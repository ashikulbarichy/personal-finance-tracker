import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Delete } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { BrandMark } from '../layout/Sidebar';
import { cx, haptic } from '../ui';
import {
  RELOCK_AFTER_MS, clearPin, hasPin, isSessionUnlocked, markUnlocked, pinLength, verifyPin,
} from '../../lib/appLock';

/** Number pad + dots. Calls onComplete when `length` digits are entered. */
export function PinPad({ length, onComplete, error, busy }: {
  length: number; onComplete: (pin: string) => void; error?: string; busy?: boolean;
}) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => { if (error) { setShake(true); setPin(''); const t = setTimeout(() => setShake(false), 400); return () => clearTimeout(t); } }, [error]);

  const press = useCallback((d: string) => {
    if (busy) return;
    haptic(6);
    setPin((p) => {
      const next = (p + d).slice(0, length);
      if (next.length === length) setTimeout(() => onComplete(next), 60);
      return next;
    });
  }, [busy, length, onComplete]);
  const back = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  // Physical keyboard too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, back]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  return (
    <div className="flex flex-col items-center gap-6">
      <div className={cx('flex gap-3', shake && 'animate-[k-shake_0.35s]')} aria-label={`${pin.length} of ${length} digits entered`}>
        {Array.from({ length }, (_, i) => (
          <span key={i} className={cx('w-3.5 h-3.5 border-2 transition-colors', i < pin.length ? 'bg-slate-100 border-slate-100' : 'border-slate-500')} />
        ))}
      </div>
      <p className={cx('text-sm min-h-[20px]', error ? 'text-red-400' : 'text-transparent')} role="alert">{error || '.'}</p>
      <div className="grid grid-cols-3 gap-2.5">
        {keys.map((k, i) => k === '' ? <span key={i} /> : (
          <button
            key={i}
            type="button"
            onClick={() => (k === '⌫' ? back() : press(k))}
            aria-label={k === '⌫' ? 'Delete' : k}
            className="w-[72px] h-[60px] grid place-items-center text-2xl font-bold text-slate-100 bg-surface active:bg-slate-100/[0.12] transition-colors"
          >
            {k === '⌫' ? <Delete size={22} /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Wraps the signed-in app. With a PIN set on this device, it starts locked on
 *  each launch and re-locks after 5 minutes in the background. */
export function AppLock({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const uid = user?.id;
  const [locked, setLocked] = useState(() => !!uid && hasPin(uid) && !isSessionUnlocked());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fails = useRef(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => { if (uid) setLocked(hasPin(uid) && !isSessionUnlocked()); }, [uid]);

  // Re-lock after time in the background.
  useEffect(() => {
    const onVis = () => {
      if (!uid || !hasPin(uid)) return;
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_AFTER_MS) {
        markUnlocked(false);
        setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [uid]);

  // Settings can lock straight away (e.g. right after setting a PIN).
  useEffect(() => {
    const on = () => { if (uid && hasPin(uid)) { markUnlocked(false); setLocked(true); } };
    window.addEventListener('keel-lock-now', on);
    return () => window.removeEventListener('keel-lock-now', on);
  }, [uid]);

  const tryPin = async (pin: string) => {
    if (!uid) return;
    if (Date.now() < waitUntil) { setError(`Too many tries — wait ${Math.ceil((waitUntil - Date.now()) / 1000)}s`); return; }
    setBusy(true);
    const ok = await verifyPin(uid, pin);
    setBusy(false);
    if (ok) {
      fails.current = 0;
      setError('');
      markUnlocked(true);
      setLocked(false);
      return;
    }
    fails.current += 1;
    if (fails.current >= 5) { setWaitUntil(Date.now() + 30_000); fails.current = 0; setError('Too many tries — wait 30s'); }
    else setError('Wrong PIN');
    haptic(40);
  };

  const forgot = async () => {
    if (uid) clearPin(uid);
    markUnlocked(false);
    await signOut();
  };

  return (
    <>
      {children}
      {locked && uid && createPortal(
        <div className="fixed inset-0 z-[200] bg-app flex flex-col items-center justify-center gap-8 px-6 pt-safe pb-safe anim-fade" role="dialog" aria-modal="true" aria-label="Keel is locked">
          <div className="flex flex-col items-center gap-3">
            <BrandMark size={40} />
            <h1 className="text-xl font-extrabold text-slate-100">Enter your PIN</h1>
          </div>
          <PinPad length={pinLength(uid)} onComplete={tryPin} error={error} busy={busy} />
          <button type="button" onClick={forgot} className="text-sm font-semibold text-slate-400 hover:text-slate-100">
            Forgot PIN? Sign out
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
