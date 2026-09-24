import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { clearPin, hasPin, markUnlocked, pinLength, setPin, verifyPin } from '../../lib/appLock';
import { Button, Modal, SegmentedControl, Switch, useToast } from '../ui';
import { PinPad } from './AppLock';

type Step = { mode: 'set'; phase: 'first' | 'confirm'; first?: string } | { mode: 'off' } | { mode: 'change-verify' };

/** Settings row: turn the PIN lock on/off or change it (this device only). */
export function AppLockSetting() {
  const { user } = useAuth();
  const toast = useToast();
  const uid = user?.id ?? '';
  const [on, setOn] = useState(() => !!uid && hasPin(uid));
  const [step, setStep] = useState<Step | null>(null);
  const [len, setLen] = useState<'4' | '6'>('4');
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0); // remounts the pad between steps

  const close = () => { setStep(null); setError(''); };
  const next = (s: Step) => { setStep(s); setError(''); setNonce((n) => n + 1); };

  const onPin = async (pin: string) => {
    if (!step || !uid) return;
    if (step.mode === 'set') {
      if (step.phase === 'first') { next({ mode: 'set', phase: 'confirm', first: pin }); return; }
      if (pin !== step.first) { next({ mode: 'set', phase: 'first' }); setError('PINs didn’t match — start again'); return; }
      await setPin(uid, pin);
      markUnlocked(true);
      setOn(true);
      close();
      toast.show('App lock is on for this device');
      return;
    }
    const ok = await verifyPin(uid, pin);
    if (!ok) { setError('Wrong PIN'); return; }
    if (step.mode === 'off') {
      clearPin(uid);
      setOn(false);
      close();
      toast.show('App lock is off');
    } else {
      next({ mode: 'set', phase: 'first' });
    }
  };

  const title = !step ? '' : step.mode === 'off' ? 'Enter your PIN to turn off'
    : step.mode === 'change-verify' ? 'Enter your current PIN'
    : step.phase === 'first' ? 'Choose a PIN' : 'Enter it again';
  const padLength = step && step.mode !== 'set' ? pinLength(uid) : Number(len);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 row-rule py-3.5">
      <div className="flex flex-col min-w-0">
        <span className="text-[15px] sm:text-sm font-semibold text-slate-100">App lock (PIN)</span>
        <span className="text-xs text-slate-400">Ask for a PIN when Keel opens on this device, and after 5 minutes away.</span>
      </div>
      <div className="shrink-0 flex items-center gap-3">
        {on && <Button size="sm" variant="ghost" onClick={() => next({ mode: 'change-verify' })}>Change PIN</Button>}
        <Switch checked={on} onChange={(v) => next(v ? { mode: 'set', phase: 'first' } : { mode: 'off' })} label="App lock" />
      </div>

      <Modal open={!!step} onClose={close} title={title} maxWidth="max-w-sm">
        <div className="flex flex-col items-center gap-4 py-2">
          {step?.mode === 'set' && step.phase === 'first' && (
            <SegmentedControl value={len} onChange={(v) => { setLen(v); setNonce((n) => n + 1); }}
              options={[{ value: '4', label: '4 digits' }, { value: '6', label: '6 digits' }]} />
          )}
          <PinPad key={nonce} length={padLength} onComplete={onPin} error={error} />
          {step?.mode === 'set' && (
            <p className="text-xs text-slate-400 text-center max-w-[260px]">
              Stored only on this device. Forgot it? You can sign out from the lock screen and sign back in.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
