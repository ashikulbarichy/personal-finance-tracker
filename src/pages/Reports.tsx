import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { convertManual, loadManualRates } from '../lib/manualRates';
import { formatCompact, formatMoney } from '../lib/money';
import { NetWorthChart } from '../components/plan/NetWorthChart';
import { useMoneyPlan } from '../components/plan/useMoneyPlan';
import { EmptyState, Kpi, KpiStrip, PageHeader, SegmentedControl, Skeleton, cx } from '../components/ui';

type Range = '3' | '6' | '12';
interface Txn {
  id: string;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  currency: string;
  category_id: string | null;
  payee_id: string | null;
  payer_id: string | null;
  transfer_pair_id: string | null;
  is_adjustment: boolean;
  transaction_date: string;
}
interface MonthPoint { key: string; label: string; full: string; income: number; spending: number }

const TX_COLS = 'id, title, amount, type, currency, category_id, payee_id, payer_id, transfer_pair_id, is_adjustment, transaction_date';
const PAGE = 1000;

const parseDate = (s: string) => (s.length === 10 ? new Date(`${s}T00:00:00`) : new Date(s));
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const pctDelta = (now: number, last: number) => (last > 0 ? Math.round((now / last - 1) * 100) : null);
const deltaLabel = (d: number | null) => (d == null ? '—' : `${d > 0 ? '▲ ' : d < 0 ? '▼ ' : ''}${Math.abs(d)}%`);

