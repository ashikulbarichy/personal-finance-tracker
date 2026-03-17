import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { TrendingUp, TrendingDown, Wallet, Target, AlertCircle, BarChart2 } from 'lucide-react';

interface DashboardStats {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  activeGoals: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

interface RecentTransaction {
  id: string;
  description: string;
  amount: number;
  type: string;
  transaction_date: string;
  category: { name: string; color: string } | null;
}

interface MonthBar {
  label: string;
  income: number;
  expenses: number;
}

interface CategorySlice {
  category: string;
  amount: number;
  color: string;
}

/* ── Donut chart ─────────────────────────────────────────────────────────── */
function DonutChart({ slices, total }: { slices: CategorySlice[]; total: number }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const cx = 70;
  const cy = 70;

  let offset = 0;
  const segments = slices.map((s) => {
    const pct = total > 0 ? s.amount / total : 0;
    const dash = pct * C;
    const seg = { ...s, dash, gap: C - dash, offset };
    offset += dash;
    return seg;
  });

  if (slices.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-xs text-slate-600">
        No data
      </div>
    );
  }

  return (
    <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0">
      {segments.map((seg, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke={seg.color}
          strokeWidth={14}
          strokeDasharray={`${seg.dash} ${seg.gap}`}
          strokeDashoffset={-seg.offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          strokeLinecap="butt"
        />
      ))}
      {/* inner hole */}
      <circle cx={cx} cy={cy} r={40} fill="#141927" />
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#f1f5f9" fontSize="10" fontWeight="700">
        {slices.length}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#64748b" fontSize="7">
        categories
      </text>
    </svg>
  );
}

/* ── Grouped bar chart (6 months) ────────────────────────────────────────── */
function MonthlyBarChart({ months }: { months: MonthBar[] }) {
  const maxVal = Math.max(...months.flatMap((m) => [m.income, m.expenses]), 1);
  const chartH = 120;
  const barW = 14;
  const gap = 4;
  const groupW = barW * 2 + gap + 12;
  const svgW = months.length * groupW + 16;

  if (months.every((m) => m.income === 0 && m.expenses === 0)) {
    return (
      <div className="flex items-center justify-center h-36 text-xs text-slate-600">
        No data for the last 6 months
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${svgW} ${chartH + 24}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* grid lines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <line
          key={frac}
          x1={0}
          y1={chartH - frac * chartH}
          x2={svgW}
          y2={chartH - frac * chartH}
          stroke="#1e293b"
          strokeWidth={0.5}
        />
      ))}

