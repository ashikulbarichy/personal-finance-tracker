import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, CreditCard as Edit2, Trash2, Search, ArrowRight, UserCheck } from 'lucide-react';
import type { Database } from '../lib/database.types';
import { TransactionFormModal } from '../components/transactions/TransactionFormModal';

type Transaction = Database['public']['Tables']['transactions']['Row'];
type Account = Database['public']['Tables']['accounts']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];
type Payee = Database['public']['Tables']['payees']['Row'];

interface TransactionWithDetails extends Transaction {
  accounts: { name: string } | null;
  categories: { name: string; color: string } | null;
  payees: { name: string } | null;
  payers: { name: string } | null;
}

export function Transactions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [displayCurrency, setDisplayCurrency] = useState('USD');

  const loadData = useCallback(async () => {
    if (!user) {
      setTransactions([]);
      setAccounts([]);
      setCategories([]);
      return;
    }

    const [txRes, accRes, catRes, payeesRes, profRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false }),
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('categories').select('*').eq('user_id', user.id),
      supabase.from('payees').select('*').eq('user_id', user.id).order('name'),
      supabase.from('profiles').select('default_currency').eq('id', user.id).single(),
    ]);

    if (txRes.error) {
      console.error('Failed to load transactions', txRes.error);
      setTransactions([]);
    } else if (txRes.data) {
      const accMap = new Map(accRes.data?.map((a) => [a.id, a]) ?? []);
      const catMap = new Map(catRes.data?.map((c) => [c.id, c]) ?? []);
      const payeeMap = new Map(payeesRes.data?.map((p) => [p.id, p]) ?? []);

      const withDetails: TransactionWithDetails[] = txRes.data.map((t) => ({
        ...(t as Transaction),
        accounts: accMap.get(t.account_id)
          ? { name: accMap.get(t.account_id)!.name }
          : null,
        categories: t.category_id && catMap.get(t.category_id)
          ? { name: catMap.get(t.category_id)!.name, color: catMap.get(t.category_id)!.color }
          : null,
        payees: t.payee_id && payeeMap.get(t.payee_id)
          ? { name: payeeMap.get(t.payee_id)!.name }
          : null,
        payers: t.payer_id && payeeMap.get(t.payer_id)
          ? { name: payeeMap.get(t.payer_id)!.name }
          : null,
      }));

      setTransactions(withDetails);
    }

    if (accRes.data) setAccounts(accRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (payeesRes.data) setPayees(payeesRes.data);
    setDisplayCurrency(profRes.data?.default_currency ?? 'USD');
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleEdit = (transaction: TransactionWithDetails) => {
    setEditingTransaction(transaction);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this transaction?')) {
      await supabase.from('transactions').delete().eq('id', id);
      loadData();
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    const term = searchTerm.toLowerCase().trim();

    const matchesSearch =
      !term ||
      t.title?.toLowerCase().includes(term) ||
      t.description?.toLowerCase().includes(term) ||
      t.accounts?.name.toLowerCase().includes(term) ||
      t.payees?.name.toLowerCase().includes(term) ||
      t.payers?.name.toLowerCase().includes(term);

    // Use the actual transaction type from the database
    const matchesType = filterType === 'all' || t.type === filterType;

    return matchesSearch && matchesType;
  });

  const totalIncome = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const totalExpenses = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  // suppress unused-variable warnings — accounts/categories/payees kept for potential future inline use
  void accounts; void categories; void payees;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-6">

      {/* Transaction form modal */}
      <TransactionFormModal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingTransaction(null); }}
        onSaved={loadData}
        editingTransaction={editingTransaction}
      />

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#141927] p-4 rounded-xl border border-slate-800">
          <p className="text-sm text-slate-400">Total Income</p>
          <p className="text-2xl font-bold text-emerald-400">{displayCurrency} {totalIncome.toFixed(2)}</p>
        </div>
        <div className="bg-[#141927] p-4 rounded-xl border border-slate-800">
          <p className="text-sm text-slate-400">Total Expenses</p>
          <p className="text-2xl font-bold text-red-400">{displayCurrency} {totalExpenses.toFixed(2)}</p>
        </div>
        <div className="bg-[#141927] p-4 rounded-xl border border-slate-800">
          <p className="text-sm text-slate-400">Net</p>
          <p className={`text-2xl font-bold ${totalIncome - totalExpenses >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {displayCurrency} {(totalIncome - totalExpenses).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex-1 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
            <input type="text" placeholder="Search transactions…" value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>
          <div className="flex items-center bg-slate-800 border border-slate-600 rounded-lg p-1 gap-1 overflow-x-auto">
            {(['all', 'income', 'expense', 'transfer'] as const).map((f) => (
              <button key={f} onClick={() => setFilterType(f)}
                className={`px-3 py-1 rounded text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                  filterType === f
                    ? f === 'income' ? 'bg-emerald-600 text-white'
                      : f === 'expense' ? 'bg-red-600 text-white'
                      : f === 'transfer' ? 'bg-cyan-600 text-white'
                      : 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}>{f}</button>
            ))}
          </div>
        </div>
        <button
          onClick={() => { setEditingTransaction(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all">
          <Plus size={18} /> Add Transaction
        </button>
      </div>

      {/* Transaction list */}
      <div className="bg-[#141927] rounded-xl border border-slate-800">
        {/* Desktop table */}
        <div className="hidden md:block overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/40 border-b border-slate-800">
              <tr>
                {['Date', 'Title', 'From → To', 'Category', 'Amount', ''].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/30">
                  <td className="px-5 py-3 text-sm text-slate-400">{new Date(t.transaction_date).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-sm text-slate-100">{t.title || t.description || '—'}</td>
                  <td className="px-5 py-3 text-sm">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span>{t.accounts?.name ?? '—'}</span>
                      {t.payees && (
                        <>
                          <ArrowRight size={11} className="text-slate-600 shrink-0" />
                          <span className="text-violet-400 flex items-center gap-1">
                            <UserCheck size={11} />{t.payees.name}
                          </span>
                        </>
                      )}
                      {!t.payees && t.payers && (
                        <>
                          <ArrowRight size={11} className="text-slate-600 shrink-0" />
                          <span className="text-emerald-400 flex items-center gap-1">
                            <UserCheck size={11} />{t.payers.name}
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm">
                    {t.categories ? (
                      <span className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: `${t.categories.color}20`, color: t.categories.color }}>
                        {t.categories.name}
                      </span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-5 py-3 text-sm">
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`font-semibold ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.type === 'income' ? '+' : '-'}{t.currency} {Number(t.amount).toFixed(2)}
                      </span>
                      {t.custom_rate != null && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 leading-tight">
                          rate {t.custom_rate}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(t)} className="text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 p-1.5 rounded-lg transition-all"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(t.id)} className="text-slate-500 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition-all"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-600 text-sm">No transactions found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-800">
          {filteredTransactions.map((t) => (
            <div key={t.id} className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-100 truncate">{t.title || t.description || 'Transaction'}</p>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={`text-sm font-semibold whitespace-nowrap ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.type === 'income' ? '+' : '-'}{t.currency} {Number(t.amount).toFixed(2)}
                    </span>
                    {t.custom_rate != null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 leading-tight">
                        rate {t.custom_rate}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500">
                  <span>{new Date(t.transaction_date).toLocaleDateString()}</span>
                  <span>·</span>
                  <span>{t.accounts?.name ?? '—'}</span>
                  {t.payees && (
                    <>
                      <ArrowRight size={10} className="text-slate-600 shrink-0" />
                      <span className="text-violet-400">{t.payees.name}</span>
                    </>
                  )}
                  {!t.payees && t.payers && (
                    <>
                      <ArrowRight size={10} className="text-slate-600 shrink-0" />
                      <span className="text-emerald-400">{t.payers.name}</span>
                    </>
                  )}
                </div>
                {t.categories && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-medium"
                    style={{ backgroundColor: `${t.categories.color}20`, color: t.categories.color }}>
                    {t.categories.name}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1 items-end">
                <button onClick={() => handleEdit(t)} className="text-slate-500 hover:text-blue-400"><Edit2 size={14} /></button>
                <button onClick={() => handleDelete(t.id)} className="text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {filteredTransactions.length === 0 && (
            <div className="py-10 text-center text-slate-600 text-sm">No transactions found</div>
          )}
        </div>
      </div>
    </div>
  );
}
