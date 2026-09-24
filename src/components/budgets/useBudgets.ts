import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useUserPrefs } from '../../contexts/UserPrefsContext';
import { convertManual, loadManualRates } from '../../lib/manualRates';
import type { Database } from '../../lib/database.types';

export type BudgetPeriodType = Database['public']['Tables']['budgets']['Row']['period_type'];
type BudgetRowRaw = Database['public']['Tables']['budgets']['Row'];

export type BudgetRow = {
  /** The category's id — every consumer joins back to categories/transactions by this. */
  id: string;
  name: string;
  budget: number;      // this period's budget, converted to the default currency
  spent: number;       // spent this period, converted to the default currency
  count: number;       // transactions this period
  periodType: BudgetPeriodType;
};

/** The current calendar month or year in LOCAL time: first/last day as
 *  'YYYY-MM-DD' (the budget row's key), plus the exact instants
 *  [from, until) used to pick that period's transactions. */
function currentPeriod(periodType: BudgetPeriodType, now = new Date()) {
  const yearly = periodType === 'yearly';
  const start = yearly ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  const next = yearly ? new Date(now.getFullYear() + 1, 0, 1) : new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const end = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
  return { start: toISODate(start), end: toISODate(end), from: start.toISOString(), until: next.toISOString() };
}
// Local calendar date — toISOString() would shift it by the UTC offset.
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Expense categories with the CURRENT period's budget (if one is set) and
 * how much has been spent so far this period, both converted to the user's
 * default currency. Setting a budget writes a new row for the current
 * period — past periods' rows are left alone, so budget history survives.
 */
export function useBudgets(periodType: BudgetPeriodType = 'monthly') {
  const { user } = useAuth();
  const { defaultCurrency } = useUserPrefs();
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [income, setIncome] = useState<{ id: string; name: string; total: number; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { start, from, until } = currentPeriod(periodType);
    const [cats, txns, budgetRows] = await Promise.all([
      supabase.from('categories').select('id, name, type').eq('user_id', user.id).order('name'),
      supabase.from('transactions')
        .select('category_id, amount, currency, type, transfer_pair_id')
        .eq('user_id', user.id)
        .gte('transaction_date', from)
        .lt('transaction_date', until),
      // Budgets repeat: the latest row on/before this period applies.
      supabase.from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .eq('period_type', periodType)
        .lte('period_start', start)
        .order('period_start', { ascending: false }),
    ]);
    const rates = loadManualRates(user.id);
    const spent: Record<string, { v: number; n: number }> = {};
    (txns.data ?? []).forEach((t) => {
      if (t.transfer_pair_id || !t.category_id) return;
      const v = convertManual(Number(t.amount), t.currency, defaultCurrency, defaultCurrency, rates);
      const e = (spent[t.category_id] ??= { v: 0, n: 0 });
      e.v += v; e.n += 1;
    });
    // Rows are newest first, so the first one seen per category is the one in effect.
    const budgetByCategory = new Map<string, BudgetRowRaw>();
    (budgetRows.data ?? []).forEach((b: BudgetRowRaw) => { if (!budgetByCategory.has(b.category_id)) budgetByCategory.set(b.category_id, b); });
    const all = cats.data ?? [];
    setRows(all.filter((c) => c.type === 'expense').map((c) => {
      const b = budgetByCategory.get(c.id);
      const budgetAmt = b ? convertManual(Number(b.amount), b.currency, defaultCurrency, defaultCurrency, rates) : 0;
      return { id: c.id, name: c.name, budget: budgetAmt, spent: spent[c.id]?.v ?? 0, count: spent[c.id]?.n ?? 0, periodType };
    }));
    setIncome(all.filter((c) => c.type === 'income').map((c) => ({
      id: c.id, name: c.name, total: spent[c.id]?.v ?? 0, count: spent[c.id]?.n ?? 0,
    })));
    setLoading(false);
  }, [user, defaultCurrency, periodType]);

  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener('ft-data-changed', on);
    return () => window.removeEventListener('ft-data-changed', on);
  }, [load]);

  /** Set the budget from THIS period on (it repeats until changed).
   *  Pass null/0 to clear it: if an earlier budget would otherwise carry
   *  forward, a 0 row stops it; past periods are never touched. */
  const setBudget = useCallback(async (categoryId: string, amount: number | null) => {
    if (!user) return;
    const { start, end } = currentPeriod(periodType);
    if (!amount || amount <= 0) {
      const { data: earlier } = await supabase.from('budgets').select('amount')
        .eq('user_id', user.id).eq('category_id', categoryId).eq('period_type', periodType)
        .lt('period_start', start).order('period_start', { ascending: false }).limit(1);
      if (earlier?.length && Number(earlier[0].amount) > 0) {
        await supabase.from('budgets').upsert(
          { user_id: user.id, category_id: categoryId, period_type: periodType, period_start: start, period_end: end, amount: 0, currency: defaultCurrency },
          { onConflict: 'user_id,category_id,period_type,period_start' },
        );
      } else {
        await supabase.from('budgets').delete()
          .eq('user_id', user.id).eq('category_id', categoryId)
          .eq('period_type', periodType).eq('period_start', start);
      }
    } else {
      await supabase.from('budgets').upsert(
        {
          user_id: user.id,
          category_id: categoryId,
          period_type: periodType,
          period_start: start,
          period_end: end,
          amount,
          currency: defaultCurrency,
        },
        { onConflict: 'user_id,category_id,period_type,period_start' },
      );
    }
    window.dispatchEvent(new Event('ft-data-changed'));
  }, [user, periodType, defaultCurrency]);

  // Memoized: consumers use these as effect/memo dependencies.
  const budgeted = useMemo(() => rows.filter((r) => r.budget > 0), [rows]);
  const totals = useMemo(() => ({
    budget: budgeted.reduce((s, r) => s + r.budget, 0),
    spent: budgeted.reduce((s, r) => s + r.spent, 0),
    over: budgeted.filter((r) => r.spent > r.budget).length,
  }), [budgeted]);

  return { rows, income, budgets: budgeted, totals, loading, setBudget, reload: load, currency: defaultCurrency };
}
