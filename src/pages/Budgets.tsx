import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import {
  Plus, CreditCard as Edit2, Trash2, AlertTriangle, CheckCircle,
  ChevronDown, ChevronRight, ChevronLeft, Receipt, TrendingUp, TrendingDown, Calendar,
} from 'lucide-react';
import type { Database } from '../lib/database.types';

type Budget = Database['public']['Tables']['budgets']['Row'];
type Group = Database['public']['Tables']['transaction_groups']['Row'];

interface BudgetTransaction {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  transaction_date: string;
}

interface BudgetWithDetails extends Budget {
  transaction_groups: { name: string; color: string } | null;
  spent: number;
  transactions: BudgetTransaction[];
  current_start?: string;
  current_end?: string;
}

/* ── Allocated vs Spent horizontal bar ─────────────────────────────────────── */
function AllocSpentBar({
  allocated, spent, currency, color,
}: { allocated: number; spent: number; currency: string; color: string }) {
  const pct = allocated > 0 ? Math.min((spent / allocated) * 100, 100) : 0;
  const over = spent > allocated;
  const near = pct >= 80 && !over;

  const barColor = over ? '#ef4444' : near ? '#f59e0b' : color;

  return (
    <div className="space-y-2">
      {/* Amounts row */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Spent</p>
          <p className={`text-2xl font-bold leading-none ${over ? 'text-red-400' : near ? 'text-amber-400' : 'text-slate-100'}`}>
            {currency} {spent.toFixed(2)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Plan</p>
          <p className="text-2xl font-bold leading-none text-slate-400">
            {currency} {allocated.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Bar */}
      <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>

      {/* Below bar labels */}
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium flex items-center gap-1 ${over ? 'text-red-400' : near ? 'text-amber-400' : 'text-emerald-400'}`}>
          {over
            ? <><TrendingUp size={11} /> Over by {currency} {(spent - allocated).toFixed(2)}</>
            : <><TrendingDown size={11} /> {currency} {(allocated - spent).toFixed(2)} left</>}
        </span>
        <span className="text-slate-500">{pct.toFixed(1)}% used</span>
      </div>
    </div>
  );
}

/* ── Overview horizontal bars for all budgets (mini chart) ─────────────────── */
function BudgetComparisonChart({
  budgets, currency,
}: { budgets: BudgetWithDetails[]; currency: string }) {
  if (budgets.length === 0) return null;
  const maxAmount = Math.max(...budgets.map((b) => Math.max(Number(b.amount), b.spent)), 1);

  return (
    <div className="bg-[#141927] rounded-xl border border-slate-800 p-5">
      <h3 className="text-sm font-semibold text-slate-100 mb-4">Budget Comparison</h3>
      <div className="space-y-3">
        {budgets.map((b) => {
          const allocated = Number(b.amount);
          const over = b.spent > allocated;
          const color = b.transaction_groups?.color ?? '#3b82f6';
          const allocPct = (allocated / maxAmount) * 100;
          const spentPct = Math.min((b.spent / maxAmount) * 100, 100);

          return (
            <div key={b.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium truncate max-w-[180px]">{b.name}</span>
                <span className={`font-semibold ${over ? 'text-red-400' : 'text-slate-400'}`}>
                  {currency} {b.spent.toFixed(0)} / {currency} {allocated.toFixed(0)}
                </span>
              </div>
              <div className="relative h-2 bg-slate-800 rounded-full overflow-visible">
                {/* Allocated track */}
                <div className="absolute inset-y-0 left-0 rounded-full opacity-20"
                  style={{ width: `${allocPct}%`, backgroundColor: color }} />
                {/* Spent fill */}
                <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{ width: `${spentPct}%`, backgroundColor: over ? '#ef4444' : color }} />
                {/* Allocated marker line */}
                <div className="absolute top-[-2px] bottom-[-2px] w-0.5 rounded-full bg-slate-500"
                  style={{ left: `${allocPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-slate-500 inline-block" /> Allocated limit</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-blue-500/60 inline-block" /> Spent</span>
      </div>
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────────────────────── */
export function Budgets() {
  const { user } = useAuth();
  const { fmt } = useUserPrefs();
  const [budgets, setBudgets] = useState<BudgetWithDetails[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cycleOffsets, setCycleOffsets] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState({
    name: '',
    group_id: '',
    amount: '',
    period: 'monthly' as Budget['period'],
    start_date: '',
    end_date: '',
  });

  const calculateEndDate = (startDate: string, period: Budget['period']) => {
    if (period === 'one_time') return ''; // one-time budgets have no dates
    const date = new Date(startDate);
    switch (period) {
      case 'weekly':    date.setDate(date.getDate() + 7); break;
      case 'monthly':   date.setMonth(date.getMonth() + 1); break;
      case 'quarterly': date.setMonth(date.getMonth() + 3); break;
      case 'annual':    date.setFullYear(date.getFullYear() + 1); break;
    }
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  };

  const getCurrentCycle = (startDateStr: string, period: Budget['period'], offset: number = 0) => {
    if (period === 'one_time') return { start: startDateStr, end: startDateStr };
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    let currentStart = new Date(startDateStr);
    currentStart.setHours(0, 0, 0, 0);
    
    // Initial start logic
    if (currentStart > now) {
      // Future budget start
    } else if (period === 'monthly') {
      const yearDiff = now.getFullYear() - currentStart.getFullYear();
      let monthDiff = now.getMonth() - currentStart.getMonth() + (yearDiff * 12);
      if (now.getDate() < currentStart.getDate()) {
        monthDiff--;
      }
      if (monthDiff < 0) monthDiff = 0;
      currentStart.setMonth(currentStart.getMonth() + monthDiff);
    } else {
      let currentEnd = new Date(currentStart);
      while (true) {
        currentEnd = new Date(currentStart);
        switch (period) {
          case 'weekly':    currentEnd.setDate(currentEnd.getDate() + 7); break;
          case 'quarterly': currentEnd.setMonth(currentEnd.getMonth() + 3); break;
          case 'annual':    currentEnd.setFullYear(currentEnd.getFullYear() + 1); break;
        }
        currentEnd.setDate(currentEnd.getDate() - 1);
        if (now <= currentEnd) break;
        currentStart = new Date(currentEnd);
        currentStart.setDate(currentStart.getDate() + 1);
      }
    }

    // Apply offset
    if (offset !== 0) {
      switch (period) {
        case 'weekly':    currentStart.setDate(currentStart.getDate() + 7 * offset); break;
        case 'monthly':   currentStart.setMonth(currentStart.getMonth() + 1 * offset); break;
        case 'quarterly': currentStart.setMonth(currentStart.getMonth() + 3 * offset); break;
        case 'annual':    currentStart.setFullYear(currentStart.getFullYear() + 1 * offset); break;
      }
    }

    let finalEnd = new Date(currentStart);
    switch (period) {
      case 'weekly':    finalEnd.setDate(finalEnd.getDate() + 7); break;
      case 'monthly':   finalEnd.setMonth(finalEnd.getMonth() + 1); break;
      case 'quarterly': finalEnd.setMonth(finalEnd.getMonth() + 3); break;
      case 'annual':    finalEnd.setFullYear(finalEnd.getFullYear() + 1); break;
    }
    finalEnd.setDate(finalEnd.getDate() - 1);

    return {
      start: currentStart.toISOString().split('T')[0],
      end: finalEnd.toISOString().split('T')[0]
    };
  };

  const loadData = useCallback(async () => {
    if (!user) { setBudgets([]); setGroups([]); return; }

    const [budgetsRes, groupsRes, profileRes] = await Promise.all([
      supabase.from('budgets').select('*, transaction_groups(name, color)').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('transaction_groups').select('*').eq('user_id', user.id).order('name'),
      supabase.from('profiles').select('default_currency').eq('id', user.id).single(),
    ]);

    if (profileRes.data?.default_currency) setDisplayCurrency(profileRes.data.default_currency);

    if (budgetsRes.data && groupsRes.data) {
      const enriched = await Promise.all(
        budgetsRes.data.map(async (budget) => {
          let current_start: string | null = null;
          let current_end: string | null = null;

          if (budget.period !== 'one_time' && budget.start_date) {
            const offset = cycleOffsets[budget.id] || 0;
            const cycle = getCurrentCycle(budget.start_date, budget.period, offset);
            current_start = cycle.start;
            current_end = cycle.end;
          }

          // Transactions explicitly linked to budget
          let byBudgetIdQuery = supabase
            .from('transactions')
            .select('id, title, description, amount, transaction_date')
            .eq('user_id', user.id)
            .eq('budget_id', budget.id)
            .eq('type', 'expense');
            
          if (current_start && current_end) {
            byBudgetIdQuery = byBudgetIdQuery.gte('transaction_date', current_start).lte('transaction_date', current_end);
          }
          
          const { data: byBudgetId } = await byBudgetIdQuery.order('transaction_date', { ascending: false });

          // For recurring budgets: include unlinked expenses in the same group within the date range.
          // For one-time budgets (no dates): only include explicitly linked transactions (budget_id = this budget).
          const byGroupQuery = (budget.period !== 'one_time' && budget.group_id && current_start && current_end)
            ? await supabase
                .from('transactions')
                .select('id, title, description, amount, transaction_date')
                .eq('user_id', user.id)
                .eq('group_id', budget.group_id)
                .eq('type', 'expense')
                .is('budget_id', null)
                .gte('transaction_date', current_start)
                .lte('transaction_date', current_end)
                .order('transaction_date', { ascending: false })
            : { data: [] };

          const txList = [...(byBudgetId ?? []), ...(byGroupQuery.data ?? [])];
          const spent = txList.reduce((s, t) => s + Number(t.amount), 0);

          return {
            ...budget,
            spent,
            transactions: txList as BudgetTransaction[],
            current_start,
            current_end,
          };
        })
      );
      setBudgets(enriched as BudgetWithDetails[]);
      setGroups(groupsRes.data);
    }
  }, [user, cycleOffsets]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const budgetData = {
      user_id: user.id,
      name: formData.name,
      group_id: formData.group_id || null,
      amount: parseFloat(formData.amount),
      period: formData.period,
      start_date: formData.period === 'one_time' ? null : (formData.start_date || null),
      end_date: formData.period === 'one_time'
        ? null
        : (formData.end_date || calculateEndDate(formData.start_date, formData.period) || null),
    };

    if (editingBudget) {
      await supabase.from('budgets').update(budgetData).eq('id', editingBudget.id);
    } else {
      await supabase.from('budgets').insert(budgetData);
    }

    setShowForm(false);
    setEditingBudget(null);
    resetForm();
    loadData();
  };

  const resetForm = () => {
    setFormData({
      name: '', group_id: '', amount: '', period: 'monthly',
      start_date: '', end_date: '',
    });
  };

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setFormData({
      name: budget.name, group_id: budget.group_id ?? '',
      amount: budget.amount.toString(), period: budget.period,
      start_date: budget.start_date ?? '', end_date: budget.end_date ?? '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this budget?')) {
      await supabase.from('budgets').delete().eq('id', id);
      loadData();
    }
  };

  const totalAllocated = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const totalRemaining = totalAllocated - totalSpent;
  const overBudgetCount = budgets.filter((b) => b.spent > Number(b.amount)).length;
  const onTrackCount = budgets.filter((b) => b.spent <= Number(b.amount) * 0.8).length;
  const overallPct = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;

  const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1';

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-6">

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">Budget Overview</h3>
        <button onClick={() => { setShowForm(true); setEditingBudget(null); resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all">
          <Plus size={18} /> Add Budget
        </button>
      </div>

      {/* Top summary cards */}
      {budgets.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Allocated */}
          <div className="bg-[#141927] border border-slate-800 rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Total Allocated</p>
            <p className="text-xl font-bold text-slate-100">{displayCurrency} {totalAllocated.toFixed(2)}</p>
            <p className="text-[10px] text-slate-600 mt-1">across {budgets.length} budget{budgets.length !== 1 ? 's' : ''}</p>
          </div>

          {/* Spent */}
          <div className={`border rounded-xl p-4 ${totalSpent > totalAllocated ? 'bg-red-900/20 border-red-800/40' : 'bg-[#141927] border-slate-800'}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Total Spent</p>
            <p className={`text-xl font-bold ${totalSpent > totalAllocated ? 'text-red-400' : 'text-slate-100'}`}>
              {displayCurrency} {totalSpent.toFixed(2)}
            </p>
            <p className="text-[10px] text-slate-600 mt-1">{overallPct.toFixed(1)}% of budget</p>
          </div>

          {/* Remaining */}
          <div className={`border rounded-xl p-4 ${totalRemaining < 0 ? 'bg-red-900/20 border-red-800/40' : 'bg-emerald-900/10 border-emerald-800/20'}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Remaining</p>
            <p className={`text-xl font-bold ${totalRemaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {totalRemaining < 0 ? '-' : ''}{displayCurrency} {Math.abs(totalRemaining).toFixed(2)}
            </p>
            <p className="text-[10px] text-slate-600 mt-1">{totalRemaining < 0 ? 'over budget' : 'available'}</p>
          </div>

          {/* Status */}
          <div className="bg-[#141927] border border-slate-800 rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Health</p>
            <div className="space-y-1.5 mt-1">
              {overBudgetCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-red-400 font-semibold">
                  <AlertTriangle size={11} /> {overBudgetCount} over budget
                </div>
              )}
              {onTrackCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                  <CheckCircle size={11} /> {onTrackCount} on track
                </div>
              )}
              {overBudgetCount === 0 && onTrackCount === 0 && (
                <p className="text-xs text-slate-500">—</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Overall progress bar */}
      {budgets.length > 0 && (
        <div className="bg-[#141927] rounded-xl border border-slate-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-100">Overall Spending</h3>
            <div className="text-right">
              <span className="text-xs text-slate-400">
                <span className={`font-bold ${totalSpent > totalAllocated ? 'text-red-400' : 'text-slate-100'}`}>
                  {displayCurrency} {totalSpent.toFixed(2)}
                </span>
                {' '}of{' '}
                <span className="text-slate-400">{displayCurrency} {totalAllocated.toFixed(2)}</span>
              </span>
            </div>
          </div>
          <div className="h-4 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                overallPct > 100 ? 'bg-gradient-to-r from-red-600 to-red-400'
                : overallPct > 80 ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                : 'bg-gradient-to-r from-blue-600 to-blue-400'
              }`}
              style={{ width: `${Math.min(overallPct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>{overallPct > 100 ? `${(overallPct - 100).toFixed(1)}% over budget` : `${(100 - overallPct).toFixed(1)}% budget remaining`}</span>
            <span>{overallPct.toFixed(1)}% used</span>
          </div>
        </div>
      )}

      {/* Comparison chart */}
      {budgets.length > 1 && <BudgetComparisonChart budgets={budgets} currency={displayCurrency} />}

      {/* Form */}
      {showForm && (
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">
            {editingBudget ? 'Edit Budget' : 'New Budget'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Budget Name *</label>
                <input required type="text" value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Monthly Groceries" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Group</label>
                <select value={formData.group_id}
                  onChange={(e) => setFormData({ ...formData, group_id: e.target.value })}
                  className={inputCls}>
                  <option value="">No group (track all expenses)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Allocated Amount *</label>
                <input required type="number" step="0.01" value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Period</label>
                <select value={formData.period}
                  onChange={(e) => setFormData({
                    ...formData,
                    period: e.target.value as Budget['period'],
                    start_date: (e.target.value as Budget['period']) === 'one_time' ? '' : formData.start_date,
                    end_date: calculateEndDate(formData.start_date, e.target.value as Budget['period']),
                  })}
                  className={inputCls}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                  <option value="one_time">One-time</option>
                </select>
              </div>
              {formData.period !== 'one_time' && (
                <>
                  <div>
                    <label className={labelCls}>Start Date *</label>
                    <input required type="date" value={formData.start_date}
                      onChange={(e) => setFormData({
                        ...formData, start_date: e.target.value,
                        end_date: calculateEndDate(e.target.value, formData.period),
                      })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>End Date *</label>
                    <input required type="date" value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      className={inputCls} />
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all">
                {editingBudget ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingBudget(null); }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-[0.97] text-slate-300 text-sm font-medium rounded-xl border border-slate-700/60 transition-all">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Budget cards */}
      <div className="space-y-4">
        {budgets.map((budget) => {
          const allocated = Number(budget.amount);
          const pct = allocated > 0 ? (budget.spent / allocated) * 100 : 0;
          const over = budget.spent > allocated;
          const near = pct >= 80 && !over;
          const color = budget.transaction_groups?.color ?? '#3b82f6';
          const isExpanded = expandedId === budget.id;

          // Days info (only meaningful for date-ranged budgets)
          const today = new Date();
          const activeStart = budget.current_start || budget.start_date;
          const activeEnd = budget.current_end || budget.end_date;
          const hasDates = budget.period !== 'one_time' && !!activeStart && !!activeEnd;
          
          const start = hasDates ? new Date(activeStart as string) : null;
          const end = hasDates ? new Date(activeEnd as string) : null;
          const totalDays = hasDates && start && end
            ? Math.max(Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1, 1)
            : 0;
          const daysElapsed = hasDates && start
            ? Math.max(Math.floor((today.getTime() - start.getTime()) / 86400000) + 1, 0)
            : 0;
          const activeElapsed = Math.min(daysElapsed, totalDays);
          const daysLeft = hasDates && end
            ? Math.max(Math.ceil((end.getTime() - today.getTime()) / 86400000), 0)
            : 0;
          const dailyBudget = hasDates && totalDays > 0 ? allocated / totalDays : 0;
          const dailyActual = hasDates && activeElapsed > 0 ? budget.spent / activeElapsed : 0;
          const projectedTotal = hasDates && totalDays > 0 ? dailyActual * totalDays : 0;

          return (
            <div key={budget.id}
              className={`bg-[#141927] rounded-xl border transition-all ${over ? 'border-red-800/50' : near ? 'border-amber-800/40' : 'border-slate-800'}`}>

              {/* Card body */}
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  {/* Left: name + category */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-slate-100">{budget.name}</h4>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 capitalize">
                        {budget.period === 'one_time' ? 'One-time' : budget.period}
                      </span>
                      {over && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 font-semibold flex items-center gap-1">
                          <AlertTriangle size={9} /> Over budget
                        </span>
                      )}
                    </div>
                    {budget.transaction_groups && (
                      <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ backgroundColor: `${color}20`, color }}>
                        {budget.transaction_groups.name}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleEdit(budget)}
                      className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(budget.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Allocated vs Spent bar */}
                <AllocSpentBar
                  allocated={allocated}
                  spent={budget.spent}
                  currency={displayCurrency}
                  color={color}
                />

                {/* Stats row (date-ranged budgets only) */}
                {hasDates && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <p className="text-[10px] text-slate-500 mb-0.5">Daily Budget</p>
                      <p className="text-sm font-semibold text-slate-200">{displayCurrency} {dailyBudget.toFixed(2)}</p>
                    </div>
                    <div className={`rounded-lg p-3 ${dailyActual > dailyBudget ? 'bg-red-500/10' : 'bg-slate-800/50'}`}>
                      <p className="text-[10px] text-slate-500 mb-0.5">Daily Actual</p>
                      <p className={`text-sm font-semibold ${dailyActual > dailyBudget ? 'text-red-400' : 'text-slate-200'}`}>
                        {displayCurrency} {dailyActual.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3 flex items-center gap-2">
                      <Calendar size={13} className="text-slate-500 shrink-0" />
                      <div>
                        <p className="text-[10px] text-slate-500">Days Left</p>
                        <p className="text-sm font-semibold text-slate-200">{daysLeft > 0 ? daysLeft : 'Ended'}</p>
                      </div>
                    </div>
                    <div className={`rounded-lg p-3 ${projectedTotal > allocated ? 'bg-amber-500/10' : 'bg-slate-800/50'}`}>
                      <p className="text-[10px] text-slate-500 mb-0.5">Projected Total</p>
                      <p className={`text-sm font-semibold ${projectedTotal > allocated ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {displayCurrency} {projectedTotal.toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Date range + transaction count */}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center text-xs text-slate-600 gap-2">
                    {hasDates ? (
                      <>
                        <div className="flex items-center bg-slate-800/40 border border-slate-700/50 rounded overflow-hidden">
                          <button 
                            onClick={() => setCycleOffsets(prev => ({ ...prev, [budget.id]: (prev[budget.id] || 0) - 1 }))}
                            className="p-1 hover:bg-slate-700/50 transition-colors text-slate-400"
                          >
                            <ChevronLeft size={12} />
                          </button>
                          <span className="font-medium text-slate-400 px-1">
                            {(cycleOffsets[budget.id] || 0) === 0 ? 'Current Cycle' : 
                             (cycleOffsets[budget.id] || 0) < 0 ? `${Math.abs(cycleOffsets[budget.id] || 0)} Ago` : 
                             `+${cycleOffsets[budget.id]}`}
                          </span>
                          <button 
                            onClick={() => setCycleOffsets(prev => ({ ...prev, [budget.id]: (prev[budget.id] || 0) + 1 }))}
                            className="p-1 hover:bg-slate-700/50 transition-colors text-slate-400"
                          >
                            <ChevronRight size={12} />
                          </button>
                        </div>
                        <span>{fmt(activeStart as string)} – {fmt(activeEnd as string)}</span>
                      </>
                    ) : (
                      <span className="text-slate-500">No date range</span>
                    )}
                  </div>
                  {budget.transactions.length > 0 && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : budget.id)}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <Receipt size={12} />
                      {budget.transactions.length} transaction{budget.transactions.length !== 1 ? 's' : ''}
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Expandable transactions list */}
              {isExpanded && budget.transactions.length > 0 && (
                <div className="border-t border-slate-800 px-5 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    Transactions in this budget
                  </p>
                  <div className="space-y-0">
                    {budget.transactions.slice(0, 20).map((tx) => (
                      <div key={tx.id}
                        className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-200 truncate">{tx.title || tx.description || 'Transaction'}</p>
                          <p className="text-[10px] text-slate-500">{fmt(tx.transaction_date)}</p>
                        </div>
                        <span className="text-sm font-semibold text-red-400 shrink-0 ml-3">
                          -{displayCurrency} {Number(tx.amount).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {budget.transactions.length > 20 && (
                      <p className="text-xs text-slate-600 pt-2 text-center">
                        +{budget.transactions.length - 20} more transactions
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {budgets.length === 0 && !showForm && (
        <div className="text-center py-16 bg-[#141927] rounded-xl border border-slate-800">
          <Receipt className="mx-auto mb-3 text-slate-700" size={40} />
          <p className="text-sm font-medium text-slate-500">No budgets yet</p>
          <p className="text-xs text-slate-600 mt-1">
            Create a budget, set your allocated amount, and tag expenses to track how much you've spent.
          </p>
        </div>
      )}
    </div>
  );
}
