import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, Printer, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { convertManual, loadManualRates } from '../lib/manualRates';
import { formatMoney } from '../lib/money';
import { toISODate } from '../lib/recurring';
import {
  Button, Field, IconButton, Input, Kpi, KpiStrip, ListSkeleton, Modal, PageHeader, Select, cx, useToast,
} from '../components/ui';
import { isAssetKind, INVESTMENT_KINDS } from './Investments';
import type { Database } from '../lib/database.types';

type Account = Database['public']['Tables']['accounts']['Row'];
type Loan = Database['public']['Tables']['loans']['Row'] & { accounts: { currency: string } | null };
type Payment = Database['public']['Tables']['loan_payments']['Row'];
type Valuation = Database['public']['Tables']['account_valuations']['Row'];
type TaxPayment = Database['public']['Tables']['tax_payments']['Row'];
type Tx = {
  amount: number; charge_amount: number | null; type: 'income' | 'expense'; currency: string; account_id: string;
  category_id: string | null; transfer_pair_id: string | null; loan_payment_id: string | null;
  is_adjustment: boolean; transaction_date: string;
};

const TAX_KINDS: { value: TaxPayment['kind']; label: string }[] = [
  { value: 'tds', label: 'Deducted at source (TDS)' },
  { value: 'advance', label: 'Advance tax' },
  { value: 'with_return', label: 'Paid with return' },
  { value: 'other', label: 'Other' },
];

/** Bangladesh income year: 1 July – 30 June. '2025-26' = Jul 2025 – Jun 2026. */
function yearOf(d: Date) { const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return y; }
const yearLabel = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
const PAGE = 1000;

/** Tax-ready summary (no tax calculation — rules change every Finance Act):
 *  income by source, rebate-eligible investments, tax already paid, and a
 *  statement of assets & liabilities at the end of the income year. */
