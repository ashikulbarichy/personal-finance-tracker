import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { Globe2, Calculator, AlertTriangle } from 'lucide-react';

interface ResidencyPeriod {
  id: string;
  country_code: string;
  start_date: string | null;
  end_date: string | null;
  tax_status: string | null;
}

interface TaxEstimate {
  year: number;
  country: string;
  totalIncome: number;
  taxableIncome: number;
  estimatedTax: number;
  effectiveRate: number;
}

export function Tax() {
  const { user } = useAuth();
  const { defaultCurrency } = useUserPrefs();
  const [periods, setPeriods] = useState<ResidencyPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPeriod, setSavingPeriod] = useState(false);

  // New residency period form
  const [newPeriod, setNewPeriod] = useState<{
    country_code: string;
    start_date: string;
    end_date: string;
    tax_status: string;
  }>({
    country_code: '',
    start_date: '',
    end_date: '',
    tax_status: '',
  });

  // Estimation controls
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [year, setYear] = useState(currentYear);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [ratePct, setRatePct] = useState('20'); // user-controlled flat rate
  const [allowance, setAllowance] = useState('0'); // user-controlled tax-free allowance
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<TaxEstimate | null>(null);

  // Zakat controls
  const [goldPricePerGram, setGoldPricePerGram] = useState('0'); // in defaultCurrency
  const [gramsThreshold, setGramsThreshold] = useState('85');
  const [confirmYearAbove, setConfirmYearAbove] = useState(false);
  const [netWorth, setNetWorth] = useState<number | null>(null);
  const [netLoading, setNetLoading] = useState(true);

  // Load residency periods
  useEffect(() => {
    if (!user) {
      setPeriods([]);
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_tax_residency_periods')
        .select('id, country_code, start_date, end_date, tax_status')
        .eq('user_id', user.id)
        .order('start_date', { ascending: true });
      if (!error) {
        setPeriods(data ?? []);
      }
      setLoading(false);
    };
    void load();
  }, [user]);

  // Load current net worth (same formula as Dashboard: balances + assets - borrowing loans)
  useEffect(() => {
    if (!user) {
      setNetWorth(null);
      setNetLoading(false);
      return;
    }
    const loadNetWorth = async () => {
      setNetLoading(true);
      const [accountsRes, assetsRes, loansRes] = await Promise.all([
        supabase.from('accounts').select('balance').eq('user_id', user.id).eq('is_active', true),
        supabase.from('assets').select('current_value').eq('user_id', user.id).eq('is_active', true),
        supabase.from('loans').select('current_balance, type').eq('user_id', user.id).eq('is_active', true),
      ]);

      const totalBalance = accountsRes.data?.reduce((sum, acc) => sum + Number(acc.balance), 0) || 0;
      const totalAssetValue = assetsRes.data?.reduce((s, a) => s + Number(a.current_value), 0) ?? 0;
      const totalLiabilities =
        loansRes.data?.filter((l) => l.type === 'borrowing').reduce((s, l) => s + Number(l.current_balance), 0) ?? 0;

      setNetWorth(totalBalance + totalAssetValue - totalLiabilities);
      setNetLoading(false);
    };
    void loadNetWorth();
  }, [user]);

  const handleAddPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newPeriod.country_code || !newPeriod.start_date) return;
    setSavingPeriod(true);
    const { error } = await supabase.from('user_tax_residency_periods').insert({
      user_id: user.id,
      country_code: newPeriod.country_code,
      start_date: newPeriod.start_date,
      end_date: newPeriod.end_date || null,
      tax_status: newPeriod.tax_status || null,
    });
    setSavingPeriod(false);
    if (!error) {
      setNewPeriod({ country_code: '', start_date: '', end_date: '', tax_status: '' });
      const { data } = await supabase
        .from('user_tax_residency_periods')
        .select('id, country_code, start_date, end_date, tax_status')
        .eq('user_id', user.id)
        .order('start_date', { ascending: true });
      setPeriods(data ?? []);
    }
  };

  const handleDeletePeriod = async (id: string) => {
    if (!user) return;
    await supabase.from('user_tax_residency_periods').delete().eq('id', id).eq('user_id', user.id);
    setPeriods((prev) => prev.filter((p) => p.id !== id));
  };

  const handleEstimate = async () => {
    if (!user) return;
    setEstimating(true);
    setEstimate(null);

    const selected = selectedCountry || periods[0]?.country_code || '';

    // Year range
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    const { data: tx, error } = await supabase
      .from('transactions')
      .select('amount, transaction_date')
      .eq('user_id', user.id)
      .eq('type', 'income')
      .gte('transaction_date', start)
      .lte('transaction_date', end);

    if (error || !tx) {
      setEstimating(false);
      return;
    }

    const periodsForCountry = periods.filter((p) => p.country_code === selected);
    const incomeForCountry = tx.filter((t) => {
      const d = new Date(t.transaction_date);
      return periodsForCountry.some((p) => {
        const startD = p.start_date ? new Date(p.start_date) : null;
        const endD = p.end_date ? new Date(p.end_date) : null;
        if (startD && d < startD) return false;
        if (endD && d > endD) return false;
        return true;
      });
    });

    const totalIncome = incomeForCountry.reduce((s, t) => s + Number(t.amount), 0);
    const allowanceNum = parseFloat(allowance || '0') || 0;
    const rate = parseFloat(ratePct || '0') || 0;
    const taxableIncome = Math.max(totalIncome - allowanceNum, 0);
    const estimatedTax = taxableIncome * (rate / 100);
    const effectiveRate = totalIncome > 0 ? (estimatedTax / totalIncome) * 100 : 0;

    setEstimate({
      year,
      country: selected || '—',
      totalIncome,
      taxableIncome,
      estimatedTax,
      effectiveRate,
    });

    setEstimating(false);
  };

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <Calculator size={20} className="text-blue-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-100">Income Tax</h2>
          <p className="text-xs text-slate-500">
            Overview and estimation of your income tax in {defaultCurrency}.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-amber-900/20 border border-amber-700/60 rounded-xl p-4 flex gap-3 text-xs text-amber-100">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
        <div>
          <p className="font-semibold mb-1">Disclaimer</p>
          <p className="text-amber-100/90">
            This page is for rough income-tax estimation only. It does not replace professional advice
            and may not include all deductions, credits, or country-specific rules.
          </p>
        </div>
      </div>

      {/* Residency periods overview + editor */}
      <div className="bg-[#141927] rounded-xl border border-slate-800 p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Globe2 size={16} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-100">Tax Residency Periods</h3>
        </div>
        <p className="text-xs text-slate-500">
          These periods determine which country&apos;s rules to apply when estimating your income tax.
          Manage them here and we&apos;ll use them for the estimator below.
        </p>

        {loading ? (
          <p className="text-xs text-slate-500 mt-2">Loading periods…</p>
        ) : (
          <>
            {periods.length === 0 ? (
              <p className="text-xs text-slate-500 mt-2">
                No residency periods configured yet. Add one below to start estimating tax.
              </p>
            ) : (
              <div className="mt-3 border border-slate-800 rounded-lg overflow-hidden text-xs">
                <div className="grid grid-cols-4 bg-slate-900/60 text-slate-400 font-semibold px-3 py-2">
                  <span>Country</span>
                  <span>From</span>
                  <span>To / Status</span>
                  <span className="text-right">Actions</span>
                </div>
                {periods.map((p) => (
                  <div key={p.id} className="grid grid-cols-4 px-3 py-2 border-t border-slate-800 text-slate-200">
                    <span>{p.country_code}</span>
                    <span>{p.start_date ?? '—'}</span>
                    <span>
                      {p.end_date ?? 'Present'}
                      {p.tax_status && <span className="text-slate-500"> · {p.tax_status}</span>}
                    </span>
                    <span className="text-right">
                      <button
                        type="button"
                        onClick={() => handleDeletePeriod(p.id)}
                        className="text-[11px] text-slate-500 hover:text-red-400"
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Add residency period form */}
            <form onSubmit={handleAddPeriod} className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Country code *</label>
                <input
                  type="text"
                  value={newPeriod.country_code}
                  onChange={(e) => setNewPeriod((p) => ({ ...p, country_code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. US, BD"
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                  maxLength={2}
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Start date *</label>
                <input
                  type="date"
                  value={newPeriod.start_date}
                  onChange={(e) => setNewPeriod((p) => ({ ...p, start_date: e.target.value }))}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">End date</label>
                <input
                  type="date"
                  value={newPeriod.end_date}
                  onChange={(e) => setNewPeriod((p) => ({ ...p, end_date: e.target.value }))}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Status (optional)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPeriod.tax_status}
                    onChange={(e) => setNewPeriod((p) => ({ ...p, tax_status: e.target.value }))}
                    placeholder="e.g. single"
                    className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={savingPeriod}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                  >
                    {savingPeriod ? 'Saving…' : 'Add'}
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </div>

      {/* Tax estimator */}
      <div className="bg-[#141927] rounded-xl border border-slate-800 p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Tax Estimation</h3>
        <p className="text-xs text-slate-500 mb-3">
          Choose a year, country, and your approximate tax rate and allowance. We&apos;ll estimate tax on your recorded income.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs mb-4">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value || String(currentYear), 10))}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Country</label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
            >
              <option value="">(auto: first residency)</option>
              {Array.from(new Set(periods.map((p) => p.country_code))).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Flat rate %</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={ratePct}
              onChange={(e) => setRatePct(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Allowance ({defaultCurrency})</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleEstimate}
          disabled={estimating || periods.length === 0}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
        >
          {estimating ? 'Calculating…' : 'Estimate tax'}
        </button>

        {estimate && (
          <div className="mt-4 space-y-2 text-xs text-slate-300">
            <p>
              <span className="text-slate-500">Year:</span> {estimate.year}{' '}
              <span className="text-slate-500 ml-2">Country:</span> {estimate.country}
            </p>
            <p>
              <span className="text-slate-500">Total income:</span>{' '}
              {defaultCurrency} {estimate.totalIncome.toFixed(2)}
            </p>
            <p>
              <span className="text-slate-500">Taxable after allowance:</span>{' '}
              {defaultCurrency} {estimate.taxableIncome.toFixed(2)}
            </p>
            <p>
              <span className="text-slate-500">Estimated tax ({ratePct}%):</span>{' '}
              {defaultCurrency} {estimate.estimatedTax.toFixed(2)}
            </p>
            <p className="text-[11px] text-slate-500">
              Effective rate over total income: {estimate.effectiveRate.toFixed(1)}%
            </p>
          </div>
        )}
      </div>

      {/* Zakat calculator */}
      <div className="bg-[#141927] rounded-xl border border-slate-800 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Zakat</h3>
        <p className="text-xs text-slate-500">
          Zakat is due when your eligible savings stay above the nisab (approx. value of 85g of gold) for one full year.
          This tool uses your current net worth and a simple nisab approximation.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">
              Gold price per gram ({defaultCurrency})
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={goldPricePerGram}
              onChange={(e) => setGoldPricePerGram(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
              placeholder="e.g. 80"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Nisab threshold (grams)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={gramsThreshold}
              onChange={(e) => setGramsThreshold(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
            />
          </div>
          <div className="flex items-start gap-2 mt-2 md:mt-0">
            <input
              id="zakat-year-confirm"
              type="checkbox"
              checked={confirmYearAbove}
              onChange={(e) => setConfirmYearAbove(e.target.checked)}
              className="mt-1"
            />
            <label htmlFor="zakat-year-confirm" className="text-[11px] text-slate-500 leading-snug">
              My eligible savings have been above this nisab threshold for at least one lunar year.
            </label>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-300 space-y-1">
          <p>
            <span className="text-slate-500">Current net worth:</span>{' '}
            {netLoading || netWorth == null
              ? 'Loading…'
              : `${defaultCurrency} ${netWorth.toFixed(2)}`}
          </p>
          <p>
            <span className="text-slate-500">Nisab:</span>{' '}
            {(() => {
              const gp = parseFloat(goldPricePerGram || '0') || 0;
              const g = parseFloat(gramsThreshold || '0') || 0;
              const nisab = gp * g;
              return `${defaultCurrency} ${nisab.toFixed(2)}`;
            })()}
          </p>
          {(() => {
            const gp = parseFloat(goldPricePerGram || '0') || 0;
            const g = parseFloat(gramsThreshold || '0') || 0;
            const nisab = gp * g;
            if (!netWorth || netWorth <= 0 || nisab <= 0 || !confirmYearAbove) {
              return (
                <p className="text-[11px] text-slate-500">
                  Zakat due: {defaultCurrency} 0.00{' '}
                  {!confirmYearAbove && '(confirm 1-year condition to compute)'}
                </p>
              );
            }
            if (netWorth < nisab) {
              return (
                <p className="text-[11px] text-slate-500">
                  Your net worth is below the nisab threshold, so no zakat is due.
                </p>
              );
            }
            const amountAbove = netWorth - nisab;
            const zakat = amountAbove * 0.025;
            return (
              <p className="text-[11px] text-emerald-400">
                Zakat due (2.5% of amount above nisab): {defaultCurrency} {zakat.toFixed(2)}
              </p>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

