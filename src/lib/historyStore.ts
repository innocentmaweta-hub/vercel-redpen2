import { HistoryRecord } from '../types';

export const HISTORY_STORAGE_KEY = 'grading_history';
export const HISTORY_MAX_LOCAL = 500;
const STORAGE_SCOPE_KEY = 'redpen_storage_owner';

export type HistorySaveState = 'idle' | 'saving' | 'saved' | 'error';

const historyStorageKey = (ownerId?: string | number | null) => {
  const owner = typeof ownerId === 'string' || typeof ownerId === 'number'
    ? String(ownerId).trim()
    : (localStorage.getItem(STORAGE_SCOPE_KEY) || '').trim();
  return owner ? `${HISTORY_STORAGE_KEY}:${encodeURIComponent(owner)}` : HISTORY_STORAGE_KEY;
};

export function clearLocalHistory(ownerId?: string | number | null): void {
  localStorage.removeItem(historyStorageKey(ownerId));
  if (!ownerId) localStorage.removeItem(HISTORY_STORAGE_KEY);
}

export function loadLocalHistory(ownerId?: string | number | null): HistoryRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(historyStorageKey(ownerId)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeLocalHistory(records: HistoryRecord[], ownerId?: string | number | null): HistoryRecord[] {
  const next = records
    .filter(Boolean)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, HISTORY_MAX_LOCAL);
  try {
    localStorage.setItem(historyStorageKey(ownerId), JSON.stringify(next));
  } catch {
    // Large history should never make grading fail. Keep the in-memory state.
  }
  return next;
}

export async function fetchCloudHistory(token: string): Promise<HistoryRecord[]> {
  const response = await fetch('/api/history', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`History load failed (${response.status})`);
  const data = await response.json();
  return Array.isArray(data.history) ? data.history : [];
}

export async function saveCloudHistory(token: string, record: HistoryRecord): Promise<HistoryRecord[]> {
  const response = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(record),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `History save failed (${response.status})`);
  return Array.isArray(data.history) ? data.history : [record];
}

export async function deleteCloudHistory(token: string, id: string): Promise<HistoryRecord[]> {
  const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `History delete failed (${response.status})`);
  return Array.isArray(data.history) ? data.history : [];
}

export function mergeCloudAndLocalHistory(cloud: HistoryRecord[], local: HistoryRecord[]): HistoryRecord[] {
  const byId = new Map<string, HistoryRecord>();
  for (const record of [...cloud, ...local]) {
    if (record?.id && !byId.has(record.id)) byId.set(record.id, record);
  }
  return Array.from(byId.values())
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, HISTORY_MAX_LOCAL);
}