export function TaxSummary() {
  const { user } = useAuth();
  const { defaultCurrency: cur } = useUserPrefs();
  const toast = useToast();
  const thisYear = yearOf(new Date());
  const [year, setYear] = useState(thisYear);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [vals, setVals] = useState<Valuation[]>([]);
  const [txns, setTxns] = useState<Tx[]>([]);
  const [cats, setCats] = useState<Record<string, string>>({});
  const [tax, setTax] = useState<TaxPayment[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: 'tds' as TaxPayment['kind'], description: '', amount: '', paid_on: toISODate(new Date()) });

  const start = new Date(year, 6, 1);
  const end = new Date(year + 1, 6, 1); // exclusive
  const ended = end.getTime() <= Date.now();
  const asOf = ended ? new Date(year + 1, 5, 30, 23, 59, 59) : new Date();

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    // Everything after the income year's start: needed both for the year's
    // figures and to roll balances back to 30 June.
    const fetchTx = async () => {
      const all: Tx[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from('transactions')
          .select('amount, charge_amount, type, currency, account_id, category_id, transfer_pair_id, loan_payment_id, is_adjustment, transaction_date')
          .eq('user_id', user.id).gte('transaction_date', start.toISOString())
          .order('transaction_date').range(from, from + PAGE - 1);
        if (error || !data) break;
        all.push(...(data as Tx[]));
        if (data.length < PAGE) break;
      }
      return all;
    };
    const [tx, acc, ln, pay, v, c, t] = await Promise.all([
      fetchTx(),
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase.from('loans').select('*, accounts(currency)').eq('user_id', user.id),
      supabase.from('loan_payments').select('*').eq('user_id', user.id).gte('payment_date', start.toISOString()),
      supabase.from('account_valuations').select('*').eq('user_id', user.id).order('as_of'),
      supabase.from('categories').select('id, name').eq('user_id', user.id),
      supabase.from('tax_payments').select('*').eq('user_id', user.id).eq('tax_year', yearLabel(year)).order('paid_on'),
    ]);
    setTxns(tx.map((x) => ({ ...x, amount: Number(x.amount) })));
    setAccounts(acc.data ?? []);
    setLoans((ln.data ?? []) as unknown as Loan[]);
    setPayments(pay.data ?? []);
    setVals(v.data ?? []);
    setCats(Object.fromEntries((c.data ?? []).map((x) => [x.id, x.name])));
    setTax(t.data ?? []);
    setLoading(false);
  }, [user, year]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener('ft-data-changed', on);
    return () => window.removeEventListener('ft-data-changed', on);
  }, [load]);

  // Print on paper: light theme, amounts unmasked; restore afterwards.
  useEffect(() => {
    const root = document.documentElement;
    let saved: string[] = [];
    const before = () => {
      saved = ['dark', 'hide-amounts'].filter((c) => root.classList.contains(c));
      saved.forEach((c) => root.classList.remove(c));
    };
    const after = () => saved.forEach((c) => root.classList.add(c));
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);

  const r = useMemo(() => {
    const rates = loadManualRates(user?.id);
    const conv = (n: number, c: string | null | undefined) => convertManual(Number(n) || 0, c || cur, cur, cur, rates);
    const inYear = (s: string) => { const d = new Date(s); return d >= start && d < end; };
    const after = (s: string) => new Date(s) > asOf;
    const byId = new Map(accounts.map((a) => [a.id, a]));

    /* Income by source (category), in the year */
    const income = new Map<string, number>();
    txns.forEach((t) => {
      if (t.type !== 'income' || t.transfer_pair_id || t.loan_payment_id || t.is_adjustment || !inYear(t.transaction_date)) return;
      const k = t.category_id ? cats[t.category_id] ?? 'Other' : 'Uncategorized';
      income.set(k, (income.get(k) ?? 0) + conv(t.amount, t.currency));
    });
    const incomeRows = Array.from(income.entries()).sort((a, b) => b[1] - a[1]);
    const totalIncome = incomeRows.reduce((s, [, v]) => s + v, 0);

    /* Rebate-eligible investments: money moved into flagged holdings this year */
    const rebate = new Map<string, number>();
    txns.forEach((t) => {
      if (t.type !== 'income' || !t.transfer_pair_id || !inYear(t.transaction_date)) return;
      const a = byId.get(t.account_id);
      if (!a || a.type !== 'investment' || !a.tax_rebate) return;
      rebate.set(a.id, (rebate.get(a.id) ?? 0) + conv(t.amount, t.currency));
    });
    const rebateRows = Array.from(rebate.entries()).map(([id, v]) => ({ a: byId.get(id)!, v })).sort((x, y) => y.v - x.v);
    const totalRebate = rebateRows.reduce((s, x) => s + x.v, 0);

    /* Balances rolled back to the as-of date */
    const later = new Map<string, number>(); // account → net change after asOf (own currency)
    txns.forEach((t) => {
      if (!after(t.transaction_date)) return;
      const d = t.type === 'income' ? t.amount : -(t.amount + Number(t.charge_amount ?? 0));
      later.set(t.account_id, (later.get(t.account_id) ?? 0) + d);
    });
    const existed = (created: string) => new Date(created) <= asOf;
    const balAt = (a: Account) => Number(a.balance) - (later.get(a.id) ?? 0);
    const valueAt = (a: Account) => {
      const v = [...vals].reverse().find((x) => x.account_id === a.id && new Date(`${x.as_of}T23:59:59`) <= asOf);
      if (v) return Number(v.value);
      if (!ended && a.current_value != null) return Number(a.current_value);
      return balAt(a);
    };

    type Line = { name: string; detail: string; cost: number; value: number };
    const groups: Record<string, Line[]> = { cash: [], bank: [], invest: [], asset: [], owed: [], loan: [], card: [] };
    accounts.forEach((a) => {
      if (!existed(a.created_at)) return;
      const b = conv(balAt(a), a.currency);
      if (a.type === 'investment') {
        const line = { name: a.name, detail: INVESTMENT_KINDS.find((k) => k.value === a.investment_kind)?.label ?? 'Investment', cost: b, value: conv(valueAt(a), a.currency) };
        if (Math.abs(line.cost) > 0.005 || Math.abs(line.value) > 0.005) groups[isAssetKind(a.investment_kind) ? 'asset' : 'invest'].push(line);
      } else if ((a.type === 'credit_card' || a.type === 'virtual_card') && b < 0) {
        groups.card.push({ name: a.name, detail: 'Card balance', cost: -b, value: -b });
      } else if (Math.abs(b) > 0.005) {
        groups[a.type === 'cash' ? 'cash' : 'bank'].push({ name: a.name, detail: `${a.currency}${a.is_active ? '' : ' · archived'}`, cost: b, value: b });
      }
    });
    const payLater = (l: Loan) => payments.filter((p) => p.loan_id === l.id && after(p.payment_date))
      .reduce((s, p) => s + (p.payment_type === 'repayment' ? Number(p.amount) : -Number(p.amount)), 0);
    loans.forEach((l) => {
      if (!existed(l.created_at)) return;
      const bal = conv(Number(l.current_balance) + payLater(l), l.accounts?.currency ?? cur);
      if (bal <= 0.005) return;
      groups[l.type === 'lending' ? 'owed' : 'loan'].push({ name: l.name, detail: l.lender_borrower, cost: bal, value: bal });
    });
    const sum = (k: string, f: 'cost' | 'value') => groups[k].reduce((s, x) => s + x[f], 0);
    const assetsCost = ['cash', 'bank', 'invest', 'asset', 'owed'].reduce((s, k) => s + sum(k, 'cost'), 0);
    const assetsValue = ['cash', 'bank', 'invest', 'asset', 'owed'].reduce((s, k) => s + sum(k, 'value'), 0);
    const liabilities = sum('loan', 'cost') + sum('card', 'cost');

    const taxPaid = tax.reduce((s, t) => s + Number(t.amount), 0);
    return { incomeRows, totalIncome, rebateRows, totalRebate, groups, sum, assetsCost, assetsValue, liabilities, taxPaid };
  }, [txns, accounts, loans, payments, vals, cats, tax, cur, user?.id, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTax = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const amount = Number(form.amount);
    if (!(amount > 0)) return;
    const { error } = await supabase.from('tax_payments').insert({
      user_id: user.id, tax_year: yearLabel(year), kind: form.kind,
      description: form.description.trim() || null, amount, paid_on: form.paid_on,
    });
    if (error) { toast.show(`Couldn't save: ${error.message}`); return; }
    setAdding(false);
    setForm({ kind: 'tds', description: '', amount: '', paid_on: toISODate(new Date()) });
    load();
  };
  const removeTax = async (id: string) => {
    await supabase.from('tax_payments').delete().eq('id', id);
    load();
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [['Section', 'Item', 'Detail', `Cost (${cur})`, `Value (${cur})`]];
    const push = (sec: string, k: string) => r.groups[k].forEach((l) => rows.push([sec, l.name, l.detail, l.cost.toFixed(2), l.value.toFixed(2)]));
    push('Assets: cash in hand', 'cash'); push('Assets: bank & wallets', 'bank'); push('Assets: investments', 'invest');
    push('Assets: property & other', 'asset'); push('Assets: money owed to you', 'owed');
    push('Liabilities: loans', 'loan'); push('Liabilities: cards', 'card');
    rows.push([], ['Income by source', '', '', '', '']);
    r.incomeRows.forEach(([k, v]) => rows.push(['Income', k, '', v.toFixed(2), '']));
    rows.push(['Rebate investments', '', '', r.totalRebate.toFixed(2), '']);
    tax.forEach((t) => rows.push(['Tax paid', TAX_KINDS.find((k) => k.value === t.kind)?.label ?? t.kind, t.description ?? '', Number(t.amount).toFixed(2), '']));
    const csv = rows.map((row) => row.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `keel-tax-${yearLabel(year)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const m = (n: number) => formatMoney(n, cur);
  const asOfLabel = asOf.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const section = (title: string, k: string, showValue: boolean) => r.groups[k].length > 0 && (
    <div className="mb-4">
      <div className="flex justify-between t-kicker !text-slate-100 pb-1.5 rule-b">
        <span>{title}</span><span className="tabular-nums">{m(r.sum(k, 'cost'))}</span>
      </div>
      {r.groups[k].map((l, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_140px_140px] gap-3 py-2 row-rule text-sm">
          <span className="min-w-0"><span className="text-slate-100">{l.name}</span> <span className="text-xs text-slate-400">· {l.detail}</span></span>
          <span className="text-right tabular-nums text-slate-100">{m(l.cost)}</span>
          {showValue && <span className="hidden md:block text-right tabular-nums text-slate-400">{m(l.value)}</span>}
        </div>
      ))}
    </div>
  );

  return (
    <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-6 md:gap-7 max-w-[1000px] print:max-w-none print:p-0">
      <PageHeader
        title="Tax summary"
        description={`Income year ${yearLabel(year)} · 1 July ${year} – 30 June ${year + 1} · for your return (assessment year ${yearLabel(year + 1)})`}
        actions={<>
          <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="!w-auto print:hidden">
            {[0, 1, 2, 3].map((d) => <option key={d} value={thisYear - d}>{yearLabel(thisYear - d)}</option>)}
          </Select>
          <Button variant="secondary" onClick={exportCsv} className="print:hidden"><Download size={16} /> CSV</Button>
          <Button variant="secondary" onClick={() => window.print()} className="print:hidden"><Printer size={16} /> Print / PDF</Button>
        </>}
      />

      <p className="border-l-2 border-line-strong pl-3 text-xs text-slate-400 max-w-3xl leading-relaxed print:hidden">
        Keel gathers the figures your return asks for — it doesn’t calculate your tax, because slabs and rebate rules change with each
        Finance Act. Check the numbers and rules with the NBR guidance or a tax adviser before filing.
      </p>

      {loading ? <ListSkeleton rows={5} /> : (
        <>
          <KpiStrip cols={4}>
            <Kpi label="Income this year" value={m(r.totalIncome)} note={ended ? 'Full year' : 'So far'} />
            <Kpi label="Rebate investments" value={m(r.totalRebate)} note="Put into holdings marked for rebate" />
            <Kpi label="Tax already paid" value={m(r.taxPaid)} note={`${tax.length} entr${tax.length === 1 ? 'y' : 'ies'}`} />
            <Kpi
              label={`Net wealth · ${ended ? '30 June' : 'today'}`}
              value={<span className={r.assetsCost - r.liabilities < 0 ? 'text-red-400' : undefined}>{m(r.assetsCost - r.liabilities)}</span>}
              note="At cost, assets minus liabilities"
            />
          </KpiStrip>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section>
              <h2 className="text-[17px] font-extrabold text-slate-100 mb-2">Income by source</h2>
              {r.incomeRows.length === 0 ? <p className="text-sm text-slate-400 py-2">No income recorded in this income year.</p> : (
                <div className="rule-t">
                  {r.incomeRows.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 py-2 row-rule text-sm">
                      <span className="text-slate-100">{k}</span><span className="tabular-nums text-slate-100">{m(v)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3 py-2 text-sm font-bold">
                    <span className="text-slate-100">Total</span><span className="tabular-nums text-slate-100">{m(r.totalIncome)}</span>
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1.5">Grouped by income category — name categories by source (Salary, Business, Profit / interest…) for a clean summary.</p>
            </section>

            <section>
              <h2 className="text-[17px] font-extrabold text-slate-100 mb-2">Rebate investments</h2>
              {r.rebateRows.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">Nothing yet. Mark holdings as “counts for tax rebate” under Assets &amp; investments, and move money in with Add money.</p>
              ) : (
                <div className="rule-t">
                  {r.rebateRows.map(({ a, v }) => (
                    <div key={a.id} className="flex justify-between gap-3 py-2 row-rule text-sm">
                      <span className="text-slate-100">{a.name}</span><span className="tabular-nums text-slate-100">{m(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section>
            <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className="text-[17px] font-extrabold text-slate-100">Tax paid &amp; deducted</h2>
              <Button size="sm" variant="secondary" onClick={() => setAdding(true)} className="print:hidden"><Plus size={14} /> Add</Button>
            </div>
            {tax.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">Add tax deducted at source (e.g. on savings-certificate profit or salary) and any advance tax, so it’s ready for your return.</p>
            ) : (
              <div className="rule-t">
                {tax.map((t) => (
                  <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center py-2 row-rule text-sm">
                    <span className="min-w-0 truncate">
                      <span className="text-slate-100">{TAX_KINDS.find((k) => k.value === t.kind)?.label}</span>
                      <span className="text-xs text-slate-400"> · {t.description ? `${t.description} · ` : ''}{new Date(t.paid_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </span>
                    <span className="tabular-nums text-slate-100">{m(Number(t.amount))}</span>
                    <IconButton bordered={false} className="w-8 h-8 text-red-400 print:hidden" onClick={() => removeTax(t.id)} aria-label="Delete"><Trash2 size={14} /></IconButton>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-[17px] font-extrabold text-slate-100">Statement of assets &amp; liabilities</h2>
            <p className="text-xs text-slate-400 mb-3">
              As of {asOfLabel}{ended ? '' : ' (this income year hasn’t ended — figures will be as of 30 June once it does)'} · amounts in {cur}.
              {' '}The return usually asks for assets at cost; current value is shown alongside for reference.
            </p>
            <div className="hidden md:grid grid-cols-[minmax(0,1fr)_140px_140px] gap-3 t-th pb-1">
              <span /><span className="text-right">Cost</span><span className="text-right">Current value</span>
            </div>
            <h3 className="t-kicker mb-2">Assets</h3>
            {section('Cash in hand', 'cash', false)}
            {section('Bank accounts & mobile wallets', 'bank', false)}
            {section('Investments', 'invest', true)}
            {section('Property, vehicles & valuables', 'asset', true)}
            {section('Money owed to you', 'owed', false)}
            <div className={cx('flex justify-between py-2 text-sm font-bold rule-t mb-6')}>
              <span className="text-slate-100">Total assets</span>
              <span className="tabular-nums text-slate-100">{m(r.assetsCost)} <span className="text-xs font-normal text-slate-400">· value {m(r.assetsValue)}</span></span>
            </div>
            <h3 className="t-kicker mb-2">Liabilities</h3>
            {section('Loans', 'loan', false)}
            {section('Card balances', 'card', false)}
            {r.liabilities === 0 && <p className="text-sm text-slate-400 mb-4">No liabilities on this date.</p>}
            <div className="flex justify-between py-2 text-sm font-bold rule-t">
              <span className="text-slate-100">Total liabilities</span><span className={cx('tabular-nums', r.liabilities > 0 ? 'text-red-400' : 'text-slate-100')}>{m(r.liabilities)}</span>
            </div>
            <div className="flex justify-between py-3 text-base font-extrabold rule-t rule-b mt-2">
              <span className="text-slate-100">Net wealth</span>
              <span className={cx('tabular-nums', r.assetsCost - r.liabilities < 0 ? 'text-red-400' : 'text-slate-100')}>{m(r.assetsCost - r.liabilities)}</span>
            </div>
          </section>
        </>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={`Add tax · ${yearLabel(year)}`}
        maxWidth="max-w-sm"
        footer={<>
          <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          <Button type="submit" form="tax-form" disabled={!(Number(form.amount) > 0)}>Save</Button>
        </>}
      >
        <form id="tax-form" onSubmit={addTax} className="flex flex-col gap-3.5">
          <Field label="Type">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as TaxPayment['kind'] })}>
              {TAX_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="Description (optional)">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Sanchayapatra profit, employer" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Amount (${cur})`}>
              <Input type="number" inputMode="decimal" min="0.01" step="any" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="no-mask" />
            </Field>
            <Field label="Date">
              <Input type="date" value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })} />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
}
