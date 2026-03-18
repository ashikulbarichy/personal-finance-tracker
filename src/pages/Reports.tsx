import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, TrendingUp, TrendingDown, Activity, PieChart as PieIcon, BarChart2, UserCheck, Users } from 'lucide-react';

interface CategorySpending {
  category: string;
  amount: number;
  color: string;
}

interface PersonRow {
  name: string;
  amount: number;
  count: number;
}

interface MonthlyCatData {
  months: string[];
  categories: { name: string; color: string; monthAmounts: number[] }[];
  monthTotals: number[];
}

interface DailyPoint {
  date: string;          // "MMM DD"
  income: number;
  expenses: number;
  cumIncome: number;
  cumExpenses: number;
}

/* ── Donut chart ─────────────────────────────────────────────────────────── */
function DonutChart({ slices, total, currency }: { slices: CategorySpending[]; total: number; currency: string }) {
  const R = 60;
  const C = 2 * Math.PI * R;
  const cx = 80;
  const cy = 80;

  let offset = 0;
  const segments = slices.slice(0, 8).map((s) => {
    const pct = total > 0 ? s.amount / total : 0;
    const dash = pct * C;
    const seg = { ...s, dash, gap: C - dash, offset };
    offset += dash;
    return seg;
  });

  if (slices.length === 0) return null;

  return (
    <svg viewBox="0 0 160 160" className="w-40 h-40 shrink-0">
      {segments.map((seg, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke={seg.color}
          strokeWidth={16}
          strokeDasharray={`${seg.dash} ${seg.gap}`}
          strokeDashoffset={-seg.offset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={44} fill="#141927" />
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#f1f5f9" fontSize="11" fontWeight="700">
        {currency}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#f1f5f9" fontSize="10" fontWeight="700">
        {total.toFixed(0)}
      </text>
      <text x={cx} y={cy + 20} textAnchor="middle" fill="#64748b" fontSize="7">
        total spend
      </text>
    </svg>
  );
}

/* ── Filled Pie chart ────────────────────────────────────────────────────── */
function PieChart({ slices, total, currency }: { slices: CategorySpending[]; total: number; currency: string }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const cx = 110;
  const cy = 110;
  const r = 90;
  const innerR = 42;

  const visible = slices.slice(0, 10);

  const segments = useMemo(() => {
    let startAngle = -Math.PI / 2;
    return visible.map((s) => {
      const pct = total > 0 ? s.amount / total : 0;
      const angle = pct * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const mid = startAngle + angle / 2;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const lx = cx + (r + 18) * Math.cos(mid);
      const ly = cy + (r + 18) * Math.sin(mid);
      const large = angle > Math.PI ? 1 : 0;
      const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
      const result = { ...s, path, pct, mid, lx, ly, startAngle, endAngle };
      startAngle = endAngle;
      return result;
    });
  }, [visible, total]);

  if (slices.length === 0) {
    return (
      <div className="flex items-center justify-center h-56 text-sm text-slate-600">
        No expense data for this period
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row items-center gap-6">
      {/* SVG Pie */}
      <div className="relative shrink-0">
        <svg viewBox="0 0 220 220" className="w-56 h-56">
          {segments.map((seg) => {
            const isHov = hovered === seg.category;
            const scale = isHov ? 1.04 : 1;
            return (
              <path
                key={seg.category}
                d={seg.path}
                fill={seg.color}
                fillOpacity={hovered && !isHov ? 0.45 : 0.9}
                stroke="#0b0f1a"
                strokeWidth={2}
                style={{ transform: `scale(${scale})`, transformOrigin: `${cx}px ${cy}px`, transition: 'all 0.15s ease', cursor: 'pointer' }}
                onMouseEnter={() => setHovered(seg.category)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
          {/* Inner hole */}
          <circle cx={cx} cy={cy} r={innerR} fill="#141927" />
          {/* Center label */}
          {hovered ? (
            <>
              <text x={cx} y={cy - 8} textAnchor="middle" fill="#f1f5f9" fontSize="9" fontWeight="700">
                {segments.find((s) => s.category === hovered)?.category.slice(0, 12)}
              </text>
              <text x={cx} y={cy + 6} textAnchor="middle" fill="#f1f5f9" fontSize="11" fontWeight="800">
                {(segments.find((s) => s.category === hovered)?.pct ?? 0 * 100).toFixed(1)}%
              </text>
              <text x={cx} y={cy + 18} textAnchor="middle" fill="#64748b" fontSize="7">
                {currency} {segments.find((s) => s.category === hovered)?.amount.toFixed(0)}
              </text>
            </>
          ) : (
            <>
              <text x={cx} y={cy - 5} textAnchor="middle" fill="#94a3b8" fontSize="7">Total spend</text>
              <text x={cx} y={cy + 10} textAnchor="middle" fill="#f1f5f9" fontSize="10" fontWeight="700">
                {currency} {total.toFixed(0)}
              </text>
            </>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
        {segments.map((seg) => (
          <div
            key={seg.category}
            className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-all cursor-default ${hovered === seg.category ? 'bg-slate-700/60' : 'hover:bg-slate-800/60'}`}
            onMouseEnter={() => setHovered(seg.category)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-300 truncate">{seg.category}</p>
              <p className="text-[10px] text-slate-500">{currency} {seg.amount.toFixed(2)}</p>
            </div>
            <span className="text-xs font-bold shrink-0" style={{ color: seg.color }}>
              {(seg.pct * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Horizontal bar chart for categories ─────────────────────────────────── */
function CategoryBarChart({ slices, total, currency }: { slices: CategorySpending[]; total: number; currency: string }) {
  const maxAmt = Math.max(...slices.map((s) => s.amount), 1);

  if (slices.length === 0) {
    return <div className="flex items-center justify-center h-40 text-sm text-slate-600">No expense data</div>;
  }

  return (
    <div className="space-y-3">
      {slices.map((s) => (
        <div key={s.category}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-sm font-medium text-slate-200">{s.category}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-slate-500">{total > 0 ? ((s.amount / total) * 100).toFixed(1) : 0}%</span>
              <span className="text-sm font-semibold text-slate-100 w-28 text-right">
                {currency} {s.amount.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="relative h-6 bg-slate-800/80 rounded-lg overflow-hidden">
            <div
              className="h-full rounded-lg transition-all duration-500"
              style={{ width: `${(s.amount / maxAmt) * 100}%`, backgroundColor: s.color, opacity: 0.85 }}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white/70">
              {total > 0 ? ((s.amount / total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Area / line chart for cumulative trend ──────────────────────────────── */
function TrendAreaChart({ points }: { points: DailyPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-44 text-xs text-slate-600">
        Not enough data for trend
      </div>
    );
  }

  const W = 500;
  const H = 140;
  const padX = 8;
  const padY = 12;

  const maxVal = Math.max(...points.flatMap((p) => [p.cumIncome, p.cumExpenses]), 1);

  const toX = (i: number) => padX + (i / (points.length - 1)) * (W - padX * 2);
  const toY = (v: number) => padY + (1 - v / maxVal) * (H - padY * 2);

  const incomePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)},${toY(p.cumIncome)}`).join(' ');
  const expensePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)},${toY(p.cumExpenses)}`).join(' ');

  const incomeArea = `${incomePath} L ${toX(points.length - 1)},${H - padY} L ${toX(0)},${H - padY} Z`;
  const expenseArea = `${expensePath} L ${toX(points.length - 1)},${H - padY} L ${toX(0)},${H - padY} Z`;

  // Pick a few date labels to show
  const labelIndices = [0, Math.floor(points.length / 3), Math.floor((2 * points.length) / 3), points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={padX} y1={toY(f * maxVal)} x2={W - padX} y2={toY(f * maxVal)} stroke="#1e293b" strokeWidth={0.7} />
      ))}

      {/* Areas */}
      <path d={incomeArea} fill="url(#incomeGrad)" />
      <path d={expenseArea} fill="url(#expenseGrad)" />

      {/* Lines */}
      <path d={incomePath} fill="none" stroke="#10b981" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <path d={expensePath} fill="none" stroke="#f43f5e" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />

      {/* Date labels */}
      {labelIndices.map((idx) => (
        <text key={idx} x={toX(idx)} y={H + 13} textAnchor="middle" fill="#475569" fontSize="7">
          {points[idx]?.date}
        </text>
      ))}
    </svg>
  );
}

/* ── Bar chart for daily income/expenses ─────────────────────────────────── */
function DailyBarChart({ points }: { points: DailyPoint[] }) {
  if (points.length === 0) {
    return <div className="flex items-center justify-center h-36 text-xs text-slate-600">No data</div>;
  }

  const maxVal = Math.max(...points.flatMap((p) => [p.income, p.expenses]), 1);
  const W = 500;
  const H = 100;
  const barW = Math.max(3, Math.min(12, (W - 16) / points.length / 2 - 1));

  return (
    <svg viewBox={`0 0 ${W} ${H + 4}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {points.map((p, i) => {
        const x = 8 + (i / points.length) * (W - 16);
        const incH = (p.income / maxVal) * H;
        const expH = (p.expenses / maxVal) * H;
        return (
          <g key={p.date}>
            <rect x={x} y={H - incH} width={barW} height={incH} rx={1.5} fill="#10b981" fillOpacity={0.75} />
            <rect x={x + barW + 1} y={H - expH} width={barW} height={expH} rx={1.5} fill="#f43f5e" fillOpacity={0.75} />
          </g>
        );
      })}
    </svg>
  );
}

/* ── Ranked person bar list (payees / payers) ────────────────────────────── */
function PersonBarList({ rows, currency, emptyText }: { rows: PersonRow[]; currency: string; emptyText: string }) {
  const maxAmt = Math.max(...rows.map((r) => r.amount), 1);
  const total  = rows.reduce((s, r) => s + r.amount, 0);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-600">
        <Users size={32} strokeWidth={1} className="mb-2" />
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={row.name}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-5 h-5 rounded-full bg-slate-700 text-slate-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="text-sm font-medium text-slate-200 truncate">{row.name}</span>
              <span className="text-[10px] text-slate-500 shrink-0">{row.count}×</span>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-3">
              <span className="text-[10px] text-slate-500">{total > 0 ? ((row.amount / total) * 100).toFixed(1) : 0}%</span>
              <span className="text-sm font-semibold text-slate-100 w-28 text-right">
                {currency} {row.amount.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="relative h-5 bg-slate-800/80 rounded-lg overflow-hidden">
            <div
              className="h-full rounded-lg transition-all duration-500"
              style={{ width: `${(row.amount / maxAmt) * 100}%`, background: 'linear-gradient(90deg, #3b82f6 0%, #6366f1 100%)', opacity: 0.8 }}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white/60">
              {total > 0 ? ((row.amount / total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Monthly category heatmap ────────────────────────────────────────────── */
function MonthlyCategoryHeatmap({ data, currency }: { data: MonthlyCatData; currency: string }) {
  const { months, categories, monthTotals } = data;

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-600">
        <BarChart2 size={32} strokeWidth={1} className="mb-2" />
        <p className="text-sm">No expense category data for the last 6 months</p>
      </div>
    );
  }

  const maxCell = Math.max(...categories.flatMap((c) => c.monthAmounts), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[480px]">
        <thead>
          <tr>
            <th className="text-left text-slate-500 font-medium pb-3 pr-4 w-36">Category</th>
            {months.map((m) => (
              <th key={m} className="text-center text-slate-500 font-medium pb-3 px-1">{m}</th>
            ))}
            <th className="text-right text-slate-500 font-medium pb-3 pl-3">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {categories.map((cat) => {
            const rowTotal = cat.monthAmounts.reduce((s, a) => s + a, 0);
            return (
              <tr key={cat.name} className="hover:bg-slate-800/20 transition-colors">
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-slate-300 truncate max-w-[110px]">{cat.name}</span>
                  </div>
                </td>
                {cat.monthAmounts.map((amt, mi) => (
                  <td key={mi} className="py-2 px-1 text-center">
                    {amt > 0 ? (
                      <div
                        className="mx-auto rounded px-1 py-0.5 text-[10px] font-semibold text-white/90 min-w-[44px]"
                        style={{
                          backgroundColor: cat.color,
                          opacity: 0.25 + (amt / maxCell) * 0.75,
                        }}
                      >
                        {amt >= 1000 ? `${(amt / 1000).toFixed(1)}k` : amt.toFixed(0)}
                      </div>
                    ) : (
                      <span className="text-slate-700">—</span>
                    )}
                  </td>
                ))}
                <td className="py-2 pl-3 text-right font-semibold text-slate-200">
                  {currency} {rowTotal.toFixed(0)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-700">
            <td className="pt-2.5 pr-4 text-slate-500 font-semibold">Monthly Total</td>
            {monthTotals.map((tot, mi) => (
              <td key={mi} className="pt-2.5 px-1 text-center font-semibold text-slate-300">
                {tot > 0 ? (tot >= 1000 ? `${(tot / 1000).toFixed(1)}k` : tot.toFixed(0)) : <span className="text-slate-700">—</span>}
              </td>
            ))}
            <td className="pt-2.5 pl-3 text-right font-bold text-slate-100">
              {currency} {monthTotals.reduce((s, t) => s + t, 0).toFixed(0)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function Reports() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categorySpending, setCategorySpending] = useState<CategorySpending[]>([]);
  const [dailyPoints, setDailyPoints] = useState<DailyPoint[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const [payeeAnalysis, setPayeeAnalysis] = useState<PersonRow[]>([]);
  const [payerAnalysis, setPayerAnalysis] = useState<PersonRow[]>([]);
  const [payeePayerTab, setPayeePayerTab] = useState<'payee' | 'payer'>('payee');
  const [monthlyCatData, setMonthlyCatData] = useState<MonthlyCatData>({ months: [], categories: [], monthTotals: [] });

  useEffect(() => {
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    let start = new Date(now);

    if (period === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), quarter * 3, 1);
    } else if (period === 'year') {
      start = new Date(now.getFullYear(), 0, 1);
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end);
  }, [period]);

  const loadReportData = useCallback(async () => {
    if (!user || !startDate || !endDate) return;

    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];

    const [{ data: transactions }, { data: payeesData }, { data: monthlyCatTx }] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, categories(name, color)')
        .eq('user_id', user.id)
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .order('transaction_date', { ascending: true }),
      supabase.from('payees').select('id, name').eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('amount, transaction_date, categories(name, color)')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .gte('transaction_date', sixMonthsAgo)
        .order('transaction_date', { ascending: true }),
    ]);

    if (!transactions) return;

    /* ── Payee / Payer analysis ── */
    const payeeNameMap = new Map((payeesData ?? []).map((p) => [p.id, p.name]));

    const payeeMap = new Map<string, PersonRow>();
    const payerMap = new Map<string, PersonRow>();

    transactions.forEach((t) => {
      if (t.type === 'expense' && (t as { payee_id?: string | null }).payee_id) {
        const pid = (t as { payee_id: string }).payee_id;
        const name = payeeNameMap.get(pid) ?? 'Unknown';
        const prev = payeeMap.get(pid) ?? { name, amount: 0, count: 0 };
        payeeMap.set(pid, { name, amount: prev.amount + Number(t.amount), count: prev.count + 1 });
      }
      if (t.type === 'income' && (t as { payer_id?: string | null }).payer_id) {
        const pid = (t as { payer_id: string }).payer_id;
        const name = payeeNameMap.get(pid) ?? 'Unknown';
        const prev = payerMap.get(pid) ?? { name, amount: 0, count: 0 };
        payerMap.set(pid, { name, amount: prev.amount + Number(t.amount), count: prev.count + 1 });
      }
    });

    setPayeeAnalysis(Array.from(payeeMap.values()).sort((a, b) => b.amount - a.amount));
    setPayerAnalysis(Array.from(payerMap.values()).sort((a, b) => b.amount - a.amount));

    /* ── Monthly category heatmap (last 6 months) ── */
    const monthLabels: string[] = [];
    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      monthLabels.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));
    }

    // catKey → { color, monthAmounts[6] }
    const catMonthMap = new Map<string, { color: string; amounts: number[] }>();

    (monthlyCatTx ?? []).forEach((t) => {
      const cat = (t as { categories?: { name: string; color: string } | null }).categories;
      if (!cat) return;
      const monthKey = t.transaction_date.slice(0, 7);
      const mIdx = monthKeys.indexOf(monthKey);
      if (mIdx === -1) return;
      const prev = catMonthMap.get(cat.name) ?? { color: cat.color, amounts: [0, 0, 0, 0, 0, 0] };
      prev.amounts[mIdx] += Number(t.amount);
      catMonthMap.set(cat.name, prev);
    });

    // Sort categories by total spend descending
    const catRows = Array.from(catMonthMap.entries())
      .map(([name, v]) => ({ name, color: v.color, monthAmounts: v.amounts, total: v.amounts.reduce((s, a) => s + a, 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const monthTotals = monthKeys.map((_, mi) =>
      catRows.reduce((s, r) => s + r.monthAmounts[mi], 0)
    );

    setMonthlyCatData({ months: monthLabels, categories: catRows, monthTotals });

    const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expenses = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    setTotalIncome(income);
    setTotalExpenses(expenses);
    setTransactionCount(transactions.length);

    // Category map
    const catMap = new Map<string, { amount: number; color: string }>();
    transactions.filter((t) => t.type === 'expense' && t.categories).forEach((t) => {
      const name = t.categories!.name;
      const existing = catMap.get(name) || { amount: 0, color: t.categories!.color };
      catMap.set(name, { amount: existing.amount + Number(t.amount), color: t.categories!.color });
    });
    const catData = Array.from(catMap.entries())
      .map(([category, d]) => ({ category, amount: d.amount, color: d.color }))
      .sort((a, b) => b.amount - a.amount);
    setCategorySpending(catData);

    // Daily points
    const dayMap = new Map<string, { income: number; expenses: number }>();
    transactions.forEach((t) => {
      const day = t.transaction_date.slice(0, 10);
      const existing = dayMap.get(day) || { income: 0, expenses: 0 };
      if (t.type === 'income') existing.income += Number(t.amount);
      else if (t.type === 'expense') existing.expenses += Number(t.amount);
      dayMap.set(day, existing);
    });

    // Fill in all dates in range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const pts: DailyPoint[] = [];
    let cumIncome = 0;
    let cumExpenses = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      const vals = dayMap.get(key) || { income: 0, expenses: 0 };
      cumIncome += vals.income;
      cumExpenses += vals.expenses;
      pts.push({
        date: d.toLocaleDateString('default', { month: 'short', day: 'numeric' }),
        income: vals.income,
        expenses: vals.expenses,
        cumIncome,
        cumExpenses,
      });
    }
    setDailyPoints(pts);
  }, [user, startDate, endDate]);

  useEffect(() => {
    if (user && startDate && endDate) loadReportData();
  }, [user, startDate, endDate, loadReportData]);

  useEffect(() => {
    const loadCurrency = async () => {
      if (!user) { setDisplayCurrency('USD'); return; }
      const { data } = await supabase.from('profiles').select('default_currency').eq('id', user.id).single();
      setDisplayCurrency(data?.default_currency || 'USD');
    };
    loadCurrency();
  }, [user]);

  const [categoryView, setCategoryView] = useState<'pie' | 'bar'>('pie');

  const maxCategoryAmount = useMemo(() => Math.max(...categorySpending.map((c) => c.amount), 1), [categorySpending]);
  const savingsRate = totalIncome > 0 ? (((totalIncome - totalExpenses) / totalIncome) * 100).toFixed(1) : '0';
  const days = useMemo(() => Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))), [startDate, endDate]);

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-5">

      {/* ── Header + period selector ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-100">Financial Reports</h3>
        <div className="flex flex-wrap items-center gap-2">
          {['month', 'quarter', 'year', 'custom'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                period === p
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300 border border-slate-700/50'
              }`}
            >
              {p === 'month' ? 'Month' : p === 'quarter' ? 'Quarter' : p === 'year' ? 'Year' : 'Custom'}
            </button>
          ))}
          {period === 'custom' && (
            <>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-emerald-700/40 to-emerald-900/20 border border-emerald-800/40 p-4 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-emerald-400" />
            <p className="text-xs text-emerald-400 font-medium">Income</p>
          </div>
          <p className="text-xl font-bold text-white">{displayCurrency} {totalIncome.toFixed(2)}</p>
        </div>
        <div className="bg-gradient-to-br from-red-700/40 to-red-900/20 border border-red-800/40 p-4 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={14} className="text-red-400" />
            <p className="text-xs text-red-400 font-medium">Expenses</p>
          </div>
          <p className="text-xl font-bold text-white">{displayCurrency} {totalExpenses.toFixed(2)}</p>
        </div>
        <div className={`bg-gradient-to-br border p-4 rounded-xl ${totalIncome - totalExpenses >= 0 ? 'from-blue-700/40 to-blue-900/20 border-blue-800/40' : 'from-orange-700/40 to-orange-900/20 border-orange-800/40'}`}>
          <div className="flex items-center gap-2 mb-1">
            <Activity size={14} className={totalIncome - totalExpenses >= 0 ? 'text-blue-400' : 'text-orange-400'} />
            <p className={`text-xs font-medium ${totalIncome - totalExpenses >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>Net</p>
          </div>
          <p className="text-xl font-bold text-white">
            {totalIncome - totalExpenses >= 0 ? '+' : ''}{displayCurrency} {(totalIncome - totalExpenses).toFixed(2)}
          </p>
        </div>
        <div className="bg-[#141927] border border-slate-800 p-4 rounded-xl">
          <p className="text-xs text-slate-400 mb-1">Savings rate</p>
          <p className={`text-xl font-bold ${Number(savingsRate) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{savingsRate}%</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{transactionCount} transactions · {days}d</p>
        </div>
      </div>

      {/* ── Category Analysis (main feature) ── */}
      <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h4 className="text-base font-semibold text-slate-100">Category Spending Analysis</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {categorySpending.length} categories · {displayCurrency} {totalExpenses.toFixed(2)} total
            </p>
          </div>
          {categorySpending.length > 0 && (
            <div className="flex items-center gap-1 bg-slate-800 rounded-xl p-1">
              <button
                onClick={() => setCategoryView('pie')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  categoryView === 'pie'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <PieIcon size={13} />
                Pie
              </button>
              <button
                onClick={() => setCategoryView('bar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  categoryView === 'bar'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BarChart2 size={13} />
                Bar
              </button>
            </div>
          )}
        </div>

        {categorySpending.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-600">
            <PieIcon size={40} strokeWidth={1} className="mb-3" />
            <p className="text-sm">No expense categories found for this period</p>
          </div>
        ) : categoryView === 'pie' ? (
          <PieChart slices={categorySpending} total={totalExpenses} currency={displayCurrency} />
        ) : (
          <CategoryBarChart slices={categorySpending} total={totalExpenses} currency={displayCurrency} />
        )}
      </div>

      {/* ── Cumulative trend area chart ── */}
      <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-slate-100">Cumulative Trend</h4>
          <div className="flex items-center gap-4 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" />Income</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-500 inline-block rounded" />Expenses</span>
          </div>
        </div>
        <TrendAreaChart points={dailyPoints} />
      </div>

      {/* ── Payee / Payer Analysis ── */}
      <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h4 className="text-base font-semibold text-slate-100">Payee &amp; Payer Analysis</h4>
            <p className="text-xs text-slate-500 mt-0.5">Who you pay most — and who pays you most</p>
          </div>
          <div className="flex items-center gap-1 bg-slate-800 rounded-xl p-1">
            <button
              onClick={() => setPayeePayerTab('payee')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                payeePayerTab === 'payee' ? 'bg-red-600/80 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserCheck size={12} />
              Payees
            </button>
            <button
              onClick={() => setPayeePayerTab('payer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                payeePayerTab === 'payer' ? 'bg-emerald-600/80 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserCheck size={12} />
              Payers
            </button>
          </div>
        </div>

        {payeePayerTab === 'payee' ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-slate-400">
                {payeeAnalysis.length > 0
                  ? <><span className="text-red-400 font-semibold">{payeeAnalysis.length} payees</span> — total outflow {displayCurrency} {payeeAnalysis.reduce((s, r) => s + r.amount, 0).toFixed(2)}</>
                  : 'No payee data for this period'}
              </p>
            </div>
            <PersonBarList
              rows={payeeAnalysis}
              currency={displayCurrency}
              emptyText="No expense transactions with payees in this period"
            />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-slate-400">
                {payerAnalysis.length > 0
                  ? <><span className="text-emerald-400 font-semibold">{payerAnalysis.length} payers</span> — total inflow {displayCurrency} {payerAnalysis.reduce((s, r) => s + r.amount, 0).toFixed(2)}</>
                  : 'No payer data for this period'}
              </p>
            </div>
            <PersonBarList
              rows={payerAnalysis}
              currency={displayCurrency}
              emptyText="No income transactions with payers in this period"
            />
          </>
        )}
      </div>

      {/* ── Monthly Category Heatmap (last 6 months) ── */}
      <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h4 className="text-base font-semibold text-slate-100">Monthly Category Spending</h4>
            <p className="text-xs text-slate-500 mt-0.5">Last 6 months — darker cells = higher spend</p>
          </div>
          {monthlyCatData.categories.length > 0 && (
            <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded-lg">
              Top {monthlyCatData.categories.length} categories
            </span>
          )}
        </div>
        <MonthlyCategoryHeatmap data={monthlyCatData} currency={displayCurrency} />
      </div>

      {/* ── Daily bar + Category donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily bars */}
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-slate-100">Daily Activity</h4>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />Income</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500 inline-block" />Expenses</span>
            </div>
          </div>
          <DailyBarChart points={dailyPoints} />
        </div>

        {/* Category donut */}
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <h4 className="text-sm font-semibold text-slate-100 mb-4">Expense Breakdown</h4>
          {categorySpending.length > 0 ? (
            <div className="flex items-center gap-5">
              <DonutChart slices={categorySpending} total={totalExpenses} currency={displayCurrency} />
              <div className="flex-1 space-y-2 min-w-0">
                {categorySpending.slice(0, 6).map((item) => (
                  <div key={item.category}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-slate-400 truncate">{item.category}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-200 shrink-0 ml-2">
                        {((item.amount / totalExpenses) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(item.amount / maxCategoryAmount) * 100}%`, backgroundColor: item.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-slate-500 py-8 text-sm">No expense data for this period</p>
          )}
        </div>
      </div>

      {/* ── Full category list ── */}
      {categorySpending.length > 0 && (
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-slate-100">All Categories</h4>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-slate-500">{displayCurrency} / share</span>
            </div>
          </div>
          <div className="space-y-3">
            {categorySpending.map((item) => (
              <div key={item.category}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded" style={{ backgroundColor: item.color }} />
                    <span className="text-sm font-medium text-slate-200">{item.category}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-500">{((item.amount / totalExpenses) * 100).toFixed(1)}%</span>
                    <span className="text-sm font-semibold text-slate-100 w-28 text-right">
                      {displayCurrency} {item.amount.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${(item.amount / maxCategoryAmount) * 100}%`, backgroundColor: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Income vs Expenses visual bars ── */}
      <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-slate-100">Income vs Expenses</h4>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Calendar size={12} />
            <span>{startDate && new Date(startDate).toLocaleDateString()} – {endDate && new Date(endDate).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Income', value: totalIncome, total: totalIncome + totalExpenses, color: 'bg-emerald-500', textColor: 'text-emerald-400' },
            { label: 'Expenses', value: totalExpenses, total: totalIncome + totalExpenses, color: 'bg-red-500', textColor: 'text-red-400' },
          ].map(({ label, value, total, color, textColor }) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-200">{label}</span>
                <span className={`text-sm font-semibold ${textColor}`}>{displayCurrency} {value.toFixed(2)}</span>
              </div>
              <div className="h-5 bg-slate-800 rounded-lg overflow-hidden">
                <div
                  className={`h-full ${color} transition-all duration-500`}
                  style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800">
          <span className="text-xs text-slate-500">Daily avg spending</span>
          <span className="text-sm font-semibold text-slate-200">{displayCurrency} {(totalExpenses / days).toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">Avg transaction</span>
          <span className="text-sm font-semibold text-slate-200">
            {displayCurrency} {transactionCount > 0 ? ((totalIncome + totalExpenses) / transactionCount).toFixed(2) : '0.00'}
          </span>
        </div>
      </div>
    </div>
  );
}
