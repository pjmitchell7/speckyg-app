import type { MemoryNote, Preferences } from '../../shared/types';

export const STORAGE_KEY = 'speckyg.settings.v1';
export const NOTES_KEY = 'speckyg.notes.v1';
export const CHAT_KEY = 'speckyg.conversation.v1';
export const DEFAULT_PREFERENCES: Preferences = {
  voice: true, teasing: 'off', faith: 'only-if-asked', remember: false, reducedMotion: false,
};

function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

export function loadPreferences(): Preferences {
  const value = read(STORAGE_KEY);
  if (!value || typeof value !== 'object') return { ...DEFAULT_PREFERENCES };
  const p = value as Partial<Preferences>;
  return { voice: true, teasing: p.teasing === 'gentle' ? 'gentle' : 'off',
    faith: p.faith === 'welcome' ? 'welcome' : 'only-if-asked', remember: p.remember === true,
    reducedMotion: p.reducedMotion === true };
}

export function loadMemories(allowed: boolean): MemoryNote[] {
  if (!allowed) { removePrivateData(); return []; }
  const notes = read(NOTES_KEY);
  if (!Array.isArray(notes)) return [];
  return notes.filter((n): n is MemoryNote => !!n && typeof n.id === 'string'
    && typeof n.text === 'string' && n.text.length <= 200 && typeof n.createdAt === 'number').slice(0, 8);
}

export function saveSettings(p: Preferences) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* Private browsing may disallow storage. */ }
}
export function savePrivateData(p: Preferences, notes: MemoryNote[]) {
  if (!p.remember) { removePrivateData(); return; }
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    // Only explicitly authored notes persist. Remove legacy transcript data if present.
    localStorage.removeItem(CHAT_KEY);
  } catch { /* Current conversation remains available in memory. */ }
}
export function removePrivateData() {
  try { localStorage.removeItem(NOTES_KEY); localStorage.removeItem(CHAT_KEY); } catch { /* No storage access. */ }
}
export function eraseAllData() {
  removePrivateData();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* No storage access. */ }
}