      {months.map((m, i) => {
        const x = i * groupW + 8;
        const incH = maxVal > 0 ? (m.income / maxVal) * chartH : 0;
        const expH = maxVal > 0 ? (m.expenses / maxVal) * chartH : 0;
        return (
          <g key={m.label}>
            {/* Income bar */}
            <rect
              x={x}
              y={chartH - incH}
              width={barW}
              height={incH}
              rx={3}
              fill="#10b981"
              fillOpacity={0.85}
            />
            {/* Expense bar */}
            <rect
              x={x + barW + gap}
              y={chartH - expH}
              width={barW}
              height={expH}
              rx={3}
              fill="#f43f5e"
              fillOpacity={0.85}
            />
            {/* Month label */}
            <text
              x={x + barW + gap / 2}
              y={chartH + 14}
              textAnchor="middle"
              fill="#64748b"
              fontSize="7"
            >
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalBalance: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    activeGoals: 0,
    totalAssets: 0,
    totalLiabilities: 0,
    netWorth: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthBar[]>([]);
  const [categorySlices, setCategorySlices] = useState<CategorySlice[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayCurrency, setDisplayCurrency] = useState('USD');

  const loadDashboardData = useCallback(async () => {
    if (!user) {
      setStats({ totalBalance: 0, monthlyIncome: 0, monthlyExpenses: 0, activeGoals: 0 });
      setRecentTransactions([]);
      setLoading(false);
      return;
    }

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    // Last 6 months start
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];

    const [accountsRes, transactionsRes, goalsRes, recentRes, trendRes, categoryRes, assetsRes, loansRes] = await Promise.all([
      supabase.from('accounts').select('balance').eq('user_id', user.id).eq('is_active', true),
      supabase.from('transactions').select('amount, type').eq('user_id', user.id).gte('transaction_date', firstDayOfMonth),
      supabase.from('savings_goals').select('id').eq('user_id', user.id).eq('is_completed', false),
      supabase.from('transactions')
        .select('id, title, description, amount, type, transaction_date, categories(name, color)')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false })
        .limit(5),
      supabase.from('transactions')
        .select('amount, type, transaction_date')
        .eq('user_id', user.id)
        .gte('transaction_date', sixMonthsAgo)
        .order('transaction_date', { ascending: true }),
      supabase.from('transactions')
        .select('amount, type, categories(name, color)')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .gte('transaction_date', firstDayOfMonth),
      supabase.from('assets').select('current_value').eq('user_id', user.id).eq('is_active', true),
      supabase.from('loans').select('current_balance, type').eq('user_id', user.id).eq('is_active', true),
    ]);

    const totalBalance = accountsRes.data?.reduce((sum, acc) => sum + Number(acc.balance), 0) || 0;
    const monthlyIncome = transactionsRes.data?.filter((t) => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const monthlyExpenses = transactionsRes.data?.filter((t) => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const activeGoals = goalsRes.data?.length || 0;

    // Net worth formula:
    // Assets = liquid account balances + physical/financial asset values
    // Liabilities = outstanding borrowing loan balances
    // Net Worth = Assets − Liabilities
    const totalAssetValue = assetsRes.data?.reduce((s, a) => s + Number(a.current_value), 0) ?? 0;
    const totalAssets = totalBalance + totalAssetValue;
    const totalLiabilities = loansRes.data?.filter((l) => l.type === 'borrowing').reduce((s, l) => s + Number(l.current_balance), 0) ?? 0;
    const netWorth = totalAssets - totalLiabilities;

    setStats({ totalBalance, monthlyIncome, monthlyExpenses, activeGoals, totalAssets, totalLiabilities, netWorth });
    setRecentTransactions(
      (recentRes.data ?? []).map((t) => ({
        id: t.id,
        description: (t as { title?: string; description?: string }).title || t.description || '',
        amount: Number(t.amount),
        type: t.type,
        transaction_date: t.transaction_date,
        category: (t as { categories?: { name: string; color: string } | null }).categories ?? null,
      }))
    );

    // Build 6-month trend
    const monthMap = new Map<string, { income: number; expenses: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short' });
      monthMap.set(key, { income: 0, expenses: 0 });
      // store label
      monthMap.set(key + '__label', { income: 0, expenses: 0 });
      void label;
    }

    const monthBars: MonthBar[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthBars.unshift({
        label: d.toLocaleString('default', { month: 'short' }),
        income: 0,
        expenses: 0,
      });
    }

    (trendRes.data ?? []).forEach((t) => {
      const d = new Date(t.transaction_date);
      const monthsBack = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (monthsBack >= 0 && monthsBack <= 5) {
        const idx = 5 - monthsBack;
        if (t.type === 'income') monthBars[idx].income += Number(t.amount);
        else if (t.type === 'expense') monthBars[idx].expenses += Number(t.amount);
      }
    });

    setMonthlyTrend(monthBars);

    // Category donut (this month's expenses)
    const catMap = new Map<string, { amount: number; color: string }>();
    (categoryRes.data ?? []).forEach((t) => {
      const cat = (t as { categories?: { name: string; color: string } | null }).categories;
      const name = cat?.name ?? 'Uncategorized';
      const color = cat?.color ?? '#64748b';
      const existing = catMap.get(name) ?? { amount: 0, color };
      catMap.set(name, { amount: existing.amount + Number(t.amount), color });
    });
    const slices = Array.from(catMap.entries())
      .map(([category, v]) => ({ category, amount: v.amount, color: v.color }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
    setCategorySlices(slices);

    setLoading(false);
  }, [user]);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  useEffect(() => {
    const loadCurrency = async () => {
      if (!user) { setDisplayCurrency('USD'); return; }
      const { data } = await supabase.from('profiles').select('default_currency').eq('id', user.id).single();
      setDisplayCurrency(data?.default_currency || 'USD');
    };
    loadCurrency();
  }, [user]);

  const totalCatExpenses = useMemo(() => categorySlices.reduce((s, c) => s + c.amount, 0), [categorySlices]);

  if (loading) {
    return <div className="px-4 py-4 md:px-8 md:py-8 text-slate-400">Loading...</div>;
  }

  const netIncome = stats.monthlyIncome - stats.monthlyExpenses;
  const savingsRate = stats.monthlyIncome > 0 ? ((netIncome / stats.monthlyIncome) * 100) : 0;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-5">

      {/* ── Net Worth banner ── */}
      <div className="bg-gradient-to-r from-slate-900 via-[#141927] to-slate-900 border border-slate-700/60 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/30 to-indigo-600/30 flex items-center justify-center shrink-0">
            <BarChart2 size={22} className="text-blue-400" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Net Worth</p>
            <p className={`text-3xl font-bold tracking-tight mt-0.5 ${stats.netWorth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {stats.netWorth >= 0 ? '' : '-'}{displayCurrency} {Math.abs(stats.netWorth).toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Assets − Liabilities</p>
          </div>
        </div>
        <div className="flex items-center gap-6 shrink-0">
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-0.5">Total Assets</p>
            <p className="text-lg font-bold text-slate-100">{displayCurrency} {stats.totalAssets.toFixed(2)}</p>
            <p className="text-[10px] text-slate-600">accounts + physical</p>
          </div>
          <div className="w-px h-10 bg-slate-800" />
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-0.5">Total Liabilities</p>
            <p className="text-lg font-bold text-red-400">{displayCurrency} {stats.totalLiabilities.toFixed(2)}</p>
            <p className="text-[10px] text-slate-600">outstanding loans</p>
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-xl shadow-lg col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-200 font-medium">Total Balance</p>
              <p className="text-xl md:text-2xl font-bold text-white mt-1 leading-tight">
                {displayCurrency} {stats.totalBalance.toFixed(2)}
              </p>
            </div>
            <div className="p-2.5 bg-white/20 rounded-xl"><Wallet className="text-white" size={20} /></div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-5 rounded-xl shadow-lg">
          <p className="text-xs text-emerald-200 font-medium">Income</p>
          <p className="text-lg font-bold text-white mt-1">{displayCurrency} {stats.monthlyIncome.toFixed(2)}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp size={12} className="text-emerald-200" />
            <span className="text-[10px] text-emerald-200">this month</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-rose-600 to-red-700 p-5 rounded-xl shadow-lg">
          <p className="text-xs text-rose-200 font-medium">Expenses</p>
          <p className="text-lg font-bold text-white mt-1">{displayCurrency} {stats.monthlyExpenses.toFixed(2)}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendingDown size={12} className="text-rose-200" />
            <span className="text-[10px] text-rose-200">this month</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-violet-600 to-purple-700 p-5 rounded-xl shadow-lg">
          <p className="text-xs text-violet-200 font-medium">Active Goals</p>
          <p className="text-lg font-bold text-white mt-1">{stats.activeGoals}</p>
          <div className="flex items-center gap-1 mt-1">
            <Target size={12} className="text-violet-200" />
            <span className="text-[10px] text-violet-200">savings goals</span>
          </div>
        </div>
      </div>

      {/* ── Analytics row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* 6-Month bar chart */}
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-100">6-Month Overview</h3>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />Income</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500 inline-block" />Expenses</span>
            </div>
          </div>
          <MonthlyBarChart months={monthlyTrend} />
        </div>

        {/* Category donut */}
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Spending by Category</h3>
          {categorySlices.length === 0 ? (
            <div className="flex items-center justify-center h-36 text-xs text-slate-600">
              No expense data this month
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <DonutChart slices={categorySlices} total={totalCatExpenses} />
              <div className="flex-1 space-y-2 min-w-0">
                {categorySlices.map((s) => (
                  <div key={s.category} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-xs text-slate-400 truncate">{s.category}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-semibold text-slate-200">
                        {totalCatExpenses > 0 ? ((s.amount / totalCatExpenses) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Savings rate + monthly summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800 md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-100">Monthly Cash Flow</h3>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${netIncome >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
              {netIncome >= 0 ? '+' : ''}{displayCurrency} {netIncome.toFixed(2)}
            </span>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Income</span>
                <span className="text-emerald-400 font-medium">{displayCurrency} {stats.monthlyIncome.toFixed(2)}</span>
              </div>
              <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${stats.monthlyIncome > 0 ? Math.min((stats.monthlyIncome / (stats.monthlyIncome + stats.monthlyExpenses)) * 100, 100) : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Expenses</span>
                <span className="text-red-400 font-medium">{displayCurrency} {stats.monthlyExpenses.toFixed(2)}</span>
              </div>
              <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${stats.monthlyIncome + stats.monthlyExpenses > 0 ? Math.min((stats.monthlyExpenses / (stats.monthlyIncome + stats.monthlyExpenses)) * 100, 100) : 0}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Savings rate ring */}
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800 flex flex-col items-center justify-center">
          <p className="text-xs font-medium text-slate-400 mb-3">Savings Rate</p>
          <div className="relative w-24 h-24">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={savingsRate >= 0 ? '#10b981' : '#f43f5e'}
                strokeWidth="3"
                strokeDasharray={`${Math.abs(Math.min(savingsRate, 100))} 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-lg font-bold ${savingsRate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {savingsRate.toFixed(0)}%
              </span>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">of income saved</p>
        </div>
      </div>

      {/* ── Recent transactions ── */}
      <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">Recent Transactions</h3>
        {recentTransactions.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <AlertCircle className="mx-auto mb-2" size={36} />
            <p className="text-xs">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {recentTransactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-slate-800/70 last:border-0">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      backgroundColor: t.category?.color ? `${t.category.color}22` : '#1e293b',
                      color: t.category?.color || '#94a3b8',
                    }}
                  >
                    {t.category?.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200 leading-tight">
                      {t.description || 'Transaction'}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {new Date(t.transaction_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span className={`text-sm font-semibold ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {t.type === 'income' ? '+' : '-'}{displayCurrency} {t.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
