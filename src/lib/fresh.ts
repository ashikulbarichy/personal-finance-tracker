/* "Just saved" markers: list rows whose id was saved in the last few seconds
 * get the one-off .flash-new highlight, so a save visibly lands. */
const fresh = new Map<string, number>();
const TTL = 4000;

export function markFresh(ids: (string | null | undefined)[]) {
  const until = Date.now() + TTL;
  ids.forEach((id) => { if (id) fresh.set(id, until); });
}

export function isFresh(id: string | null | undefined): boolean {
  if (!id) return false;
  const until = fresh.get(id);
  if (!until) return false;
  if (until < Date.now()) { fresh.delete(id); return false; }
  return true;
}
