import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { Plus, Pencil, Trash2, RefreshCw, Check } from 'lucide-react';
import {
  Avatar, Button, EmptyState, IconButton, Kpi, KpiStrip, ListSkeleton, Modal, PageHeader, Switch, cx, fieldCls, labelCls, useToast,
} from '../components/ui';
import { formatMoney } from '../lib/money';
import { convertManual, loadManualRates } from '../lib/manualRates';
import { advance, parseDay, recordRecurring, startOfToday, toISODate } from '../lib/recurring';
import type { Database } from '../lib/database.types';

type RecurringTransaction = Database['public']['Tables']['recurring_transactions']['Row'];
type Account = Database['public']['Tables']['accounts']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];
type Payee = Database['public']['Tables']['payees']['Row'];
type Frequency = RecurringTransaction['frequency'];
type EndType = RecurringTransaction['end_type'];

interface RecurringWithDetails extends RecurringTransaction {
  accounts: { name: string; currency: string } | null;
  categories: { name: string; color: string } | null;
  payees: { name: string } | null;
}

const emptyForm = {
  name: '',
  account_id: '',
  category_id: '',
  payee_id: '',
  amount: '',
  type: 'expense' as 'income' | 'expense',
  frequency: 'monthly' as Frequency,
  interval_count: '1',
  next_date: toISODate(new Date()),
  end_type: 'never' as EndType,
  end_date: '',
  max_occurrences: '',
  description: '',
};

const DAY = 86_400_000;
const CADENCE: Record<Frequency, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
};
const CADENCE_UNIT: Record<Frequency, string> = {
  daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year',
};
/** Occurrences per month, for the "monthly equivalent" figures. */
const PER_MONTH: Record<Frequency, number> = {
  daily: 30.4375, weekly: 52 / 12, monthly: 1, yearly: 1 / 12,
};

