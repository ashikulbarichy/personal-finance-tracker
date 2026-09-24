/* App lock (PIN), per device. Only a salted PBKDF2 hash of the PIN is stored,
 * in localStorage. This is a privacy screen for a shared/lost phone — not
 * encryption: your data still comes from your signed-in Supabase session. */

type Stored = { salt: string; hash: string; len: number; iter: number };

const key = (uid: string) => `keel-lock:${uid}`;
const ITER = 120_000;

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iter: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, 256);
  return toB64(bits);
}

function read(uid: string): Stored | null {
  try {
    const raw = localStorage.getItem(key(uid));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

export const hasPin = (uid: string) => !!read(uid);
export const pinLength = (uid: string) => read(uid)?.len ?? 4;

export async function setPin(uid: string, pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITER);
  localStorage.setItem(key(uid), JSON.stringify({ salt: toB64(salt), hash, len: pin.length, iter: ITER } satisfies Stored));
}

export async function verifyPin(uid: string, pin: string) {
  const s = read(uid);
  if (!s) return true;
  return (await derive(pin, fromB64(s.salt), s.iter)) === s.hash;
}

export function clearPin(uid: string) {
  try { localStorage.removeItem(key(uid)); } catch { /* ignore */ }
}

/* Unlocked for this app session (a fresh launch of the installed app starts locked). */
const SESSION = 'keel-unlocked';
export const isSessionUnlocked = () => { try { return sessionStorage.getItem(SESSION) === '1'; } catch { return false; } };
export const markUnlocked = (v: boolean) => { try { if (v) sessionStorage.setItem(SESSION, '1'); else sessionStorage.removeItem(SESSION); } catch { /* ignore */ } };

/** Lock again after the app has been in the background this long. */
export const RELOCK_AFTER_MS = 5 * 60_000;
