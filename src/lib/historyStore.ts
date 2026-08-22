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
  return mergeCloudAndLocalHistory(cloud, loadLocalHistory());
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
  return mergeCloudAndLocalHistory(cloud, loadLocalHistory());
}

export async function deleteCloudHistory(token: string, id: string): Promise<HistoryRecord[]> {
  const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `History delete failed (${response.status})`);
  const cloud = Array.isArray(data.history) ? data.history : [];
  return mergeCloudAndLocalHistory(cloud, loadLocalHistory().filter(record => record.id !== id));
}

export function mergeCloudAndLocalHistory(cloud: HistoryRecord[], local: HistoryRecord[]): HistoryRecord[] {
  const byId = new Map<string, HistoryRecord>();
  for (const record of [...cloud, ...local]) {
    if (record?.id && !byId.has(record.id)) byId.set(record.id, record);
  }
  return Array.from(byId.values())
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 50);
}
