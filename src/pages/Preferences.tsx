import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { Settings, Check, Globe, Clock, Calendar, RefreshCw } from 'lucide-react';
import { TIMEZONE_OPTIONS } from '../lib/dateUtils';

interface ProfilePrefs {
  default_currency: string;
  timezone: string;
  date_format: string;
}

const ALL_CURRENCIES = [
  'USD','EUR','GBP','JPY','CHF','CAD','AUD','NZD','CNY','HKD',
  'SGD','INR','BRL','MXN','ZAR','SEK','NOK','DKK','PLN','TRY',
  'AED','SAR','KRW','THB','IDR','MYR','PHP','NGN','BDT',
];

const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY  (e.g. 16/03/2026)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY  (e.g. 03/16/2026)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD  (e.g. 2026-03-16)' },
];

const inputCls =
  'w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';

export function Preferences() {
  const { user } = useAuth();
  const { refreshPrefs, defaultCurrency: ctxCurrency } = useUserPrefs();

  const [prefs, setPrefs] = useState<ProfilePrefs>({
    default_currency: 'USD',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    date_format: 'DD/MM/YYYY',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tzSearch, setTzSearch] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('default_currency, timezone, date_format')
      .eq('id', user.id)
      .single();
    if (data) {
      setPrefs({
        default_currency: data.default_currency ?? 'USD',
        timezone: data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
        date_format: data.date_format ?? 'DD/MM/YYYY',
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!user) return;
    setSaving(true);

    await supabase.from('profiles').update({
      default_currency: prefs.default_currency,
      timezone: prefs.timezone,
      date_format: prefs.date_format,
    }).eq('id', user.id);

    setSaving(false);
    setSaved(true);

    // Refresh the global prefs context so all pages react immediately
    await refreshPrefs();

    setTimeout(() => setSaved(false), 2500);

    // If currency changed, reload the page so every data-fetching page picks
    // up the new default and re-runs its conversion calculations.
    if (prefs.default_currency !== ctxCurrency) {
      setTimeout(() => window.location.reload(), 400);
    }
  };

  const filteredTZ = tzSearch.trim()
    ? TIMEZONE_OPTIONS.filter(
        (tz) =>
          tz.label.toLowerCase().includes(tzSearch.toLowerCase()) ||
          tz.value.toLowerCase().includes(tzSearch.toLowerCase()),
      )
    : TIMEZONE_OPTIONS;

  if (loading) return <div className="px-8 py-8 text-slate-400">Loading…</div>;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-5 max-w-2xl">
      {/* Header */}
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
          <div className="flex items-center gap-2 mb-1">
            <Globe size={14} className="text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-100">Default Currency</h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Used for displaying totals. Changing this will reload the app and convert all
            displayed amounts to the new currency.
          </p>
          <select
            value={prefs.default_currency}
            onChange={(e) => setPrefs({ ...prefs, default_currency: e.target.value })}
            className="w-full md:w-64 px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            {ALL_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {prefs.default_currency !== ctxCurrency && (
            <p className="flex items-center gap-1.5 mt-2 text-xs text-amber-400">
              <RefreshCw size={11} /> Saving will reload the app to apply the new currency everywhere.
            </p>
          )}
        </div>

        {/* Timezone */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-100">Timezone</h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Your local timezone. Transactions are stored in UTC and displayed in this timezone.
            Set this correctly to avoid dates shifting by a day.
          </p>
          <input
            type="text"
            value={tzSearch}
            onChange={(e) => setTzSearch(e.target.value)}
            placeholder="Search timezone…"
            className={`${inputCls} mb-2 md:w-80`}
          />
          <select
            value={prefs.timezone}
            onChange={(e) => { setPrefs({ ...prefs, timezone: e.target.value }); setTzSearch(''); }}
            size={6}
            className="w-full md:w-96 px-3 py-1 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            {filteredTZ.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">
            Current selection: <span className="text-slate-300 font-medium">{prefs.timezone}</span>
          </p>
        </div>

        {/* Date Format */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={14} className="text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-100">Date Format</h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            How dates are displayed throughout the app. This is a display-only setting.
          </p>
          <div className="flex flex-col gap-2 md:w-80">
            {DATE_FORMATS.map((f) => (
              <label key={f.value} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="date_format"
                  value={f.value}
                  checked={prefs.date_format === f.value}
                  onChange={() => setPrefs({ ...prefs, date_format: f.value })}
                  className="accent-blue-500"
                />
                <span className={`text-sm ${prefs.date_format === f.value ? 'text-slate-100 font-medium' : 'text-slate-400'}`}>
                  {f.label}
                </span>
              </label>
            ))}
          </div>
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

        {/* Budget Alerts */}
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
