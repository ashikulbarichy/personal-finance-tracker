import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { ArrowLeftRight, ArrowUpDown, Plus } from 'lucide-react';
import {
  Button, Card, Field, IconButton, Modal, PageHeader, SearchInput, Skeleton, Switch, cx, fieldCls, useToast,
} from '../components/ui';
import { convertManual, loadManualRates, saveManualRates, type ManualRates } from '../lib/manualRates';
import { currencySymbol, formatMoney } from '../lib/money';

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

const nameOf = (code: string) => ALL_CURRENCIES.find((c) => c.code === code)?.name ?? code;
const symOf = (code: string) => currencySymbol(code).trim();

type Acct = { currency: string; balance: number };

/** Editable manual-rate cell: "1 XXX = [ n ] BASE", saves on blur / Enter. */
function RateInput({ code, base, value, onSave, className }: {
  code: string; base: string; value: number | undefined; onSave: (code: string, v: number) => void; className?: string;
}) {
  const initial = value ? String(value) : '';
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(initial); }, [initial]);
  const commit = () => {
    const n = parseFloat(val.replace(/,/g, ''));
    const next = Number.isFinite(n) && n > 0 ? n : 0;
    if (next !== (value ?? 0)) onSave(code, next);
  };
  return (
    <div className={cx('flex items-center gap-1.5 text-[13px] text-slate-400', className)}>
      <span className="whitespace-nowrap">1 {code} =</span>
      <input
        inputMode="decimal"
        value={val}
        placeholder="Set rate"
        aria-label={`Rate for ${code} in ${base}`}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className={cx(fieldCls, 'w-[84px] min-w-0 tabular-nums text-right text-slate-100')}
      />
      <span>{base}</span>
    </div>
  );
}