/** e.g. "Every 2 weeks", "Monthly" (when interval is 1). */
function cadenceLabel(f: Frequency, interval: number): string {
  if (interval <= 1) return CADENCE[f];
  return `Every ${interval} ${CADENCE_UNIT[f]}s`;
}

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
function inDays(d: Date, today: Date): string {
  const n = Math.round((d.getTime() - today.getTime()) / DAY);
  if (n < 0) return n === -1 ? 'yesterday' : `${-n} days ago`;
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

export function RecurringTransactions() {
  const { user } = useAuth();
  const { defaultCurrency, timezone } = useUserPrefs();
  const toast = useToast();
  const [recurring, setRecurring] = useState<RecurringWithDetails[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringTransaction | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [loaded, setLoaded] = useState(false);
  const [recording, setRecording] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) {
      setRecurring([]);
      setAccounts([]);
      setCategories([]);
      setPayees([]);
      return;
    }

    const [recurringRes, accountsRes, categoriesRes, payeesRes] = await Promise.all([
      supabase
        .from('recurring_transactions')
        .select('*, accounts(name, currency), categories(name, color), payees(name)')
        .eq('user_id', user.id)
        .order('next_date', { ascending: true }),
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('categories').select('*').eq('user_id', user.id),
      supabase.from('payees').select('*').eq('user_id', user.id).order('name'),
    ]);

    if (recurringRes.data) setRecurring(recurringRes.data as unknown as RecurringWithDetails[]);
    if (accountsRes.data) setAccounts(accountsRes.data);
    if (categoriesRes.data) setCategories(categoriesRes.data);
    if (payeesRes.data) setPayees(payeesRes.data);
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    loadData();
    const on = () => loadData();
    window.addEventListener('ft-data-changed', on);
    return () => window.removeEventListener('ft-data-changed', on);
  }, [loadData]);

  const changed = () => window.dispatchEvent(new Event('ft-data-changed'));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const data = {
      user_id: user.id,
      name: formData.name,
      account_id: formData.account_id,
      category_id: formData.category_id || null,
      payee_id: formData.payee_id || null,
      amount: parseFloat(formData.amount),
      type: formData.type,
      frequency: formData.frequency,
      interval_count: Math.max(1, parseInt(formData.interval_count, 10) || 1),
      next_date: formData.next_date,
      end_type: formData.end_type,
      end_date: formData.end_type === 'on_date' ? (formData.end_date || null) : null,
      max_occurrences: formData.end_type === 'after_occurrences' ? (parseInt(formData.max_occurrences, 10) || null) : null,
      description: formData.description || null,
    };

    if (editingRecurring) {
      await supabase.from('recurring_transactions').update(data).eq('id', editingRecurring.id);
    } else {
      await supabase.from('recurring_transactions').insert(data);
    }

    setShowForm(false);
    setEditingRecurring(null);
    setFormData(emptyForm);
    changed();
  };

  const handleEdit = (rec: RecurringWithDetails) => {
    setEditingRecurring(rec);
    setFormData({
      name: rec.name,
      account_id: rec.account_id,
      category_id: rec.category_id ?? '',
      payee_id: rec.payee_id ?? '',
      amount: rec.amount.toString(),
      type: rec.type as 'income' | 'expense',
      frequency: rec.frequency,
      interval_count: String(rec.interval_count || 1),
      next_date: rec.next_date,
      end_type: rec.end_type,
      end_date: rec.end_date ?? '',
      max_occurrences: rec.max_occurrences != null ? String(rec.max_occurrences) : '',
      description: rec.description ?? '',
    });
    setShowForm(true);
  };

  const handleToggleActive = async (rec: RecurringTransaction) => {
    // optimistic flip so the switch animates immediately
    setRecurring((list) => list.map((r) => (r.id === rec.id ? { ...r, is_active: !rec.is_active } : r)));
    await supabase.from('recurring_transactions').update({ is_active: !rec.is_active }).eq('id', rec.id);
    changed();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this recurring transaction?')) {
      await supabase.from('recurring_transactions').delete().eq('id', id);
      changed();
    }
  };

  /** Record today's due occurrence as a real transaction, then advance the rule. */
  const handleRecord = async (rec: RecurringWithDetails) => {
    if (!user || recording) return;
    setRecording(rec.id);
    const acctCurrency = rec.accounts?.currency ?? defaultCurrency;

    const { error, ended } = await recordRecurring(rec, { userId: user.id, currency: acctCurrency, timezone });
    setRecording(null);
    if (error) { toast.show(`Couldn't record: ${error}`); return; }
    toast.show(`Recorded ${rec.name}${ended ? ' — this was the last occurrence' : ''}`);
  };

  const openNew = () => { setShowForm(true); setEditingRecurring(null); setFormData(emptyForm); };

  /* ---- Derived figures ---- */
  const today = startOfToday();
  const rates = useMemo(() => loadManualRates(user?.id), [user?.id, recurring]); // eslint-disable-line react-hooks/exhaustive-deps
  const curOf = (r: RecurringWithDetails) => r.accounts?.currency ?? defaultCurrency;
  const toBase = (r: RecurringWithDetails) =>
    convertManual(Number(r.amount), curOf(r), defaultCurrency, defaultCurrency, rates);
  const monthlyEquivalent = (r: RecurringWithDetails) => toBase(r) * PER_MONTH[r.frequency] / Math.max(1, r.interval_count || 1);

  const active = recurring.filter((r) => r.is_active);
  const paused = recurring.length - active.length;
  const fixedOut = active.filter((r) => r.type === 'expense').reduce((s, r) => s + monthlyEquivalent(r), 0);
  const incomeRows = active.filter((r) => r.type === 'income');
  const recIn = incomeRows.reduce((s, r) => s + monthlyEquivalent(r), 0);

  /** Next occurrence on/after today (rolls forward stale next_dates for display). */
  const nextOf = (r: RecurringWithDetails): Date => {
    let d = parseDay(r.next_date);
    let guard = 0;
    while (d < today && guard++ < 1000) d = advance(d, r);
    return d;
  };
  const isDue = (r: RecurringWithDetails) => r.is_active && parseDay(r.next_date) <= today;

  const nextCharge = active
    .filter((r) => r.type === 'expense')
    .map((r) => ({ r, d: nextOf(r) }))
    .sort((a, b) => a.d.getTime() - b.d.getTime())[0];

  const timeline = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return { d, marks: [] as { kind: 'out' | 'in'; name: string }[] };
    });
    const end = days[29].d.getTime();
    recurring.filter((r) => r.is_active).forEach((r) => {
      let d = nextOf(r);
      let guard = 0;
      while (d.getTime() <= end && guard++ < 60) {
        const idx = Math.round((d.getTime() - today.getTime()) / DAY);
        if (idx >= 0 && idx < 30) days[idx].marks.push({ kind: r.type === 'income' ? 'in' : 'out', name: r.name });
        d = advance(d, r);
      }
    });
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurring, today.getTime()]);

  const amountText = (r: RecurringWithDetails) =>
    r.type === 'income'
      ? formatMoney(Number(r.amount), curOf(r), { sign: true })
      : formatMoney(-Number(r.amount), curOf(r));

  const endLabel = (r: RecurringWithDetails) => {
    if (r.end_type === 'on_date' && r.end_date) return `ends ${shortDate(parseDay(r.end_date))}`;
    if (r.end_type === 'after_occurrences' && r.max_occurrences != null) return `${r.occurrences_count}/${r.max_occurrences} times`;
    return null;
  };

  return (
    <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-7">
      <PageHeader
        className="hidden md:flex"
        description={`${active.length} active · ${paused} paused`}
        actions={<Button variant="secondary" onClick={openNew}><Plus size={16} /> New recurring</Button>}
      />
      <div className="md:hidden flex items-center justify-between gap-3">
        <span className="text-[13px] text-slate-400">{active.length} active · {paused} paused</span>
        <Button variant="secondary" size="sm" onClick={openNew}><Plus size={14} /> New</Button>
      </div>

      {/* KPI strip — 3 cells on web, 2 on phone */}
      <KpiStrip cols={3} className="hidden sm:grid">
        <Kpi label="Fixed costs / month" value={formatMoney(fixedOut, defaultCurrency)} />
        <Kpi
          label="Recurring income / month"
          value={formatMoney(recIn, defaultCurrency)}
          note={incomeRows.length ? incomeRows.slice(0, 2).map((r) => r.name).join(' · ') : 'None scheduled'}
        />
        <Kpi
          label="Next charge"
          value={nextCharge ? shortDate(nextCharge.d) : '—'}
          note={nextCharge ? `${nextCharge.r.name} · ${inDays(nextCharge.d, today)}` : 'No upcoming payments'}
        />
      </KpiStrip>
      <KpiStrip cols={2} className="sm:hidden">
        <Kpi label="Fixed / month" value={formatMoney(fixedOut, defaultCurrency)} />
        <Kpi label="Income / month" value={formatMoney(recIn, defaultCurrency)} />
      </KpiStrip>

      {/* Next 30 days timeline (web) */}
      <section className="hidden md:block">
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className="text-[17px] font-extrabold text-slate-100">Next 30 days</h2>
          <span className="flex gap-3.5 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-blue-500" />Payment</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-slate-100" />Income</span>
          </span>
        </div>
        <div className="grid rule-t rule-b" style={{ gridTemplateColumns: 'repeat(30, minmax(0, 1fr))' }}>
          {timeline.map(({ d, marks }, i) => {
            const showMon = i === 0 || d.getDate() === 1;
            const title = marks.length
              ? `${shortDate(d)}: ${marks.map((m) => m.name).join(', ')}`
              : shortDate(d);
            return (
              <div
                key={i}
                title={title}
                className={cx('h-[72px] border-l border-line pt-1.5 pl-[5px] flex flex-col gap-1 min-w-0', i === 0 && 'bg-slate-100/[0.04]')}
              >
                <span className="text-[10px] font-bold tracking-[0.04em] uppercase text-blue-400 h-3 leading-3">
                  {showMon ? d.toLocaleDateString('en-US', { month: 'short' }) : ''}
                </span>
                <span className="text-xs font-semibold text-slate-100">{d.getDate()}</span>
                <div className="flex gap-0.5 flex-wrap">
                  {marks.map((m, j) => (
                    <span key={j} className={cx('w-2 h-2', m.kind === 'in' ? 'bg-slate-100' : 'bg-blue-500')} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Table */}
      {!loaded ? <ListSkeleton rows={4} /> : recurring.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title="No recurring transactions yet"
          description="Add rent, salary, subscriptions and other scheduled payments."
          action={<Button variant="secondary" onClick={openNew}><Plus size={16} /> New recurring</Button>}
        />
      ) : (
        <section className="rule-t">
          <div
            className="hidden md:grid items-center h-[38px] rule-b t-th"
            style={{ gridTemplateColumns: 'minmax(0,1.5fr) 120px 170px 170px 130px 60px 104px' }}
          >
            <span>Name</span><span>Repeats</span><span>Account</span><span>Next</span>
            <span className="text-right pr-5">Amount</span><span>Active</span><span />
          </div>
          {recurring.map((rec) => {
            const next = nextOf(rec);
            const op = rec.is_active ? 'opacity-100' : 'opacity-45';
            const sub = [rec.payees?.name, rec.categories?.name ?? rec.description, endLabel(rec)].filter(Boolean).join(' · ');
            const due = isDue(rec);
            return (
              <div key={rec.id} className="row-rule">
                {/* web row */}
                <div
                  className="hidden md:grid items-center min-h-[56px] group"
                  style={{ gridTemplateColumns: 'minmax(0,1.5fr) 120px 170px 170px 130px 60px 104px' }}
                >
                  <div className={cx('flex items-center gap-3 min-w-0 transition-opacity', op)}>
                    <Avatar name={rec.name} />
                    <div className="flex flex-col leading-[1.3] min-w-0">
                      <span className="text-sm font-semibold text-slate-100 truncate">{rec.name}</span>
                      {sub && <span className="text-xs text-slate-400 truncate">{sub}</span>}
                    </div>
                  </div>
                  <span className={cx('text-[13px] text-slate-100', op)}>{cadenceLabel(rec.frequency, rec.interval_count)}</span>
                  <span className={cx('text-[13px] text-slate-100 truncate pr-2', op)}>{rec.accounts?.name ?? '—'}</span>
                  <div className={cx('flex flex-col leading-[1.3]', op)}>
                    <span className={cx('text-[13px]', due ? 'text-blue-400 font-semibold' : 'text-slate-100')}>{shortDate(next)}</span>
                    <span className="text-xs text-slate-400">{rec.is_active ? inDays(next, today) : 'Paused'}</span>
                  </div>
                  <span className={cx('text-right pr-5 text-sm tabular-nums text-slate-100', rec.type === 'income' ? 'font-bold' : 'font-normal', op)}>
                    {amountText(rec)}
                  </span>
                  <Switch checked={rec.is_active} onChange={() => handleToggleActive(rec)} label={`${rec.name} active`} />
                  <div className="flex justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                    {due && (
                      <IconButton className="w-8 h-8" onClick={() => handleRecord(rec)} disabled={recording === rec.id} aria-label={`Record ${rec.name}`} title="Record this occurrence">
                        <Check size={14} />
                      </IconButton>
                    )}
                    <IconButton bordered={false} className="w-8 h-8" onClick={() => handleEdit(rec)} aria-label="Edit"><Pencil size={14} /></IconButton>
                    <IconButton bordered={false} className="w-8 h-8 text-red-400" onClick={() => handleDelete(rec.id)} aria-label="Delete"><Trash2 size={14} /></IconButton>
                  </div>
                </div>
                {/* phone row */}
                <div className="md:hidden grid grid-cols-[minmax(0,1fr)_auto_44px] gap-3 items-center min-h-[62px]">
                  <button type="button" onClick={() => handleEdit(rec)} className={cx('flex flex-col leading-[1.3] text-left min-w-0', op)}>
                    <span className="text-[15px] font-semibold text-slate-100 truncate">{rec.name}</span>
                    <span className="text-xs text-slate-400 truncate">
                      {shortDate(next)} · {rec.is_active ? inDays(next, today) : 'Paused'}
                    </span>
                  </button>
                  {due ? (
                    <IconButton className="w-9 h-9" onClick={() => handleRecord(rec)} disabled={recording === rec.id} aria-label={`Record ${rec.name}`}>
                      <Check size={16} />
                    </IconButton>
                  ) : (
                    <span className={cx('text-[15px] tabular-nums text-slate-100', rec.type === 'income' ? 'font-bold' : 'font-normal', op)}>
                      {amountText(rec)}
                    </span>
                  )}
                  <div className="grid place-items-center h-11">
                    <Switch checked={rec.is_active} onChange={() => handleToggleActive(rec)} label={`${rec.name} active`} />
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Form */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditingRecurring(null); }}
        title={editingRecurring ? 'Edit recurring' : 'New recurring'}
        maxWidth="max-w-2xl"
        footer={
          <>
            {editingRecurring && (
              <Button
                variant="danger"
                className="mr-auto"
                onClick={() => { const id = editingRecurring.id; setShowForm(false); setEditingRecurring(null); handleDelete(id); }}
              >
                <Trash2 size={14} /> Delete
              </Button>
            )}
            <Button variant="secondary" type="button" onClick={() => { setShowForm(false); setEditingRecurring(null); }}>Cancel</Button>
            <Button type="submit" form="recurring-form">{editingRecurring ? 'Update' : 'Create'}</Button>
          </>
        }
      >
        <form id="recurring-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div>
              <label className={labelCls}>Name *</label>
              <input required type="text" value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Monthly rent, Netflix" className={fieldCls} />
            </div>

            <div>
              <label className={labelCls}>Type</label>
              <select value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'income' | 'expense' })}
                className={fieldCls}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Amount *</label>
              <input required type="number" step="0.01" value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className={cx(fieldCls, 'tabular-nums')} />
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_84px] gap-2">
              <div>
                <label className={labelCls}>Frequency</label>
                <select value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value as Frequency })}
                  className={fieldCls}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Every</label>
                <input type="number" min={1} step={1} value={formData.interval_count}
                  onChange={(e) => setFormData({ ...formData, interval_count: e.target.value })}
                  className={cx(fieldCls, 'tabular-nums')} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Account *</label>
              <select required value={formData.account_id}
                onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                className={fieldCls}>
                <option value="">Select account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Category</label>
              <select value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                className={fieldCls}>
                <option value="">No category</option>
                {categories.filter((c) => c.type === formData.type).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>{formData.type === 'income' ? 'Payer' : 'Payee'} <span className="text-slate-400">(optional)</span></label>
              <select value={formData.payee_id}
                onChange={(e) => setFormData({ ...formData, payee_id: e.target.value })}
                className={fieldCls}>
                <option value="">None</option>
                {payees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Next date *</label>
              <input required type="date" value={formData.next_date}
                onChange={(e) => setFormData({ ...formData, next_date: e.target.value })}
                className={fieldCls} />
            </div>

            <div className={formData.end_type === 'never' ? '' : 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2'}>
              <div>
                <label className={labelCls}>Ends</label>
                <select value={formData.end_type}
                  onChange={(e) => setFormData({ ...formData, end_type: e.target.value as EndType })}
                  className={fieldCls}>
                  <option value="never">Never</option>
                  <option value="on_date">On a date</option>
                  <option value="after_occurrences">After N times</option>
                </select>
              </div>
              {formData.end_type === 'on_date' && (
                <div>
                  <label className={labelCls}>End date</label>
                  <input required type="date" value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    min={formData.next_date} className={fieldCls} />
                </div>
              )}
              {formData.end_type === 'after_occurrences' && (
                <div>
                  <label className={labelCls}>Occurrences</label>
                  <input required type="number" min={1} step={1} value={formData.max_occurrences}
                    onChange={(e) => setFormData({ ...formData, max_occurrences: e.target.value })}
                    placeholder="e.g. 12" className={cx(fieldCls, 'tabular-nums')} />
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Description</label>
              <input type="text" value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional note" className={fieldCls} />
            </div>

          </div>
        </form>
      </Modal>
    </div>
  );
}
