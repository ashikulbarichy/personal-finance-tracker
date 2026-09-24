import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useUserPrefs } from '../../contexts/UserPrefsContext';
import { formatMoney } from '../../lib/money';
import { markFresh } from '../../lib/fresh';
import { Button, Field, Input, Modal, cx, useToast } from '../ui';

interface Props {
  account: { id: string; name: string; balance: number; currency: string } | null;
  onClose: () => void;
}

/** "Match my bank": enter the real balance and record the difference as a
 *  balance adjustment — it moves the balance but isn't income or spending. */
export function AdjustBalanceModal({ account, onClose }: Props) {
  const { user } = useAuth();
  const { timezone } = useUserPrefs();
  const toast = useToast();
  const [actual, setActual] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (account) setActual(String(Number(account.balance))); }, [account]);

  const current = Number(account?.balance ?? 0);
  const target = actual.trim() === '' ? NaN : Number(actual);
  const diff = Number.isFinite(target) ? Math.round((target - current) * 100) / 100 : 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !account || !Number.isFinite(target)) return;
    if (diff === 0) { toast.show('Already matches — nothing to adjust'); onClose(); return; }
    setSaving(true);
    const { data, error } = await supabase.from('transactions').insert({
      user_id: user.id,
      account_id: account.id,
      amount: Math.abs(diff),
      type: diff > 0 ? 'income' : 'expense',
      currency: account.currency,
      title: 'Balance adjustment',
      description: `Matched to actual balance ${formatMoney(target, account.currency)}`,
      transaction_date: new Date().toISOString(),
      timezone,
      is_adjustment: true,
    }).select('id').single();
    setSaving(false);
    if (error) { toast.show(`Couldn't adjust: ${error.message}`); return; }
    markFresh([data?.id]);
    window.dispatchEvent(new Event('ft-data-changed'));
    toast.show(`${account.name} now shows ${formatMoney(target, account.currency)}`);
    onClose();
  };

  return (
    <Modal
      open={!!account}
      onClose={onClose}
      title={account ? `Adjust balance · ${account.name}` : 'Adjust balance'}
      maxWidth="max-w-sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="adjust-form" disabled={saving || !Number.isFinite(target)}>{saving ? 'Saving…' : 'Adjust'}</Button>
      </>}
    >
      {account && (
        <form id="adjust-form" onSubmit={save} className="flex flex-col gap-3.5">
          <p className="text-sm text-slate-300 tabular-nums">Keel shows {formatMoney(current, account.currency)}.</p>
          <Field label={`Actual balance in your bank / wallet (${account.currency})`}>
            <Input type="number" inputMode="decimal" step="any" required autoFocus value={actual}
              onChange={(e) => setActual(e.target.value)} className="no-mask" />
          </Field>
          {Number.isFinite(target) && diff !== 0 && (
            <p className={cx('text-sm tabular-nums', diff < 0 ? 'text-red-400' : 'text-slate-100')}>
              Records a {formatMoney(Math.abs(diff), account.currency)} {diff > 0 ? 'increase' : 'decrease'}.
            </p>
          )}
          <p className="text-xs text-slate-400">
            Adjustments change the balance only — they don’t count as income or spending. If you know what the missing money was, add it as a normal transaction instead.
          </p>
        </form>
      )}
    </Modal>
  );
}
