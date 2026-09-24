import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import type { Database } from '../lib/database.types';
import { ChevronLeft, Scale } from 'lucide-react';
import { Button, PageHeader, KpiStrip, Kpi, SectionTitle, EmptyState, Skeleton, cx } from '../components/ui';
import { formatMoney } from '../lib/money';
import { ACCOUNT_TYPE_LABEL } from './Accounts';
import { AdjustBalanceModal } from '../components/accounts/AdjustBalanceModal';

type Account = Database['public']['Tables']['accounts']['Row'];
type Transaction = Database['public']['Tables']['transactions']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];
type SavingsAllocation = Database['public']['Tables']['savings_goal_allocations']['Row'];

interface TransactionWithDetails extends Transaction {
  categories: Pick<Category, 'name' | 'color'> | null;
}

export function AccountDetails() {
  const { user } = useAuth();
  const { fmt } = useUserPrefs();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [account, setAccount] = useState<Account | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [allocations, setAllocations] = useState<SavingsAllocation[]>([]);
  const [payeeNames, setPayeeNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (quiet = false) => {
    if (!user || !id) {
      setAccount(null);
      setTransactions([]);
      setAllocations([]);
      setLoading(false);
      return;
    }

    if (!quiet) setLoading(true);

    const [accountRes, txRes, allocRes, payeesRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('id', id).eq('user_id', user.id).single(),
      supabase
        .from('transactions')
        .select('*, categories(name, color)')
        .eq('user_id', user.id)
        .eq('account_id', id)
        .order('transaction_date', { ascending: true }),
      supabase
        .from('savings_goal_allocations')
        .select('*')
        .eq('user_id', user.id)
        .eq('account_id', id),
      supabase.from('payees').select('id, name').eq('user_id', user.id),
    ]);

    setAccount(accountRes.data ?? null);
    if (txRes.data) setTransactions(txRes.data as TransactionWithDetails[]);
    if (allocRes.data) setAllocations(allocRes.data);
    if (payeesRes.data) {
      setPayeeNames(Object.fromEntries((payeesRes.data as { id: string; name: string }[]).map((p) => [p.id, p.name])));
    }

    setLoading(false);
  }, [user, id]);

  useEffect(() => {
    loadData();
    const onChange = () => loadData(true);
    window.addEventListener('ft-data-changed', onChange);
    return () => window.removeEventListener('ft-data-changed', onChange);
  }, [loadData]);

  const reservedAmount = useMemo(
    () => allocations.reduce((sum, alloc) => sum + Number(alloc.amount), 0),
    [allocations]
  );

  const { balanceHistory, minBalance, maxBalance } = useMemo(() => {
    if (!transactions.length) {
      return { balanceHistory: [] as { index: number; value: number }[], minBalance: 0, maxBalance: 0 };
    }

    let running = 0;
    const history = transactions.map((tx, index) => {
      const charge = Number(tx.charge_amount ?? 0);
      const delta = tx.type === 'income'
        ? (Number(tx.amount) - charge)
        : (-Number(tx.amount) - charge);
      running += delta;
      return { index, value: running };
    });

    const values = history.map((p) => p.value);
    return { balanceHistory: history, minBalance: Math.min(...values), maxBalance: Math.max(...values) };
  }, [transactions]);

  /** This month's in / out for the KPI strip. */
  const { monthIn, monthOut, monthInCount, monthOutCount } = useMemo(() => {
    const now = new Date();
    let inSum = 0, outSum = 0, inN = 0, outN = 0;
    for (const t of transactions) {
      const d = new Date(t.transaction_date);
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
      if (t.type === 'income') { inSum += Number(t.amount); inN++; }
      else { outSum += Number(t.amount); outN++; }
    }
    return { monthIn: inSum, monthOut: outSum, monthInCount: inN, monthOutCount: outN };
  }, [transactions]);

  const newestFirst = useMemo(() => [...transactions].reverse(), [transactions]);

  const renderLineChart = () => {
    const width = 400;
    const height = 120;
    const paddingY = 8;

    if (!balanceHistory.length || minBalance === maxBalance) {
      return <div className="h-[120px] flex items-center text-[13px] text-slate-400">Not enough data for a trend yet.</div>;
    }

    const rangeY = maxBalance - minBalance || 1;
    const innerHeight = height - paddingY * 2;
    const points = balanceHistory.map((p, i) => {
      const x = balanceHistory.length === 1 ? width / 2 : (i / (balanceHistory.length - 1)) * width;
      const y = paddingY + (1 - (p.value - minBalance) / rangeY) * innerHeight;
      return `${x},${y}`;
    });
    const zeroY = minBalance < 0 && maxBalance > 0 ? paddingY + (1 - (0 - minBalance) / rangeY) * innerHeight : null;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[120px]" preserveAspectRatio="none">
        <line x1="0" x2={width} y1={height - 1} y2={height - 1} stroke="rgb(var(--line-strong))" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {zeroY !== null && (
          <line x1="0" x2={width} y1={zeroY} y2={zeroY} stroke="rgb(var(--line))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
        <path
          d={`M ${points.join(' L ')}`}
          fill="none"
          stroke="rgb(var(--slate-100))"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  };

  const wrapper = 'px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-6 md:gap-7';

  const backLink = (
    <Button variant="ghost" size="sm" onClick={() => navigate('/accounts')} className="hidden md:inline-flex self-start -mb-4">
      <ChevronLeft size={16} />
      Accounts
    </Button>
  );

  if (loading) {
    return (
      <div className={wrapper}>
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-24" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className={wrapper}>
        {backLink}
        <EmptyState title="Account not found" description="It may have been deleted." />
      </div>
    );
  }

  const cur = account.currency;
  const balance = Number(account.balance);
  const availableBalance = Math.max(balance - reservedAmount, 0);

  return (
    <div className={wrapper}>
      {backLink}
      <PageHeader
        title={account.name}
        description={
          <>
            {ACCOUNT_TYPE_LABEL[account.type] ?? account.type} · {cur}
            {!account.is_active && ' · Archived'}
          </>
        }
        actions={<Button variant="secondary" onClick={() => setAdjusting(true)}><Scale size={16} /> Adjust balance</Button>}
      />
      <AdjustBalanceModal account={adjusting ? account : null} onClose={() => setAdjusting(false)} />

      <KpiStrip cols={3} className="[&>*]:!pl-0 sm:[&>*:not(:first-child)]:!pl-5">
        <Kpi
          label="Balance"
          value={formatMoney(balance, cur)}
          note={
            reservedAmount > 0 ? (
              <span className="tabular-nums">
                {formatMoney(reservedAmount, cur)} reserved for goals · {formatMoney(availableBalance, cur)} available
              </span>
            ) : (
              `${transactions.length} transaction${transactions.length === 1 ? '' : 's'}`
            )
          }
        />
        <Kpi
          label="In this month"
          value={formatMoney(monthIn, cur, { sign: monthIn > 0 })}
          note={`${monthInCount} deposit${monthInCount === 1 ? '' : 's'}`}
        />
        <Kpi
          label="Out this month"
          value={formatMoney(-monthOut, cur)}
          note={`${monthOutCount} payment${monthOutCount === 1 ? '' : 's'}`}
        />
      </KpiStrip>

      <section>
        <SectionTitle meta="Running total of this account's transactions">Balance trend</SectionTitle>
        {renderLineChart()}
      </section>

      <section>
        <SectionTitle meta={`${transactions.length} total`}>Transactions</SectionTitle>

        {/* Web table header */}
        <div className="hidden md:grid grid-cols-[110px_minmax(0,1.6fr)_minmax(0,1fr)_150px] gap-4 pb-2 rule-b t-th">
          <span>Date</span>
          <span>Payee</span>
          <span>Category</span>
          <span className="text-right">Amount</span>
        </div>
        <div className="md:hidden rule-t" />

        {newestFirst.map((tx) => {
          const income = tx.type === 'income';
          const txCur = tx.currency || cur;
          const payee = (tx.payee_id && payeeNames[tx.payee_id]) || tx.title || tx.description || 'Transaction';
          const charge = Number(tx.charge_amount ?? 0);
          const amount = (
            <span className="flex flex-col items-end">
              <span className={cx('text-[15px] tabular-nums text-slate-100', income ? 'font-extrabold' : 'font-normal')}>
                {income ? '+' : '−'}
                {formatMoney(Number(tx.amount), txCur)}
              </span>
              {charge > 0 && (
                <span className="text-[11px] text-slate-400 tabular-nums">charge {formatMoney(charge, txCur)}</span>
              )}
            </span>
          );
          return (
            <div key={tx.id} className="row-rule hover-tint">
              {/* Web row */}
              <div className="hidden md:grid grid-cols-[110px_minmax(0,1.6fr)_minmax(0,1fr)_150px] gap-4 items-center min-h-[52px] py-2">
                <span className="text-[13px] text-slate-400 tabular-nums">{fmt(tx.transaction_date)}</span>
                <span className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-slate-100 truncate">{payee}</span>
                  {tx.description && tx.description !== payee && (
                    <span className="text-xs text-slate-400 truncate">{tx.description}</span>
                  )}
                </span>
                <span className="text-[13px] text-slate-300 truncate">{tx.categories?.name ?? '—'}</span>
                {amount}
              </div>
              {/* Phone row */}
              <div className="md:hidden flex items-center justify-between gap-3 min-h-[60px] py-2">
                <span className="flex flex-col min-w-0">
                  <span className="text-[15px] font-semibold text-slate-100 truncate">{payee}</span>
                  <span className="text-xs text-slate-400 truncate">
                    {fmt(tx.transaction_date)}
                    {tx.categories?.name ? ` · ${tx.categories.name}` : ''}
                  </span>
                </span>
                {amount}
              </div>
            </div>
          );
        })}

        {transactions.length === 0 && (
          <EmptyState title="No transactions yet" description="Transactions recorded against this account will appear here." />
        )}
      </section>
    </div>
  );
}
