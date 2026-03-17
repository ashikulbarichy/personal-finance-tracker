import { Plus, ChevronDown, X, Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Database } from '../../lib/database.types';
import { TransactionFormModal } from '../transactions/TransactionFormModal';

interface HeaderProps {
  title: string;
  onToggleSidebar?: () => void;
}

type Account = Database['public']['Tables']['accounts']['Row'];
type QuickAddMode = 'none' | 'account' | 'transaction' | 'transfer';

export function Header({ title, onToggleSidebar }: HeaderProps) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<QuickAddMode>('none');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>(['USD']);

  const [accountForm, setAccountForm] = useState({
    name: '',
    type: 'checking' as Account['type'],
    balance: '',
    currency: 'USD',
  });

  /* ── Load profile currencies for account creation ── */
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('default_currency, enabled_currencies')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        const defaultCurrency = data?.default_currency || 'USD';
        const enabled = (data?.enabled_currencies as string[] | null | undefined) ?? [defaultCurrency];
        const unique = Array.from(new Set(enabled.length ? enabled : [defaultCurrency]));
        setAvailableCurrencies(unique);
        setAccountForm((f) => ({ ...f, currency: f.currency || defaultCurrency }));
      });
  }, [user]);

  const closeAccount = () => {
    setMode('none');
    setMenuOpen(false);
    setError(null);
    setSubmitting(false);
    setAccountForm({ name: '', type: 'checking', balance: '', currency: availableCurrencies[0] ?? 'USD' });
  };

  const openMode = (nextMode: QuickAddMode) => {
    setMode(nextMode);
    setMenuOpen(false);
    setError(null);
  };

  const handleSubmitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from('accounts').insert({
      user_id: user.id,
      name: accountForm.name,
      type: accountForm.type,
      balance: Number(accountForm.balance || 0),
      currency: accountForm.currency,
    });
    if (err) { setError(err.message); setSubmitting(false); return; }
    closeAccount();
  };

  return (
    <>
      <header className="bg-[#0f1421] border-b border-slate-800 px-4 py-3 md:px-8 md:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="inline-flex items-center justify-center p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-slate-200 md:hidden transition-colors"
              >
                <Menu size={20} />
              </button>
            )}
            <h2 className="text-xl md:text-2xl font-bold text-slate-100 truncate">{title}</h2>
          </div>

          {user && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-2 md:px-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
              >
                <Plus size={20} />
                <span>Add</span>
                <ChevronDown size={16} className="ml-1" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-[#1c2333] border border-slate-700 rounded-lg shadow-xl z-20">
                  <button
                    type="button"
                    onClick={() => openMode('account')}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100 rounded-t-lg"
                  >
                    New Account
                  </button>
                  <button
                    type="button"
                    onClick={() => openMode('transaction')}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                  >
                    New Transaction
                  </button>
                  <button
                    type="button"
                    onClick={() => openMode('transfer')}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100 rounded-b-lg"
                  >
                    Transfer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Account quick-add modal ── */}
      {mode === 'account' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#141927] border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h3 className="text-base font-semibold text-slate-100">New Account</h3>
              <button type="button" onClick={closeAccount}
                className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-700/80 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-2 rounded-lg text-xs">{error}</div>
              )}
              <form onSubmit={handleSubmitAccount} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
                  <input
                    required
                    value={accountForm.name}
                    onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Type</label>
                    <select
                      value={accountForm.type}
                      onChange={(e) => setAccountForm((f) => ({ ...f, type: e.target.value as Account['type'] }))}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="checking">Checking</option>
                      <option value="savings">Savings</option>
                      <option value="credit_card">Credit Card</option>
                      <option value="cash">Cash</option>
                      <option value="investment">Investment</option>
                      <option value="multi_currency">Multi-currency</option>
                      <option value="mfs">Mobile Money</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Balance</label>
                    <input
                      type="number"
                      step="0.01"
                      value={accountForm.balance}
                      onChange={(e) => setAccountForm((f) => ({ ...f, balance: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Currency</label>
                  <select
                    value={accountForm.currency}
                    onChange={(e) => setAccountForm((f) => ({ ...f, currency: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    {availableCurrencies.map((cur) => (
                      <option key={cur} value={cur}>{cur}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={closeAccount}
                    className="px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                    {submitting ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Full transaction form modal (shared component) ── */}
      <TransactionFormModal
        isOpen={mode === 'transaction' || mode === 'transfer'}
        initialType={mode === 'transfer' ? 'transfer' : 'expense'}
        onClose={() => setMode('none')}
        onSaved={() => setMode('none')}
      />
    </>
  );
}
