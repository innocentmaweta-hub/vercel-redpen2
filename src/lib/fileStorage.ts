// Handles persisting a File System Access API directory handle across sessions,
// and provides fallbacks for browsers that don't support it (Firefox, Safari).

const DB_NAME = 'redpen_filesystem';
const STORE_NAME = 'handles';
const FOLDER_KEY = 'saveFolder';

export function isFileSystemAccessSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbSet(key: string, value: any): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function idbGet<T = any>(key: string): Promise<T | undefined> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// Ask the user to pick a folder, and remember it for next time.
export async function pickSaveFolder(): Promise<FileSystemDirectoryHandle | null> {
    if (!isFileSystemAccessSupported()) return null;
    try {
        // @ts-ignore — showDirectoryPicker isn't in default TS lib yet
        const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await idbSet(FOLDER_KEY, handle);
        return handle;
    } catch (err) {
        // User cancelled the picker — not an error worth surfacing
        return null;
    }
}

// Retrieve the previously chosen folder, re-requesting permission if needed.
export async function getSavedFolder(): Promise<FileSystemDirectoryHandle | null> {
    if (!isFileSystemAccessSupported()) return null;
    try {
        const handle = await idbGet<FileSystemDirectoryHandle>(FOLDER_KEY);
        if (!handle) return null;

        // @ts-ignore
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') return handle;

        // @ts-ignore
        const requested = await handle.requestPermission({ mode: 'readwrite' });
        return requested === 'granted' ? handle : null;
    } catch (err) {
        return null;
    }
}

export async function clearSaveFolder(): Promise<void> {
    await idbSet(FOLDER_KEY, undefined);
}

export interface SavedPdfFile {
    name: string;
    size: number;
    modified: number;
    handle: FileSystemFileHandle;
}

/**
 * List PDF files currently present in the folder selected in Settings.
 * The same directory handle is used by PDF export, so this is the canonical
 * view of files that RedPen has saved to that folder (including files saved
 * in earlier sessions).
 */
export async function listSavedPdfFiles(): Promise<SavedPdfFile[]> {
    const folder = await getSavedFolder();
    if (!folder) return [];

    const files: SavedPdfFile[] = [];

    try {
        // @ts-ignore — File System Access API async iterator
        for await (const entry of folder.values()) {
            if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.pdf')) {
                continue;
            }

            try {
                const handle = entry as FileSystemFileHandle;
                const file = await handle.getFile();
                files.push({
                    name: file.name,
                    size: file.size,
                    modified: file.lastModified,
                    handle,
                });
            } catch {
                // Ignore files that disappear or become inaccessible while listing.
            }
        }
    } catch (error) {
        console.error('Failed to list saved PDFs:', error);
    }

    return files.sort((a, b) => b.modified - a.modified);
}

// Write a file (Blob) into the saved folder, or trigger a normal download if no folder is available.
export async function writeFileToFolder(folder: FileSystemDirectoryHandle | null, filename: string, blob: Blob): Promise<'written' | 'downloaded'> {
    if (folder && blob instanceof Blob) {
        try {
            // @ts-ignore
            const fileHandle = await folder.getFileHandle(filename, { create: true });
            // @ts-ignore
            const writable = await fileHandle.createWritable();
            // Some Chrome versions require the explicit write-params shape rather than a bare Blob
            await writable.write({ type: 'write', data: blob });
            await writable.close();
            return 'written';
        } catch (err) {
            console.error(`Failed to write ${filename} to folder, falling back to download:`, err);
            // fall through to download below
        }
    }

    // Fallback: normal browser download
    if (!(blob instanceof Blob)) {
        console.error(`writeFileToFolder: expected a Blob for ${filename}, got:`, blob);
        throw new Error(`Invalid file data for ${filename}`);
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return 'downloaded';
}
