import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { DollarSign, Check, X } from 'lucide-react';

const ALL_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' },
  { code: 'NPR', name: 'Nepalese Rupee', symbol: '₨' },
  { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' },
];

export function Currencies() {
  const { user } = useAuth();
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [enabled, setEnabled] = useState<string[]>(['USD']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('profiles').select('default_currency, enabled_currencies').eq('id', user.id).single();
    if (data) {
      setDefaultCurrency(data.default_currency ?? 'USD');
      setEnabled((data.enabled_currencies as string[] | null) ?? [data.default_currency ?? 'USD']);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const toggleCurrency = (code: string) => {
    if (code === defaultCurrency) return; // can't disable default
    setEnabled((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const setDefault = (code: string) => {
    setDefaultCurrency(code);
    if (!enabled.includes(code)) setEnabled((prev) => [...prev, code]);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from('profiles').update({ default_currency: defaultCurrency, enabled_currencies: enabled }).eq('id', user.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const filtered = ALL_CURRENCIES.filter((c) =>
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="px-8 py-8 text-slate-400">Loading…</div>;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-5 max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
          <DollarSign size={20} className="text-emerald-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-100">Currencies</h2>
          <p className="text-xs text-slate-500">Enable currencies and set your default</p>
        </div>
      </div>

      {/* Enabled summary */}
      <div className="bg-[#141927] p-4 rounded-xl border border-slate-800">
        <p className="text-xs text-slate-400 mb-2">Enabled currencies ({enabled.length})</p>
        <div className="flex flex-wrap gap-2">
          {enabled.map((code) => (
            <div key={code} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              code === defaultCurrency
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}>
              {code}
              {code === defaultCurrency && <span className="text-[9px] text-blue-400 font-semibold uppercase">default</span>}
              {code !== defaultCurrency && (
                <button onClick={() => toggleCurrency(code)} className="text-slate-500 hover:text-red-400 ml-0.5 transition-colors">
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search currencies…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      />

      {/* Currency list */}
      <div className="bg-[#141927] rounded-xl border border-slate-800 overflow-hidden">
        <div className="divide-y divide-slate-800">
          {filtered.map((c) => {
            const isEnabled = enabled.includes(c.code);
            const isDefault = c.code === defaultCurrency;
            return (
              <div key={c.code} className={`flex items-center justify-between px-5 py-3 hover:bg-slate-800/30 transition-colors ${isEnabled ? '' : 'opacity-50'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-300 shrink-0">
                    {c.symbol}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{c.code}</p>
                    <p className="text-xs text-slate-500">{c.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isDefault && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold">DEFAULT</span>
                  )}
                  {!isDefault && isEnabled && (
                    <button onClick={() => setDefault(c.code)} className="text-[10px] text-slate-500 hover:text-blue-400 transition-colors">
                      Set default
                    </button>
                  )}
                  <button
                    onClick={() => toggleCurrency(c.code)}
                    disabled={isDefault}
                    className={`w-8 h-5 rounded-full transition-colors flex items-center ${
                      isEnabled ? 'bg-blue-600' : 'bg-slate-700'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${isEnabled ? 'translate-x-3' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all disabled:opacity-40"
      >
        {saved ? <><Check size={16} /> Saved!</> : saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
}