export function Currencies() {
  const { user } = useAuth();
  const { refreshPrefs } = useUserPrefs();
  const toast = useToast();
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [enabled, setEnabled] = useState<string[]>(['USD']);
  const [rates, setRates] = useState<ManualRates>({});
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [manageOpen, setManageOpen] = useState(false);

  // converter
  const [convFrom, setConvFrom] = useState<string | null>(null);
  const [convTo, setConvTo] = useState<string | null>(null);
  const [convVal, setConvVal] = useState('100');

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data }, acctRes] = await Promise.all([
      supabase.from('profiles').select('default_currency, enabled_currencies').eq('id', user.id).single(),
      supabase.from('accounts').select('currency, balance').eq('user_id', user.id).eq('is_active', true),
    ]);
    if (data) {
      setDefaultCurrency(data.default_currency ?? 'USD');
      setEnabled((data.enabled_currencies as string[] | null) ?? [data.default_currency ?? 'USD']);
    }
    setAccounts((acctRes.data ?? []) as Acct[]);
    setRates(loadManualRates(user.id));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener('ft-data-changed', on);
    return () => window.removeEventListener('ft-data-changed', on);
  }, [load]);

  /** Persist default + enabled currencies to the profile. */
  const persist = async (nextDefault: string, nextEnabled: string[]) => {
    if (!user) return;
    const { data, error } = await supabase.from('profiles')
      .update({ default_currency: nextDefault, enabled_currencies: nextEnabled })
      .eq('id', user.id)
      .select('id');
    // 0 rows updated means the profile row is missing — not an error to Postgres.
    if (error || !data?.length) {
      toast.show(`Couldn't save currencies: ${error?.message ?? 'your profile wasn’t found — reload the page and try again'}`);
      await refreshPrefs();
      load();
      return;
    }
    if (nextDefault !== defaultCurrency) await refreshPrefs();
    window.dispatchEvent(new Event('ft-data-changed'));
  };

  const toggleCurrency = (code: string) => {
    if (code === defaultCurrency) return;
    const next = enabled.includes(code) ? enabled.filter((c) => c !== code) : [...enabled, code];
    setEnabled(next);
    persist(defaultCurrency, next);
  };

  const setDefault = (code: string) => {
    const next = enabled.includes(code) ? enabled : [...enabled, code];
    setDefaultCurrency(code);
    setEnabled(next);
    persist(code, next);
  };

  const saveRate = (code: string, v: number) => {
    if (!user) return;
    const next = { ...rates, [code]: v };
    if (!v) delete next[code];
    setRates(next);
    // Local copy updates instantly; the profile copy syncs other devices.
    saveManualRates(user.id, next).then((err) => { if (err) toast.show(`Rate saved on this device only: ${err}`); });
    window.dispatchEvent(new Event('ft-data-changed'));
  };

  /* ---- Rows ---- */
  const byCur = useMemo(() => {
    const m: Record<string, { n: number; bal: number }> = {};
    accounts.forEach((a) => {
      const e = (m[a.currency] ??= { n: 0, bal: 0 });
      e.n += 1; e.bal += Number(a.balance);
    });
    return m;
  }, [accounts]);

  const codes = useMemo(() => {
    const set = new Set<string>([defaultCurrency, ...enabled, ...Object.keys(byCur)]);
    const rest = [...set].filter((c) => c !== defaultCurrency)
      .sort((a, b) => (byCur[b]?.n ?? 0) - (byCur[a]?.n ?? 0) || a.localeCompare(b));
    return [defaultCurrency, ...rest];
  }, [defaultCurrency, enabled, byCur]);

  const secondary = codes.length > 1 ? codes[1] : null;
  const roleOf = (c: string) => (c === defaultCurrency ? 'Base' : c === secondary ? 'Secondary' : 'Enabled');
  const toBase = (amount: number, c: string) => convertManual(amount, c, defaultCurrency, defaultCurrency, rates);
  const hasRate = (c: string) => c === defaultCurrency || !!rates[c];

  /* ---- Converter ---- */
  const from = convFrom ?? secondary ?? defaultCurrency;
  const to = convTo ?? defaultCurrency;
  const convAmount = parseFloat(convVal.replace(/,/g, '')) || 0;
  const convOut = convertManual(convAmount, from, to, defaultCurrency, rates);
  const convOk = hasRate(from) && hasRate(to);
  const swap = () => { setConvFrom(to); setConvTo(from); };
  const convOptions = codes;

  const filtered = ALL_CURRENCIES.filter(
    (c) => c.code.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const cols = 'minmax(0,1.3fr) 110px 230px 100px 160px 160px';
  const fmt = (n: number, c: string) => formatMoney(n, c);

  const converter = (
    <>
      <div className="hidden md:grid grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] gap-2.5 items-end">
        <Field label={
          <select value={from} onChange={(e) => setConvFrom(e.target.value)} className="bg-transparent text-xs text-slate-300 -ml-0.5 cursor-pointer" aria-label="From currency">
            {convOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        }>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">{symOf(from)}</span>
            <input inputMode="decimal" value={convVal} onChange={(e) => setConvVal(e.target.value)}
              className={cx(fieldCls, 'text-base font-bold tabular-nums')} style={{ paddingLeft: `${Math.max(24, symOf(from).length * 9 + 14)}px` }} />
          </div>
        </Field>
        <IconButton onClick={swap} title="Swap" aria-label="Swap currencies"><ArrowLeftRight size={16} /></IconButton>
        <Field label={
          <select value={to} onChange={(e) => setConvTo(e.target.value)} className="bg-transparent text-xs text-slate-300 -ml-0.5 cursor-pointer" aria-label="To currency">
            {convOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        }>
          <div className="min-h-[36px] flex items-center px-2.5 bg-card text-base font-extrabold tabular-nums text-slate-100">
            {convOk ? fmt(convOut, to) : '—'}
          </div>
        </Field>
      </div>
      {!convOk && <p className="text-xs text-slate-400">Set a rate for {!hasRate(from) ? from : to} in the table to convert.</p>}
    </>
  );

  return (
    <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-7">
      <PageHeader
        className="hidden md:flex"
        description="Totals are shown per currency; charts convert at your manual rates"
      />

      {/* ---- Phone: rate card + converter ---- */}
      {secondary && (
        <Card className="md:hidden p-4 flex flex-col gap-1.5">
          <span className="t-kicker">1 {secondary}</span>
          <span className="text-[30px] font-extrabold tabular-nums text-slate-100">
            {rates[secondary] ? fmt(rates[secondary], defaultCurrency) : '—'}
          </span>
          <span className="text-xs text-slate-400">Your manual rate · edit it in the list below</span>
        </Card>
      )}
      <div className="md:hidden flex flex-col gap-2">
        <div>
          <label className="block text-xs text-slate-300/80 mb-[5px]">
            <select value={from} onChange={(e) => setConvFrom(e.target.value)} className="bg-transparent cursor-pointer" aria-label="From currency">
              {convOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <input inputMode="decimal" value={convVal} onChange={(e) => setConvVal(e.target.value)}
            className={cx(fieldCls, 'h-11 text-[17px] font-bold tabular-nums')} />
        </div>
        <button type="button" onClick={swap}
          className="self-start h-10 px-3 border border-line-strong text-[13px] font-semibold flex items-center gap-1.5 text-slate-100">
          <ArrowUpDown size={16} /> Swap
        </button>
        <div className="flex justify-between items-baseline py-3 rule-t">
          <select value={to} onChange={(e) => setConvTo(e.target.value)} className="bg-transparent text-[13px] text-slate-400 cursor-pointer" aria-label="To currency">
            {convOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-2xl font-extrabold tabular-nums text-slate-100">{convOk ? fmt(convOut, to) : '—'}</span>
        </div>
      </div>

      {/* ---- Currency table ---- */}
      <section className="rule-t">
        <div className="hidden md:grid gap-3 items-center h-[38px] rule-b t-th" style={{ gridTemplateColumns: cols }}>
          <span>Currency</span><span>Role</span><span>Rate</span><span>Accounts</span>
          <span className="text-right">Balance</span><span className="text-right">In {defaultCurrency}</span>
        </div>
        {codes.map((c) => {
          const info = byCur[c];
          const n = info?.n ?? 0;
          const bal = info?.bal ?? 0;
          const acctLabel = `${n} account${n === 1 ? '' : 's'}`;
          return (
            <div key={c} className="row-rule">
              <div className="hidden md:grid gap-3 items-center min-h-[60px]" style={{ gridTemplateColumns: cols }}>
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-11 h-8 grid place-items-center bg-slate-100 text-app text-xs font-extrabold tracking-[0.04em] shrink-0">{c}</span>
                  <span className="text-sm font-semibold text-slate-100 truncate">{nameOf(c)}</span>
                </span>
                <span className="text-[13px] text-slate-100">{roleOf(c)}</span>
                {c === defaultCurrency
                  ? <span className="text-[13px] text-slate-400">Base · 1 {c} = 1 {c}</span>
                  : <RateInput code={c} base={defaultCurrency} value={rates[c]} onSave={saveRate} />}
                <span className="text-[13px] text-slate-400">{acctLabel}</span>
                <span className="text-right text-[15px] font-bold tabular-nums text-slate-100">{fmt(bal, c)}</span>
                <span className="text-right text-sm tabular-nums text-slate-300">
                  {hasRate(c) ? fmt(toBase(bal, c), defaultCurrency) : '—'}
                </span>
              </div>
              <div className="md:hidden flex flex-col gap-2 py-3 min-h-[58px] justify-center">
                <div className="flex justify-between items-center gap-3">
                  <span className="flex flex-col leading-[1.3] min-w-0">
                    <span className="text-[15px] font-semibold text-slate-100 truncate">{c} · {nameOf(c)}</span>
                    <span className="text-xs text-slate-400">{roleOf(c)} · {acctLabel}</span>
                  </span>
                  <span className="text-[15px] font-bold tabular-nums text-slate-100">{fmt(bal, c)}</span>
                </div>
                {c !== defaultCurrency && <RateInput code={c} base={defaultCurrency} value={rates[c]} onSave={saveRate} className="[&_input]:h-10" />}
              </div>
            </div>
          );
        })}
        <Button variant="ghost" size="sm" className="mt-2.5" onClick={() => setManageOpen(true)}>
          <Plus size={14} /> Add a currency
        </Button>
      </section>

      {/* ---- Web: converter | rate panel ---- */}
      <div className="hidden md:grid grid-cols-2 kpi-strip">
        <section className="!pl-0 !pr-6 !py-[22px] flex flex-col gap-3.5">
          <h2 className="text-[17px] font-extrabold text-slate-100">Converter</h2>
          {converter}
        </section>
        <section className="!pl-6 !pr-0 !py-[22px] flex flex-col gap-3">
          {secondary ? (
            <>
              <h2 className="text-[17px] font-extrabold text-slate-100">{secondary} → {defaultCurrency}</h2>
              <div className="text-[28px] font-extrabold tabular-nums text-slate-100">
                {rates[secondary] ? fmt(rates[secondary], defaultCurrency) : '—'}
              </div>
              <div className="text-xs text-slate-400 pt-2.5 border-t border-line">
                {rates[secondary]
                  ? <>Your manual rate for 1 {secondary}. <span className="tabular-nums">1 {defaultCurrency} = {(1 / rates[secondary]).toPrecision(4)} {secondary}</span>.</>
                  : `No rate set yet — enter one for ${secondary} in the table above.`}
              </div>
            </>
          ) : (
            <>
              <h2 className="text-[17px] font-extrabold text-slate-100">Rates</h2>
              <p className="text-sm text-slate-400">Add a second currency to set its rate against {defaultCurrency}.</p>
            </>
          )}
        </section>
      </div>

      {/* ---- Manage currencies ---- */}
      <Modal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        title="Currencies"
        maxWidth="max-w-lg"
        footer={<Button onClick={() => setManageOpen(false)}>Done</Button>}
      >
        <div className="flex flex-col gap-3">
          <SearchInput placeholder="Find a currency" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="rule-t max-h-[50vh] overflow-y-auto">
            {filtered.map((c) => {
              const isEnabled = enabled.includes(c.code);
              const isDefault = c.code === defaultCurrency;
              return (
                <div key={c.code} className="flex items-center justify-between gap-3 min-h-[52px] row-rule">
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={cx('w-11 h-8 grid place-items-center text-xs font-extrabold tracking-[0.04em] shrink-0', isEnabled ? 'bg-slate-100 text-app' : 'bg-slate-900 text-slate-300')}>{c.code}</span>
                    <span className="text-sm font-semibold text-slate-100 truncate">{c.name}</span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    {isDefault
                      ? <span className="text-[11px] font-semibold px-2 py-[3px] bg-slate-100 text-app">Base</span>
                      : isEnabled && <Button variant="ghost" size="sm" onClick={() => setDefault(c.code)}>Make base</Button>}
                    <Switch checked={isEnabled} disabled={isDefault} onChange={() => toggleCurrency(c.code)} label={`Enable ${c.code}`} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
