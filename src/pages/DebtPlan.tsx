import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Flag, Landmark, PartyPopper } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatMoney } from '../lib/money';
import { toISODate } from '../lib/recurring';
import {
  Badge, Button, EmptyState, Field, Input, Kpi, KpiStrip, ListSkeleton, Modal, PageHeader, Progress, Select,
  burst, cx, useToast,
} from '../components/ui';
import { TransactionFormModal } from '../components/transactions/TransactionFormModal';
import { useMoneyPlan, type Debt } from '../components/plan/useMoneyPlan';
import type { Database } from '../lib/database.types';

type Account = Database['public']['Tables']['accounts']['Row'];

const monthYear = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

/** Debt-free plan: every debt smallest-first (the "snowball"), one focus debt,
 *  total progress, and a debt-free date from your recent repayment pace.
 *  Why smallest first: closing whole debts early is what predicts clearing all
 *  of them (Gal & McShane 2012) — the wins keep you going. */
export function DebtPlan() {
  const p = useMoneyPlan();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const cur = p.cur;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paying, setPaying] = useState<Debt | null>(null);
  const [cardPay, setCardPay] = useState<Debt | null>(null);
  const [form, setForm] = useState({ amount: '', from: '', date: toISODate(new Date()) });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true).order('name')
      .then(({ data }) => setAccounts(data ?? []));
  }, [user]);

  const openPay = (d: Debt) => {
    if (d.kind === 'card') { setCardPay(d); return; }
    setForm({ amount: '', from: accounts.find((a) => a.type !== 'investment' && a.type !== 'credit_card')?.id ?? '', date: toISODate(new Date()) });
    setPaying(d);
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !paying) return;
    const amount = Number(form.amount);
    if (!(amount > 0)) return;
    setSaving(true);
    const { error } = await supabase.from('loan_payments').insert({
      user_id: user.id,
      loan_id: paying.id,
      from_account_id: form.from || null,
      to_account_id: null,
      amount,
      payment_type: 'repayment',
      payment_date: form.date,
    });
    setSaving(false);
    if (error) { toast.show(`Couldn't record payment: ${error.message}`); return; }
    const cleared = amount >= paying.balance - 0.005;
    const left = p.debts.length - (cleared ? 1 : 0);
    setPaying(null);
    window.dispatchEvent(new Event('ft-data-changed'));
    if (cleared) {
      burst();
      toast.show(left > 0 ? `${paying.name} is paid off! ${left} to go — roll that payment into the next one.` : 'Your last debt is paid off. You’re debt-free!');
    } else {
      toast.show(`Paid ${formatMoney(amount, cur)} · ${formatMoney(paying.balance - amount, cur)} left on ${paying.name}`);
    }
  };

  if (p.loading) {
    return <div className="px-5 md:px-8 pt-3 md:pt-7"><ListSkeleton rows={4} /></div>;
  }

  const focus = p.debts[0];
  const totalBorrowed = p.paidOff + p.owe;

  return (
    <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-6 md:gap-7 max-w-[1000px]">
      <PageHeader
        title="Debt-free plan"
        description="Smallest debt first — each one you close frees money for the next"
      />

      {p.debts.length === 0 && p.paidOff === 0 ? (
        <EmptyState
          icon={Flag}
          title="No debts tracked"
          description="Add money you’ve borrowed under Loans (and any card balance below zero). They’ll line up here smallest-first with a debt-free date."
          action={<Button onClick={() => navigate('/loans')}>Go to Loans</Button>}
        />
      ) : p.debts.length === 0 ? (
        <div className="flex items-start gap-3 p-4 bg-blue-100 anim-pop">
          <PartyPopper size={20} className="text-blue-600 dark:text-blue-400 shrink-0" />
          <div>
            <p className="font-extrabold text-slate-100">You’re debt-free.</p>
            <p className="text-sm text-slate-300 tabular-nums">You paid off {formatMoney(p.paidOff, cur)}. Keep the same monthly amount going — into savings or investments now.</p>
          </div>
        </div>
      ) : (
        <>
          <KpiStrip cols={4}>
            <Kpi label="You owe" value={<span className="text-red-400">{formatMoney(p.owe, cur)}</span>} note={`${p.debts.length} debt${p.debts.length === 1 ? '' : 's'}`} />
            <Kpi label="Paid off so far" value={formatMoney(p.paidOff, cur)} note={`${Math.round(p.debtProgress)}% of ${formatMoney(totalBorrowed, cur)}`} />
            <Kpi label="Your pace" value={p.monthlyRepay > 0 ? formatMoney(p.monthlyRepay, cur) : '—'} note="Average repaid per month (last 3 months)" />
            <Kpi
              label="Debt-free by"
              value={p.debtFreeDate ? monthYear(p.debtFreeDate) : '—'}
              note={p.monthsToFree != null ? `${p.monthsToFree} month${p.monthsToFree === 1 ? '' : 's'} at this pace` : 'Record a repayment to see it'}
            />
          </KpiStrip>

          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1.5 tabular-nums">
              <span>Paid off {Math.round(p.debtProgress)}%</span>
              <span>{formatMoney(p.owe, cur)} to go</span>
            </div>
            <Progress value={p.debtProgress} tone="accent" height={10} />
          </div>

          {focus && (
            <div className="border-l-2 border-blue-500 pl-3.5 text-sm text-slate-300 leading-snug tabular-nums">
              <b className="text-slate-100">Focus: {focus.name}.</b> Put every spare amount here and pay the minimum on the rest.
              {' '}{formatMoney(focus.balance, cur)} to clear it
              {p.monthlyRepay > 0 && <> — about {Math.max(1, Math.ceil(focus.balance / p.monthlyRepay))} month{Math.ceil(focus.balance / p.monthlyRepay) > 1 ? 's' : ''} at your pace</>}.
            </div>
          )}

          <section className="rule-t stagger">
            {p.debts.map((d, i) => {
              const pct = d.original > 0 ? Math.min(100, ((d.original - d.balance) / d.original) * 100) : 0;
              const Icon = d.kind === 'card' ? CreditCard : Landmark;
              return (
                <div key={d.id} className={cx('grid grid-cols-[28px_minmax(0,1fr)_auto] md:grid-cols-[28px_minmax(0,1fr)_200px_auto] gap-3 md:gap-5 items-center py-3.5 row-rule', i === 0 && 'bg-blue-500/[0.05] -mx-2 px-2')}>
                  <span className="text-xs font-extrabold text-slate-400 tabular-nums no-mask">{String(i + 1).padStart(2, '0')}</span>
                  <button type="button" onClick={() => navigate(d.href)} className="min-w-0 text-left">
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon size={14} className="text-slate-400 shrink-0" />
                      <span className="text-[15px] font-bold text-slate-100 truncate hover:underline">{d.name}</span>
                      {i === 0 && <Badge tone="outline">Focus</Badge>}
                    </span>
                    <span className="block text-xs text-slate-400 truncate">
                      {d.who}{d.dueDate ? ` · due ${new Date(d.dueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                    </span>
                    <Progress value={pct} tone="accent" height={4} className="mt-2 md:hidden" />
                  </button>
                  <div className="hidden md:flex flex-col gap-1">
                    <Progress value={pct} tone="accent" height={6} />
                    <span className="text-[11px] text-slate-400 tabular-nums">{d.kind === 'loan' ? `${Math.round(pct)}% of ${formatMoney(d.original, cur)} repaid` : 'Card balance'}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-[15px] font-extrabold tabular-nums text-slate-100">{formatMoney(d.balance, cur)}</span>
                    <Button size="sm" variant={i === 0 ? 'primary' : 'secondary'} onClick={() => openPay(d)}>Pay</Button>
                  </div>
                </div>
              );
            })}
          </section>

          <p className="text-xs text-slate-400 max-w-xl">
            Why smallest first? Closing whole debts early is the strongest predictor of clearing all of them — the
            quick wins keep motivation up. Each time one is gone, add its payment to the next.
          </p>
        </>
      )}

      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title={paying ? `Pay ${paying.name}` : 'Pay'}
        footer={<>
          <Button variant="secondary" onClick={() => setPaying(null)}>Cancel</Button>
          <Button type="submit" form="debt-pay" disabled={saving || !(Number(form.amount) > 0)}>{saving ? 'Saving…' : 'Record payment'}</Button>
        </>}
      >
        {paying && (
          <form id="debt-pay" onSubmit={recordPayment} className="flex flex-col gap-3.5">
            <p className="text-sm text-slate-300 tabular-nums">{formatMoney(paying.balance, cur)} left to {paying.who}.</p>
            <Field label="Amount">
              <Input type="number" inputMode="decimal" min="0.01" step="any" required autoFocus value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} className="no-mask" />
            </Field>
            <button type="button" onClick={() => setForm({ ...form, amount: String(Math.round(paying.balance * 100) / 100) })}
              className="self-start -mt-2 text-xs font-semibold text-blue-400">Pay it all off</button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Paid from">
                <Select value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })}>
                  <option value="">Not from a tracked account</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
                </Select>
              </Field>
              <Field label="Date">
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
            </div>
          </form>
        )}
      </Modal>

      <TransactionFormModal
        isOpen={!!cardPay}
        initialType="transfer"
        initialToAccountId={cardPay?.id ?? ''}
        initialTitle={cardPay ? `Pay ${cardPay.name}` : ''}
        onClose={() => setCardPay(null)}
        onSaved={() => { setCardPay(null); window.dispatchEvent(new Event('ft-data-changed')); }}
      />
    </div>
  );
}
