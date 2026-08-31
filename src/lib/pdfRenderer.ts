import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

let workerConfigured = false;

function configurePdfWorker() {
    if (!workerConfigured) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
        workerConfigured = true;
    }
}

/**
 * Render every page of a PDF into one vertically stacked image.
 * Keeping the original PDF untouched means AI grading still receives the
 * original document while the marking canvas gets a real image it can draw on.
 */
export async function renderPdfToImage(dataUrl: string, scale = 1.5): Promise<string> {
    configurePdfWorker();

    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex < 0) throw new Error('Invalid PDF data URL.');

    const binary = atob(dataUrl.slice(commaIndex + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    if (pdf.numPages < 1) throw new Error('The PDF contains no pages.');

    const pages = [] as Array<{ canvas: HTMLCanvasElement; width: number; height: number }>;
    let totalHeight = 0;
    let maxWidth = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error(`Could not create a canvas for PDF page ${pageNumber}.`);

        await page.render({ canvasContext: context, viewport }).promise;
        pages.push({ canvas, width: canvas.width, height: canvas.height });
        totalHeight += canvas.height;
        maxWidth = Math.max(maxWidth, canvas.width);
    }

    const combined = document.createElement('canvas');
    combined.width = maxWidth;
    combined.height = totalHeight;
    const context = combined.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not create the combined PDF canvas.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, combined.width, combined.height);

    let y = 0;
    for (const page of pages) {
        context.drawImage(page.canvas, 0, y);
        y += page.height;
    }

    return combined.toDataURL('image/jpeg', 0.92);
}

export function isPdfDataUrl(value?: string | null): boolean {
    return typeof value === 'string' && /^data:application\/pdf(?:;|,)/i.test(value);
}
