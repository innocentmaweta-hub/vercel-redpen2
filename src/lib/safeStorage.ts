/**
 * Safe browser storage helpers.
 *
 * localStorage can throw (private browsing, disabled storage, quota limits,
 * malformed JSON, etc.). UI state should degrade gracefully instead of
 * crashing the application.
 */
export function getStoredValue<T>(key: string, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export function setStoredValue<T>(key: string, value: T): boolean {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

export function removeStoredValue(key: string): boolean {
    try {
        window.localStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

export function getStoredString(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function setStoredString(key: string, value: string): boolean {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

export function removeStoredString(key: string): boolean {
    try {
        window.localStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}
