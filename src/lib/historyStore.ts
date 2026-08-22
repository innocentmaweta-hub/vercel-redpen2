import { HistoryRecord } from '../types';

export const HISTORY_STORAGE_KEY = 'grading_history';

export type HistorySaveState = 'idle' | 'saving' | 'saved' | 'error';

export function loadLocalHistory(): HistoryRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeLocalHistory(records: HistoryRecord[]): HistoryRecord[] {
  const next = mergeCloudAndLocalHistory([], records);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('redpen:history-updated'));
  }
  return next;
}

export async function fetchCloudHistory(token: string): Promise<HistoryRecord[]> {
  const response = await fetch('/api/history', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`History load failed (${response.status})`);

  const data = await response.json();
  const cloud = Array.isArray(data.history) ? data.history : [];

  // Never let an empty/partial cloud response erase results that already
  // exist locally. This is especially important when a user imports an
  // Excel session before signing in and then authenticates afterwards.
  const merged = mergeCloudAndLocalHistory(cloud, loadLocalHistory());
  writeLocalHistory(merged);
  return merged;
}

export async function saveCloudHistory(token: string, record: HistoryRecord): Promise<HistoryRecord[]> {
  const response = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(record),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `History save failed (${response.status})`);

  const cloud = Array.isArray(data.history) ? data.history : [record];
  const merged = mergeCloudAndLocalHistory(cloud, loadLocalHistory());
  writeLocalHistory(merged);
  return merged;
}

export async function deleteCloudHistory(token: string, id: string): Promise<HistoryRecord[]> {
  const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `History delete failed (${response.status})`);

  const cloud = Array.isArray(data.history) ? data.history : [];
  const localWithoutDeleted = loadLocalHistory().filter(record => record.id !== id);
  const merged = mergeCloudAndLocalHistory(cloud, localWithoutDeleted);
  writeLocalHistory(merged);
  return merged;
}

function historyIdentity(record: HistoryRecord): string {
  if (record.id) return `id:${record.id}`;

  return [
    record.date || '',
    record.studentInfo?.regNo || '',
    record.studentInfo?.name || '',
    record.studentInfo?.courseCode || '',
    record.result?.totalScore || '',
    record.result?.grade || '',
  ].join('|');
}

export function mergeCloudAndLocalHistory(
  cloud: HistoryRecord[],
  local: HistoryRecord[]
): HistoryRecord[] {
  const byIdentity = new Map<string, HistoryRecord>();

  // Prefer cloud records when the same record exists in both sources,
  // while still retaining every local-only record.
  for (const record of local) {
    if (!record) continue;
    byIdentity.set(historyIdentity(record), record);
  }

  for (const record of cloud) {
    if (!record) continue;
    byIdentity.set(historyIdentity(record), record);
  }

  return Array.from(byIdentity.values())
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}
