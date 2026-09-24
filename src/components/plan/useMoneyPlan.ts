/* ============================================================================
 * Money plan — the numbers behind the saving/debt features.
 *
 * Built on a few well-replicated findings from behavioural economics:
 *  - Pay yourself first (Thaler & Benartzi 2004, "Save More Tomorrow";
 *    Madrian & Shea 2001 on defaults): decide the saving amount up front and
 *    move it when income lands, instead of saving "whatever is left".
 *  - Small wins (Gal & McShane 2012; Brown & Lahey 2015): people who close
 *    individual debts early are more likely to clear all of them → debts are
 *    ordered smallest-first ("snowball") with one focus debt.
 *  - Goal gradient (Kivetz, Urminsky & Zheng 2006): effort rises as a goal
 *    feels close → always show progress and the distance left.
 *  - Future-self continuity (Hershfield et al. 2011): make the future concrete
 *    → a debt-free date instead of an abstract total.
 *  - Salience of spending (Soman 2001; Prelec & Loewenstein 1998): card and
 *    mobile payments hide the "pain of paying" → a per-day "safe to spend".
 *  - Fresh start effect (Dai, Milkman & Riis 2014): new periods motivate
 *    change → a recap + restart prompt at the start of each month.
 *
 * Money moved by loan payments (borrowing or repaying) is left out of
 * income/spending here — it's debt, not earnings or living costs.
 * ========================================================================= */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toISODate } from '../../lib/recurring';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useUserPrefs } from '../../contexts/UserPrefsContext';
import { convertManual, loadManualRates } from '../../lib/manualRates';
import type { Database } from '../../lib/database.types';

type Account = Database['public']['Tables']['accounts']['Row'];
type Loan = Database['public']['Tables']['loans']['Row'] & { accounts: { currency: string } | null };
type Payment = Database['public']['Tables']['loan_payments']['Row'];
export type Snapshot = Database['public']['Tables']['net_worth_snapshots']['Row'];

/* Several screens use this hook at once; remember the last snapshot written
 * per user+month so the same value isn't upserted repeatedly. */
const lastSnapshot = new Map<string, string>();
type Tx = {
  amount: number; type: 'income' | 'expense'; currency: string; account_id: string;
  transfer_pair_id: string | null; loan_payment_id: string | null; is_adjustment: boolean; transaction_date: string;
};

export const SAVING_TYPES = new Set<Account['type']>(['savings', 'investment']);
const CARD_TYPES = new Set<Account['type']>(['credit_card', 'virtual_card']);

export interface Debt {
  id: string;
  kind: 'loan' | 'card';
  name: string;
  who: string;
  balance: number;      // owed now (default currency)
  original: number;     // borrowed (loans) — equals balance for cards
  href: string;
  dueDate: string | null;
}

