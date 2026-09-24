import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Eye, EyeOff, Tag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { usePrivacy } from '../contexts/PrivacyContext';
import { convertManual, loadManualRates } from '../lib/manualRates';
import { formatCompact, formatMoney } from '../lib/money';
import { daysLeftInMonth, monthProgress } from '../lib/dateUtils';
import { useBudgets } from '../components/budgets/useBudgets';
import { BudgetList } from '../components/budgets/BudgetList';
import { AnimatedNumber, Avatar, Button, EmptyState, Kpi, KpiStrip, SectionTitle, Skeleton, cx } from '../components/ui';
import { NotificationBell } from '../components/notifications/NotificationPanel';
import { MoneyPlanCard } from '../components/plan/MoneyPlanCard';

/** True below the md breakpoint — Home renders the money plan in one layout only. */
function useIsPhone() {
  const q = '(max-width: 767px)';
  const [phone, setPhone] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

/* ── Types ───────────────────────────────────────────────────────────────── */
interface Account { id: string; name: string; type: string; balance: number; currency: string }
interface Txn {
  id: string;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  currency: string;
  category_id: string | null;
  account_id: string;
  payee_id: string | null;
  transfer_pair_id: string | null;
  is_adjustment?: boolean;
  transaction_date: string;
}
interface Recurring { id: string; name: string; amount: number; type: 'income' | 'expense'; next_date: string; account_id: string }

const ACCOUNT_TYPE: Record<string, string> = {
  checking: 'Bank account', savings: 'Savings', credit_card: 'Credit card', virtual_card: 'Virtual card', cash: 'Cash',
  investment: 'Investment', multi_currency: 'Multi-currency', mfs: 'Mobile wallet',
};

/** Parse a `YYYY-MM-DD` date as local midnight; full timestamps as-is. */
const parseDate = (s: string) => (s.length === 10 ? new Date(`${s}T00:00:00`) : new Date(s));
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (d: Date, from: Date) => Math.round((startOfDay(d).getTime() - startOfDay(from).getTime()) / 86400000);
const inDays = (d: Date, now: Date) => {
  const n = dayDiff(d, now);
  if (n < 0) return 'Overdue';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `in ${n} days`;
};

/** A "nice" step for ~4 horizontal gridlines. */
function niceStep(max: number) {
  const raw = max / 4;
  if (raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export function Dashboard() {
  const { user } = useAuth();
  const { defaultCurrency: cur } = useUserPrefs();
  const { hidden, toggle } = usePrivacy();
  const navigate = useNavigate();
  const budgets = useBudgets();

  const [loading, setLoading] = useState(true);
  const isPhone = useIsPhone();
  // Lets the phone "spent" bar grow from 0 after first paint.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (loading) return;
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, [loading]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]); // since the 1st of last month
  const [recent, setRecent] = useState<Txn[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [catNames, setCatNames] = useState<Record<string, string>>({});
  const [payeeNames, setPayeeNames] = useState<Record<string, string>>({});
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  const now = useMemo(() => new Date(), []);
  const rates = useMemo(() => loadManualRates(user?.id), [user?.id, accounts]); // eslint-disable-line react-hooks/exhaustive-deps
  const conv = useCallback((amount: number, from: string) => convertManual(amount, from || cur, cur, cur, rates), [cur, rates]);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const today = new Date();
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    const [accRes, txRes, recentRes, recRes, catRes, payRes] = await Promise.all([
      supabase.from('accounts').select('id, name, type, balance, currency').eq('user_id', user.id).eq('is_active', true).order('name'),
      supabase.from('transactions')
        .select('id, title, amount, type, currency, category_id, account_id, payee_id, transfer_pair_id, is_adjustment, transaction_date')
        .eq('user_id', user.id).gte('transaction_date', lastMonthStart),
      supabase.from('transactions')
        .select('id, title, amount, type, currency, category_id, account_id, payee_id, transfer_pair_id, is_adjustment, transaction_date')
        .eq('user_id', user.id).order('transaction_date', { ascending: false }).limit(7),
      supabase.from('recurring_transactions').select('id, name, amount, type, next_date, account_id')
        .eq('user_id', user.id).eq('is_active', true).order('next_date', { ascending: true }).limit(3),
      supabase.from('categories').select('id, name').eq('user_id', user.id),
      supabase.from('payees').select('id, name').eq('user_id', user.id),
    ]);
    setAccounts((accRes.data ?? []).map((a) => ({ ...a, balance: Number(a.balance) })) as Account[]);
    setTxns((txRes.data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })) as Txn[]);
    setRecent((recentRes.data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })) as Txn[]);
    setRecurring((recRes.data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as Recurring[]);
    setCatNames(Object.fromEntries((catRes.data ?? []).map((c) => [c.id, c.name])));
    setPayeeNames(Object.fromEntries((payRes.data ?? []).map((p) => [p.id, p.name])));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener('ft-data-changed', on);
    return () => window.removeEventListener('ft-data-changed', on);
  }, [load]);

  /* ── Derived figures ───────────────────────────────────────────────────── */
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });
  const monShort = now.toLocaleDateString('en-US', { month: 'short' });
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthName = lastMonthDate.toLocaleDateString('en-US', { month: 'long' });
  const lastMonShort = lastMonthDate.toLocaleDateString('en-US', { month: 'short' });
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysInLast = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const todayIdx = now.getDate() - 1;

  const acctById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);

  const stats = useMemo(() => {
    const curDaily = Array(daysInMonth).fill(0) as number[];
    const lastDaily = Array(daysInLast).fill(0) as number[];
    let income = 0, lastIncome = 0, uncat = 0;
    txns.forEach((t) => {
      if (t.transfer_pair_id || t.is_adjustment) return; // adjustments aren't income/spending
      const d = parseDate(t.transaction_date);
      const v = conv(t.amount, t.currency);
      const thisMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      const lastMonth = d.getFullYear() === lastMonthDate.getFullYear() && d.getMonth() === lastMonthDate.getMonth();
      if (t.type === 'expense') {
        if (thisMonth) { curDaily[d.getDate() - 1] += v; if (!t.category_id) uncat += 1; }
        else if (lastMonth) lastDaily[d.getDate() - 1] += v;
      } else if (t.type === 'income') {
        if (thisMonth) income += v;
        else if (lastMonth) lastIncome += v;
      }
    });
    const cum = (a: number[]) => { let x = 0; return a.map((v) => (x += v)); };
    const curCum = cum(curDaily).slice(0, todayIdx + 1);
    const lastCum = cum(lastDaily).slice(0, daysInMonth);
    const spent = curCum[curCum.length - 1] ?? 0;
    const lastSame = lastCum[Math.min(todayIdx, lastCum.length - 1)] ?? 0;
    const delta = lastSame > 0 ? Math.round((spent / lastSame - 1) * 100) : null;
    return { curCum, lastCum, spent, lastSame, delta, income, lastIncome, uncat };
  }, [txns, conv, now, daysInMonth, daysInLast, todayIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const balances = useMemo(() => {
    const groups = new Map<string, { cur: string; total: number; rows: Account[] }>();
    accounts.forEach((a) => {
      const c = a.currency || cur;
      const g = groups.get(c) ?? { cur: c, total: 0, rows: [] };
      g.total += a.balance; g.rows.push(a);
      groups.set(c, g);
    });
    const list = Array.from(groups.values()).sort((a, b) => (a.cur === cur ? -1 : b.cur === cur ? 1 : b.rows.length - a.rows.length));
    const totalDefault = accounts.reduce((s, a) => s + conv(a.balance, a.currency), 0);
    return { list, totalDefault, secondary: list.find((g) => g.cur !== cur) ?? null };
  }, [accounts, conv, cur]);

  const bt = budgets.totals;
  const hasBudget = bt.budget > 0;
  const daysLeft = daysLeftInMonth(now);
  const todayPct = monthProgress(now) * 100;

  /* ── Chart geometry ───────────────────────────────────────────────────── */
  const chart = useMemo(() => {
    const W = 620, H = 200;
    const { curCum, lastCum, spent } = stats;
    const mx = Math.max(lastCum[lastCum.length - 1] ?? 0, spent, bt.budget, 1) * 1.1;
    const X = (i: number) => (daysInMonth > 1 ? (i / (daysInMonth - 1)) * W : 0);
    const Y = (v: number) => H - (v / mx) * H;
    const path = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    const step = niceStep(mx);
    const ticks: { y: number; label: string }[] = [];
    for (let v = step; v < mx; v += step) ticks.push({ y: (Y(v) / H) * 100, label: formatCompact(v, cur) });
    const curPath = path(curCum);
    const area = curCum.length ? `${curPath} L${X(curCum.length - 1).toFixed(1)} ${H} L0 ${H} Z` : '';
    return {
      W, H, ticks, cur: curPath, last: path(lastCum), area,
      xPct: (i: number) => (daysInMonth > 1 ? (i / (daysInMonth - 1)) * 100 : 0),
      yPct: (v: number) => (Y(v) / H) * 100,
      budY: (Y(bt.budget) / H) * 100,
    };
  }, [stats, bt.budget, daysInMonth, cur]);

  const onChartMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(daysInMonth - 1, Math.round(((e.clientX - r.left) / r.width) * (daysInMonth - 1))));
    if (i !== hoverDay) setHoverDay(i);
  };

  const hd = hoverDay;
  const hoverCur = hd == null ? stats.spent : hd <= todayIdx ? stats.curCum[hd] ?? 0 : null;
  const hoverLastIdx = Math.min(hd == null ? todayIdx : hd, stats.lastCum.length - 1);
  const hoverLast = stats.lastCum[hoverLastIdx] ?? 0;

  /* ── Row helpers ──────────────────────────────────────────────────────── */
  const txTitle = (t: Txn) => (t.payee_id && payeeNames[t.payee_id]) || t.title || 'Transaction';
  const txCat = (t: Txn) => (t.transfer_pair_id ? 'Transfer' : t.category_id ? catNames[t.category_id] ?? 'Category' : 'Uncategorized');
  const txUncat = (t: Txn) => !t.transfer_pair_id && !t.category_id;
  const txAmt = (t: Txn) => formatMoney(t.type === 'income' ? t.amount : -t.amount, t.currency || cur, { sign: true });
  const shortDate = (s: string) => parseDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const openTx = (t: Txn) => navigate(`/transactions?q=${encodeURIComponent(txTitle(t))}`);

  const upcoming = recurring.map((r) => {
    const d = parseDate(r.next_date);
    const a = acctById[r.account_id];
    return {
      id: r.id,
      day: String(d.getDate()),
      mon: d.toLocaleDateString('en-US', { month: 'short' }),
      name: r.name,
      when: inDays(d, now),
      acctName: a?.name ?? '',
      amount: formatMoney(r.type === 'income' ? r.amount : -r.amount, a?.currency || cur, { sign: true }),
      income: r.type === 'income',
    };
  });

  const eyebrowWeb = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const eyebrowPhone = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  const spentNote = stats.delta == null ? `No spending by this day in ${lastMonthName}` : `${stats.delta >= 0 ? '▲' : '▼'} ${Math.abs(stats.delta)}% vs this point in ${lastMonthName}`;
  const chartDelta = stats.delta == null ? '' : `${stats.delta >= 0 ? '▲' : '▼'} ${Math.abs(stats.delta)}% vs ${lastMonthName}`;
  const budgetNote = bt.over ? `${daysLeft} days left · ${bt.over} categor${bt.over > 1 ? 'ies' : 'y'} over` : `${daysLeft} days left · all on track`;

  /* One encouraging, honest line about where the month stands. */
  const nudge: { text: string; tone: 'good' | 'bad' | 'muted' } | null = (() => {
    if (hasBudget) {
      const left = bt.budget - bt.spent;
      if (left < 0) return { text: `${formatMoney(-left, cur)} over budget this month — ${daysLeft} days to steady it.`, tone: 'bad' };
      const ahead = (bt.spent / bt.budget) * 100 < todayPct;
      return {
        text: `You're ${formatMoney(left, cur)} under budget with ${daysLeft} day${daysLeft === 1 ? '' : 's'} left${ahead ? ' — ahead of pace.' : '.'}`,
        tone: ahead ? 'good' : 'muted',
      };
    }
    if (stats.delta != null && stats.delta < 0) {
      return { text: `Spending is ${Math.abs(stats.delta)}% lower than this point in ${lastMonthName}. Nice.`, tone: 'good' };
    }
    if (recent.length === 0) return { text: 'Add your first transaction to start seeing where your money goes.', tone: 'muted' };
    return null;
  })();
  const nudgeEl = nudge && (
    <p className={cx(
      'border-l-2 pl-3 text-sm leading-snug anim-fade tabular-nums no-mask',
      nudge.tone === 'good' ? 'border-blue-500 text-slate-100' : nudge.tone === 'bad' ? 'border-red-500 text-red-400' : 'border-line-strong text-slate-300',
    )}>
      {nudge.text}
    </p>
  );
  const money = (n: number, c = cur) => <AnimatedNumber value={n} format={(v) => formatMoney(v, c)} />;

  if (loading) {
    return (
      <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 flex flex-col gap-7">
        <Skeleton className="h-16 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const secondaryLine = balances.secondary ? formatMoney(balances.secondary.total, balances.secondary.cur) : undefined;

  return (
    <>
      {/* ═════════════════════════ WEB ═════════════════════════ */}
      <div className="hidden md:flex px-8 pt-7 pb-[120px] flex-col gap-7">
        <div className="flex items-end gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-slate-400 mb-1">{eyebrowWeb}</div>
            <h1 className="text-[32px] font-extrabold tracking-[-0.02em] text-slate-100 leading-[1.12]">Home</h1>
            {nudgeEl && <div className="mt-3">{nudgeEl}</div>}
          </div>
          {stats.uncat > 0 && (
            <Button variant="secondary" onClick={() => navigate('/transactions?view=uncat')}>
              <Tag size={16} />Review {stats.uncat} uncategorized
            </Button>
          )}
        </div>

        <KpiStrip cols={4}>
          <Kpi
            label="Total balance"
            value={money(balances.totalDefault)}
            sub={secondaryLine}
            note={`${accounts.length} account${accounts.length === 1 ? '' : 's'}${balances.secondary ? ` · all in ${cur} at your rates` : ''}`}
          />
          <Kpi label={`Spent · ${monthName}`} value={money(stats.spent)} note={spentNote} noteTone={stats.delta != null && stats.delta > 0 ? 'accent' : 'muted'} />
          <Kpi label={`Income · ${monthName}`} value={money(stats.income)} note={`${formatMoney(stats.lastIncome, cur)} in ${lastMonthName}`} />
          {hasBudget ? (
            <Kpi label="Left to budget" value={money(bt.budget - bt.spent)} note={budgetNote} noteTone={bt.over ? 'accent' : 'muted'} />
          ) : (
            <Kpi
              label={`Kept · ${monthName}`}
              value={<span className={stats.income - stats.spent < 0 ? 'text-red-400' : undefined}>{money(stats.income - stats.spent)}</span>}
              note="Income minus spending so far"
              noteTone={stats.income - stats.spent < 0 ? 'accent' : 'muted'}
            />
          )}
        </KpiStrip>

        {!isPhone && <MoneyPlanCard />}

        <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-10">
          {/* Spending chart */}
          <section className="min-w-0">
            <SectionTitle meta={balances.secondary ? `All accounts · converted to ${cur}` : 'All accounts'} className="mb-3">Spending this month</SectionTitle>
            <div className="flex gap-8 items-end mb-3.5">
              <div>
                <div className="text-xs text-slate-400 flex items-center gap-1.5"><span className="w-3 h-[3px] bg-blue-500" />{hd == null ? `${monthName} to date` : `${monShort} ${hd + 1}`}</div>
                <div className="text-[28px] font-extrabold tracking-[-0.02em] tabular-nums text-slate-100 leading-tight">{hoverCur == null ? '—' : formatMoney(hoverCur, cur)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 flex items-center gap-1.5"><span className="w-3 h-0 border-t-2 border-dashed border-slate-500" />{hd == null ? `Same day in ${lastMonthName}` : `${lastMonShort} ${hoverLastIdx + 1}`}</div>
                <div className="text-lg font-semibold tabular-nums text-slate-300">{formatMoney(hoverLast, cur)}</div>
              </div>
              {chartDelta && <div className={cx('ml-auto text-[13px] font-semibold', stats.delta! > 0 ? 'text-red-400' : 'text-slate-300')}>{chartDelta}</div>}
            </div>
            <div className="relative h-[200px] rule-b cursor-crosshair" onMouseMove={onChartMove} onMouseLeave={() => setHoverDay(null)}>
              {chart.ticks.map((tk) => (
                <div key={tk.y} className="absolute inset-x-0 border-t border-line" style={{ top: `${tk.y}%` }}>
                  <span className="absolute right-0 -top-4 text-[11px] text-slate-400 tabular-nums">{tk.label}</span>
                </div>
              ))}
              {hasBudget && (
                <div className="absolute inset-x-0 border-t border-dashed border-blue-500" style={{ top: `${chart.budY}%` }}>
                  <span className="absolute left-0 -top-[17px] text-[11px] font-semibold text-blue-400 tabular-nums">Budget {formatCompact(bt.budget, cur)}</span>
                </div>
              )}
              <svg viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
                {chart.area && <path d={chart.area} fill="rgb(var(--blue-100))" />}
                <path d={chart.last} fill="none" stroke="rgb(var(--slate-500))" strokeWidth={2} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                <path d={chart.cur} fill="none" stroke="rgb(var(--blue-500))" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] bg-blue-500" style={{ left: `${chart.xPct(todayIdx)}%`, top: `${chart.yPct(stats.spent)}%` }} />
              {hd != null && (
                <>
                  <div className="absolute inset-y-0 w-0 border-l border-slate-100 pointer-events-none" style={{ left: `${chart.xPct(hd)}%` }} />
                  {hoverCur != null && (
                    <div className="absolute w-2 h-2 -ml-1 -mt-1 bg-app border-2 border-blue-500 pointer-events-none" style={{ left: `${chart.xPct(hd)}%`, top: `${chart.yPct(hoverCur)}%` }} />
                  )}
                  <div className="absolute w-2 h-2 -ml-1 -mt-1 bg-app border-2 border-slate-500 pointer-events-none" style={{ left: `${chart.xPct(hd)}%`, top: `${chart.yPct(hoverLast)}%` }} />
                </>
              )}
            </div>
            <div className="flex justify-between text-[11px] text-slate-400 pt-1.5">
              {[1, 8, 15, 22, daysInMonth].map((d) => <span key={d}>{monShort} {d}</span>)}
            </div>
          </section>

          {/* Budgets */}
          <section className="min-w-0">
            <SectionTitle action="All categories" onAction={() => navigate('/categories')} className="mb-1.5">Budgets</SectionTitle>
            {hasBudget && (
              <div className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                <span className="w-[2px] h-2.5 bg-slate-100" />Marker shows where you should be today ({Math.round(todayPct)}% of month)
              </div>
            )}
            <BudgetList rows={budgets.rows} currency={cur} limit={6} />
          </section>
        </div>

        <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-10 rule-t pt-6">
          {/* Recent activity */}
          <section className="min-w-0">
            <SectionTitle action="All transactions" onAction={() => navigate('/transactions')}>Recent activity</SectionTitle>
            {recent.length === 0 ? (
              <EmptyState title="No transactions yet" description="Add your first transaction with the New transaction button." />
            ) : <div className="stagger">{recent.map((t) => (
              <div
                key={t.id}
                onClick={() => openTx(t)}
                className="grid grid-cols-[36px_minmax(0,1fr)_auto_64px] gap-3 items-center min-h-[52px] row-rule cursor-pointer hover-tint"
              >
                <Avatar name={txTitle(t)} />
                <div className="min-w-0 flex flex-col leading-[1.3]">
                  <span className="text-sm font-semibold text-slate-100 truncate">{txTitle(t)}</span>
                  <span className={cx('text-xs truncate', txUncat(t) ? 'text-red-400' : 'text-slate-400')}>{txCat(t)} · {acctById[t.account_id]?.name ?? 'Account'}</span>
                </div>
                <span className={cx('text-sm tabular-nums text-right text-slate-100', t.type === 'income' && !t.transfer_pair_id ? 'font-extrabold' : 'font-medium')}>{txAmt(t)}</span>
                <span className="text-xs text-slate-400 text-right">{shortDate(t.transaction_date)}</span>
              </div>
            ))}</div>}
          </section>

          <section className="min-w-0 flex flex-col gap-7">
            {/* Coming up */}
            <div>
              <SectionTitle action="Recurring" onAction={() => navigate('/recurring')}>Coming up</SectionTitle>
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate-400 py-3 row-rule">Nothing scheduled. Add recurring bills or income to see them here.</p>
              ) : upcoming.map((u) => (
                <div key={u.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto] gap-3 items-center py-[9px] row-rule">
                  <div className="flex flex-col items-start leading-none">
                    <span className="text-xl font-extrabold text-slate-100">{u.day}</span>
                    <span className="text-[11px] uppercase tracking-[0.06em] text-slate-400 mt-[3px]">{u.mon}</span>
                  </div>
                  <div className="flex flex-col leading-[1.3] min-w-0">
                    <span className="text-sm font-semibold text-slate-100 truncate">{u.name}</span>
                    <span className="text-xs text-slate-400 truncate">{u.when}{u.acctName ? ` · ${u.acctName}` : ''}</span>
                  </div>
                  <span className={cx('text-sm tabular-nums text-slate-100', u.income ? 'font-extrabold' : 'font-medium')}>{u.amount}</span>
                </div>
              ))}
            </div>

            {/* Accounts */}
            <div>
              <SectionTitle action="Manage" onAction={() => navigate('/accounts')}>Accounts</SectionTitle>
              {balances.list.length === 0 ? (
                <p className="text-sm text-slate-400 py-3">No accounts yet.</p>
              ) : balances.list.map((g) => (
                <div key={g.cur}>
                  <div className="flex justify-between pt-2 pb-1.5 rule-b t-kicker !text-slate-100">
                    <span>{g.cur}</span><span className="tabular-nums">{formatMoney(g.total, g.cur)}</span>
                  </div>
                  {g.rows.map((a) => (
                    <button key={a.id} type="button" onClick={() => navigate(`/accounts/${a.id}`)}
                      className="w-full flex justify-between gap-2 py-2 row-rule text-sm text-left hover-tint">
                      <span className="truncate text-slate-100">{a.name}</span>
                      <span className="tabular-nums font-semibold text-slate-100">{formatMoney(a.balance, g.cur)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* ═════════════════════════ PHONE ═════════════════════════ */}
      <div className="md:hidden px-5 pt-3 pb-7 flex flex-col gap-[22px]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] text-slate-400">{eyebrowPhone}</div>
            <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-slate-100 leading-tight">Home</h1>
          </div>
          <div className="flex gap-2">
            <NotificationBell className="!w-11 !h-11" size={18} />
            <button type="button" onClick={toggle} aria-label={hidden ? 'Show balances' : 'Hide balances'}
              className="w-11 h-11 grid place-items-center border border-line-strong text-slate-100">
              {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {nudgeEl}

        {/* Totals per currency */}
        <div className="grid grid-cols-2 rule-t rule-b">
          {(balances.list.length ? balances.list.slice(0, 2) : [{ cur, total: 0, rows: [] as Account[] }]).map((g, i) => (
            <div key={g.cur} className={cx('py-3.5 min-w-0', i === 0 ? 'pr-3 rule-r' : 'pl-3.5')}>
              <div className="t-th text-slate-400 mb-1.5">{g.cur}</div>
              <div className="text-[22px] font-extrabold tracking-[-0.02em] tabular-nums text-slate-100 truncate">{money(g.total, g.cur)}</div>
            </div>
          ))}
          {balances.list.length < 2 && (
            <div className="py-3.5 pl-3.5 min-w-0">
              <div className="t-th text-slate-400 mb-1.5">Income · {monShort}</div>
              <div className="text-[22px] font-extrabold tracking-[-0.02em] tabular-nums text-slate-100 truncate">{formatMoney(stats.income, cur)}</div>
            </div>
          )}
        </div>

        {/* Spent this month */}
        <button type="button" onClick={() => navigate('/plan')} className="flex flex-col gap-2.5 p-4 bg-card text-left">
          <div className="flex justify-between w-full t-kicker">
            <span>Spent in {monthName}</span><ChevronRight size={14} />
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-[26px] font-extrabold tabular-nums text-slate-100">{money(stats.spent)}</span>
            {hasBudget && <span className="text-[15px] font-semibold text-slate-300 tabular-nums">of {formatMoney(bt.budget, cur)}</span>}
          </div>
          <div className="relative h-2 w-full bg-slate-800">
            <div className="absolute inset-y-0 left-0 bg-slate-100 transition-[width] duration-700 ease-ds"
              style={{ width: `${hasBudget && grown ? Math.min(100, (bt.spent / bt.budget) * 100) : 0}%` }} />
            <div className="absolute -top-1 -bottom-1 w-[2px] bg-blue-500" style={{ left: `${todayPct}%` }} />
          </div>
          <div className="flex justify-between w-full text-xs">
            <span className="text-slate-300 tabular-nums">
              {hasBudget ? `${formatMoney(bt.budget - bt.spent, cur)} left · ${daysLeft} days to go` : 'No budgets yet · set them in Plan'}
            </span>
            {bt.over > 0 && <span className="text-red-400 font-bold">{bt.over} over</span>}
          </div>
        </button>

        {isPhone && <MoneyPlanCard />}

        {/* Account cards */}
        <div>
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-[17px] font-extrabold text-slate-100">Accounts</span>
            <button type="button" onClick={() => navigate('/accounts')} className="text-sm font-semibold text-blue-400 py-2">See all</button>
          </div>
          {accounts.length === 0 ? (
            <p className="text-sm text-slate-400">No accounts yet.</p>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-5 px-5 snap-x snap-mandatory">
              {accounts.map((a) => (
                <button key={a.id} type="button" onClick={() => navigate(`/accounts/${a.id}`)}
                  className="flex-none w-[150px] snap-start flex flex-col gap-3.5 p-3.5 border border-line-strong bg-app text-left">
                  <span className="flex flex-col leading-[1.3] min-w-0 w-full">
                    <span className="text-sm font-bold text-slate-100 truncate">{a.name}</span>
                    <span className="text-xs text-slate-400 truncate">{ACCOUNT_TYPE[a.type] ?? a.type}</span>
                  </span>
                  <span className="text-base font-extrabold tabular-nums text-slate-100 truncate w-full">{formatMoney(a.balance, a.currency || cur)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Coming up */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[17px] font-extrabold text-slate-100">Coming up</span>
            <button type="button" onClick={() => navigate('/recurring')} className="text-sm font-semibold text-blue-400 py-2">Recurring</button>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">Nothing scheduled.</p>
          ) : upcoming.map((u) => (
            <div key={u.id} className="grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 items-center min-h-[56px] row-rule">
              <div className="flex flex-col leading-none">
                <span className="text-[19px] font-extrabold text-slate-100">{u.day}</span>
                <span className="text-[10px] uppercase tracking-[0.06em] text-slate-400 mt-[3px]">{u.mon}</span>
              </div>
              <div className="flex flex-col leading-[1.3] min-w-0">
                <span className="text-[15px] font-semibold text-slate-100 truncate">{u.name}</span>
                <span className="text-xs text-slate-400 truncate">{u.when}{u.acctName ? ` · ${u.acctName}` : ''}</span>
              </div>
              <span className={cx('text-[15px] tabular-nums text-slate-100', u.income ? 'font-extrabold' : 'font-medium')}>{u.amount}</span>
            </div>
          ))}
        </div>

        {/* Recent */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[17px] font-extrabold text-slate-100">Recent</span>
            <button type="button" onClick={() => navigate('/transactions')} className="text-sm font-semibold text-blue-400 py-2">See all</button>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">No transactions yet.</p>
          ) : <div className="stagger">{recent.slice(0, 6).map((t) => (
            <div key={t.id} onClick={() => openTx(t)} className="grid grid-cols-[38px_minmax(0,1fr)_auto] gap-3 items-center min-h-[60px] row-rule cursor-pointer">
              <Avatar name={txTitle(t)} size={38} />
              <div className="flex flex-col leading-[1.3] min-w-0">
                <span className="text-[15px] font-semibold text-slate-100 truncate">{txTitle(t)}</span>
                <span className={cx('text-xs truncate', txUncat(t) ? 'text-red-400' : 'text-slate-400')}>{txCat(t)} · {shortDate(t.transaction_date)}</span>
              </div>
              <span className={cx('text-[15px] tabular-nums text-slate-100', t.type === 'income' && !t.transfer_pair_id ? 'font-extrabold' : 'font-medium')}>{txAmt(t)}</span>
            </div>
          ))}</div>}
        </div>
      </div>
    </>
  );
}
