import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { Plus, Trash2, Package, Edit2, TrendingUp, TrendingDown } from 'lucide-react';

interface Asset {
  id: string;
  name: string;
  asset_type: string;
  purchase_price: number;
  current_value: number;
  currency: string;
  purchase_date: string | null;
  description: string | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

const ASSET_TYPE_OPTIONS = [
  { value: 'real_estate', label: 'Real Estate', color: '#f59e0b' },
  { value: 'vehicle', label: 'Vehicle', color: '#3b82f6' },
  { value: 'electronics', label: 'Electronics', color: '#8b5cf6' },
  { value: 'jewelry', label: 'Jewelry / Precious Metals', color: '#ec4899' },
  { value: 'stock', label: 'Stocks / Shares', color: '#10b981' },
  { value: 'crypto', label: 'Cryptocurrency', color: '#f97316' },
  { value: 'business', label: 'Business Interest', color: '#06b6d4' },
  { value: 'collectibles', label: 'Collectibles / Art', color: '#a78bfa' },
  { value: 'other', label: 'Other', color: '#64748b' },
];

const typeColor = (type: string) => ASSET_TYPE_OPTIONS.find((o) => o.value === type)?.color ?? '#64748b';
const typeLabel = (type: string) => ASSET_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;

const emptyForm = {
  name: '', asset_type: 'real_estate', purchase_price: '', current_value: '',
  currency: 'USD', purchase_date: '', description: '', location: '',
};

export function Assets() {
  const { user } = useAuth();
  const { fmt } = useUserPrefs();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [displayCurrency, setDisplayCurrency] = useState('USD');

  const load = useCallback(async () => {
    if (!user) { setAssets([]); setLoading(false); return; }

    const [assetsRes, profRes] = await Promise.all([
      supabase.from('assets').select('*').eq('user_id', user.id).order('current_value', { ascending: false }),
      supabase.from('profiles').select('default_currency').eq('id', user.id).single(),
    ]);

    setAssets((assetsRes.data ?? []) as Asset[]);
    const dc = profRes.data?.default_currency ?? 'USD';
    setDisplayCurrency(dc);
    setFormData((prev) => ({ ...prev, currency: dc }));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      user_id: user.id,
      name: formData.name,
      asset_type: formData.asset_type,
      purchase_price: parseFloat(formData.purchase_price) || 0,
      current_value: parseFloat(formData.current_value) || 0,
      currency: formData.currency,
      purchase_date: formData.purchase_date || null,
      description: formData.description || null,
      location: formData.location || null,
    };

    if (editing) {
      await supabase.from('assets').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('assets').insert(payload);
    }

    setShowForm(false);
    setEditing(null);
    setFormData({ ...emptyForm, currency: displayCurrency });
    load();
  };

  const handleEdit = (a: Asset) => {
    setEditing(a);
    setFormData({
      name: a.name,
      asset_type: a.asset_type,
      purchase_price: a.purchase_price.toString(),
      current_value: a.current_value.toString(),
      currency: a.currency,
      purchase_date: a.purchase_date ?? '',
      description: a.description ?? '',
      location: a.location ?? '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this asset?')) {
      await supabase.from('assets').delete().eq('id', id);
      load();
    }
  };

  const totalValue = useMemo(() =>
    assets.filter((a) => a.is_active).reduce((s, a) => s + Number(a.current_value), 0), [assets]);
  const totalPurchase = useMemo(() =>
    assets.filter((a) => a.is_active).reduce((s, a) => s + Number(a.purchase_price), 0), [assets]);
  const totalGainLoss = totalValue - totalPurchase;

  if (loading) return <div className="px-8 py-8 text-slate-400">Loading…</div>;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-5 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-100 font-medium">Total Asset Value</p>
              <p className="text-2xl font-bold text-white mt-1">{displayCurrency} {totalValue.toFixed(2)}</p>
              <p className="text-[11px] text-amber-100 mt-1">{assets.filter((a) => a.is_active).length} active asset{assets.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="p-2.5 bg-white/20 rounded-xl"><Package className="text-white" size={20} /></div>
          </div>
        </div>

        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-400 mb-1">Total Cost Basis</p>
          <p className="text-xl font-bold text-slate-100">{displayCurrency} {totalPurchase.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">original purchase price</p>
        </div>

        <div className={`bg-[#141927] p-5 rounded-xl border ${totalGainLoss >= 0 ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
          <p className="text-xs text-slate-400 mb-1">Unrealized Gain / Loss</p>
          <div className="flex items-center gap-2 mt-1">
            {totalGainLoss >= 0
              ? <TrendingUp size={18} className="text-emerald-400 shrink-0" />
              : <TrendingDown size={18} className="text-red-400 shrink-0" />}
            <p className={`text-xl font-bold ${totalGainLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalGainLoss >= 0 ? '+' : ''}{displayCurrency} {totalGainLoss.toFixed(2)}
            </p>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {totalPurchase > 0 ? `${((totalGainLoss / totalPurchase) * 100).toFixed(1)}% from cost basis` : '—'}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex justify-end">
        <button onClick={() => { setShowForm(true); setEditing(null); setFormData({ ...emptyForm, currency: displayCurrency }); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all">
          <Plus size={18} /> Add Asset
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">{editing ? 'Edit Asset' : 'New Asset'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Asset Name *</label>
                <input required type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Main Apartment" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Asset Type *</label>
                <select required value={formData.asset_type} onChange={(e) => setFormData({ ...formData, asset_type: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  {ASSET_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Purchase Price</label>
                <input type="number" step="0.01" value={formData.purchase_price} onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
                  placeholder="0.00" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Current Value *</label>
                <input required type="number" step="0.01" value={formData.current_value} onChange={(e) => setFormData({ ...formData, current_value: e.target.value })}
                  placeholder="0.00" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Currency</label>
                <input type="text" value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                  placeholder="USD" maxLength={4} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Purchase Date</label>
                <input type="date" value={formData.purchase_date} onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
                <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. Dhaka, Bangladesh" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Additional details" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-all">{editing ? 'Update' : 'Create'}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl border border-slate-700 transition-all">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Asset cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {assets.map((a) => {
          const color = typeColor(a.asset_type);
          const gainLoss = Number(a.current_value) - Number(a.purchase_price);
          const gainPct = Number(a.purchase_price) > 0 ? (gainLoss / Number(a.purchase_price)) * 100 : 0;
          return (
            <div key={a.id} className={`bg-[#141927] p-5 rounded-xl border border-slate-800 ${!a.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${color}22` }}>
                    <Package size={18} style={{ color }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{a.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{ backgroundColor: `${color}22`, color }}>{typeLabel(a.asset_type)}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleEdit(a)} className="p-1.5 text-slate-600 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"><Edit2 size={13} /></button>
                  <button onClick={() => handleDelete(a.id)} className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><Trash2 size={13} /></button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Current Value</span>
                  <span className="font-bold text-slate-100">{a.currency} {Number(a.current_value).toFixed(2)}</span>
                </div>
                {Number(a.purchase_price) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Cost Basis</span>
                    <span className="text-slate-400">{a.currency} {Number(a.purchase_price).toFixed(2)}</span>
                  </div>
                )}
                {Number(a.purchase_price) > 0 && (
                  <div className="flex justify-between text-xs items-center">
                    <span className="text-slate-500">Gain / Loss</span>
                    <span className={`flex items-center gap-1 font-semibold ${gainLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {gainLoss >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {gainLoss >= 0 ? '+' : ''}{a.currency} {gainLoss.toFixed(2)} ({gainPct.toFixed(1)}%)
                    </span>
                  </div>
                )}
                {a.location && (
                  <p className="text-[10px] text-slate-600 mt-1">📍 {a.location}</p>
                )}
                {a.purchase_date && (
                  <p className="text-[10px] text-slate-600">Purchased {fmt(a.purchase_date)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {assets.length === 0 && !showForm && (
        <div className="text-center py-16 bg-[#141927] rounded-xl border border-slate-800">
          <Package className="mx-auto mb-3 text-slate-700" size={40} />
          <p className="text-sm text-slate-500">No assets yet</p>
          <p className="text-xs text-slate-600 mt-1">Track your property, vehicles, investments, and more</p>
        </div>
      )}
    </div>
  );
}
