import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Globe, RefreshCw, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { convertWithBase, fetchLiveRates, getBaseCurrency, type LiveRatesResponse } from '../lib/exchangeRates';

export function ExchangeRates() {
  const { user } = useAuth();
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [enabledCurrencies, setEnabledCurrencies] = useState<string[]>(['USD']);
  const [liveRates, setLiveRates] = useState<LiveRatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('default_currency, enabled_currencies')
      .eq('id', user.id)
      .single();
    if (data) {
      setDefaultCurrency(data.default_currency ?? 'USD');
      setEnabledCurrencies((data.enabled_currencies as string[] | null) ?? [data.default_currency ?? 'USD']);
    }
  }, [user]);

  const loadRates = useCallback(async (force = false) => {
    setError(null);
    try {
      const live = await fetchLiveRates({ base_currency: getBaseCurrency(), force });
      setLiveRates(live);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load exchange rates');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadRates();
  }, [loadProfile, loadRates]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadRates(true);
  };

  const rates = liveRates?.rates ?? {};
  const base = liveRates?.base_currency ?? getBaseCurrency();
  const allDisplayCurrencies = Array.from(new Set([...enabledCurrencies, base])).filter(Boolean);

  if (loading) return <div className="px-8 py-8 text-slate-400">Loading rates…</div>;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <Globe size={20} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">Exchange Rates</h2>
            <p className="text-xs text-slate-500">
              Powered by FreeCurrencyAPI · Base: <span className="text-slate-300 font-medium">{base}</span>
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Status badge */}
      {liveRates && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs ${liveRates.stale ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'}`}>
          {liveRates.stale
            ? <AlertTriangle size={13} />
            : <CheckCircle2 size={13} />}
          {liveRates.stale
            ? `Using stale cache (provider unavailable). Last fetched: ${new Date(liveRates.fetched_at).toLocaleString()}`
            : `Live rates · Fetched: ${new Date(liveRates.fetched_at).toLocaleString()} · Expires: ${new Date(liveRates.expires_at).toLocaleString()}`}
          {liveRates.cached && !liveRates.stale && (
            <span className="ml-1 text-emerald-400/70">(served from cache)</span>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs">
          <AlertTriangle size={13} />
          {error}
        </div>
      )}

      {/* Your currencies vs default grid */}
      {liveRates && allDisplayCurrencies.length > 1 && (
        <div className="bg-[#141927] rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your Enabled Currencies vs {defaultCurrency}</p>
          </div>
          <div className="divide-y divide-slate-800/60">
            {allDisplayCurrencies
              .filter((c) => c !== defaultCurrency)
              .map((c) => {
                const rate = convertWithBase({ amount: 1, from: defaultCurrency, to: c, base_currency: base, rates });
                const inverse = convertWithBase({ amount: 1, from: c, to: defaultCurrency, base_currency: base, rates });
                return (
                  <div key={c} className="flex items-center justify-between px-5 py-3 hover:bg-slate-800/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                        <span>{defaultCurrency}</span>
                        <ArrowRight size={12} className="text-slate-600" />
                        <span>{c}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-100">
                        1 {defaultCurrency} = {rate.toFixed(4)} {c}
                      </p>
                      <p className="text-xs text-slate-500">
                        1 {c} = {inverse.toFixed(6)} {defaultCurrency}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Full rates table */}
      {liveRates && Object.keys(rates).length > 0 && (
        <div className="bg-[#141927] rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              All Available Rates (base: {base})
            </p>
            <span className="text-xs text-slate-600">{Object.keys(rates).length} currencies</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/40 border-b border-slate-800">
                <tr>
                  {['Currency', `1 ${base} =`, `1 unit → ${base}`].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {Object.entries(rates)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([code, rate]) => (
                    <tr key={code} className={`hover:bg-slate-800/20 transition-colors ${enabledCurrencies.includes(code) ? '' : 'opacity-50'}`}>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100">{code}</span>
                          {enabledCurrencies.includes(code) && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/20 font-semibold uppercase">enabled</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-sm text-slate-200 font-medium">
                        {rate.toFixed(4)}
                      </td>
                      <td className="px-5 py-2.5 text-sm text-slate-400">
                        {(1 / rate).toFixed(6)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Setup instructions */}
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-xs text-slate-400 space-y-1.5">
        <p className="font-semibold text-emerald-400">Powered by fawazahmed0/exchange-api</p>
        <p>
          Free, no API key required, 200+ currencies, daily updated.
          Rates are fetched server-side via a Supabase Edge Function and cached for 1 hour.
        </p>
      </div>
    </div>
  );
}
