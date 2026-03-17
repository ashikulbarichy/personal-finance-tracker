import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { RefreshCw, Plus, Pause, Play, Trash2, Edit2, ExternalLink } from 'lucide-react';
import type { Database } from '../lib/database.types';

type Subscription = Database['public']['Tables']['subscriptions']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];
type Account = Database['public']['Tables']['accounts']['Row'];

interface RateRow {
  from_currency: string;
  to_currency: string;
  rate: number;
  updated_at: string;
}

interface SubWithDetails extends Subscription {
  categories: { name: string; color: string } | null;
  accounts: { name: string } | null;
  recurring_count?: number;
}

const CYCLE_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

function toMonthly(amount: number, cycle: string): number {
  switch (cycle) {
    case 'weekly':    return amount * 4.333;
    case 'quarterly': return amount / 3;
    case 'yearly':    return amount / 12;
    default:          return amount;
  }
}

const emptyForm = {
  name: '', provider: '', plan: '', amount: '', currency: 'USD',
  billing_cycle: 'monthly' as Subscription['billing_cycle'],
  category_id: '', account_id: '', start_date: '', renewal_date: '',
  website: '', notes: '',
};

export function Subscriptions() {
  const { user } = useAuth();
  const [subs, setSubs] = useState<SubWithDetails[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [enabledCurrencies, setEnabledCurrencies] = useState<string[]>(['USD']);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [displayCurrency, setDisplayCurrency] = useState('USD');

  const STORAGE_KEY = `exchange_rates_${user?.id ?? 'anon'}`;

  const load = useCallback(async () => {
    if (!user) { setSubs([]); setLoading(false); return; }

    const [subsRes, catRes, accRes, profRes] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('*, categories(name, color), accounts(name)')
        .eq('user_id', user.id)
        .order('is_active', { ascending: false })
        .order('name'),
      supabase.from('categories').select('*').eq('user_id', user.id).eq('type', 'expense'),
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('profiles').select('default_currency, enabled_currencies').eq('id', user.id).single(),
    ]);

    setSubs((subsRes.data ?? []) as SubWithDetails[]);
    setCategories(catRes.data ?? []);
    setAccounts(accRes.data ?? []);
    const dc = profRes.data?.default_currency ?? 'USD';
    const enabled =
      ((profRes.data?.enabled_currencies as string[] | null | undefined) ?? [dc]).filter(Boolean);
    const unique = Array.from(new Set(enabled.length ? enabled : [dc]));

    setDisplayCurrency(dc);
    setEnabledCurrencies(unique);
    setFormData((prev) => ({ ...prev, currency: prev.currency || dc }));

    // load exchange rates from localStorage shared with ExchangeRates page
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { rates: RateRow[]; updated_at?: string };
        setRates(parsed.rates ?? []);
      } else {
        setRates([]);
      }
    } catch {
      setRates([]);
    }

    setLoading(false);
  }, [user, STORAGE_KEY]);

  useEffect(() => { load(); }, [load]);

  const convertAmount = useCallback(
    (amount: number, from: string, to: string): number => {
      if (!amount || from === to) return amount;
      const direct = rates.find((r) => r.from_currency === from && r.to_currency === to);
      if (direct) return amount * direct.rate;
      const inverse = rates.find((r) => r.from_currency === to && r.to_currency === from);
      if (inverse) return amount / inverse.rate;
      return amount;
    },
    [rates]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      user_id: user.id,
      name: formData.name,
      provider: formData.provider || null,
      plan: formData.plan || null,
      amount: parseFloat(formData.amount),
      currency: formData.currency,
      billing_cycle: formData.billing_cycle,
      category_id: formData.category_id || null,
      account_id: formData.account_id || null,
      start_date: formData.start_date || null,
      renewal_date: formData.renewal_date || null,
      website: formData.website || null,
      notes: formData.notes || null,
    };

    if (editing) {
      await supabase.from('subscriptions').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('subscriptions').insert(payload);
    }

    setShowForm(false);
    setEditing(null);
    setFormData({ ...emptyForm, currency: displayCurrency });
    load();
  };

  const handleEdit = (s: Subscription) => {
    setEditing(s);
    setFormData({
      name: s.name,
      provider: s.provider ?? '',
      plan: s.plan ?? '',
      amount: s.amount.toString(),
      currency: s.currency,
      billing_cycle: s.billing_cycle,
      category_id: s.category_id ?? '',
      account_id: s.account_id ?? '',
      start_date: s.start_date ?? '',
      renewal_date: s.renewal_date ?? '',
      website: s.website ?? '',
      notes: s.notes ?? '',
    });
    setShowForm(true);
  };

  const handleToggle = async (s: Subscription) => {
    await supabase.from('subscriptions').update({ is_active: !s.is_active }).eq('id', s.id);
    load();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this subscription? Any linked recurring payments will be unlinked.')) {
      await supabase.from('subscriptions').delete().eq('id', id);
      load();
    }
  };

  const activeSubs = useMemo(() => subs.filter((s) => s.is_active), [subs]);
  const totalMonthly = useMemo(
    () =>
      activeSubs.reduce((sum, s) => {
        const monthlyNative = toMonthly(Number(s.amount), s.billing_cycle);
        const monthlyDefault = convertAmount(monthlyNative, s.currency, displayCurrency);
        return sum + monthlyDefault;
      }, 0),
    [activeSubs, convertAmount, displayCurrency]
  );

  if (loading) return <div className="px-8 py-8 text-slate-400">Loading…</div>;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-5">

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 p-5 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-violet-200 font-medium">Monthly Cost</p>
              <p className="text-2xl font-bold text-white mt-1">
                {displayCurrency} {totalMonthly.toFixed(2)}
              </p>
              <p className="text-[11px] text-violet-200 mt-1">
                {activeSubs.length} active subscription{activeSubs.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="p-2.5 bg-white/20 rounded-xl">
              <RefreshCw className="text-white" size={20} />
            </div>
          </div>
        </div>

        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">Annual Cost</p>
          <p className="text-xl font-bold text-slate-100">
            {displayCurrency} {(totalMonthly * 12).toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-1">based on active subscriptions</p>
        </div>

        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">Daily Cost</p>
          <p className="text-xl font-bold text-slate-100">
            {displayCurrency} {(totalMonthly / 30).toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-1">per day average</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex justify-end">
        <button
          onClick={() => { setShowForm(true); setEditing(null); setFormData({ ...emptyForm, currency: displayCurrency }); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all"
        >
          <Plus size={18} /> Add Subscription
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">
            {editing ? 'Edit Subscription' : 'New Subscription'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Subscription Name *</label>
                <input required type="text" value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Netflix" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Provider / Brand</label>
                <input type="text" value={formData.provider}
                  onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                  placeholder="e.g. Netflix Inc." className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Plan / Tier</label>
                <input type="text" value={formData.plan}
                  onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                  placeholder="e.g. Premium, Family, Pro" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Amount *</label>
                  <input required type="number" step="0.01" value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    {(
                      formData.currency && !enabledCurrencies.includes(formData.currency)
                        ? [formData.currency, ...enabledCurrencies]
                        : enabledCurrencies
                    ).map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Billing Cycle</label>
                <select value={formData.billing_cycle}
                  onChange={(e) => setFormData({ ...formData, billing_cycle: e.target.value as Subscription['billing_cycle'] })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                <select value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="">No category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Charged to Account</label>
                <select value={formData.account_id}
                  onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="">No account</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Website</label>
                <input type="url" value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://netflix.com" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Start Date</label>
                <input type="date" value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Next Renewal Date</label>
                <input type="date" value={formData.renewal_date}
                  onChange={(e) => setFormData({ ...formData, renewal_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
                <input type="text" value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional notes" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl transition-all">
                {editing ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl border border-slate-700 transition-all">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Active subscriptions */}
      {activeSubs.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 px-1">Active</h3>
          <div className="space-y-3">
            {activeSubs.map((s) => (
              <SubCard
                key={s.id}
                sub={s}
                defaultCurrency={displayCurrency}
                monthlyInDefault={convertAmount(toMonthly(Number(s.amount), s.billing_cycle), s.currency, displayCurrency)}
                onEdit={handleEdit}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inactive subscriptions */}
      {subs.filter((s) => !s.is_active).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 px-1">Inactive / Paused</h3>
          <div className="space-y-3 opacity-60">
            {subs.filter((s) => !s.is_active).map((s) => (
              <SubCard
                key={s.id}
                sub={s}
                defaultCurrency={displayCurrency}
                monthlyInDefault={convertAmount(toMonthly(Number(s.amount), s.billing_cycle), s.currency, displayCurrency)}
                onEdit={handleEdit}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {subs.length === 0 && !showForm && (
        <div className="text-center py-16 bg-[#141927] rounded-xl border border-slate-800">
          <RefreshCw className="mx-auto mb-3 text-slate-700" size={40} />
          <p className="text-sm text-slate-500">No subscriptions yet</p>
          <p className="text-xs text-slate-600 mt-1">
            Track services like Netflix, Spotify, SaaS tools, etc. independently of recurring payments.
          </p>
        </div>
      )}
    </div>
  );
}

function SubCard({
  sub,
  defaultCurrency,
  monthlyInDefault,
  onEdit,
  onToggle,
  onDelete,
}: {
  sub: SubWithDetails;
  defaultCurrency: string;
  monthlyInDefault: number;
  onEdit: (s: Subscription) => void;
  onToggle: (s: Subscription) => void;
  onDelete: (id: string) => void;
}) {
  const monthly = toMonthly(Number(sub.amount), sub.billing_cycle);
  const color = sub.categories?.color ?? '#8b5cf6';

  const daysUntilRenewal = sub.renewal_date
    ? Math.ceil((new Date(sub.renewal_date).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className="bg-[#141927] p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-base font-bold"
            style={{ backgroundColor: `${color}20`, color }}>
            {sub.name.charAt(0).toUpperCase()}
          </div>

          {/* Info */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-100">{sub.name}</p>
              {sub.plan && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-medium border border-slate-700">
                  {sub.plan}
                </span>
              )}
              {sub.website && (
                <a href={sub.website} target="_blank" rel="noopener noreferrer"
                  className="text-slate-600 hover:text-slate-400 transition-colors">
                  <ExternalLink size={11} />
                </a>
              )}
            </div>

            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {sub.categories && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: `${sub.categories.color}20`, color: sub.categories.color }}>
                  {sub.categories.name}
                </span>
              )}
              <span className="text-[10px] text-slate-500">{CYCLE_LABEL[sub.billing_cycle]}</span>
              {sub.accounts && (
                <>
                  <span className="text-[10px] text-slate-600">·</span>
                  <span className="text-[10px] text-slate-500">{sub.accounts.name}</span>
                </>
              )}
              {daysUntilRenewal !== null && (
                <>
                  <span className="text-[10px] text-slate-600">·</span>
                  <span className={`text-[10px] font-medium ${daysUntilRenewal <= 7 ? 'text-amber-400' : 'text-slate-500'}`}>
                    Renews in {daysUntilRenewal}d
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: amount + actions */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-sm font-bold text-slate-100">
              {sub.currency} {Number(sub.amount).toFixed(2)}
              <span className="text-[10px] text-slate-500 font-normal ml-1">/{sub.billing_cycle.replace('ly', '')}</span>
            </p>
            {sub.billing_cycle !== 'monthly' && (
              <p className="text-[10px] text-slate-500">
                ≈ {defaultCurrency} {monthlyInDefault.toFixed(2)}/mo
              </p>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(sub)}
              className="p-1.5 text-slate-600 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors">
              <Edit2 size={13} />
            </button>
            <button onClick={() => onToggle(sub)}
              className={`p-1.5 rounded-lg transition-colors ${sub.is_active ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-slate-500 hover:bg-slate-800'}`}>
              {sub.is_active ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button onClick={() => onDelete(sub.id)}
              className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