/* ── Main ────────────────────────────────────────────────────────────────── */
export function Reports() {
  const { user } = useAuth();
  const { defaultCurrency: cur } = useUserPrefs();
  const navigate = useNavigate();

  const [range, setRange] = useState<Range>('6');
  const { history: netHistory } = useMoneyPlan();
  const [catMode, setCatMode] = useState<'expense' | 'income'>('expense');
  const [peopleMode, setPeopleMode] = useState<'pay' | 'paid'>('pay');
  const [hover, setHover] = useState<number | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [catNames, setCatNames] = useState<Record<string, string>>({});
  const [payeeNames, setPayeeNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [ratesVer, setRatesVer] = useState(0);

  const now = useMemo(() => new Date(), []);

  /* Always load the full 12-month window so switching range is instant. */
  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString();
    const fetchTxns = async () => {
      const all: Txn[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from('transactions').select(TX_COLS)
          .eq('user_id', user.id).gte('transaction_date', start)
          .order('transaction_date', { ascending: true }).range(from, from + PAGE - 1);
        if (error || !data) break;
        all.push(...(data as Txn[]));
        if (data.length < PAGE) break;
      }
      return all;
    };
    const [rows, { data: cats }, { data: payees }] = await Promise.all([
      fetchTxns(),
      supabase.from('categories').select('id, name').eq('user_id', user.id),
      supabase.from('payees').select('id, name').eq('user_id', user.id),
    ]);
    setTxns(rows.map((t) => ({ ...t, amount: Number(t.amount) })));
    setCatNames(Object.fromEntries((cats ?? []).map((c) => [c.id, c.name])));
    setPayeeNames(Object.fromEntries((payees ?? []).map((p) => [p.id, p.name])));
    setRatesVer((v) => v + 1);
    setLoading(false);
  }, [user, now]);

  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener('ft-data-changed', on);
    return () => window.removeEventListener('ft-data-changed', on);
  }, [load]);

  const rates = useMemo(() => loadManualRates(user?.id), [user?.id, ratesVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const conv = useCallback((amount: number, from: string) => convertManual(amount, from || cur, cur, cur, rates), [cur, rates]);

  const n = Number(range);
  const thisKey = monthKey(now);
  const lastKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });
  const lastMonthName = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'long' });

  /* ── Aggregations (transfer legs excluded everywhere) ─────────────────── */
  const data = useMemo(() => {
    const months: MonthPoint[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const isCur = i === 0;
      months.push({
        key: monthKey(d),
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        full: isCur ? `${d.toLocaleDateString('en-US', { month: 'long' })} · to date` : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        income: 0,
        spending: 0,
      });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    const catNow = { expense: new Map<string, number>(), income: new Map<string, number>() };
    const catLast = { expense: new Map<string, number>(), income: new Map<string, number>() };
    // People over the whole selected range: who you pay / who pays you.
    const people = { pay: new Map<string, { v: number; n: number }>(), paid: new Map<string, { v: number; n: number }>() };
    const firstKey = months[0]?.key ?? thisKey;

    txns.forEach((t) => {
      if (t.transfer_pair_id || t.is_adjustment) return;
      const k = monthKey(parseDate(t.transaction_date));
      const v = conv(t.amount, t.currency);
      const m = byKey.get(k);
      if (m) { if (t.type === 'income') m.income += v; else if (t.type === 'expense') m.spending += v; }
      if (t.type !== 'expense' && t.type !== 'income') return;
      const kind = t.type;
      const cat = t.category_id ?? '__none';
      if (k === thisKey) catNow[kind].set(cat, (catNow[kind].get(cat) ?? 0) + v);
      else if (k === lastKey) catLast[kind].set(cat, (catLast[kind].get(cat) ?? 0) + v);
      if (k >= firstKey) {
        const pid = kind === 'expense' ? t.payee_id : t.payer_id;
        const who = (pid && payeeNames[pid]) || (kind === 'expense' ? t.title?.trim() : '') || '';
        if (who) {
          const m = people[kind === 'expense' ? 'pay' : 'paid'];
          const e = m.get(who) ?? { v: 0, n: 0 };
          e.v += v; e.n += 1;
          m.set(who, e);
        }
      }
    });

    const sumI = months.reduce((s, m) => s + m.income, 0);
    const sumO = months.reduce((s, m) => s + m.spending, 0);

    let run = 0;
    const cumNet = months.map((m) => (run += m.income - m.spending));

    const catList = (kind: 'expense' | 'income') => {
      const ids = new Set([...catNow[kind].keys(), ...catLast[kind].keys()]);
      const list = Array.from(ids).map((id) => {
        const nowV = catNow[kind].get(id) ?? 0, lastV = catLast[kind].get(id) ?? 0;
        return { id, name: id === '__none' ? 'Uncategorized' : catNames[id] ?? 'Category', now: nowV, last: lastV, d: pctDelta(nowV, lastV) };
      }).sort((a, b) => b.now - a.now || b.last - a.last).slice(0, 8);
      return { list, max: Math.max(1, ...list.map((c) => Math.max(c.now, c.last))) };
    };
    const peopleList = (key: 'pay' | 'paid') => {
      const list = Array.from(people[key].entries()).sort((a, b) => b[1].v - a[1].v).slice(0, 6).map(([name, e]) => ({ name, v: e.v, n: e.n }));
      return { list, max: list[0]?.v ?? 1 };
    };

    return { months, sumI, sumO, cumNet, catSets: { expense: catList('expense'), income: catList('income') }, peopleSets: { pay: peopleList('pay'), paid: peopleList('paid') } };
  }, [txns, conv, n, now, thisKey, lastKey, catNames, payeeNames]);

  const { months, sumI, sumO, cumNet, catSets, peopleSets } = data;
  const { list: cats, max: cmax } = catSets[catMode];
  const { list: payees, max: pmax } = peopleSets[peopleMode];
  // Up/down colouring: more spending is bad, less income is bad.
  const deltaBad = (d: number | null) => d != null && (catMode === 'expense' ? d > 0 : d < 0);
  const catEmpty = catMode === 'expense' ? 'No spending this month or last.' : 'No income this month or last.';
  const peopleEmpty = peopleMode === 'pay'
    ? `No payees in the last ${n} months.`
    : `No payers in the last ${n} months — choose who paid you when adding income.`;
  const catSwitch = (
    <SegmentedControl value={catMode} onChange={setCatMode} options={[{ value: 'expense', label: 'Spending' }, { value: 'income', label: 'Income' }]} />
  );
  const peopleSwitch = (
    <SegmentedControl value={peopleMode} onChange={setPeopleMode} options={[{ value: 'pay', label: 'Who you pay' }, { value: 'paid', label: 'Who pays you' }]} />
  );
  const peopleLink = (name: string) => navigate(`/transactions?q=${encodeURIComponent(name)}`);
  const hi = hover == null || hover >= months.length ? months.length - 1 : hover;
  const hm = months[hi];
  const amx = Math.max(1, ...months.flatMap((m) => [m.income, m.spending])) * 1.08;
  const hSaved = hm ? hm.income - hm.spending : 0;
  const hSavePct = hm && hm.income > 0 ? Math.round((hSaved / hm.income) * 100) : null;
  const net = sumI - sumO;
  const savingsRate = sumI > 0 ? Math.round((1 - sumO / sumI) * 100) : null;
  const sinceLabel = months[0] ? new Date(`${months[0].key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';

  /* ── Cumulative net line geometry ─────────────────────────────────────── */
  const line = useMemo(() => {
    const W = 460, H = 180;
    const lo = Math.min(0, ...cumNet), hiV = Math.max(0, ...cumNet);
    const pad = (hiV - lo || 1) * 0.08;
    const min = lo - (lo < 0 ? pad : 0), max = hiV + pad;
    const X = (i: number) => (cumNet.length > 1 ? (i / (cumNet.length - 1)) * W : W / 2);
    const Y = (v: number) => H - ((v - min) / (max - min || 1)) * H;
    const p = cumNet.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    const area = cumNet.length ? `${p} L${X(cumNet.length - 1).toFixed(1)} ${H} L${X(0).toFixed(1)} ${H} Z` : '';
    return { W, H, path: p, area, zeroY: (Y(0) / H) * 100, showZero: lo < 0, dots: cumNet.map((v, i) => ({ x: (X(i) / W) * 100, y: (Y(v) / H) * 100 })) };
  }, [cumNet]);

  const rangeOpts = [{ value: '3' as Range, label: '3M' }, { value: '6' as Range, label: '6M' }, { value: '12' as Range, label: '12M' }];
  const pickRange = (v: Range) => { setRange(v); setHover(null); };
  const hasAny = months.some((m) => m.income > 0 || m.spending > 0);

  if (loading) {
    return (
      <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 flex flex-col gap-7">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const legendHeader = (big: boolean) => (
    <div className="flex gap-4 md:gap-[18px] tabular-nums">
      <span className={cx('flex items-center gap-1.5 font-extrabold text-slate-100', big ? 'text-lg' : 'text-[17px]')}>
        <span className="w-2.5 h-2.5 bg-slate-100" />{formatMoney(hm?.income ?? 0, cur)}
      </span>
      <span className={cx('flex items-center gap-1.5 font-extrabold text-slate-100', big ? 'text-lg' : 'text-[17px]')}>
        <span className="w-2.5 h-2.5 bg-blue-500" />{formatMoney(hm?.spending ?? 0, cur)}
      </span>
    </div>
  );

  const bars = (height: string, labelSize: string) => (
    <div>
      <div className={cx('flex items-end rule-b', height)} onMouseLeave={() => setHover(null)}>
        {months.map((m, i) => (
          <div key={m.key} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}
            className={cx('flex-1 h-full flex items-end justify-center gap-[3px] cursor-pointer transition-opacity duration-200', i === hi ? 'opacity-100' : 'opacity-[0.35]')}
            title={`${m.full}: income ${formatMoney(m.income, cur)}, spending ${formatMoney(m.spending, cur)}`}>
            <div className="w-[34%] max-w-[20px] bg-slate-100 transition-[height] duration-500 ease-ds" style={{ height: `${(m.income / amx) * 100}%` }} />
            <div className="w-[34%] max-w-[20px] bg-blue-500 transition-[height] duration-500 ease-ds" style={{ height: `${(m.spending / amx) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex pt-1.5">
        {months.map((m, i) => (
          <span key={m.key} className={cx('flex-1 text-center', labelSize, i === hi ? 'text-slate-100 font-bold' : 'text-slate-400')}>{m.label}</span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-5 md:gap-7">
      <PageHeader
        className="hidden md:flex"
        title="Analytics"
        description={`All accounts in ${cur} · other currencies converted at your manual rates`}
        actions={<SegmentedControl options={rangeOpts} value={range} onChange={pickRange} />}
      />

      {/* ═════════════ PHONE ═════════════ */}
      <div className="md:hidden flex flex-col gap-4">
        <SegmentedControl options={rangeOpts} value={range} onChange={pickRange} stretch />
        <div>
          <div className="text-xs text-slate-400">{hm?.full}</div>
          {legendHeader(false)}
        </div>
        {bars('h-[170px]', 'text-[10px]')}
        <div className="rule-t pt-3">
          <div className="t-kicker pb-2">Net worth over time</div>
          <NetWorthChart history={netHistory} currency={cur} height={150} />
        </div>
        <div className="rule-t">
          <div className="flex items-center justify-between gap-2 pt-3 pb-1.5">
            <span className="t-kicker">By category · {monthName}</span>
            {catSwitch}
          </div>
          {cats.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">{catEmpty}</p>
          ) : cats.map((c) => (
            <div key={c.id} className="flex flex-col gap-1.5 py-2.5 row-rule">
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-semibold text-slate-100 truncate">{c.name}</span>
                <span className="tabular-nums text-slate-100 shrink-0">
                  {formatMoney(c.now, cur)}{' '}
                  <span className={cx('text-xs font-semibold', deltaBad(c.d) ? 'text-red-400' : 'text-slate-400')}>{deltaLabel(c.d)}</span>
                </span>
              </div>
              <div className="h-1.5 bg-slate-900"><div className="h-full bg-slate-100" style={{ width: `${(c.now / cmax) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="rule-t">
          <div className="flex flex-col gap-2 pt-3 pb-1.5">
            <span className="t-kicker">People · last {n} months</span>
            {peopleSwitch}
          </div>
          {payees.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">{peopleEmpty}</p>
          ) : payees.map((p, i) => (
            <button key={p.name} type="button" onClick={() => peopleLink(p.name)}
              className="w-full grid grid-cols-[28px_minmax(0,1fr)_auto] gap-2.5 items-center min-h-[56px] row-rule text-left">
              <span className="text-xs font-extrabold text-slate-400">{String(i + 1).padStart(2, '0')}</span>
              <div className="flex flex-col gap-[5px] min-w-0">
                <span className="text-[15px] font-semibold text-slate-100 truncate">{p.name} <span className="text-xs font-normal text-slate-400">· {p.n}×</span></span>
                <div className="h-1 bg-slate-900"><div className="h-full bg-blue-500" style={{ width: `${(p.v / pmax) * 100}%` }} /></div>
              </div>
              <span className="text-sm tabular-nums text-slate-100">{formatMoney(p.v, cur)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═════════════ WEB ═════════════ */}
      <div className="hidden md:flex flex-col gap-7">
        <KpiStrip cols={4}>
          <Kpi label="Avg. monthly income" value={formatMoney(sumI / n, cur)} note={`Last ${n} months`} />
          <Kpi label="Avg. monthly spending" value={formatMoney(sumO / n, cur)} note={`Last ${n} months`} />
          <Kpi label="Savings rate" value={savingsRate == null ? '—' : `${savingsRate}%`} note="Income kept after spending" noteTone={savingsRate != null && savingsRate < 0 ? 'accent' : 'muted'} />
          <Kpi label="Balance change" value={formatMoney(net, cur, { sign: true })} note={`Income minus spending since ${sinceLabel}`} noteTone={net < 0 ? 'accent' : 'muted'} />
        </KpiStrip>

        <section>
          <h2 className="text-[17px] font-extrabold text-slate-100 mb-3">Net worth over time <span className="text-xs font-normal text-slate-400">· month-end, everything you own minus everything you owe</span></h2>
          <NetWorthChart history={netHistory} currency={cur} />
        </section>

        {!hasAny ? (
          <EmptyState title="Nothing to analyse yet" description={`No income or spending in the last ${n} months. Add transactions and they show up here.`} />
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-10">
              <section className="min-w-0">
                <h2 className="text-[17px] font-extrabold text-slate-100 mb-3">Income and spending</h2>
                <div className="flex gap-7 items-end mb-4 min-h-[52px]">
                  <div>
                    <div className="text-xs text-slate-400">{hm?.full}</div>
                    {legendHeader(true)}
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-xs text-slate-400">Saved{hSavePct != null ? ` · ${hSavePct}%` : ''}</div>
                    <div className={cx('text-lg font-extrabold tabular-nums', hSaved < 0 ? 'text-red-400' : 'text-slate-100')}>{formatMoney(hSaved, cur, { sign: true })}</div>
                  </div>
                </div>
                {bars('h-[220px]', 'text-[11px]')}
              </section>

              <section className="min-w-0">
                <h2 className="text-[17px] font-extrabold text-slate-100 mb-3">Cumulative net</h2>
                <div className="mb-4 min-h-[52px]">
                  <div className="text-xs text-slate-400">Income minus spending since {sinceLabel}</div>
                  <div className={cx('text-[26px] font-extrabold tracking-[-0.02em] tabular-nums leading-tight', net < 0 ? 'text-red-400' : 'text-slate-100')}>{formatMoney(net, cur, { sign: true })}</div>
                </div>
                <div className="relative h-[220px] rule-b">
                  {line.showZero && (
                    <div className="absolute inset-x-0 border-t border-dashed border-line-strong" style={{ top: `${line.zeroY}%` }}>
                      <span className="absolute right-0 -top-4 text-[11px] text-slate-400 tabular-nums">{formatCompact(0, cur)}</span>
                    </div>
                  )}
                  <svg viewBox={`0 0 ${line.W} ${line.H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
                    {line.area && <path d={line.area} fill="rgb(var(--slate-900))" />}
                    <path d={line.path} fill="none" stroke="rgb(var(--slate-100))" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                  </svg>
                  {line.dots.map((d, i) => (
                    <div key={i} className={cx('absolute -ml-[3px] -mt-[3px] w-1.5 h-1.5', i === hi ? 'bg-blue-500 w-2 h-2 -ml-1 -mt-1' : 'bg-slate-100')}
                      style={{ left: `${d.x}%`, top: `${d.y}%` }} />
                  ))}
                </div>
                <div className="flex justify-between pt-1.5">
                  {months.filter((_, i) => n <= 6 || i % 2 === 0).map((m) => (
                    <span key={m.key} className="text-[11px] text-slate-400">{m.label}</span>
                  ))}
                </div>
              </section>
            </div>

            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-10 rule-t pt-6">
              <section className="min-w-0">
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <h2 className="flex items-baseline gap-3 text-[17px] font-extrabold text-slate-100">By category · {monthName}
                    <span className="text-xs font-normal text-slate-400 flex items-center gap-1.5"><span className="w-2.5 h-[3px] bg-slate-700" />{lastMonthName}</span>
                  </h2>
                  {catSwitch}
                </div>
                {cats.length === 0 ? (
                  <p className="text-sm text-slate-400 py-3">{catEmpty}</p>
                ) : cats.map((c) => (
                  <div key={c.id} className="grid grid-cols-[130px_minmax(0,1fr)_96px_60px] gap-3.5 items-center py-2 row-rule text-sm">
                    <span className="font-semibold text-slate-100 truncate">{c.name}</span>
                    <div className="relative h-3.5" title={`${lastMonthName}: ${formatMoney(c.last, cur)}`}>
                      <div className="absolute left-0 top-0 h-2.5 bg-slate-100 transition-[width] duration-500" style={{ width: `${(c.now / cmax) * 100}%` }} />
                      <div className="absolute left-0 bottom-0 h-[2px] bg-slate-700" style={{ width: `${(c.last / cmax) * 100}%` }} />
                    </div>
                    <span className="text-right tabular-nums text-slate-100">{formatMoney(c.now, cur)}</span>
                    <span className={cx('text-right text-xs font-semibold', deltaBad(c.d) ? 'text-red-400' : 'text-slate-400')}>{deltaLabel(c.d)}</span>
                  </div>
                ))}
              </section>

              <section className="min-w-0">
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <h2 className="text-[17px] font-extrabold text-slate-100">People <span className="text-xs font-normal text-slate-400">· last {n} months</span></h2>
                  {peopleSwitch}
                </div>
                {payees.length === 0 ? (
                  <p className="text-sm text-slate-400 py-3">{peopleEmpty}</p>
                ) : payees.map((p, i) => (
                  <button key={p.name} type="button" onClick={() => peopleLink(p.name)}
                    className="w-full grid grid-cols-[28px_minmax(0,1fr)_auto] gap-2.5 items-center py-2.5 row-rule text-left hover-tint">
                    <span className="text-xs font-extrabold text-slate-400">{String(i + 1).padStart(2, '0')}</span>
                    <div className="flex flex-col gap-[5px] min-w-0">
                      <span className="text-sm font-semibold text-slate-100 truncate">{p.name} <span className="text-xs font-normal text-slate-400">· {p.n} payment{p.n === 1 ? '' : 's'}</span></span>
                      <div className="h-1 bg-slate-900"><div className="h-full bg-blue-500" style={{ width: `${(p.v / pmax) * 100}%` }} /></div>
                    </div>
                    <span className="text-sm tabular-nums text-slate-100">{formatMoney(p.v, cur)}</span>
                  </button>
                ))}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
