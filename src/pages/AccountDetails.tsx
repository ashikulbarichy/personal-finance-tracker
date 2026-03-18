import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import type { Database } from '../lib/database.types';
import { ArrowLeft } from 'lucide-react';

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
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [allocations, setAllocations] = useState<SavingsAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayCurrency, setDisplayCurrency] = useState('USD');

  const loadData = useCallback(async () => {
    if (!user || !id) {
      setAccount(null);
      setTransactions([]);
      setAllocations([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [accountRes, txRes, allocRes, profileRes] = await Promise.all([
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
      supabase.from('profiles').select('default_currency').eq('id', user.id).single(),
    ]);

    if (accountRes.data) setAccount(accountRes.data);
    if (txRes.data) setTransactions(txRes.data as TransactionWithDetails[]);
    if (allocRes.data) setAllocations(allocRes.data);
    setDisplayCurrency(profileRes.data?.default_currency || 'USD');

    setLoading(false);
  }, [user, id]);

  useEffect(() => {
    loadData();
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
    const min = Math.min(...values);
    const max = Math.max(...values);

    return { balanceHistory: history, minBalance: min, maxBalance: max };
  }, [transactions]);

  const renderLineChart = () => {
    const width = 400;
    const height = 160;
    const paddingX = 24;
    const paddingY = 16;

    if (!balanceHistory.length || minBalance === maxBalance) {
      return (
        <div className="h-40 flex items-center justify-center text-xs text-slate-600">
          Not enough data for trend
        </div>
      );
    }

    const rangeY = maxBalance - minBalance || 1;
    const innerWidth = width - paddingX * 2;
    const innerHeight = height - paddingY * 2;

    const points = balanceHistory.map((p, i) => {
      const xRatio = balanceHistory.length === 1 ? 0.5 : i / (balanceHistory.length - 1);
      const x = paddingX + xRatio * innerWidth;
      const y =
        paddingY + (1 - (p.value - minBalance) / rangeY) * innerHeight;
      return `${x},${y}`;
    });

    const pathData = `M ${points.join(' L ')}`;

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-40"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="balanceArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill="#141927" />
        <path
          d={pathData}
          fill="none"
          stroke="#60a5fa"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={`${pathData} L ${paddingX + innerWidth} ${paddingY + innerHeight} L ${paddingX} ${
            paddingY + innerHeight
          } Z`}
          fill="url(#balanceArea)"
        />
      </svg>
    );
  };

  if (loading) {
    return <div className="px-4 py-4 md:px-8 md:py-8 text-slate-400">Loading account details…</div>;
  }

  if (!account) {
    return (
      <div className="px-4 py-4 md:px-8 md:py-8">
        <button
          type="button"
          onClick={() => navigate('/accounts')}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors mb-4"
        >
          <ArrowLeft size={16} className="mr-1" />
          Back to accounts
        </button>
        <p className="text-slate-500">Account not found.</p>
      </div>
    );
  }

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpenses = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const availableBalance = Math.max(Number(account.balance) - reservedAmount, 0);

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-6">
      <button
        type="button"
        onClick={() => navigate('/accounts')}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors"
      >
        <ArrowLeft size={16} className="mr-1" />
        Back to accounts
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[#141927] p-6 rounded-xl border border-slate-800 lg:col-span-1">
          <h3 className="text-lg font-semibold text-slate-100 mb-2">{account.name}</h3>
          <p className="text-sm text-slate-500 capitalize mb-4">
            {account.type.replace('_', ' ')} · {account.currency}
          </p>
          <div className="space-y-2 text-sm text-slate-300">
            <p>
              <span className="font-medium">Current balance:</span>{' '}
              {account.currency} {Number(account.balance).toFixed(2)}
            </p>
            <p>
              <span className="font-medium">Reserved in savings goals:</span>{' '}
              {account.currency} {reservedAmount.toFixed(2)}
            </p>
            <p>
              <span className="font-medium">Available to use:</span>{' '}
              {account.currency} {availableBalance.toFixed(2)}
            </p>
            <p>
              <span className="font-medium">Transactions:</span> {transactions.length}
            </p>
          </div>
        </div>
        <div className="bg-[#141927] p-6 rounded-xl border border-slate-800 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-100">Balance trend</h4>
            <span className="text-xs text-slate-500">
              Currency: {displayCurrency || account.currency}
            </span>
          </div>
          {renderLineChart()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#141927] p-4 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-500">Total income</p>
          <p className="text-xl font-semibold text-emerald-400 mt-1">
            {account.currency} {totalIncome.toFixed(2)}
          </p>
        </div>
        <div className="bg-[#141927] p-4 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-500">Total expenses</p>
          <p className="text-xl font-semibold text-red-400 mt-1">
            {account.currency} {totalExpenses.toFixed(2)}
          </p>
        </div>
        <div className="bg-[#141927] p-4 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-500">Net</p>
          <p
            className={`text-xl font-semibold mt-1 ${
              totalIncome - totalExpenses >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {account.currency} {(totalIncome - totalExpenses).toFixed(2)}
          </p>
        </div>
      </div>

      <div className="bg-[#141927] rounded-xl border border-slate-800">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Transactions</h3>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/40 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-800/40">
                  <td className="px-6 py-3 text-sm text-slate-100">
                    {fmt(tx.transaction_date)}
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-100">
                    {tx.title || '-'}
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-500">
                    {tx.description || '-'}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    {tx.categories && (
                      <span
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{
                          backgroundColor: `${tx.categories.color}20`,
                          color: tx.categories.color,
                        }}
                      >
                        {tx.categories.name}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-300 capitalize">
                    {tx.type}
                  </td>
                  <td
                    className={`px-6 py-3 text-sm font-semibold ${
                      tx.type === 'income' ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    <div className="flex flex-col items-start gap-0.5">
                      <span>
                        {tx.type === 'income' ? '+' : '-'}
                        {tx.currency || account.currency}{' '}
                        {Number(tx.amount).toFixed(2)}
                      </span>
                      {Number(tx.charge_amount ?? 0) > 0 && (
                        <span className="text-[10px] text-slate-500">
                          charge {tx.currency || account.currency} {Number(tx.charge_amount).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <div className="text-center py-8 text-slate-500">No transactions for this account yet.</div>
          )}
        </div>

        {/* Mobile list */}
        <div className="md:hidden divide-y divide-slate-800">
          {transactions.map((tx) => (
            <div key={tx.id} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <div className="mr-2">
                  <p className="text-sm font-medium text-slate-100">
                    {tx.title || tx.description || 'Transaction'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmt(tx.transaction_date)} ·{' '}
                    <span className="capitalize">{tx.type}</span>
                  </p>
                </div>
                <div
                  className={`text-sm font-semibold text-right ${
                    tx.type === 'income' ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  <div>
                    {tx.type === 'income' ? '+' : '-'}
                    {tx.currency || account.currency}{' '}
                    {Number(tx.amount).toFixed(2)}
                  </div>
                  {Number(tx.charge_amount ?? 0) > 0 && (
                    <div className="text-[10px] text-slate-500 font-normal">
                      charge {tx.currency || account.currency} {Number(tx.charge_amount).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
              {tx.categories && (
                <div className="mt-1">
                  <span
                    className="px-2 py-0.5 rounded text-[11px] font-medium"
                    style={{
                      backgroundColor: `${tx.categories.color}20`,
                      color: tx.categories.color,
                    }}
                  >
                    {tx.categories.name}
                  </span>
                </div>
              )}
              {tx.description && (
                <p className="mt-1 text-xs text-slate-500">{tx.description}</p>
              )}
            </div>
          ))}
          {transactions.length === 0 && (
            <div className="text-center py-8 text-slate-500">No transactions for this account yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

