import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useUserPrefs } from '../../contexts/UserPrefsContext';
import { useBudgets } from '../budgets/useBudgets';
import { useMoneyPlan } from '../plan/useMoneyPlan';
import { formatMoney } from '../../lib/money';
import { parseDay, recordRecurring, startOfToday } from '../../lib/recurring';
import { loadStore, milestoneReached, saveStore, syncStore } from '../../lib/notifications';
import type { Notice } from '../../lib/notifications';
import type { Database } from '../../lib/database.types';

type Recurring = Database['public']['Tables']['recurring_transactions']['Row'] & { accounts: { currency: string } | null };
type Loan = Database['public']['Tables']['loans']['Row'] & { accounts: { currency: string } | null };
type Goal = Database['public']['Tables']['savings_goals']['Row'];

interface Ctx {
  items: (Notice & { read: boolean })[];
  unread: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** Record a due recurring occurrence straight from the panel. */
  record: (recurringId: string) => Promise<string | null>;
}

const NotificationsCtx = createContext<Ctx | undefined>(undefined);
const DAY = 86_400_000;

const whenLabel = (d: Date, today: Date) => {
  const n = Math.round((today.getTime() - d.getTime()) / DAY);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
};

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { defaultCurrency, timezone } = useUserPrefs();
  const monthly = useBudgets('monthly');
  const yearly = useBudgets('yearly');
  const plan = useMoneyPlan();
  const { target: saveTarget, month: planMonth, investments } = plan;
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [store, setStore] = useState(() => (user ? loadStore(user.id) : { seen: {}, read: {} }));
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [r, l, g] = await Promise.all([
      supabase.from('recurring_transactions').select('*, accounts(currency)').eq('user_id', user.id).eq('is_active', true),
      supabase.from('loans').select('*, accounts(currency)').eq('user_id', user.id).eq('is_active', true),
      supabase.from('savings_goals').select('*').eq('user_id', user.id),
    ]);
    setRecurring((r.data ?? []) as unknown as Recurring[]);
    setLoans((l.data ?? []) as unknown as Loan[]);
    setGoals(g.data ?? []);
  }, [user]);

  useEffect(() => {
    load();
    const on = () => load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('ft-data-changed', on);
    document.addEventListener('visibilitychange', onVisible);
    const t = window.setInterval(load, 5 * 60_000);
    return () => {
      window.removeEventListener('ft-data-changed', on);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(t);
    };
  }, [load]);

  useEffect(() => { if (user) setStore(loadStore(user.id)); }, [user]);

  /* ---- Derive the list ---- */
  const raw = useMemo<Notice[]>(() => {
    const today = startOfToday();
    const out: Notice[] = [];

    recurring.forEach((r) => {
      const due = parseDay(r.next_date);
      if (due > today) return;
      const cur = r.accounts?.currency ?? defaultCurrency;
      out.push({
        id: `rec:${r.id}:${r.next_date}`,
        kind: 'recurring',
        tone: due < today ? 'warn' : 'info',
        title: `${r.name} is due ${whenLabel(due, today)}`,
        body: `${r.type === 'income' ? 'Expected in' : 'To pay'} · ${formatMoney(Number(r.amount), cur)}`,
        at: due.getTime(),
        href: '/recurring',
        recurringId: r.id,
      });
    });

    loans.forEach((l) => {
      if (!l.due_date || !(Number(l.current_balance) > 0)) return;
      const due = parseDay(l.due_date);
      if (due > today) return;
      const cur = l.accounts?.currency ?? defaultCurrency;
      const lent = l.type === 'lending';
      out.push({
        id: `loan:${l.id}:${l.due_date}`,
        kind: 'loan',
        tone: 'danger',
        title: due < today
          ? `${l.name} is overdue`
          : `${l.name} is due today`,
        body: `${lent ? `${l.lender_borrower} still owes you` : `You still owe ${l.lender_borrower}`} ${formatMoney(Number(l.current_balance), cur)}`,
        at: due.getTime(),
        href: `/loans/${l.id}`,
      });
    });

    [...monthly.budgets, ...yearly.budgets].forEach((b) => {
      const pct = (b.spent / b.budget) * 100;
      if (pct < 80) return;
      const over = pct >= 100;
      const period = b.periodType === 'yearly' ? 'this year' : 'this month';
      out.push({
        id: `budget:${b.id}:${b.periodType}:${over ? 100 : 80}:${periodKey(b.periodType)}`,
        kind: 'budget',
        tone: over ? 'danger' : 'warn',
        title: over ? `${b.name} is over budget` : `${b.name} is at ${Math.floor(pct)}% of budget`,
        body: over
          ? `${formatMoney(b.spent - b.budget, defaultCurrency)} over ${period}`
          : `${formatMoney(b.budget - b.spent, defaultCurrency)} left ${period}`,
        at: 0,
        href: '/categories',
      });
    });

    goals.forEach((g) => {
      const target = Number(g.target_amount);
      const current = Number(g.current_amount);
      const m = milestoneReached(current, target);
      if (m) {
        out.push({
          id: `goal:${g.id}:${m}`,
          kind: 'goal',
          tone: 'good',
          title: m === 100 ? `${g.name} is fully funded` : `${g.name} passed ${m}%`,
          body: m === 100 ? 'Goal reached — nice work.' : `${formatMoney(target - current, defaultCurrency)} to go.`,
          at: 0,
          href: '/goals',
        });
      }
      if (g.deadline && current < target) {
        const dl = parseDay(g.deadline);
        const days = Math.round((dl.getTime() - today.getTime()) / DAY);
        if (days <= 7) {
          out.push({
            id: `goal-deadline:${g.id}:${g.deadline}`,
            kind: 'goal',
            tone: days < 0 ? 'danger' : 'warn',
            title: days < 0 ? `${g.name} passed its deadline` : days === 0 ? `${g.name} is due today` : `${g.name} is due in ${days} day${days === 1 ? '' : 's'}`,
            body: `${formatMoney(target - current, defaultCurrency)} still to save.`,
            at: dl.getTime(),
            href: '/goals',
          });
        }
      }
    });

    // Pay yourself first: the best moment is right after income lands.
    if (saveTarget && saveTarget > 0 && planMonth.income > 0 && planMonth.future < saveTarget) {
      const n = new Date();
      out.push({
        id: `save:${n.getFullYear()}-${n.getMonth() + 1}`,
        kind: 'goal',
        tone: 'info',
        title: `Pay yourself first: ${formatMoney(saveTarget - planMonth.future, defaultCurrency)} to go`,
        body: 'Income is in — move it to savings, investments or a debt now, before it gets spent.',
        at: 0,
        href: '/dashboard',
      });
    }

    // Fixed-term investments maturing in the next 14 days.
    investments.forEach((a) => {
      if (!a.maturity_date) return;
      const due = parseDay(a.maturity_date);
      const days = Math.round((due.getTime() - today.getTime()) / DAY);
      if (days < 0 || days > 14) return;
      out.push({
        id: `mature:${a.id}:${a.maturity_date}`,
        kind: 'goal',
        tone: 'info',
        title: days === 0 ? `${a.name} matures today` : `${a.name} matures in ${days} day${days === 1 ? '' : 's'}`,
        body: 'Decide now where the money goes next — reinvest it, or put it toward a debt.',
        at: due.getTime(),
        href: '/investments',
      });
    });

    return out;
  }, [recurring, loans, goals, monthly.budgets, yearly.budgets, defaultCurrency, saveTarget, planMonth, investments]);

  // Keep first-seen times in sync with what currently applies.
  useEffect(() => {
    if (!user) return;
    setStore((s) => {
      const next = syncStore(s, raw.map((n) => n.id));
      if (next === s) return s; // unchanged → no re-render
      saveStore(user.id, next);
      return next;
    });
  }, [raw, user]);

  const items = useMemo(() => raw
    .map((n) => ({ ...n, at: n.at || store.seen[n.id] || Date.now(), read: !!store.read[n.id] }))
    .sort((a, b) => Number(a.read) - Number(b.read) || b.at - a.at), [raw, store]);

  const update = useCallback((fn: (read: Record<string, 1>) => Record<string, 1>) => {
    if (!user) return;
    setStore((s) => {
      const next = { ...s, read: fn({ ...s.read }) };
      saveStore(user.id, next);
      return next;
    });
  }, [user]);

  const markRead = useCallback((id: string) => update((r) => ({ ...r, [id]: 1 })), [update]);
  const markAllRead = useCallback(() => update((r) => {
    raw.forEach((n) => { r[n.id] = 1; });
    return r;
  }), [update, raw]);

  const record = useCallback(async (recurringId: string) => {
    const rec = recurring.find((r) => r.id === recurringId);
    if (!rec || !user) return 'Not found';
    const { error } = await recordRecurring(rec, { userId: user.id, currency: rec.accounts?.currency ?? defaultCurrency, timezone });
    return error;
  }, [recurring, user, defaultCurrency, timezone]);

  const value = useMemo<Ctx>(() => ({
    items,
    unread: items.filter((n) => !n.read).length,
    open,
    setOpen,
    markRead,
    markAllRead,
    record,
  }), [items, open, markRead, markAllRead, record]);

  return <NotificationsCtx.Provider value={value}>{children}</NotificationsCtx.Provider>;
}

/** Budget ids include the period, so next month's 80% warning is new again. */
function periodKey(t: 'monthly' | 'yearly') {
  const n = new Date();
  return t === 'yearly' ? String(n.getFullYear()) : `${n.getFullYear()}-${n.getMonth() + 1}`;
}

export function useNotifications() {
  const ctx = useContext(NotificationsCtx);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