export function useMoneyPlan() {
  const { user } = useAuth();
  const { defaultCurrency: cur } = useUserPrefs();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [txns, setTxns] = useState<Tx[]>([]);
  const [target, setTargetState] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratesVer, setRatesVer] = useState(0);
  const [history, setHistory] = useState<Snapshot[]>([]);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const [acc, ln, pay, tx, prof, snaps] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('loans').select('*, accounts(currency)').eq('user_id', user.id),
      supabase.from('loan_payments').select('*').eq('user_id', user.id).gte('payment_date', from.toISOString()),
      supabase.from('transactions')
        .select('amount, type, currency, account_id, transfer_pair_id, loan_payment_id, is_adjustment, transaction_date')
        .eq('user_id', user.id).gte('transaction_date', new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()),
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('net_worth_snapshots').select('*').eq('user_id', user.id)
        .gte('month', toISODate(new Date(now.getFullYear(), now.getMonth() - 23, 1))).order('month'),
    ]);
    setHistory(snaps.data ?? []);
    setAccounts(acc.data ?? []);
    setLoans((ln.data ?? []) as unknown as Loan[]);
    setPayments(pay.data ?? []);
    setTxns(((tx.data ?? []) as Tx[]).map((t) => ({ ...t, amount: Number(t.amount) })));
    const p = prof.data as { monthly_save_target?: number | null } | null;
    setTargetState(p?.monthly_save_target != null ? Number(p.monthly_save_target) : null);
    setRatesVer((v) => v + 1);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener('ft-data-changed', on);
    return () => window.removeEventListener('ft-data-changed', on);
  }, [load]);

  /** Save the monthly pay-yourself-first target (null clears it). */
  const setTarget = useCallback(async (v: number | null) => {
    if (!user) return 'Not signed in';
    setTargetState(v);
    const { error } = await supabase.from('profiles').update({ monthly_save_target: v }).eq('id', user.id);
    if (error) { load(); return error.message; }
    window.dispatchEvent(new Event('ft-data-changed'));
    return null;
  }, [user, load]);

  const plan = useMemo(() => {
    const rates = loadManualRates(user?.id);
    const conv = (n: number, c: string | null | undefined) => convertManual(Number(n) || 0, c || cur, cur, cur, rates);
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const inMonth = (s: string, dy: number, dm: number) => { const d = new Date(s); return d.getFullYear() === dy && d.getMonth() === dm; };
    const last = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysLeft = daysInMonth - now.getDate() + 1; // including today

    /* ── Net worth ── */
    let cash = 0, cardDebt = 0, investIn = 0, investValue = 0;
    const investments = accounts.filter((a) => a.type === 'investment');
    accounts.forEach((a) => {
      if (a.type === 'investment') {
        investIn += conv(a.balance, a.currency);
        investValue += conv(a.current_value ?? a.balance, a.currency);
      } else if (CARD_TYPES.has(a.type) && Number(a.balance) < 0) {
        cardDebt += -conv(a.balance, a.currency);
      } else {
        cash += conv(a.balance, a.currency);
      }
    });
    const loanCur = (l: Loan) => l.accounts?.currency ?? cur;
    const activeLoans = loans.filter((l) => l.is_active && Number(l.current_balance) > 0);
    const owedLoans = activeLoans.filter((l) => l.type === 'borrowing').reduce((s, l) => s + conv(l.current_balance, loanCur(l)), 0);
    const lent = activeLoans.filter((l) => l.type === 'lending').reduce((s, l) => s + conv(l.current_balance, loanCur(l)), 0);
    const owe = owedLoans + cardDebt;
    const netWorth = cash + investValue + lent - owe;

    /* ── This month / last month cash flow ── */
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const pairs = new Map<string, Tx[]>();
    txns.forEach((t) => { if (t.transfer_pair_id) pairs.set(t.transfer_pair_id, [...(pairs.get(t.transfer_pair_id) ?? []), t]); });
    const flow = (dy: number, dm: number) => {
      let income = 0, spending = 0, toSavings = 0;
      txns.forEach((t) => {
        if (!inMonth(t.transaction_date, dy, dm)) return;
        const v = conv(t.amount, t.currency);
        if (t.transfer_pair_id) {
          // Money arriving in a savings/investment account from an everyday one.
          const dest = byId.get(t.account_id);
          if (t.type === 'income' && dest && SAVING_TYPES.has(dest.type)) {
            const src = pairs.get(t.transfer_pair_id)?.find((x) => x !== t);
            const srcAcc = src ? byId.get(src.account_id) : undefined;
            if (!srcAcc || !SAVING_TYPES.has(srcAcc.type)) toSavings += v;
          }
          return;
        }
        if (t.loan_payment_id || t.is_adjustment) return;
        if (t.type === 'income') income += v; else spending += v;
      });
      const loanOf = new Map(loans.map((l) => [l.id, l]));
      const repaid = payments.reduce((s, p) => {
        const l = loanOf.get(p.loan_id);
        if (!l || l.type !== 'borrowing' || p.payment_type !== 'repayment' || !inMonth(p.payment_date, dy, dm)) return s;
        return s + conv(p.amount, loanCur(l));
      }, 0);
      return { income, spending, kept: income - spending, toSavings, repaid, future: toSavings + repaid };
    };
    const month = flow(y, m);
    const prev = flow(last.getFullYear(), last.getMonth());

    /* ── Safe to spend (per day, rest of the month) ── */
    const expectedIncome = Math.max(month.income, prev.income);
    const stillToPutAside = Math.max(0, (target ?? 0) - month.future);
    const leftToSpend = expectedIncome - month.spending - month.future - stillToPutAside;
    const safePerDay = expectedIncome > 0 ? leftToSpend / Math.max(1, daysLeft) : null;

    /* ── Debts, smallest first (snowball) ── */
    const debts: Debt[] = [
      ...activeLoans.filter((l) => l.type === 'borrowing').map((l) => ({
        id: l.id, kind: 'loan' as const, name: l.name, who: l.lender_borrower,
        balance: conv(l.current_balance, loanCur(l)), original: conv(l.principal_amount, loanCur(l)),
        href: `/loans/${l.id}`, dueDate: l.due_date,
      })),
      ...accounts.filter((a) => CARD_TYPES.has(a.type) && Number(a.balance) < 0).map((a) => ({
        id: a.id, kind: 'card' as const, name: a.name, who: 'Card balance',
        balance: -conv(a.balance, a.currency), original: -conv(a.balance, a.currency),
        href: `/accounts/${a.id}`, dueDate: null,
      })),
    ].sort((a, b) => a.balance - b.balance);
    const paidOff = loans.filter((l) => l.type === 'borrowing')
      .reduce((s, l) => s + Math.max(0, conv(l.principal_amount, loanCur(l)) - conv(l.current_balance, loanCur(l))), 0);
    const debtProgress = paidOff + owe > 0 ? (paidOff / (paidOff + owe)) * 100 : 0;

    // Pace = borrowing repayments over the last ~3 months (+ this month so far).
    const loanOf = new Map(loans.map((l) => [l.id, l]));
    const since = new Date(y, m - 3, 1);
    const repaidRecent = payments.reduce((s, p) => {
      const l = loanOf.get(p.loan_id);
      if (!l || l.type !== 'borrowing' || p.payment_type !== 'repayment' || new Date(p.payment_date) < since) return s;
      return s + conv(p.amount, loanCur(l));
    }, 0);
    const monthsSpan = 3 + now.getDate() / daysInMonth;
    const monthlyRepay = repaidRecent / monthsSpan;
    const monthsToFree = owe > 0 && monthlyRepay > 0 ? Math.ceil(owe / monthlyRepay) : null;
    const debtFreeDate = monthsToFree != null ? new Date(y, m + monthsToFree, 1) : null;

    /* ── Investments ── */
    const investGain = investValue - investIn;

    return {
      cur, daysLeft, netWorth, cash, cardDebt, owedLoans, lent, owe,
      investIn, investValue, investGain, investments,
      month, prev, expectedIncome, safePerDay, leftToSpend, stillToPutAside,
      debts, paidOff, debtProgress, monthlyRepay, monthsToFree, debtFreeDate,
      freshStart: now.getDate() <= 3,
    };
  }, [accounts, loans, payments, txns, target, cur, user?.id, ratesVer]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Net worth history: keep this month's snapshot current (the last write in
   * a month becomes its month-end value). Only once there's something to track. */
  useEffect(() => {
    if (loading || !user || (accounts.length === 0 && loans.length === 0)) return;
    const now = new Date();
    const month = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
    const assets = Math.round((plan.cash + plan.investValue + plan.lent) * 100) / 100;
    const liabilities = Math.round(plan.owe * 100) / 100;
    const net = Math.round((assets - liabilities) * 100) / 100;
    const key = `${user.id}:${month}`;
    const sig = `${net}|${assets}|${liabilities}|${plan.cur}`;
    if (lastSnapshot.get(key) === sig) return;
    lastSnapshot.set(key, sig);
    const row = { user_id: user.id, month, net_worth: net, assets, liabilities, currency: plan.cur, updated_at: new Date().toISOString() };
    supabase.from('net_worth_snapshots').upsert(row, { onConflict: 'user_id,month' }).then(({ error }) => {
      if (error) { lastSnapshot.delete(key); return; }
      setHistory((h) => [...h.filter((x) => x.month !== month), row].sort((a, b) => (a.month < b.month ? -1 : 1)));
    });
  }, [loading, user, accounts.length, loans.length, plan.cash, plan.investValue, plan.lent, plan.owe, plan.cur]);

  return { ...plan, target, setTarget, loading, reload: load, history };
}
