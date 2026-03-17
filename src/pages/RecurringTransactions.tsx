import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, CreditCard as Edit2, Trash2, Play, Pause, Link2, RefreshCw } from 'lucide-react';
import type { Database } from '../lib/database.types';

type RecurringTransaction = Database['public']['Tables']['recurring_transactions']['Row'];
type Account = Database['public']['Tables']['accounts']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];
type Subscription = Database['public']['Tables']['subscriptions']['Row'];

interface RecurringWithDetails extends RecurringTransaction {
  accounts: { name: string } | null;
  categories: { name: string; color: string } | null;
  subscriptions: { name: string; plan: string | null } | null;
}

const emptyForm = {
  name: '',
  account_id: '',
  category_id: '',
  subscription_id: '',
  amount: '',
  type: 'expense' as 'income' | 'expense',
  frequency: 'monthly' as RecurringTransaction['frequency'],
  next_date: new Date().toISOString().split('T')[0],
  description: '',
};

export function RecurringTransactions() {
  const { user } = useAuth();
  const [recurring, setRecurring] = useState<RecurringWithDetails[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringTransaction | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [displayCurrency, setDisplayCurrency] = useState('USD');

  const loadData = useCallback(async () => {
    if (!user) {
      setRecurring([]);
      setAccounts([]);
      setCategories([]);
      setSubscriptions([]);
      return;
    }

    const [recurringRes, accountsRes, categoriesRes, subsRes, profRes] = await Promise.all([
      supabase
        .from('recurring_transactions')
        .select('*, accounts(name), categories(name, color), subscriptions(name, plan)')
        .eq('user_id', user.id)
        .order('next_date', { ascending: true }),
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('categories').select('*').eq('user_id', user.id),
      supabase.from('subscriptions').select('id, name, plan').eq('user_id', user.id).eq('is_active', true).order('name'),
      supabase.from('profiles').select('default_currency').eq('id', user.id).single(),
    ]);

    if (recurringRes.data) setRecurring(recurringRes.data as RecurringWithDetails[]);
    if (accountsRes.data) setAccounts(accountsRes.data);
    if (categoriesRes.data) setCategories(categoriesRes.data);
    if (subsRes.data) setSubscriptions(subsRes.data as Subscription[]);
    setDisplayCurrency(profRes.data?.default_currency ?? 'USD');
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const data = {
      user_id: user.id,
      name: formData.name,
      account_id: formData.account_id,
      category_id: formData.category_id || null,
      subscription_id: formData.subscription_id || null,
      amount: parseFloat(formData.amount),
      type: formData.type,
      frequency: formData.frequency,
      next_date: formData.next_date,
      description: formData.description || null,
    };

    if (editingRecurring) {
      await supabase.from('recurring_transactions').update(data).eq('id', editingRecurring.id);
    } else {
      await supabase.from('recurring_transactions').insert(data);
    }

    setShowForm(false);
    setEditingRecurring(null);
    setFormData(emptyForm);
    loadData();
  };

  const handleEdit = (rec: RecurringWithDetails) => {
    setEditingRecurring(rec);
    setFormData({
      name: rec.name,
      account_id: rec.account_id,
      category_id: rec.category_id ?? '',
      subscription_id: rec.subscription_id ?? '',
      amount: rec.amount.toString(),
      type: rec.type as 'income' | 'expense',
      frequency: rec.frequency,
      next_date: rec.next_date,
      description: rec.description ?? '',
    });
    setShowForm(true);
  };

  const handleToggleActive = async (rec: RecurringTransaction) => {
    await supabase.from('recurring_transactions').update({ is_active: !rec.is_active }).eq('id', rec.id);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this recurring transaction?')) {
      await supabase.from('recurring_transactions').delete().eq('id', id);
      loadData();
    }
  };

  const totalMonthlyNet = recurring
    .filter((r) => r.is_active && r.frequency === 'monthly')
    .reduce((sum, r) => sum + (r.type === 'income' ? Number(r.amount) : -Number(r.amount)), 0);

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-6">

      {/* Summary card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800 md:col-span-1">
          <p className="text-xs text-slate-400">Monthly Net Recurring</p>
          <p className={`text-2xl font-bold mt-1 ${totalMonthlyNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalMonthlyNet >= 0 ? '+' : ''}{displayCurrency} {totalMonthlyNet.toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">active monthly transactions only</p>
        </div>
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-400">Active</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{recurring.filter((r) => r.is_active).length}</p>
          <p className="text-[11px] text-slate-500 mt-1">recurring payments</p>
        </div>
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-400">Linked to Subscriptions</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">
            {recurring.filter((r) => r.subscription_id).length}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">of {recurring.length} recurring payments</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">Recurring Payments</h3>
        <button
          onClick={() => { setShowForm(true); setEditingRecurring(null); setFormData(emptyForm); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all"
        >
          <Plus size={18} /> Add Recurring
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">
            {editingRecurring ? 'Edit Recurring Transaction' : 'New Recurring Transaction'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Name *</label>
                <input required type="text" value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Monthly rent" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Type</label>
                <select value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'income' | 'expense' })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Amount *</label>
                <input required type="number" step="0.01" value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Frequency</label>
                <select value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value as RecurringTransaction['frequency'] })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Account *</label>
                <select required value={formData.account_id}
                  onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="">Select account</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                <select value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="">No category</option>
                  {categories.filter((c) => c.type === formData.type).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Optional subscription link */}
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Link to Subscription
                  <span className="ml-1.5 text-slate-600 font-normal">(optional)</span>
                </label>
                <select value={formData.subscription_id}
                  onChange={(e) => setFormData({ ...formData, subscription_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="">Not linked to a subscription</option>
                  {subscriptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.plan ? ` — ${s.plan}` : ''}
                    </option>
                  ))}
                </select>
                {subscriptions.length === 0 && (
                  <p className="text-[11px] text-slate-600 mt-1">
                    No active subscriptions found. Add them under Finance → Subscriptions.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Next Date *</label>
                <input required type="date" value={formData.next_date}
                  onChange={(e) => setFormData({ ...formData, next_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                <input type="text" value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional note" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>

            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all">
                {editingRecurring ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingRecurring(null); }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-[0.97] text-slate-300 text-sm font-medium rounded-xl border border-slate-700/60 transition-all">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {recurring.map((rec) => (
          <div key={rec.id}
            className={`bg-[#141927] p-4 rounded-xl border border-slate-800 transition-all ${!rec.is_active ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${rec.type === 'income' ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                  <RefreshCw size={15} className={rec.type === 'income' ? 'text-emerald-400' : 'text-red-400'} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-100">{rec.name}</p>
                    {rec.subscriptions && (
                      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/20 font-medium">
                        <Link2 size={9} />
                        {rec.subscriptions.name}{rec.subscriptions.plan ? ` · ${rec.subscriptions.plan}` : ''}
                      </span>
                    )}
                    {rec.categories && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ backgroundColor: `${rec.categories.color}20`, color: rec.categories.color }}>
                        {rec.categories.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                    <span>{rec.accounts?.name}</span>
                    <span className="capitalize">{rec.frequency}</span>
                    <span>Next: {new Date(rec.next_date).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-base font-bold ${rec.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {rec.type === 'income' ? '+' : '-'}{displayCurrency} {Number(rec.amount).toFixed(2)}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleToggleActive(rec)}
                    className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all">
                    {rec.is_active ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button onClick={() => handleEdit(rec)}
                    className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(rec.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {recurring.length === 0 && !showForm && (
        <div className="text-center py-12 bg-[#141927] rounded-xl border border-slate-800 text-slate-500">
          <RefreshCw className="mx-auto mb-3 text-slate-700" size={36} />
          <p className="text-sm">No recurring transactions yet</p>
          <p className="text-xs text-slate-600 mt-1">Add rent, salary, loan repayments, and other scheduled payments</p>
        </div>
      )}
    </div>
  );
}
