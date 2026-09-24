import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Pencil, Sparkles } from 'lucide-react';
import { formatMoney } from '../../lib/money';
import { AnimatedNumber, Button, Progress, cx, fieldCls, useToast } from '../ui';
import { useMoneyPlan } from './useMoneyPlan';
import { NetWorthSpark } from './NetWorthChart';

const monthYear = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

/** Home: where you stand (net worth), pay-yourself-first progress, and a
 *  per-day safe-to-spend — plus links into the debt plan and investments.
 *  See useMoneyPlan for the research each part is based on. */
export function MoneyPlanCard() {
  const p = useMoneyPlan();
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const cur = p.cur;
  const money = (n: number) => <AnimatedNumber value={n} format={(v) => formatMoney(v, cur)} />;

  if (p.loading) return null;

  const now = new Date();
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });
  const lastName = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'long' });
  const negative = p.netWorth < 0;
  const target = p.target;
  const future = p.month.future;
  const hit = target != null && target > 0 && future >= target;

  const saveTarget = async () => {
    const n = val.trim() === '' ? null : Number(val);
    if (n != null && (!Number.isFinite(n) || n < 0)) return;
    const err = await p.setTarget(n);
    if (err) toast.show(`Couldn't save target: ${err}`);
    else { setEditing(false); toast.show(n ? `Monthly target set · ${formatMoney(n, cur)}` : 'Monthly target cleared'); }
  };

  const targetEditor = (
    <form className="flex gap-2 mt-1" onSubmit={(e) => { e.preventDefault(); saveTarget(); }}>
      <input
        autoFocus
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={`Amount in ${cur}`}
        aria-label="Monthly target"
        className={cx(fieldCls, 'no-mask')}
      />
      <Button type="submit" size="sm" className="h-9">Save</Button>
      {target != null && <Button size="sm" variant="ghost" className="h-9" onClick={() => setEditing(false)}>Cancel</Button>}
    </form>
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-extrabold text-slate-100">Your money plan</h2>
        <span className="text-xs text-slate-400">All in {cur}</span>
      </div>

      {/* Fresh start: the first days of a month are when change sticks best. */}
      {p.freshStart && (p.prev.income > 0 || p.prev.spending > 0) && (
        <div className="flex items-start gap-3 p-3.5 bg-blue-100 text-slate-100 anim-fade">
          <Sparkles size={16} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm leading-snug tabular-nums">
            <b>New month, fresh start.</b> In {lastName} you {p.prev.kept >= 0 ? 'kept' : 'overspent by'}{' '}
            <b>{formatMoney(Math.abs(p.prev.kept), cur)}</b>
            {p.prev.future > 0 && <> and put <b>{formatMoney(p.prev.future, cur)}</b> toward savings and debt</>}.
            {' '}{target ? `This month's target: ${formatMoney(target, cur)} — move it as soon as income arrives.` : 'Set a target for this month below.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line-strong rule-t rule-b">
        {/* ── Net worth ── */}
        <div className="bg-app py-4 md:pr-5 flex flex-col gap-1.5">
          <div className="t-kicker">Net worth</div>
          <button type="button" onClick={() => navigate('/reports')} title="See net worth over time" className="flex items-end justify-between gap-3 text-left">
            <span className={cx('text-[26px] font-extrabold tracking-[-0.02em] tabular-nums leading-tight', negative ? 'text-red-400' : 'text-slate-100')}>
              {money(p.netWorth)}
            </span>
            <NetWorthSpark history={p.history} />
          </button>
          <div className="text-xs text-slate-400 tabular-nums">
            {negative ? <>{formatMoney(-p.netWorth, cur)} to get back to zero</> : 'What you own minus what you owe'}
          </div>
          <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[13px] tabular-nums">
            <dt className="text-slate-400">Accounts</dt><dd className="text-right text-slate-100">{formatMoney(p.cash, cur)}</dd>
            {(p.investValue !== 0 || p.investments.length > 0) && <><dt className="text-slate-400">Assets &amp; investments</dt><dd className="text-right text-slate-100">{formatMoney(p.investValue, cur)}</dd></>}
            {p.lent > 0 && <><dt className="text-slate-400">Owed to you</dt><dd className="text-right text-slate-100">{formatMoney(p.lent, cur)}</dd></>}
            {p.owe > 0 && <><dt className="text-slate-400">You owe</dt><dd className="text-right text-red-400">−{formatMoney(p.owe, cur)}</dd></>}
          </dl>
        </div>

        {/* ── Pay yourself first ── */}
        <div className="bg-app py-4 md:px-5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="t-kicker">Pay yourself first · {monthName}</span>
            {target != null && !editing && (
              <button type="button" onClick={() => { setVal(String(target)); setEditing(true); }} className="text-slate-400 hover:text-slate-100" aria-label="Edit monthly target">
                <Pencil size={13} />
              </button>
            )}
          </div>
          {target == null || editing ? (
            <>
              <p className="text-[13px] text-slate-300 leading-snug">
                Decide what future-you gets each month — savings, investments and debt repayments — and move it the day income arrives, before spending.
              </p>
              {targetEditor}
            </>
          ) : (
            <>
              <div className="text-[26px] font-extrabold tracking-[-0.02em] tabular-nums leading-tight text-slate-100">
                {money(future)} <span className="text-[15px] font-semibold text-slate-400">of {formatMoney(target, cur)}</span>
              </div>
              <Progress value={target > 0 ? (future / target) * 100 : 0} tone="accent" className="my-1" />
              <div className="text-xs text-slate-400 tabular-nums">
                {hit
                  ? 'Target reached — future-you says thanks.'
                  : `${formatMoney(target - future, cur)} to go · saved ${formatMoney(p.month.toSavings, cur)} · repaid ${formatMoney(p.month.repaid, cur)}`}
              </div>
            </>
          )}
        </div>

        {/* ── Safe to spend ── */}
        <div className="bg-app py-4 md:pl-5 flex flex-col gap-1.5">
          <div className="t-kicker">Safe to spend</div>
          {p.safePerDay == null ? (
            <p className="text-[13px] text-slate-300 leading-snug">Record this month’s income to see how much you can spend each day.</p>
          ) : p.safePerDay < 0 ? (
            <>
              <div className="text-[26px] font-extrabold tracking-[-0.02em] tabular-nums leading-tight text-red-400">{money(-p.leftToSpend)} over</div>
              <div className="text-xs text-slate-400 leading-snug">
                Spending{target ? ' plus your target' : ''} is above this month’s income. Every day without extra spending closes the gap.
              </div>
            </>
          ) : (
            <>
              <div className="text-[26px] font-extrabold tracking-[-0.02em] tabular-nums leading-tight text-slate-100">
                {money(p.safePerDay)} <span className="text-[15px] font-semibold text-slate-400">/ day</span>
              </div>
              <div className="text-xs text-slate-400 leading-snug tabular-nums">
                For the next {p.daysLeft} day{p.daysLeft === 1 ? '' : 's'} · {formatMoney(p.leftToSpend, cur)} left
                {p.stillToPutAside > 0 ? ` after setting aside ${formatMoney(p.stillToPutAside, cur)}` : ''}
                {p.month.income === 0 ? ` · based on ${lastName}’s income` : ''}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Links: debt plan, investments ── */}
      {(p.owe > 0 || p.investments.length > 0) && (
        <div className="flex flex-col md:flex-row gap-2 md:gap-6">
          {p.owe > 0 && (
            <button type="button" onClick={() => navigate('/debt')} className="flex items-center gap-2 text-sm text-left text-slate-100 hover:text-blue-400 transition-colors tabular-nums">
              <span className="w-[2px] h-4 bg-red-500" />
              {p.debtFreeDate
                ? <>Debt-free by <b>{monthYear(p.debtFreeDate)}</b> at your current pace</>
                : <>Record a repayment to see your debt-free date</>}
              <ChevronRight size={14} />
            </button>
          )}
          {p.investments.length > 0 && (
            <button type="button" onClick={() => navigate('/investments')} className="flex items-center gap-2 text-sm text-left text-slate-100 hover:text-blue-400 transition-colors tabular-nums">
              <span className="w-[2px] h-4 bg-blue-500" />
              Assets &amp; investments worth <b>{formatMoney(p.investValue, cur)}</b>
              <span className={cx('text-xs font-semibold', p.investGain < 0 ? 'text-red-400' : 'text-slate-400')}>
                {p.investGain >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(p.investGain), cur)}
              </span>
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
