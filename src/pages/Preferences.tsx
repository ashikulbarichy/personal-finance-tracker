import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Settings, Check } from 'lucide-react';

interface ProfilePrefs {
  default_currency: string | null;
}

const ALL_CURRENCIES = [
  'USD','EUR','GBP','JPY','CHF','CAD','AUD','NZD','CNY','HKD',
  'SGD','INR','BRL','MXN','ZAR','SEK','NOK','DKK','PLN','TRY',
  'AED','SAR','KRW','THB','IDR','MYR','PHP','NGN','BDT',
];

export function Preferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<ProfilePrefs>({ default_currency: 'USD' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('profiles').select('default_currency').eq('id', user.id).single();
    if (data) setPrefs({ default_currency: data.default_currency });
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from('profiles').update({ default_currency: prefs.default_currency }).eq('id', user.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading) return <div className="px-8 py-8 text-slate-400">Loading…</div>;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-5 max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <Settings size={20} className="text-blue-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-100">Preferences</h2>
          <p className="text-xs text-slate-500">App-wide settings and defaults</p>
        </div>
      </div>

      <div className="bg-[#141927] rounded-xl border border-slate-800 divide-y divide-slate-800">
        {/* Default Currency */}
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-1">Default Currency</h3>
          <p className="text-xs text-slate-500 mb-3">Used for displaying totals and creating new accounts</p>
          <select
            value={prefs.default_currency ?? 'USD'}
            onChange={(e) => setPrefs({ ...prefs, default_currency: e.target.value })}
            className="w-full md:w-64 px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            {ALL_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Date format (cosmetic, stored preference placeholder) */}
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-1">Date Format</h3>
          <p className="text-xs text-slate-500 mb-3">How dates are displayed throughout the app</p>
          <select
            className="w-full md:w-64 px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            defaultValue="MM/DD/YYYY"
          >
            <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY (EU)</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
          </select>
        </div>

        {/* Theme */}
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-1">Theme</h3>
          <p className="text-xs text-slate-500 mb-3">Color theme for the application</p>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-500/50 bg-blue-600/20 text-blue-400 text-sm font-medium">
              <div className="w-4 h-4 rounded bg-[#0b0f1a] border border-slate-700" />
              Dark (active)
            </button>
          </div>
        </div>

        {/* Notifications placeholder */}
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-1">Budget Alerts</h3>
          <p className="text-xs text-slate-500 mb-3">Get notified when you approach budget limits</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-10 h-5 bg-slate-700 rounded-full peer peer-checked:bg-blue-600 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
            </div>
            <span className="text-sm text-slate-300">Enable budget alerts</span>
          </label>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all disabled:opacity-40"
      >
        {saved ? <><Check size={16} /> Saved!</> : saving ? 'Saving…' : 'Save Preferences'}
      </button>
    </div>
  );
}
