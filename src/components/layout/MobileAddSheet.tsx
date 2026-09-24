import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Delete } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useUserPrefs } from '../../contexts/UserPrefsContext';
import { convertManual, loadManualRates } from '../../lib/manualRates';
import { cx, haptic, SegmentedControl, useToast } from '../ui';
import { markFresh } from '../../lib/fresh';

type TxType = 'expense' | 'income' | 'transfer';
type Acct = { id: string; name: string; currency: string };
type Cat = { id: string; name: string; type: 'income' | 'expense' };
type Payee = { id: string; name: string };

const SYM: Record<string, string> = { BDT: '৳', USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥' };
export const symFor = (cur: string) => SYM[cur] ?? cur + ' ';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

/** Phone quick-add: full-height sheet with a big amount and a number pad. */
export function MobileAddSheet({
  open,
  onClose,
  onMoreDetails,
}: {
  open: boolean;
  onClose: () => void;
  /** Opens the full transaction form (charges, splits, custom rate…). */
  onMoreDetails: (type: TxType) => void;
}) {
  const { user } = useAuth();
  const { defaultCurrency, timezone } = useUserPrefs();
  const toast = useToast();
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('0');
  const [payee, setPayee] = useState('');
  const [catId, setCatId] = useState('');
  const [acct, setAcct] = useState('');
  const [acct2, setAcct2] = useState('');
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open || !user) return;
    setType('expense'); setAmount('0'); setPayee(''); setCatId(''); setErr('');
    Promise.all([
      supabase.from('accounts').select('id, name, currency').eq('user_id', user.id).eq('is_active', true).order('name'),
      supabase.from('categories').select('id, name, type').eq('user_id', user.id).order('name'),
      supabase.from('payees').select('id, name').eq('user_id', user.id).order('name').limit(200),
    ]).then(([a, c, p]) => {
      const accts = (a.data ?? []) as Acct[];
      setAccounts(accts);
      setCats((c.data ?? []) as Cat[]);
      setPayees((p.data ?? []) as Payee[]);
      setAcct((cur) => (accts.some((x) => x.id === cur) ? cur : accts[0]?.id ?? ''));
      setAcct2((cur) => (accts.some((x) => x.id === cur) ? cur : accts[1]?.id ?? accts[0]?.id ?? ''));
    });
  }, [open, user]);

  const from = accounts.find((a) => a.id === acct);
  const to = accounts.find((a) => a.id === acct2);
  const cur = from?.currency ?? defaultCurrency;
  const value = parseFloat(amount) || 0;

  const shownAmount = useMemo(() => {
    const [i, d] = amount.split('.');
    const int = Number(i || 0).toLocaleString('en-US');
    return amount.includes('.') ? `${int}.${d ?? ''}` : int;
  }, [amount]);

  const press = (k: string) => {
    setErr('');
    setAmount((a) => {
      if (k === 'del') return a.length <= 1 ? '0' : a.slice(0, -1);
      if (k === '.') return a.includes('.') ? a : a + '.';
      if (a.includes('.') && a.split('.')[1].length >= 2) return a;
      if (a.replace('.', '').length >= 10) return a;
      return a === '0' ? k : a + k;
    });
  };

  const convHint = (() => {
    if (type !== 'transfer' || !from || !to || from.currency === to.currency) return '';
    const rates = loadManualRates(user?.id);
    const out = convertManual(value || 1, from.currency, to.currency, defaultCurrency, rates);
    const rate = out / (value || 1);
    return value
      ? `Arrives as ≈ ${symFor(to.currency)}${out.toLocaleString('en-US', { maximumFractionDigits: 2 })} at ${rate.toFixed(4)}`
      : `Converted at your manual rate (${rate.toFixed(4)})`;
  })();

  const resolvePayee = async (): Promise<string | null> => {
    if (!user || !payee.trim()) return null;
    const hit = payees.find((p) => p.name.toLowerCase() === payee.trim().toLowerCase());
    if (hit) return hit.id;
    const { data } = await supabase.from('payees').insert({ user_id: user.id, name: payee.trim() }).select('id').single();
    return data?.id ?? null;
  };

  const save = async () => {
    if (!user || !from || value <= 0) return;
    if (type === 'transfer' && (!to || to.id === from.id)) { setErr('Pick two different accounts'); return; }
    setSaving(true);
    const date = new Date().toISOString();
    let error: { message: string } | null = null;
    let ids: string[] = [];
    if (type === 'transfer' && to) {
      const pair = crypto.randomUUID();
      const rate = from.currency !== to.currency
        ? convertManual(1, from.currency, to.currency, defaultCurrency, loadManualRates(user.id))
        : null;
      const base = { user_id: user.id, category_id: null, amount: value, title: 'Transfer', transaction_date: date, timezone, custom_rate: rate, transfer_pair_id: pair };
      let inserted: { id: string }[] | null;
      ({ data: inserted, error } = await supabase.from('transactions').insert([
        { ...base, account_id: from.id, type: 'expense' as const, currency: from.currency, description: `Account transfer (to ${to.name})` },
        { ...base, account_id: to.id, type: 'income' as const, currency: to.currency, description: `Account transfer (from ${from.name})` },
      ]).select('id'));
      ids = (inserted ?? []).map((r) => r.id);
    } else {
      const pid = await resolvePayee();
      const cat = cats.find((c) => c.id === catId);
      let inserted: { id: string }[] | null;
      ({ data: inserted, error } = await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: from.id,
        category_id: catId || null,
        payee_id: type === 'expense' ? pid : null,
        payer_id: type === 'income' ? pid : null,
        amount: value,
        type: type === 'income' ? 'income' as const : 'expense' as const,
        title: payee.trim() || cat?.name || (type === 'income' ? 'Income' : 'Expense'),
        transaction_date: date,
        timezone,
        currency: from.currency,
      }).select('id'));
      ids = (inserted ?? []).map((r) => r.id);
    }
    setSaving(false);
    if (error) { setErr(error.message); return; }
    markFresh(ids);
    haptic(12);
    window.dispatchEvent(new Event('ft-data-changed'));
    toast.show(`${type === 'transfer' ? 'Transfer' : type === 'income' ? 'Income' : 'Expense'} of ${symFor(cur)}${shownAmount} saved`);
    onClose();
  };

  const chip = (on: boolean) =>
    cx('shrink-0 h-9 px-3 border border-slate-100 text-[13px] font-semibold transition-colors', on ? 'bg-slate-100 text-app' : 'bg-transparent text-slate-100');

  const recentPayees = payees.slice(0, 8);
  const catOpts = cats.filter((c) => c.type === (type === 'income' ? 'income' : 'expense'));
  const saveLabel = value > 0
    ? `Save ${type} · ${symFor(cur)}${shownAmount}`
    : 'Enter an amount';

  return (
    <>
      <div onClick={onClose} className={cx('md:hidden fixed inset-0 z-[65] bg-slate-200/45 dark:bg-black/60 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0 pointer-events-none')} />
      <div
        className={cx(
          'md:hidden fixed inset-x-0 bottom-0 top-[max(12px,env(safe-area-inset-top))] z-[66] bg-app border-t-2 border-slate-100 flex flex-col transition-transform duration-[420ms]',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(.2,.9,.25,1)' }}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between h-[52px] pl-2 pr-3 shrink-0">
          <button type="button" onClick={onClose} className="h-11 px-2.5 text-[15px] font-semibold text-blue-400">Cancel</button>
          <SegmentedControl
            options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' }]}
            value={type}
            onChange={(v) => { setType(v); setCatId(''); }}
          />
          <button type="button" onClick={() => { onClose(); onMoreDetails(type); }} className="h-11 px-1 text-[13px] font-semibold text-slate-400">More</button>
        </div>

        <div className="px-5 pt-1.5 pb-2.5 flex items-baseline gap-1.5 shrink-0">
          <span className="text-[30px] font-extrabold text-slate-400">{symFor(cur).trim()}</span>
          <span className="text-[52px] font-extrabold tracking-[-0.03em] leading-none tabular-nums no-mask text-slate-100 truncate">{shownAmount}</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
          {type !== 'transfer' && (
            <>
              <div className="px-5">
                <input
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder={type === 'income' ? 'From (optional)' : 'Payee (optional)'}
                  className="w-full h-11 px-3 bg-surface border border-line-strong text-[15px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              {recentPayees.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-5 pt-2.5">
                  {recentPayees.map((p) => (
                    <button key={p.id} type="button" onClick={() => setPayee(p.name)}
                      className={cx('shrink-0 h-8 px-2.5 border text-[13px]', payee === p.name ? 'bg-slate-100 text-app border-slate-100' : 'border-slate-500 text-slate-100')}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="t-th px-5 pt-3.5 pb-1">Category</div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-5">
                {catOpts.map((c) => (
                  <button key={c.id} type="button" onClick={() => setCatId(catId === c.id ? '' : c.id)} className={chip(catId === c.id)}>{c.name}</button>
                ))}
                {catOpts.length === 0 && <span className="text-[13px] text-slate-400 py-2">No categories yet</span>}
              </div>
            </>
          )}

          <div className="t-th px-5 pt-3 pb-1">{type === 'transfer' ? 'From' : type === 'income' ? 'Received in' : 'Paid from'}</div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-5">
            {accounts.map((a) => (
              <button key={a.id} type="button" onClick={() => setAcct(a.id)} className={chip(acct === a.id)}>{a.name}</button>
            ))}
          </div>

          {type === 'transfer' && (
            <>
              <div className="flex justify-center pt-2.5 text-slate-400"><ArrowUpDown size={18} /></div>
              <div className="t-th px-5 pt-1 pb-1">To</div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-5">
                {accounts.map((a) => (
                  <button key={a.id} type="button" disabled={a.id === acct} onClick={() => setAcct2(a.id)}
                    className={cx(chip(acct2 === a.id), a.id === acct && 'opacity-35')}>{a.name}</button>
                ))}
              </div>
              <div className="px-5 pt-2.5 text-[13px] text-slate-300 min-h-[28px]">{convHint}</div>
            </>
          )}
          {err && <div className="px-5 pt-2 text-xs font-semibold text-red-400">{err}</div>}
          <div className="h-3" />
        </div>

        <div className="grid grid-cols-3 gap-[2px] bg-slate-800 rule-t shrink-0">
          {KEYS.map((k) => (
            <button key={k} type="button" onClick={() => press(k)}
              className="h-[54px] bg-app text-[24px] font-semibold text-slate-100 grid place-items-center active:bg-slate-900 transition-colors">
              {k === 'del' ? <Delete size={24} /> : k}
            </button>
          ))}
        </div>
        <div className="px-4 pt-2.5 pb-[max(20px,env(safe-area-inset-bottom))] shrink-0">
          <button
            type="button"
            onClick={save}
            disabled={value <= 0 || saving || !from}
            className="w-full h-[52px] px-[18px] bg-blue-600 active:bg-blue-400 text-app text-base font-extrabold text-left disabled:opacity-45"
          >
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </>
  );
}
