/* Notifications are derived from the user's own data on every load — there's no
 * server job. Only the "read" state (and when each one was first seen) is kept,
 * per device, in localStorage. Each id encodes the occurrence it's about (e.g.
 * a recurring rule's due date), so the next occurrence is a fresh, unread item. */

export type NoticeKind = 'recurring' | 'loan' | 'budget' | 'goal';
export type NoticeTone = 'info' | 'warn' | 'danger' | 'good';

export interface Notice {
  id: string;
  kind: NoticeKind;
  tone: NoticeTone;
  title: string;
  body: string;
  /** When it became relevant (due date, or first time we saw it) — for Today / Earlier. */
  at: number;
  href: string;
  /** Recurring rule id — enables the inline "Record" button. */
  recurringId?: string;
}

export const MILESTONES = [25, 50, 75, 100] as const;

/** The highest milestone crossed going from `before` to `after` (or null). */
export function milestoneCrossed(before: number, after: number, target: number): number | null {
  if (!(target > 0)) return null;
  const a = (before / target) * 100;
  const b = (after / target) * 100;
  let hit: number | null = null;
  for (const m of MILESTONES) if (a < m && b >= m) hit = m;
  return hit;
}

/** Highest milestone already reached. */
export function milestoneReached(current: number, target: number): number | null {
  if (!(target > 0)) return null;
  const pct = (current / target) * 100;
  let hit: number | null = null;
  for (const m of MILESTONES) if (pct >= m) hit = m;
  return hit;
}

/* ---- per-device read state ---- */
type Store = { seen: Record<string, number>; read: Record<string, 1> };
const key = (uid: string) => `keel-notif:${uid}`;

export function loadStore(uid: string): Store {
  try {
    const raw = localStorage.getItem(key(uid));
    if (raw) {
      const s = JSON.parse(raw) as Partial<Store>;
      return { seen: s.seen ?? {}, read: s.read ?? {} };
    }
  } catch { /* private mode / corrupted — start fresh */ }
  return { seen: {}, read: {} };
}

export function saveStore(uid: string, store: Store) {
  try { localStorage.setItem(key(uid), JSON.stringify(store)); } catch { /* storage full / blocked */ }
}

/** Record first-seen times for new ids and forget ids that no longer apply.
 *  Returns the SAME object when nothing changed, so callers can skip a
 *  state update (and avoid a render loop). */
export function syncStore(store: Store, ids: string[]): Store {
  const now = Date.now();
  const live = new Set(ids);
  const same =
    ids.every((id) => id in store.seen) &&
    Object.keys(store.seen).every((id) => live.has(id)) &&
    Object.keys(store.read).every((id) => live.has(id));
  if (same) return store;
  const seen: Store['seen'] = {};
  const read: Store['read'] = {};
  ids.forEach((id) => { seen[id] = store.seen[id] ?? now; });
  Object.keys(store.read).forEach((id) => { if (live.has(id)) read[id] = 1; });
  return { seen, read };
}
