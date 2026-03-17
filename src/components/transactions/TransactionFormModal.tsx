import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ArrowRight, UserCheck, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Database } from '../../lib/database.types';

type Transaction = Database['public']['Tables']['transactions']['Row'];
type Account = Database['public']['Tables']['accounts']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];
type Tag = Database['public']['Tables']['tags']['Row'];
type Group = Database['public']['Tables']['transaction_groups']['Row'];
type Budget = Database['public']['Tables']['budgets']['Row'];
type Payee = Database['public']['Tables']['payees']['Row'];

function nowForTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const y = get('year');
  const m = get('month');
  const d = get('day');
  const h = get('hour');
  const min = get('minute');

  // datetime-local expects `YYYY-MM-DDTHH:mm`
  return `${y}-${m}-${d}T${h}:${min}`;
}

/* ─── Generic Combobox (search + select) ─────────────────────────────────── */
type ComboboxItem = { id: string; label: string; meta?: string };

function SelectCombobox({
  items,
  value,
  onSelect,
  placeholder,
  icon,
  required,
}: {
  items: ComboboxItem[];
  value: string;
  onSelect: (id: string) => void;
  placeholder: string;
  icon?: React.ReactNode;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = value ? items.find((i) => i.id === value) : undefined;

  useEffect(() => {
    setQuery(selected?.label ?? '');
  }, [selected?.label]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.trim()
    ? items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    : items.slice(0, 10);

  const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-slate-500';

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
            {icon}
          </span>
        )}
        <input
          required={required}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onSelect(''); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={`${inputCls} ${icon ? 'pl-9' : ''} pr-8`}
        />
        {(value || query) && (
          <button
            type="button"
            onClick={() => { setOpen(false); setQuery(''); onSelect(''); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
            aria-label="Clear"
            title="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-[60] w-full mt-1 bg-[#1a2234] border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          {filtered.map((i) => (
            <button
              key={i.id}
              type="button"
              onMouseDown={() => { onSelect(i.id); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-800 transition-colors text-left"
            >
              <span className="text-sm text-slate-200">{i.label}</span>
              {i.meta && <span className="text-[10px] text-slate-500">{i.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface TransactionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Pre-select a transaction type when opening */
  initialType?: 'expense' | 'income' | 'transfer';
  /** Provide to open the form in edit mode */
  editingTransaction?: Transaction | null;
}

/* ─── Payee Combobox ─────────────────────────────────────────────────────── */
interface PayeeComboboxProps {
  payees: Payee[];
  value: string;
  inputValue: string;
  onInputChange: (text: string) => void;
  onSelect: (id: string, name: string) => void;
  onClear: () => void;
}

function PayeeCombobox({ payees, value, inputValue, onInputChange, onSelect, onClear }: PayeeComboboxProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = inputValue.trim()
    ? payees.filter((p) => p.name.toLowerCase().includes(inputValue.toLowerCase()))
    : payees.slice(0, 8);

  const exactMatch = payees.find((p) => p.name.toLowerCase() === inputValue.toLowerCase().trim());
  const showCreate = inputValue.trim() && !exactMatch;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-slate-500';

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <UserCheck size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Search or type payee name…"
          value={inputValue}
          onChange={(e) => { onInputChange(e.target.value); if (value) onClear(); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className={`${inputCls} pl-9 pr-8`}
        />
        {(value || inputValue) && (
          <button type="button" onClick={() => { onClear(); setOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs">
            ✕
          </button>
        )}
      </div>
      {value && (
        <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
          <UserCheck size={10} /> Linked to existing payee
        </p>
      )}
      {!value && inputValue.trim() && (
        <p className="text-[11px] text-amber-400 mt-1">
          ✦ Will auto-create "{inputValue.trim()}" as a new payee on save
        </p>
      )}
      {open && (filtered.length > 0 || showCreate) && (
        <div className="absolute z-[60] w-full mt-1 bg-[#1a2234] border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          {filtered.map((p) => (
            <button key={p.id} type="button"
              onMouseDown={() => { onSelect(p.id, p.name); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-800 transition-colors text-left">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-bold text-blue-400">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-slate-200">{p.name}</span>
              </div>
              {p.category && <span className="text-[10px] text-slate-500 capitalize">{p.category}</span>}
            </button>
          ))}
          {showCreate && (
            <button type="button"
              onMouseDown={() => { onInputChange(inputValue.trim()); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-800 transition-colors border-t border-slate-700/60">
              <span className="text-xs text-amber-400 font-medium">+ Create "{inputValue.trim()}" as new payee</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Modal ─────────────────────────────────────────────────────────── */
export function TransactionFormModal({
  isOpen,
  onClose,
  onSaved,
  initialType = 'expense',
  editingTransaction = null,
}: TransactionFormModalProps) {
  const { user } = useAuth();

  const defaultTimeZone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
      : 'UTC';

  /* ── Loaded data ── */
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState('USD');

  /* ── Form state ── */
  const blankForm = useCallback(() => ({
    account_id: '',
    to_account_id: '',
    category_id: '',
    title: '',
    amount: '',
    type: initialType as 'income' | 'expense' | 'transfer',
    description: '',
    transaction_date: nowForTimeZone(defaultTimeZone),
    timezone: defaultTimeZone,
    notes: '',
  }), [initialType, defaultTimeZone]);

  const [formData, setFormData] = useState(blankForm);
  const [payeeId, setPayeeId] = useState('');
  const [payeeInput, setPayeeInput] = useState('');
  const [payerId, setPayerId] = useState('');
  const [payerInput, setPayerInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [groupId, setGroupId] = useState('');
  const [budgetId, setBudgetId] = useState('');
  const [isSplit, setIsSplit] = useState(false);
    const [splits, setSplits] = useState<
      { title: string; category_id: string; account_id: string; amount: string; description: string }[]
    >([]);
  const [dateTouched, setDateTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Load data when modal opens ── */
  const loadData = useCallback(async () => {
    if (!user || !isOpen) return;

    const [accRes, catRes, tagsRes, groupsRes, budgetsRes, payeesRes, profRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('categories').select('*').eq('user_id', user.id),
      supabase.from('tags').select('*').eq('user_id', user.id),
      supabase.from('transaction_groups').select('*').eq('user_id', user.id),
      supabase.from('budgets').select('*').eq('user_id', user.id).order('name'),
      supabase.from('payees').select('*').eq('user_id', user.id).order('name'),
      supabase.from('profiles').select('default_currency').eq('id', user.id).single(),
    ]);

    if (accRes.data) setAccounts(accRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (tagsRes.data) setTags(tagsRes.data);
    if (groupsRes.data) setGroups(groupsRes.data);
    if (budgetsRes.data) setBudgets(budgetsRes.data);
    if (payeesRes.data) setPayees(payeesRes.data);
    setDisplayCurrency(profRes.data?.default_currency ?? 'USD');
  }, [user, isOpen]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Populate form when editing ── */
  useEffect(() => {
    if (!isOpen) return;
    if (editingTransaction) {
      setFormData({
        account_id: editingTransaction.account_id,
        to_account_id: '',
        category_id: editingTransaction.category_id || '',
        title: editingTransaction.title || '',
        amount: editingTransaction.amount.toString(),
        type: editingTransaction.type as 'income' | 'expense' | 'transfer',
        description: editingTransaction.description || '',
        transaction_date: editingTransaction.transaction_date
          ? new Date(editingTransaction.transaction_date).toISOString().slice(0, 16)
          : new Date().toISOString().slice(0, 16),
        timezone: editingTransaction.timezone || defaultTimeZone,
        notes: editingTransaction.notes || '',
      });
      if (editingTransaction.payee_id) {
        setPayeeId(editingTransaction.payee_id);
        // Name resolved once payees load
      }
      if (editingTransaction.payer_id) {
        setPayerId(editingTransaction.payer_id);
        // Name resolved once payees load
      }
      setSelectedTags(editingTransaction.tags || []);
      setGroupId(editingTransaction.group_id || '');
      setBudgetId(editingTransaction.budget_id || '');
    } else {
      setFormData(blankForm());
      setPayeeId('');
      setPayeeInput('');
      setPayerId('');
      setPayerInput('');
      setSelectedTags([]);
      setGroupId('');
      setBudgetId('');
      setIsSplit(false);
      setSplits([]);
    }
    setDateTouched(false);
    setError(null);
  }, [isOpen, editingTransaction, blankForm, defaultTimeZone]);

  // When opening a NEW transaction form, ensure it shows "now" in the selected timezone
  useEffect(() => {
    if (!isOpen) return;
    if (editingTransaction) return;
    setFormData((prev) => ({
      ...prev,
      transaction_date: nowForTimeZone(prev.timezone || defaultTimeZone),
    }));
  }, [isOpen, editingTransaction, defaultTimeZone]);

  // Resolve payee name once payees list loads when editing
  useEffect(() => {
    if (payeeId && payees.length > 0) {
      const p = payees.find((px) => px.id === payeeId);
      if (p) setPayeeInput(p.name);
    }
  }, [payeeId, payees]);

  // Resolve payer name once payees list loads when editing
  useEffect(() => {
    if (payerId && payees.length > 0) {
      const p = payees.find((px) => px.id === payerId);
      if (p) setPayerInput(p.name);
    }
  }, [payerId, payees]);

  /* ── Resolve / auto-create payee ── */
  const resolvePayee = async (): Promise<string | null> => {
    if (!user) return null;
    if (payeeId) return payeeId;
    if (!payeeInput.trim()) return null;
    const existing = payees.find((p) => p.name.toLowerCase() === payeeInput.trim().toLowerCase());
    if (existing) return existing.id;
    const { data } = await supabase
      .from('payees')
      .insert({ user_id: user.id, name: payeeInput.trim() })
      .select('id')
      .single();
    return data?.id ?? null;
  };

  const resolvePayer = async (): Promise<string | null> => {
    if (!user) return null;
    if (payerId) return payerId;
    if (!payerInput.trim()) return null;
    const existing = payees.find((p) => p.name.toLowerCase() === payerInput.trim().toLowerCase());
    if (existing) return existing.id;
    const { data } = await supabase
      .from('payees')
      .insert({ user_id: user.id, name: payerInput.trim() })
      .select('id')
      .single();
    return data?.id ?? null;
  };

  /* ── Submit ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);

    const resolvedPayeeId = formData.type === 'expense' ? await resolvePayee() : null;
    const resolvedPayerId = formData.type === 'income' ? await resolvePayer() : null;

    // Helper to pick a sensible currency for a given account
    const getCurrencyForAccount = (accountId: string | undefined | null) => {
      if (!accountId) return displayCurrency || 'USD';
      const acc = accounts.find((a) => a.id === accountId);
      return acc?.currency || displayCurrency || 'USD';
    };

    if (formData.type === 'transfer') {
      const amount = parseFloat(formData.amount);
      const fromAccount = accounts.find((a) => a.id === formData.account_id);
      const toAccount = accounts.find((a) => a.id === formData.to_account_id);
      const baseDescription = formData.description || 'Account transfer';

      const { error: err } = await supabase.from('transactions').insert([
        {
          user_id: user.id,
          account_id: formData.account_id,
          category_id: null,
          amount,
          type: 'expense',
          title: formData.title || 'Transfer',
          description: baseDescription + (toAccount ? ` (to ${toAccount.name})` : ''),
          transaction_date: formData.transaction_date,
          timezone: formData.timezone,
          currency: getCurrencyForAccount(formData.account_id),
          tags: selectedTags,
          group_id: groupId || null,
          notes: formData.notes || null,
        },
        {
          user_id: user.id,
          account_id: formData.to_account_id,
          category_id: null,
          amount,
          type: 'income',
          title: formData.title || 'Transfer',
          description: baseDescription + (fromAccount ? ` (from ${fromAccount.name})` : ''),
          transaction_date: formData.transaction_date,
          timezone: formData.timezone,
          currency: getCurrencyForAccount(formData.to_account_id),
          tags: selectedTags,
          group_id: groupId || null,
          notes: formData.notes || null,
        },
      ]);
      if (err) { setError(err.message); setSubmitting(false); return; }

    } else if (isSplit && splits.length > 0) {
      const mainTitle = formData.title || 'Split';
      const payload = splits
        .filter((s) => s.amount)
        .map((s) => {
          const splitTitle = s.title?.trim();
          const title = splitTitle ? `${mainTitle}: ${splitTitle}` : mainTitle;
          const accountId = s.account_id || formData.account_id;
          return {
            user_id: user.id,
            account_id: accountId,
            category_id: s.category_id || null,
            payee_id: formData.type === 'expense' ? resolvedPayeeId : null,
            payer_id: formData.type === 'income' ? resolvedPayerId : null,
            amount: parseFloat(s.amount),
            type: formData.type === 'income' ? 'income' as const : 'expense' as const,
            title,
            description: s.description || formData.description,
            transaction_date: formData.transaction_date,
            timezone: formData.timezone,
            currency: getCurrencyForAccount(accountId),
            notes: formData.notes || null,
            tags: selectedTags,
            group_id: groupId || null,
          };
        });
      if (payload.length > 0) {
        const { error: err } = await supabase.from('transactions').insert(payload);
        if (err) { setError(err.message); setSubmitting(false); return; }
      }
    } else {
      const transactionData = {
        user_id: user.id,
        account_id: formData.account_id,
        category_id: formData.category_id || null,
        budget_id: formData.type === 'expense' ? (budgetId || null) : null,
        payee_id: resolvedPayeeId,
        payer_id: resolvedPayerId,
        amount: parseFloat(formData.amount),
        type: formData.type,
        title: formData.title,
        description: formData.description,
        transaction_date: formData.transaction_date,
        timezone: formData.timezone,
        currency: getCurrencyForAccount(formData.account_id),
        notes: formData.notes,
        tags: selectedTags,
        group_id: groupId || null,
      };

      const { error: err } = editingTransaction
        ? await supabase.from('transactions').update(transactionData).eq('id', editingTransaction.id)
        : await supabase.from('transactions').insert(transactionData);

      if (err) { setError(err.message); setSubmitting(false); return; }
    }

    setSubmitting(false);
    onSaved();
    onClose();
  };

  const splitTotal = splits.reduce((s, sp) => s + (sp.amount ? parseFloat(sp.amount) : 0), 0);

  const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-slate-500';
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#141927] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <h3 className="text-base font-semibold text-slate-100">
            {editingTransaction ? 'Edit Transaction' : 'New Transaction'}
          </h3>
          <button type="button" onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-700/80 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-xs mb-4">{error}</div>
          )}

          <form id="txn-form" onSubmit={handleSubmit} className="space-y-5">

            {/* Type selector */}
            <div className="flex items-center gap-2">
              {(['expense', 'income', 'transfer'] as const).map((t) => (
                <button key={t} type="button"
                  onClick={() => {
                    setFormData((f) => ({ ...f, type: t }));
                    setPayeeId(''); setPayeeInput('');
                    setPayerId(''); setPayerInput('');
                  }}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize border transition-all ${
                    formData.type === t
                      ? t === 'income' ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                        : t === 'transfer' ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                        : 'bg-red-600/20 border-red-500/50 text-red-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}>
                  {t}
                </button>
              ))}
            </div>

            {/* Source → Destination */}
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/60">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
                {formData.type === 'transfer' ? 'Transfer Route' : 'Payment Route'}
              </p>
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <label className={labelCls}>
                    {formData.type === 'income' ? 'Into Account' : 'From Account (Source)'}
                  </label>
                  <SelectCombobox
                    required
                    items={accounts.map((a) => ({
                      id: a.id,
                      label: a.name,
                      meta: a.type.replace('_', ' '),
                    }))}
                    value={formData.account_id}
                    onSelect={(id) => setFormData((f) => ({ ...f, account_id: id }))}
                    placeholder="Select account…"
                  />
                </div>

                <div className="flex flex-col items-center gap-0.5 shrink-0 pt-6">
                  <ArrowRight size={18} className="text-slate-600" />
                </div>

                <div className="flex-1">
                  {formData.type === 'transfer' ? (
                    <>
                      <label className={labelCls}>To Account (Destination)</label>
                      <SelectCombobox
                        required
                        items={accounts
                          .filter((a) => a.id !== formData.account_id)
                          .map((a) => ({
                            id: a.id,
                            label: a.name,
                            meta: a.type.replace('_', ' '),
                          }))}
                        value={formData.to_account_id}
                        onSelect={(id) => setFormData((f) => ({ ...f, to_account_id: id }))}
                        placeholder="Select account…"
                      />
                    </>
                  ) : formData.type === 'expense' ? (
                    <>
                      <label className={labelCls}>Payee / Destination <span className="text-slate-600 font-normal">(optional)</span></label>
                      <PayeeCombobox
                        payees={payees}
                        value={payeeId}
                        inputValue={payeeInput}
                        onInputChange={(txt) => { setPayeeInput(txt); setPayeeId(''); }}
                        onSelect={(id, name) => { setPayeeId(id); setPayeeInput(name); }}
                        onClear={() => { setPayeeId(''); setPayeeInput(''); }}
                      />
                    </>
                  ) : (
                    <>
                      <label className={labelCls}>Payer / Source <span className="text-slate-600 font-normal">(optional)</span></label>
                      <PayeeCombobox
                        payees={payees}
                        value={payerId}
                        inputValue={payerInput}
                        onInputChange={(txt) => { setPayerInput(txt); setPayerId(''); }}
                        onSelect={(id, name) => { setPayerId(id); setPayerInput(name); }}
                        onClear={() => { setPayerId(''); setPayerInput(''); }}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Core fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Title</label>
                <input required type="text" value={formData.title}
                  onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Grocery run" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Amount</label>
                <input required type="number" step="0.01" min="0.01" value={formData.amount}
                  onChange={(e) => setFormData((f) => ({ ...f, amount: e.target.value }))}
                  className={inputCls} />
              </div>

              {formData.type !== 'transfer' && (
                <div>
                  <label className={labelCls}>Category</label>
                  <SelectCombobox
                    items={categories
                      .filter((c) => (formData.type === 'expense' ? c.type === 'expense' : c.type === 'income'))
                      .map((c) => ({ id: c.id, label: c.name }))}
                    value={formData.category_id}
                    onSelect={(id) => setFormData((f) => ({ ...f, category_id: id }))}
                    placeholder="Search category…"
                  />
                </div>
              )}

              {formData.type === 'expense' && (
                <div>
                  <label className={labelCls}>Budget <span className="text-slate-600 font-normal">(optional)</span></label>
                  <SelectCombobox
                    items={budgets.map((b) => ({ id: b.id, label: b.name, meta: b.period }))}
                    value={budgetId}
                    onSelect={(id) => setBudgetId(id)}
                    placeholder="Search budget…"
                  />
                </div>
              )}

              <div>
                <label className={labelCls}>Date &amp; Time</label>
                <input required type="datetime-local" value={formData.transaction_date}
                  onChange={(e) => {
                    setDateTouched(true);
                    setFormData((f) => ({ ...f, transaction_date: e.target.value }));
                  }}
                  className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Timezone</label>
                <select value={formData.timezone}
                  onChange={(e) => {
                    const tz = e.target.value;
                    setFormData((f) => ({
                      ...f,
                      timezone: tz,
                      transaction_date: dateTouched || editingTransaction
                        ? f.transaction_date
                        : nowForTimeZone(tz),
                    }));
                  }}
                  className={inputCls}>
                  <option value="UTC">UTC</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Europe/Berlin">Europe/Berlin</option>
                  <option value="Asia/Dhaka">Asia/Dhaka</option>
                  <option value="Asia/Kolkata">Asia/Kolkata</option>
                  <option value="Asia/Singapore">Asia/Singapore</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                </select>
              </div>

              {formData.type !== 'transfer' && formData.type !== 'income' && (
                <div>
                  <label className={labelCls}>Description</label>
                  <input type="text" value={formData.description}
                    onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                    className={inputCls} placeholder="Optional description" />
                </div>
              )}

              <div>
                <label className={labelCls}>Group <span className="text-slate-600 font-normal">(optional)</span></label>
                <SelectCombobox
                  items={groups.map((g) => ({ id: g.id, label: g.name }))}
                  value={groupId}
                  onSelect={(id) => setGroupId(id)}
                  placeholder="Search group…"
                />
              </div>

              {/* Tags */}
              <div className="md:col-span-2">
                <label className={labelCls}>Tags</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {tags.map((tag) => (
                    <button key={tag.id} type="button"
                      onClick={() => setSelectedTags((prev) =>
                        prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                      )}
                      className={`px-2 py-1 rounded-full text-xs border transition-colors ${
                        selectedTags.includes(tag.id)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                      }`}>
                      {tag.name}
                    </button>
                  ))}
                  {tags.length === 0 && <span className="text-xs text-slate-600">No tags yet.</span>}
                </div>
              </div>

              {/* Split toggle */}
              {formData.type !== 'transfer' && (
                <div className="md:col-span-2 flex items-center gap-2">
                  <input id="split-toggle-modal" type="checkbox" checked={isSplit}
                    onChange={(e) => {
                      setIsSplit(e.target.checked);
                      if (e.target.checked && splits.length === 0) {
                        setSplits([
                          { title: '', category_id: formData.category_id, account_id: formData.account_id, amount: '', description: '' },
                          { title: '', category_id: formData.category_id, account_id: formData.account_id, amount: '', description: '' },
                        ]);
                      }
                    }}
                    className="rounded border-slate-600 text-blue-600 focus:ring-blue-500" />
                  <label htmlFor="split-toggle-modal" className="text-sm text-slate-300">Split this transaction</label>
                </div>
              )}
            </div>

            {/* Split rows */}
            {isSplit && formData.type !== 'transfer' && (
              <div className="space-y-3 border-t border-slate-800/60 pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-slate-100">Splits</h4>
                  <button type="button"
                    onClick={() => setSplits((p) => [...p, { title: '', category_id: '', amount: '', description: '' }])}
                    className="text-xs text-blue-400 hover:text-blue-300">+ Add split</button>
                </div>
                {splits.map((split, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={split.amount}
                        onChange={(e) =>
                          setSplits((p) =>
                            p.map((s, idx) => (idx === i ? { ...s, amount: e.target.value } : s))
                          )
                        }
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Destination Account</label>
                      <SelectCombobox
                        items={accounts.map((a) => ({
                          id: a.id,
                          label: a.name,
                          meta: a.type.replace('_', ' '),
                        }))}
                        value={split.account_id || formData.account_id}
                        onSelect={(id) =>
                          setSplits((p) =>
                            p.map((s, idx) => (idx === i ? { ...s, account_id: id } : s))
                          )
                        }
                        placeholder="Select account…"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                      <select
                        value={split.category_id}
                        onChange={(e) =>
                          setSplits((p) =>
                            p.map((s, idx) => (idx === i ? { ...s, category_id: e.target.value } : s))
                          )
                        }
                        className={inputCls}
                      >
                        <option value="">No category</option>
                        {categories
                          .filter((c) => c.type === formData.type || c.type === 'expense')
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Title</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Title"
                          value={split.title}
                          onChange={(e) =>
                            setSplits((p) =>
                              p.map((s, idx) => (idx === i ? { ...s, title: e.target.value } : s))
                            )
                          }
                          className={`${inputCls} pr-10`}
                        />
                        {splits.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setSplits((p) => p.filter((_, idx) => idx !== i))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            aria-label="Remove split"
                            title="Remove split"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Split total: {displayCurrency} {splitTotal.toFixed(2)}{formData.amount && ` / ${displayCurrency} ${Number(formData.amount).toFixed(2)}`}</span>
                  {formData.amount && Math.abs(splitTotal - Number(formData.amount)) > 0.001 && (
                    <span className="text-red-400">Split total doesn't match amount</span>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className={labelCls}>Notes</label>
              <textarea value={formData.notes}
                onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                className={inputCls} rows={2} />
            </div>

          </form>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl border border-slate-700/60 transition-all">
            Cancel
          </button>
          <button type="submit" form="txn-form" disabled={submitting}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {submitting ? 'Saving…' : editingTransaction ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
