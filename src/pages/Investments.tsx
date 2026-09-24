import { useEffect, useState } from 'react';
import { ArrowDownToLine, LineChart, Pencil, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { formatMoney } from '../lib/money';
import { toISODate } from '../lib/recurring';
import {
  Button, EmptyState, Field, IconButton, Input, Kpi, KpiStrip, ListSkeleton, Modal, PageHeader, Select, Switch, cx, useToast,
} from '../components/ui';
import { TransactionFormModal } from '../components/transactions/TransactionFormModal';
import { useMoneyPlan } from '../components/plan/useMoneyPlan';
import type { Database } from '../lib/database.types';

type Account = Database['public']['Tables']['accounts']['Row'];
type Kind = NonNullable<Account['investment_kind']>;

/** asset = something you own (valued by hand); otherwise a financial investment.
 *  rebate = usually counts toward the tax investment rebate (the user can override). */
export const INVESTMENT_KINDS: { value: Kind; label: string; fixed?: boolean; asset?: boolean; rebate?: boolean }[] = [
  { value: 'startup', label: 'Startup / business' },
  { value: 'savings_certificate', label: 'Savings certificate', fixed: true, rebate: true },
  { value: 'dps', label: 'DPS', fixed: true, rebate: true },
  { value: 'fdr', label: 'FDR / fixed deposit', fixed: true },
  { value: 'stocks', label: 'Stocks', rebate: true },
  { value: 'fund', label: 'Mutual fund', rebate: true },
  { value: 'crypto', label: 'Crypto' },
  { value: 'property', label: 'Property (flat / house)', asset: true },
  { value: 'land', label: 'Land', asset: true },
  { value: 'vehicle', label: 'Vehicle', asset: true },
  { value: 'gold', label: 'Gold / jewellery', asset: true },
  { value: 'valuables', label: 'Other valuables', asset: true },
  { value: 'other', label: 'Other investment' },
];
export const isAssetKind = (k: Account['investment_kind'] | '') => !!INVESTMENT_KINDS.find((x) => x.value === k)?.asset;
const kindLabel = (k: Account['investment_kind']) => INVESTMENT_KINDS.find((x) => x.value === k)?.label ?? 'Investment';
const isFixed = (k: Account['investment_kind'] | '') => !!INVESTMENT_KINDS.find((x) => x.value === k)?.fixed;

const DAY = 86_400_000;
const daysSince = (s: string | null) => (s ? Math.floor((Date.now() - new Date(s).getTime()) / DAY) : null);
const shortDate = (s: string) => new Date(s).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

/** Investments are accounts of type "investment":
 *  - balance       = money you PUT IN (moved in/out by transfers)
 *  - current_value = what it's WORTH now (updated by hand)
 *  Gain = worth − put in. Profit paid out to you is recorded as income. */
export function Investments() {
  const { user } = useAuth();
  const { defaultCurrency } = useUserPrefs();
  const plan = useMoneyPlan();
  const toast = useToast();
  const [currencies, setCurrencies] = useState<string[]>([defaultCurrency]);
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [valuing, setValuing] = useState<Account | null>(null);
  const [funding, setFunding] = useState<Account | null>(null);
  const [form, setForm] = useState({ name: '', kind: 'startup' as Kind, currency: defaultCurrency, maturity: '', putIn: '', worth: '', rebate: false });
  const [value, setValue] = useState({ amount: '', date: toISODate(new Date()) });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('enabled_currencies, default_currency').eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        const list = (data?.enabled_currencies as string[] | null) ?? [];
        setCurrencies(Array.from(new Set([data?.default_currency ?? defaultCurrency, ...list])));
      });
  }, [user, defaultCurrency]);

  const items = plan.investments;
  const cur = plan.cur;

  const openNew = (kind: Kind = 'startup') => {
    setForm({ name: '', kind, currency: defaultCurrency, maturity: '', putIn: '', worth: '', rebate: !!INVESTMENT_KINDS.find((k) => k.value === kind)?.rebate });
    setEditing('new');
  };
  const openEdit = (a: Account) => {
    setForm({ name: a.name, kind: a.investment_kind ?? 'other', currency: a.currency, maturity: a.maturity_date ?? '', putIn: '', worth: '', rebate: a.tax_rebate });
    setEditing(a);
  };
  const pickKind = (kind: Kind) => setForm((f) => ({
    ...f, kind,
    // Suggest the rebate flag for the usual rebate-eligible kinds (new holdings only).
    rebate: editing === 'new' ? !!INVESTMENT_KINDS.find((k) => k.value === kind)?.rebate : f.rebate,
  }));

  const saveInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editing) return;
    setSaving(true);
    const base = {
      name: form.name.trim(),
      investment_kind: form.kind,
      maturity_date: isFixed(form.kind) && form.maturity ? form.maturity : null,
      tax_rebate: !isAssetKind(form.kind) && form.rebate,
    };
    let error: { message: string } | null = null;
    if (editing === 'new') {
      const putIn = Number(form.putIn) || 0;
      const worth = form.worth.trim() === '' ? null : Number(form.worth);
      const { data, error: err } = await supabase.from('accounts').insert({
        ...base,
        user_id: user.id,
        type: 'investment',
        currency: form.currency,
        balance: putIn, // opening amount already invested
        current_value: worth ?? (putIn || null),
        value_updated_at: worth != null || putIn ? new Date().toISOString() : null,
      }).select('id').single();
      error = err;
      if (!err && data && (worth ?? putIn)) {
        await supabase.from('account_valuations').insert({ user_id: user.id, account_id: data.id, value: worth ?? putIn });
      }
    } else {
      ({ error } = await supabase.from('accounts').update(base).eq('id', editing.id));
    }
    setSaving(false);
    if (error) { toast.show(`Couldn't save: ${error.message}`); return; }
    toast.show(editing === 'new' ? `${base.name} added` : 'Investment updated');
    setEditing(null);
    window.dispatchEvent(new Event('ft-data-changed'));
  };

  const saveValue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !valuing) return;
    const v = Number(value.amount);
    if (!Number.isFinite(v) || v < 0) return;
    setSaving(true);
    const [u, h] = await Promise.all([
      supabase.from('accounts').update({ current_value: v, value_updated_at: new Date(`${value.date}T12:00:00`).toISOString() }).eq('id', valuing.id),
      supabase.from('account_valuations').insert({ user_id: user.id, account_id: valuing.id, value: v, as_of: value.date }),
    ]);
    setSaving(false);
    const err = u.error ?? h.error;
    if (err) { toast.show(`Couldn't update value: ${err.message}`); return; }
    const gain = v - Number(valuing.balance);
    toast.show(`${valuing.name} is worth ${formatMoney(v, valuing.currency)} · ${gain >= 0 ? 'up' : 'down'} ${formatMoney(Math.abs(gain), valuing.currency)} on what you put in`);
    setValuing(null);
    window.dispatchEvent(new Event('ft-data-changed'));
  };

  const pct = plan.investIn > 0 ? (plan.investGain / plan.investIn) * 100 : null;
  const nextMaturity = items
    .filter((a) => a.maturity_date && new Date(a.maturity_date).getTime() >= Date.now() - DAY)
    .sort((a, b) => (a.maturity_date! < b.maturity_date! ? -1 : 1))[0];

  return (
    <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-6 md:gap-7 max-w-[1000px]">
      <PageHeader
        title="Assets & investments"
        description="What you paid, what it’s worth now"
        actions={<>
          <Button variant="secondary" onClick={() => openNew('property')}><Plus size={16} /> Asset</Button>
          <Button onClick={() => openNew('startup')}><Plus size={16} /> Investment</Button>
        </>}
      />

      {plan.loading ? <ListSkeleton rows={3} /> : items.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="Nothing added yet"
          description="Add what you own — property, land, a vehicle, gold — and what you invest in: your startup, savings certificates, DPS, FDRs. Update what each is worth from time to time."
          action={<div className="flex gap-2"><Button variant="secondary" onClick={() => openNew('property')}><Plus size={16} /> Asset</Button><Button onClick={() => openNew('startup')}><Plus size={16} /> Investment</Button></div>}
        />
      ) : (
        <>
          <KpiStrip cols={4}>
            <Kpi label="Paid / put in" value={formatMoney(plan.investIn, cur)} note={`${items.length} item${items.length === 1 ? '' : 's'}`} />
            <Kpi label="Worth now" value={formatMoney(plan.investValue, cur)} note="At the values you last entered" />
            <Kpi
              label="Gain / loss"
              value={<span className={plan.investGain < 0 ? 'text-red-400' : undefined}>{formatMoney(plan.investGain, cur, { sign: true })}</span>}
              note={pct == null ? '—' : `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% on what you put in`}
              noteTone={plan.investGain < 0 ? 'accent' : 'muted'}
            />
            <Kpi
              label="Next maturity"
              value={nextMaturity ? shortDate(nextMaturity.maturity_date!) : '—'}
              note={nextMaturity ? nextMaturity.name : 'No fixed-term holdings'}
            />
          </KpiStrip>

          {[
            { title: 'Investments', list: items.filter((a) => !isAssetKind(a.investment_kind)) },
            { title: 'Assets', list: items.filter((a) => isAssetKind(a.investment_kind)) },
          ].filter((g) => g.list.length).map((g) => (
          <section key={g.title}>
            <h2 className="text-[17px] font-extrabold text-slate-100 mb-2">{g.title}</h2>
            <div className="rule-t stagger">
            {g.list.map((a) => {
              const putIn = Number(a.balance);
              const worth = Number(a.current_value ?? a.balance);
              const gain = worth - putIn;
              const g = putIn > 0 ? (gain / putIn) * 100 : null;
              const stale = daysSince(a.value_updated_at);
              const matDays = a.maturity_date ? Math.ceil((new Date(a.maturity_date).getTime() - Date.now()) / DAY) : null;
              return (
                <div key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.4fr)_120px_120px_130px_auto] gap-x-4 gap-y-1.5 items-center py-3.5 row-rule">
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold text-slate-100 truncate">{a.name}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {kindLabel(a.investment_kind)} · {a.currency}{a.tax_rebate ? ' · tax rebate' : ''}
                      {matDays != null && (matDays > 0 ? ` · matures ${shortDate(a.maturity_date!)} (${matDays} days)` : ' · matured')}
                    </div>
                    <div className={cx('text-[11px] mt-0.5', stale == null || stale > 30 ? 'text-red-400' : 'text-slate-400')}>
                      {stale == null ? 'Value never updated' : stale === 0 ? 'Value updated today' : `Value updated ${stale} day${stale === 1 ? '' : 's'} ago`}
                    </div>
                  </div>
                  <div className="hidden md:block text-right">
                    <div className="t-th">{isAssetKind(a.investment_kind) ? 'Paid' : 'Put in'}</div>
                    <div className="text-sm tabular-nums text-slate-100">{formatMoney(putIn, a.currency)}</div>
                  </div>
                  <div className="text-right">
                    <div className="t-th">Worth</div>
                    <div className="text-[15px] font-extrabold tabular-nums text-slate-100">{formatMoney(worth, a.currency)}</div>
                    <div className={cx('md:hidden text-xs font-semibold tabular-nums', gain < 0 ? 'text-red-400' : 'text-slate-400')}>
                      {formatMoney(gain, a.currency, { sign: true })}{g != null ? ` · ${g.toFixed(1)}%` : ''}
                    </div>
                  </div>
                  <div className="hidden md:block text-right">
                    <div className="t-th">Gain / loss</div>
                    <div className={cx('text-sm font-semibold tabular-nums', gain < 0 ? 'text-red-400' : 'text-slate-100')}>
                      {formatMoney(gain, a.currency, { sign: true })}
                    </div>
                    <div className="text-[11px] text-slate-400 tabular-nums">{g == null ? '—' : `${g >= 0 ? '▲' : '▼'} ${Math.abs(g).toFixed(1)}%`}</div>
                  </div>
                  <div className="col-span-2 md:col-span-1 flex gap-1.5 md:justify-end">
                    <Button size="sm" variant="secondary" onClick={() => setFunding(a)} title="Move money in"><ArrowDownToLine size={14} /> Add money</Button>
                    <Button size="sm" variant="secondary" onClick={() => { setValue({ amount: String(worth), date: toISODate(new Date()) }); setValuing(a); }}>
                      <RefreshCw size={14} /> Update value
                    </Button>
                    <IconButton bordered={false} className="w-8 h-8" onClick={() => openEdit(a)} aria-label={`Edit ${a.name}`}><Pencil size={14} /></IconButton>
                  </div>
                </div>
              );
            })}
            </div>
          </section>
          ))}

          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            <b className="text-slate-300">How it works:</b> “Add money” records a transfer from one of your accounts, so it isn’t counted as
            spending. “Update value” records what the holding is worth today (for a startup, your share of its latest valuation).
            When profit or interest is paid out to you, record it as income; when you take your principal back, transfer it out.
          </p>
        </>
      )}

      {/* New / edit */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? (isAssetKind(form.kind) ? 'New asset' : 'New investment') : 'Edit'}
        footer={<>
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          <Button type="submit" form="inv-form" disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : editing === 'new' ? 'Add' : 'Save'}</Button>
        </>}
      >
        <form id="inv-form" onSubmit={saveInvestment} className="flex flex-col gap-3.5">
          <Field label="Name">
            <Input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={isAssetKind(form.kind) ? 'e.g. Flat in Mirpur, Car' : 'e.g. My startup, 5-year Sanchayapatra'} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.kind} onChange={(e) => pickKind(e.target.value as Kind)}>
                <optgroup label="Investments">
                  {INVESTMENT_KINDS.filter((k) => !k.asset).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </optgroup>
                <optgroup label="Assets">
                  {INVESTMENT_KINDS.filter((k) => k.asset).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </optgroup>
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={form.currency} disabled={editing !== 'new'} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
          {isFixed(form.kind) && (
            <Field label="Matures on (optional)">
              <Input type="date" value={form.maturity} onChange={(e) => setForm({ ...form, maturity: e.target.value })} />
            </Field>
          )}
          {editing === 'new' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={isAssetKind(form.kind) ? 'What you paid (optional)' : 'Already put in (optional)'}>
                <Input type="number" inputMode="decimal" min="0" step="any" value={form.putIn} onChange={(e) => setForm({ ...form, putIn: e.target.value })} placeholder="0" className="no-mask" />
              </Field>
              <Field label="Worth now (optional)">
                <Input type="number" inputMode="decimal" min="0" step="any" value={form.worth} onChange={(e) => setForm({ ...form, worth: e.target.value })} placeholder="Same as put in" className="no-mask" />
              </Field>
            </div>
          )}
          {!isAssetKind(form.kind) && (
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm text-slate-100">Counts for tax rebate<span className="block text-xs text-slate-400">Money put in during a tax year shows in your tax summary.</span></span>
              <Switch checked={form.rebate} onChange={(v) => setForm({ ...form, rebate: v })} label="Counts for tax rebate" />
            </div>
          )}
          {editing === 'new' && (
            <p className="text-xs text-slate-400">
              {isAssetKind(form.kind)
                ? 'For something you already own, enter what you paid and what it’s worth now. If you’re buying it now, leave “paid” empty and use “Add money” to move the payment from an account.'
                : 'Use “Already put in” for money invested before you started tracking. New money goes in with “Add money”.'}
            </p>
          )}
        </form>
      </Modal>

      {/* Update value */}
      <Modal
        open={!!valuing}
        onClose={() => setValuing(null)}
        title={valuing ? `Update value · ${valuing.name}` : 'Update value'}
        maxWidth="max-w-sm"
        footer={<>
          <Button variant="secondary" onClick={() => setValuing(null)}>Cancel</Button>
          <Button type="submit" form="inv-value" disabled={saving || value.amount === ''}>{saving ? 'Saving…' : 'Save value'}</Button>
        </>}
      >
        {valuing && (
          <form id="inv-value" onSubmit={saveValue} className="flex flex-col gap-3.5">
            <p className="text-sm text-slate-300 tabular-nums">You’ve put in {formatMoney(Number(valuing.balance), valuing.currency)}.</p>
            <Field label={`Worth now (${valuing.currency})`}>
              <Input type="number" inputMode="decimal" min="0" step="any" required autoFocus value={value.amount}
                onChange={(e) => setValue({ ...value, amount: e.target.value })} className="no-mask" />
            </Field>
            <Field label="As of">
              <Input type="date" value={value.date} onChange={(e) => setValue({ ...value, date: e.target.value })} />
            </Field>
          </form>
        )}
      </Modal>

      <TransactionFormModal
        isOpen={!!funding}
        initialType="transfer"
        initialToAccountId={funding?.id ?? ''}
        initialTitle={funding ? `Invest in ${funding.name}` : ''}
        onClose={() => setFunding(null)}
        onSaved={() => { setFunding(null); window.dispatchEvent(new Event('ft-data-changed')); }}
      />
    </div>
  );
}
