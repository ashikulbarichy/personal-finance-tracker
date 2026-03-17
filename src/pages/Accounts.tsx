import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Plus, CreditCard as Edit2, Trash2, Eye, EyeOff } from 'lucide-react';
import type { Database } from '../lib/database.types';

type Account = Database['public']['Tables']['accounts']['Row'];
type SavingsAllocation = Database['public']['Tables']['savings_goal_allocations']['Row'];

export function Accounts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allocations, setAllocations] = useState<SavingsAllocation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>(['USD']);
  const [formData, setFormData] = useState({
    name: '',
    type: 'checking' as Account['type'],
    balance: '0',
    currency: 'USD',
  });

  const loadAccounts = useCallback(async () => {
    if (!user) {
      setAccounts([]);
      return;
    }

    const [accountsRes, allocationsRes] = await Promise.all([
      supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('savings_goal_allocations')
        .select('account_id, amount, goal_id')
        .eq('user_id', user.id),
    ]);

    if (accountsRes.data) {
      setAccounts(accountsRes.data);
    }
    if (allocationsRes.data) {
      setAllocations(allocationsRes.data as SavingsAllocation[]);
    }
  }, [user]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    const loadCurrency = async () => {
      if (!user) {
        setDisplayCurrency('USD');
        setAvailableCurrencies(['USD']);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('default_currency, enabled_currencies')
        .eq('id', user.id)
        .single();

      const defaultCurrency = data?.default_currency || 'USD';
      const enabled =
        (data?.enabled_currencies as string[] | null | undefined) ?? [defaultCurrency];

      const uniqueCurrencies = Array.from(new Set(enabled.length ? enabled : [defaultCurrency]));

      setDisplayCurrency(defaultCurrency);
      setAvailableCurrencies(uniqueCurrencies);

      setFormData((prev) => ({
        ...prev,
        currency: prev.currency || defaultCurrency,
      }));
    };
    loadCurrency();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (editingAccount) {
      await supabase
        .from('accounts')
        .update({
          name: formData.name,
          type: formData.type,
          balance: parseFloat(formData.balance),
          currency: formData.currency,
        })
        .eq('id', editingAccount.id);
    } else {
      await supabase.from('accounts').insert({
        user_id: user.id,
        name: formData.name,
        type: formData.type,
        balance: parseFloat(formData.balance),
        currency: formData.currency,
      });
    }

    setShowForm(false);
    setEditingAccount(null);
    setFormData({ name: '', type: 'checking', balance: '0', currency: 'USD' });
    loadAccounts();
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      type: account.type,
      balance: account.balance.toString(),
      currency: account.currency,
    });
    setShowForm(true);
  };

  const handleToggleActive = async (account: Account) => {
    await supabase
      .from('accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id);
    loadAccounts();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this account?')) {
      await supabase.from('accounts').delete().eq('id', id);
      loadAccounts();
    }
  };

  const totalBalance = accounts
    .filter((a) => a.is_active)
    .reduce((sum, a) => sum + Number(a.balance), 0);

  const reservedByAccount = accounts.reduce<Record<string, number>>((acc, account) => {
    const reserved = allocations
      .filter((alloc) => alloc.account_id === account.id)
      .reduce((sum, alloc) => sum + Number(alloc.amount), 0);
    if (reserved > 0) {
      acc[account.id] = reserved;
    }
    return acc;
  }, {});

  const accountGradient: Record<string, string> = {
    checking: 'from-blue-600 to-indigo-700',
    savings: 'from-violet-600 to-purple-700',
    credit_card: 'from-rose-500 to-red-700',
    cash: 'from-emerald-500 to-teal-700',
    investment: 'from-amber-500 to-orange-700',
    multi_currency: 'from-cyan-500 to-blue-700',
    mfs: 'from-pink-500 to-fuchsia-700',
  };

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Balance</p>
          <p className="text-3xl font-bold text-slate-100 mt-1">
            {displayCurrency} {totalBalance.toFixed(2)}
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingAccount(null);
            setFormData({ name: '', type: 'checking', balance: '0', currency: 'USD' });
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
        >
          <Plus size={18} />
          <span className="text-sm font-medium">Add Account</span>
        </button>
      </div>

      {showForm && (
        <div className="bg-[#141927] p-6 rounded-xl border border-slate-700">
          <h3 className="text-base font-semibold text-slate-100 mb-4">
            {editingAccount ? 'Edit Account' : 'New Account'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Account Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="e.g., Chase Checking"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as Account['type'] })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="cash">Cash</option>
                  <option value="investment">Investment</option>
                  <option value="multi_currency">Multi-currency Account</option>
                  <option value="mfs">Mobile Money (MFS)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Balance</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.balance}
                  onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Currency</label>
                <select
                  required
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  {availableCurrencies.map((cur) => (
                    <option key={cur} value={cur}>{cur}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex space-x-3">
              <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150">
                {editingAccount ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingAccount(null); }}
                className="px-4 py-2 text-sm bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((account) => {
          const reserved = reservedByAccount[account.id] || 0;
          const available = Math.max(Number(account.balance) - reserved, 0);
          const gradient = accountGradient[account.type] || 'from-slate-600 to-slate-700';

          return (
            <div
              key={account.id}
              className={`bg-gradient-to-br ${gradient} p-6 rounded-xl shadow-lg cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xl ${
                !account.is_active ? 'opacity-40' : ''
              }`}
              onClick={() => navigate(`/accounts/${account.id}`)}
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h4 className="font-semibold text-white text-base">{account.name}</h4>
                  <p className="text-xs text-white/70 mt-0.5 capitalize">
                    {account.type.replace(/_/g, ' ')}
                  </p>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleActive(account); }}
                    className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {account.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(account); }}
                    className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(account.id); }}
                    className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="text-2xl font-bold text-white tracking-tight">
                {account.currency} {Number(account.balance).toFixed(2)}
              </div>

              {reserved > 0 && (
                <div className="mt-3 pt-3 border-t border-white/20 text-xs text-white/80 space-y-1">
                  <div className="flex justify-between">
                    <span>Reserved (goals)</span>
                    <span className="font-medium">{account.currency} {reserved.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Available</span>
                    <span className="font-semibold text-white">{account.currency} {available.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {accounts.length === 0 && !showForm && (
        <div className="text-center py-16 text-slate-500">
          <p className="text-sm">No accounts yet. Create your first account to get started.</p>
        </div>
      )}
    </div>
  );
}
