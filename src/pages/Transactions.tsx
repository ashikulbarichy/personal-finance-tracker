import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, CreditCard as Edit2, Trash2, Search, ArrowRight, UserCheck, ArrowLeftRight } from 'lucide-react';
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

/** Two linked legs of a transfer (expense = from, income = to) */
interface TransferPair {
  kind: 'transfer';
  id: string; // fromLeg.id used as React key
  fromLeg: TransactionWithDetails;
  toLeg: TransactionWithDetails;
}

interface SingleTx {
  kind: 'transaction';
  data: TransactionWithDetails;
}

type DisplayRow = TransferPair | SingleTx;

export function Transactions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [displayRows, setDisplayRows] = useState<DisplayRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<{ fromLeg: Transaction; toLeg: Transaction } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [displayCurrency, setDisplayCurrency] = useState('USD');

  const buildDisplayRows = useCallback((txList: TransactionWithDetails[]): DisplayRow[] => {
    // Group transfer pairs by transfer_pair_id
    const pairMap = new Map<string, TransactionWithDetails[]>();
    const unpaired: TransactionWithDetails[] = [];

    for (const t of txList) {
      if (t.transfer_pair_id) {
        const group = pairMap.get(t.transfer_pair_id) ?? [];
        group.push(t);
        pairMap.set(t.transfer_pair_id, group);
      } else {
        unpaired.push(t);
      }
    }

    const rows: DisplayRow[] = [];

    for (const [, legs] of pairMap) {
      const fromLeg = legs.find((l) => l.type === 'expense');
      const toLeg   = legs.find((l) => l.type === 'income');
      if (fromLeg && toLeg) {
        rows.push({ kind: 'transfer', id: fromLeg.id, fromLeg, toLeg });
      } else {
        // Malformed pair — show individually
        legs.forEach((l) => rows.push({ kind: 'transaction', data: l }));
      }
    }

    for (const t of unpaired) {
      rows.push({ kind: 'transaction', data: t });
    }

    // Sort by date descending (mirrors DB order)
    rows.sort((a, b) => {
      const da = a.kind === 'transfer' ? a.fromLeg.transaction_date : a.data.transaction_date;
      const db = b.kind === 'transfer' ? b.fromLeg.transaction_date : b.data.transaction_date;
      return new Date(db).getTime() - new Date(da).getTime();
    });

    return rows;
  }, []);

  const loadData = useCallback(async () => {
    if (!user) {
      setTransactions([]);
      setDisplayRows([]);
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
      setDisplayRows([]);
    } else if (txRes.data) {
      const accMap    = new Map(accRes.data?.map((a) => [a.id, a]) ?? []);
      const catMap    = new Map(catRes.data?.map((c) => [c.id, c]) ?? []);
      const payeeMap  = new Map(payeesRes.data?.map((p) => [p.id, p]) ?? []);

      const withDetails: TransactionWithDetails[] = txRes.data.map((t) => ({
        ...(t as Transaction),
        accounts:   accMap.get(t.account_id)
          ? { name: accMap.get(t.account_id)!.name } : null,
        categories: t.category_id && catMap.get(t.category_id)
          ? { name: catMap.get(t.category_id)!.name, color: catMap.get(t.category_id)!.color } : null,
        payees:     t.payee_id && payeeMap.get(t.payee_id)
          ? { name: payeeMap.get(t.payee_id)!.name } : null,
        payers:     t.payer_id && payeeMap.get(t.payer_id)
          ? { name: payeeMap.get(t.payer_id)!.name } : null,
      }));

      setTransactions(withDetails);
      setDisplayRows(buildDisplayRows(withDetails));
    }

    if (accRes.data)    setAccounts(accRes.data);
    if (catRes.data)    setCategories(catRes.data);
    if (payeesRes.data) setPayees(payeesRes.data);
    setDisplayCurrency(profRes.data?.default_currency ?? 'USD');
  }, [user, buildDisplayRows]);

  useEffect(() => { loadData(); }, [loadData]);

  const closeForm = () => {
    setShowForm(false);
    setEditingTransaction(null);
    setEditingTransfer(null);
  };

  const handleEditTransaction = (t: TransactionWithDetails) => {
    setEditingTransfer(null);
    setEditingTransaction(t);
    setShowForm(true);
  };

  const handleEditTransfer = (pair: TransferPair) => {
    setEditingTransaction(null);
    setEditingTransfer({ fromLeg: pair.fromLeg, toLeg: pair.toLeg });
    setShowForm(true);
  };

  const handleDeleteTransaction = async (id: string) => {
    if (confirm('Delete this transaction?')) {
      await supabase.from('transactions').delete().eq('id', id);
      loadData();
    }
  };

  const handleDeleteTransfer = async (pair: TransferPair) => {
    if (confirm('Delete this transfer? Both legs (debit + credit) will be removed.')) {
      await supabase.from('transactions').delete().in('id', [pair.fromLeg.id, pair.toLeg.id]);
      loadData();
    }
  };

  /* ── Filtering ── */
  const matchesSearch = (row: DisplayRow, term: string): boolean => {
    if (!term) return true;
    if (row.kind === 'transfer') {
      const { fromLeg, toLeg } = row;
      return (
        fromLeg.title?.toLowerCase().includes(term) ||
        fromLeg.accounts?.name.toLowerCase().includes(term) ||
        toLeg.accounts?.name.toLowerCase().includes(term) ||
        fromLeg.description?.toLowerCase().includes(term) ||
        false
      );
    }
    const t = row.data;
    return (
      t.title?.toLowerCase().includes(term) ||
      t.description?.toLowerCase().includes(term) ||
      t.accounts?.name.toLowerCase().includes(term) ||
      t.payees?.name.toLowerCase().includes(term) ||
      t.payers?.name.toLowerCase().includes(term) ||
      false
    );
  };

  const filteredRows = displayRows.filter((row) => {
    const term = searchTerm.toLowerCase().trim();
    if (!matchesSearch(row, term)) return false;
    if (filterType === 'all') return true;
    if (filterType === 'transfer') return row.kind === 'transfer';
    if (row.kind === 'transfer') return false;
    return row.data.type === filterType;
  });

  /* ── Totals (exclude transfer legs) ── */
  const nonTransferTx = transactions.filter((t) => !t.transfer_pair_id);
  const totalIncome   = nonTransferTx.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const totalExpenses = nonTransferTx.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  void accounts; void categories; void payees;

  /* ── Shared cell/badge helpers ── */
  const amountCell = (t: TransactionWithDetails) => (
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
  );

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-6">

      <TransactionFormModal
        isOpen={showForm}
        onClose={closeForm}
        onSaved={loadData}
        editingTransaction={editingTransaction}
        editingTransfer={editingTransfer}
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
                    ? f === 'income'   ? 'bg-emerald-600 text-white'
                    : f === 'expense'  ? 'bg-red-600 text-white'
                    : f === 'transfer' ? 'bg-cyan-600 text-white'
                    : 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
                }`}>{f}</button>
            ))}
          </div>
        </div>
        <button
          onClick={() => { setEditingTransaction(null); setEditingTransfer(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all">
          <Plus size={18} /> Add Transaction
        </button>
      </div>

      {/* Transaction list */}
      <div className="bg-[#141927] rounded-xl border border-slate-800">

        {/* ── Desktop table ── */}
        <div className="hidden md:block overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/40 border-b border-slate-800">
              <tr>
                {['Date', 'Title', 'Account / Route', 'Category', 'Amount', ''].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredRows.map((row) => {

                if (row.kind === 'transfer') {
                  const { fromLeg, toLeg } = row;
                  return (
                    <tr key={row.id} className="hover:bg-slate-800/30 bg-cyan-950/10">
                      <td className="px-5 py-3 text-sm text-slate-400">
                        {new Date(fromLeg.transaction_date).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 uppercase tracking-wide">
                            Transfer
                          </span>
                          <span className="text-slate-100">{fromLeg.title || 'Transfer'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <span className="text-slate-400">{fromLeg.accounts?.name ?? '—'}</span>
                          <ArrowLeftRight size={12} className="text-cyan-500 shrink-0" />
                          <span className="text-slate-400">{toLeg.accounts?.name ?? '—'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-600">—</td>
                      <td className="px-5 py-3 text-sm">
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="font-semibold text-cyan-400">
                            {fromLeg.currency} {Number(fromLeg.amount).toFixed(2)}
                          </span>
                          {fromLeg.custom_rate != null && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 leading-tight">
                              rate {fromLeg.custom_rate}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleEditTransfer(row)} className="text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 p-1.5 rounded-lg transition-all"><Edit2 size={14} /></button>
                          <button onClick={() => handleDeleteTransfer(row)} className="text-slate-500 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition-all"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const t = row.data;
                return (
                  <tr key={t.id} className="hover:bg-slate-800/30">
                    <td className="px-5 py-3 text-sm text-slate-400">{new Date(t.transaction_date).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-sm text-slate-100">{t.title || t.description || '—'}</td>
                    <td className="px-5 py-3 text-sm">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <span>{t.accounts?.name ?? '—'}</span>
                        {t.payees && (
                          <>
                            <ArrowRight size={11} className="text-slate-600 shrink-0" />
                            <span className="text-violet-400 flex items-center gap-1"><UserCheck size={11} />{t.payees.name}</span>
                          </>
                        )}
                        {!t.payees && t.payers && (
                          <>
                            <ArrowRight size={11} className="text-slate-600 shrink-0" />
                            <span className="text-emerald-400 flex items-center gap-1"><UserCheck size={11} />{t.payers.name}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm">
                      {t.categories
                        ? <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: `${t.categories.color}20`, color: t.categories.color }}>{t.categories.name}</span>
                        : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-3 text-sm">{amountCell(t)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleEditTransaction(t)} className="text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 p-1.5 rounded-lg transition-all"><Edit2 size={14} /></button>
                        <button onClick={() => handleDeleteTransaction(t.id)} className="text-slate-500 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition-all"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-600 text-sm">No transactions found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Mobile card list ── */}
        <div className="md:hidden divide-y divide-slate-800">
          {filteredRows.map((row) => {

            if (row.kind === 'transfer') {
              const { fromLeg, toLeg } = row;
              return (
                <div key={row.id} className="px-4 py-3 flex items-start justify-between gap-3 bg-cyan-950/10">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 uppercase tracking-wide shrink-0">
                          Transfer
                        </span>
                        <p className="text-sm font-medium text-slate-100 truncate">{fromLeg.title || 'Transfer'}</p>
                      </div>
                      <span className="text-sm font-semibold text-cyan-400 whitespace-nowrap">
                        {fromLeg.currency} {Number(fromLeg.amount).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
                      <span>{new Date(fromLeg.transaction_date).toLocaleDateString()}</span>
                      <span>·</span>
                      <span>{fromLeg.accounts?.name ?? '—'}</span>
                      <ArrowLeftRight size={10} className="text-cyan-500 shrink-0" />
                      <span>{toLeg.accounts?.name ?? '—'}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-end shrink-0">
                    <button onClick={() => handleEditTransfer(row)} className="text-slate-500 hover:text-blue-400"><Edit2 size={14} /></button>
                    <button onClick={() => handleDeleteTransfer(row)} className="text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            }

            const t = row.data;
            return (
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
                <div className="flex flex-col gap-1 items-end shrink-0">
                  <button onClick={() => handleEditTransaction(t)} className="text-slate-500 hover:text-blue-400"><Edit2 size={14} /></button>
                  <button onClick={() => handleDeleteTransaction(t.id)} className="text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
          {filteredRows.length === 0 && (
            <div className="py-10 text-center text-slate-600 text-sm">No transactions found</div>
          )}
        </div>
      </div>
    </div>
  );
}
