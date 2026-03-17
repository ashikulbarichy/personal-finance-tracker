import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Globe, Plus, Trash2, RefreshCw } from 'lucide-react';

interface RateRow {
  from_currency: string;
  to_currency: string;
  rate: number;
  updated_at: string;
}

// We'll store exchange rates in a simple JSONB field on profiles or a dedicated table.
// For now we store them in localStorage keyed by user and also try to persist in profiles.notes.
// In a production scenario you'd have a separate exchange_rates table.
// This implementation stores rates in-memory + profiles.default_currency for demo purposes.

const POPULAR_PAIRS = ['USD/EUR', 'USD/GBP', 'USD/JPY', 'USD/INR', 'USD/BDT', 'EUR/GBP'];

export function ExchangeRates() {
  const { user } = useAuth();
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [enabledCurrencies, setEnabledCurrencies] = useState<string[]>(['USD']);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formFrom, setFormFrom] = useState('USD');
  const [formTo, setFormTo] = useState('EUR');
  const [formRate, setFormRate] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const STORAGE_KEY = `exchange_rates_${user?.id ?? 'anon'}`;

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase.from('profiles').select('default_currency, enabled_currencies').eq('id', user.id).single();
    if (data) {
      setDefaultCurrency(data.default_currency ?? 'USD');
      setEnabledCurrencies((data.enabled_currencies as string[] | null) ?? [data.default_currency ?? 'USD']);
    }
    // Load from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { rates: RateRow[]; updated_at: string };
        setRates(parsed.rates ?? []);
        setLastUpdated(parsed.updated_at ?? null);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [user, STORAGE_KEY]);

  useEffect(() => { load(); }, [load]);

  const persist = (newRates: RateRow[]) => {
    const updated_at = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rates: newRates, updated_at }));
    setRates(newRates);
    setLastUpdated(updated_at);
  };

  const addRate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRate || !formFrom || !formTo || formFrom === formTo) return;
    const rate = parseFloat(formRate);
    if (isNaN(rate) || rate <= 0) return;
    const now = new Date().toISOString();
    const newRate: RateRow = { from_currency: formFrom, to_currency: formTo, rate, updated_at: now };
    const updated = [
      ...rates.filter((r) => !(r.from_currency === formFrom && r.to_currency === formTo)),
      newRate,
    ];
    persist(updated);
    setFormRate('');
    setShowForm(false);
  };

  const deleteRate = (from: string, to: string) => {
    persist(rates.filter((r) => !(r.from_currency === from && r.to_currency === to)));
  };

  if (loading) return <div className="px-8 py-8 text-slate-400">Loading…</div>;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <Globe size={20} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">Exchange Rates</h2>
            <p className="text-xs text-slate-500">
              {lastUpdated ? `Last updated: ${new Date(lastUpdated).toLocaleString()}` : 'No rates saved yet'}
            </p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all">
          <Plus size={16} /> Add Rate
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
        <p className="text-xs text-blue-300">
          <span className="font-semibold">Manual rates</span> — Enter the rate for 1 unit of the base currency in terms of the target currency.
          Example: If 1 USD = 110 JPY, set USD → JPY = 110.
          Your base currency is <span className="font-semibold">{defaultCurrency}</span>.
        </p>
      </div>

      {/* Quick add form */}
      {showForm && (
        <div className="bg-[#141927] p-5 rounded-xl border border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Add / Update Rate</h3>
          <form onSubmit={addRate} className="space-y-4">
            <div className="grid grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">From</label>
                <select value={formFrom} onChange={(e) => setFormFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  {enabledCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">To</label>
                <select value={formTo} onChange={(e) => setFormTo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  {enabledCurrencies.filter((c) => c !== formFrom).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Rate (1 {formFrom} = ? {formTo})</label>
                <input required type="number" step="any" min="0.000001" value={formRate} onChange={(e) => setFormRate(e.target.value)}
                  placeholder="e.g. 1.08" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-all">Save Rate</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl border border-slate-700 transition-all">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Rates table */}
      <div className="bg-[#141927] rounded-xl border border-slate-800 overflow-hidden">
        {rates.length === 0 ? (
          <div className="py-16 text-center">
            <Globe className="mx-auto mb-3 text-slate-700" size={40} />
            <p className="text-sm text-slate-500">No exchange rates saved</p>
            <p className="text-xs text-slate-600 mt-1 mb-4">Add rates for the currencies you use</p>
            <div className="flex flex-wrap justify-center gap-2">
              {POPULAR_PAIRS.map((pair) => {
                const [from, to] = pair.split('/');
                const bothEnabled = enabledCurrencies.includes(from) && enabledCurrencies.includes(to);
                if (!bothEnabled) return null;
                return (
                  <button key={pair} onClick={() => { setFormFrom(from); setFormTo(to); setShowForm(true); }}
                    className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-full border border-slate-700 transition-colors">
                    {pair}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-800/40 border-b border-slate-800">
              <tr>
                {['Pair', 'Rate', 'Inverse', 'Updated', ''].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rates.map((r) => (
                <tr key={`${r.from_currency}-${r.to_currency}`} className="hover:bg-slate-800/30">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100">{r.from_currency}</span>
                      <RefreshCw size={12} className="text-slate-600" />
                      <span className="text-sm font-semibold text-slate-100">{r.to_currency}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-100">
                    1 {r.from_currency} = <span className="font-semibold">{r.rate.toFixed(6)}</span> {r.to_currency}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-500">
                    1 {r.to_currency} = {(1 / r.rate).toFixed(6)} {r.from_currency}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{new Date(r.updated_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => deleteRate(r.from_currency, r.to_currency)}
                      className="text-slate-600 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
