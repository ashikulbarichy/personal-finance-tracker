import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Check, ChevronDown, Plus, Camera } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useUserPrefs } from '../../contexts/UserPrefsContext';
import { nowInTZ, tzLocalToUTC, utcToLocalInput } from '../../lib/dateUtils';
import { currencySymbol, formatMoney } from '../../lib/money';
import { loadManualRates } from '../../lib/manualRates';
import { compressImage, mediaPath, removeImages, signedUrl, uploadImage } from '../../lib/media';
import { markFresh } from '../../lib/fresh';
import { Badge, Button, IconButton, SegmentedControl, cx, fieldCls, labelCls, useToast } from '../ui';
import type { Database } from '../../lib/database.types';

const popCls = 'absolute z-[80] w-full mt-1 bg-app border border-line-strong shadow-ds-md p-1 max-h-[260px] overflow-auto';
const optCls = 'w-full flex items-center justify-between gap-2 px-2 py-[7px] text-left text-sm text-slate-100 hover:bg-slate-100/[0.07] transition-colors';

type Transaction = Database['public']['Tables']['transactions']['Row'];
type Account = Database['public']['Tables']['accounts']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];
type Payee = Database['public']['Tables']['payees']['Row'];

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

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        {icon && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {icon}
          </span>
        )}
        <input
          required={required}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onSelect(''); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={cx(fieldCls, !!icon && 'pl-9', 'pr-8')}
        />
        {(value || query) && (
          <button
            type="button"
            onClick={() => { setOpen(false); setQuery(''); onSelect(''); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center text-slate-400 hover:text-slate-100"
            aria-label="Clear"
            title="Clear"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className={popCls}>
          {filtered.map((i) => (
            <button
              key={i.id}
              type="button"
              onMouseDown={() => { onSelect(i.id); setOpen(false); }}
              className={cx(optCls, i.id === value && 'bg-slate-100/[0.04]')}
            >
              <span className="truncate">{i.label}</span>
              {i.meta && <span className="text-xs text-slate-400 capitalize shrink-0">{i.meta}</span>}
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
  /** Provide to open the form in edit mode for a regular transaction */
  editingTransaction?: Transaction | null;
  /** Provide to open the form in edit mode for a transfer pair */
  editingTransfer?: { fromLeg: Transaction; toLeg: Transaction } | null;
  /** New transfer: pre-select the destination (e.g. pay a card, fund an investment). */
  initialToAccountId?: string;
  /** New transaction: pre-fill the title. */
  initialTitle?: string;
}

/* ─── Payee Combobox ─────────────────────────────────────────────────────── */
interface PayeeComboboxProps {
  payees: Payee[];
  value: string;
  inputValue: string;
  onInputChange: (text: string) => void;
  onSelect: (id: string, name: string) => void;
  onClear: () => void;
  placeholder?: string;
}

function PayeeCombobox({ payees, value, inputValue, onInputChange, onSelect, onClear, placeholder = 'Who was it?' }: PayeeComboboxProps) {
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

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => { onInputChange(e.target.value); if (value) onClear(); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className={cx(fieldCls, 'pr-8')}
        />
        {(value || inputValue) && (
          <button type="button" onClick={() => { onClear(); setOpen(false); }} aria-label="Clear"
            className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center text-slate-400 hover:text-slate-100">
            <X size={14} />
          </button>
        )}
      </div>
      {value && (
        <p className="text-xs text-slate-300 mt-1 flex items-center gap-1.5">
          <Check size={12} /> Linked to existing payee
        </p>
      )}
      {!value && inputValue.trim() && (
        <p className="text-xs text-slate-400 mt-1 truncate">
          New payee “{inputValue.trim()}” will be created on save
        </p>
      )}
      {open && (filtered.length > 0 || showCreate) && (
        <div className={popCls}>
          {filtered.map((p) => (
            <button key={p.id} type="button"
              onMouseDown={() => { onSelect(p.id, p.name); setOpen(false); }}
              className={optCls}>
              <span className="flex items-center gap-2 min-w-0">
                <span className="avatar-sq" style={{ width: 22, height: 22, fontSize: 10 }}>{p.name.charAt(0).toUpperCase()}</span>
                <span className="truncate">{p.name}</span>
              </span>
            </button>
          ))}
          {showCreate && (
            <button type="button"
              onMouseDown={() => { onInputChange(inputValue.trim()); setOpen(false); }}
              className={cx(optCls, 'justify-start border-t border-line mt-1 pt-2 text-blue-400 font-semibold')}>
              <Plus size={14} /> Create “{inputValue.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Receipt photo picker ─────────────────────────────────────────────────── */
function ReceiptField({ preview, onPick, onRemove }: { preview: string | null; onPick: (f: File) => void; onRemove: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className={labelCls}>Receipt <span className="text-slate-400">(optional)</span></label>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }}
      />
      {preview ? (
        <div className="flex items-center gap-3 anim-fade">
          <a href={preview} target="_blank" rel="noreferrer" className="block w-16 h-16 shrink-0 bg-slate-900 border border-line-strong overflow-hidden" title="Open full size">
            <img src={preview} alt="Receipt" className="w-full h-full object-cover" />
          </a>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => input.current?.click()}>Replace</Button>
            <Button size="sm" variant="danger" onClick={onRemove}>Remove</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="w-full h-11 flex items-center gap-2.5 px-3 border border-dashed border-slate-500 text-sm text-slate-300 hover:border-slate-100 hover:text-slate-100 transition-colors"
        >
          <Camera size={16} /> Take or choose a photo
        </button>
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
  editingTransfer = null,
  initialToAccountId = '',
  initialTitle = '',
}: TransactionFormModalProps) {
  const { user } = useAuth();

  const { timezone: profileTimezone } = useUserPrefs();
  const defaultTimeZone = profileTimezone;

  /* ── Loaded data ── */
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState('USD');

  /* ── Form state ── */
  const blankForm = useCallback(() => ({
    account_id: '',
    to_account_id: initialToAccountId,
    category_id: '',
    title: initialTitle,
    amount: '',
    charge_amount: '',
    type: initialType as 'income' | 'expense' | 'transfer',
    description: '',
    transaction_date: nowInTZ(defaultTimeZone),
    timezone: defaultTimeZone,
    notes: '',
  }), [initialType, defaultTimeZone, initialToAccountId, initialTitle]);

  const [formData, setFormData] = useState(blankForm);
  const [payeeId, setPayeeId] = useState('');
  const [payeeInput, setPayeeInput] = useState('');
  const [payerId, setPayerId] = useState('');
  const [payerInput, setPayerInput] = useState('');
  const [isSplit, setIsSplit] = useState(false);
    const [splits, setSplits] = useState<
      { title: string; category_id: string; account_id: string; amount: string; description: string }[]
    >([]);
  const [dateTouched, setDateTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keepOpen, setKeepOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  /* ── Receipt photo: a new file to upload, or the saved one (path) ── */
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [existingReceipt, setExistingReceipt] = useState<string | null>(null);
  const [receiptRemoved, setReceiptRemoved] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const path = editingTransaction?.receipt_path ?? null;
    setReceiptFile(null);
    setReceiptRemoved(false);
    setExistingReceipt(path);
    setReceiptPreview(null);
    let live = true;
    if (path) signedUrl(path).then((u) => live && setReceiptPreview(u));
    return () => { live = false; };
  }, [isOpen, editingTransaction]);

  // Free the local preview URL when it's replaced.
  useEffect(() => () => { if (receiptPreview?.startsWith('blob:')) URL.revokeObjectURL(receiptPreview); }, [receiptPreview]);

  const pickReceipt = (f: File) => { setReceiptFile(f); setReceiptRemoved(false); setReceiptPreview(URL.createObjectURL(f)); };
  const clearReceipt = () => { setReceiptFile(null); setReceiptPreview(null); setReceiptRemoved(true); };

  /* Esc closes; focus the amount when a new form opens */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      if (!editingTransaction && !editingTransfer && window.matchMedia('(min-width: 768px)').matches) amountRef.current?.focus();
    }, 60);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(t); };
  }, [isOpen, onClose, editingTransaction, editingTransfer]);

  /* ── Exchange rate override ──
   * Suggested rate comes from the user's own manual rates (Currencies page):
   * rates[code] = "1 unit of `code` = this many units of the default
   * currency" — exactly the pivot displayCurrency already is here, so no
   * conversion is needed. `customRate` lets them override it per-transaction. */
  const [customRate, setCustomRate] = useState('');
  const manualRates = useMemo(() => loadManualRates(user?.id), [user]);

  /* ── Load data when modal opens ── */
  const loadData = useCallback(async () => {
    if (!user || !isOpen) return;

    const [accRes, catRes, payeesRes, profRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('categories').select('*').eq('user_id', user.id),
      supabase.from('payees').select('*').eq('user_id', user.id).order('name'),
      supabase.from('profiles').select('default_currency').eq('id', user.id).single(),
    ]);

    if (accRes.data) setAccounts(accRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (payeesRes.data) setPayees(payeesRes.data);
    setDisplayCurrency(profRes.data?.default_currency ?? 'USD');
  }, [user, isOpen]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Populate form when editing ── */
  useEffect(() => {
    if (!isOpen) return;

    if (editingTransfer) {
      const { fromLeg } = editingTransfer;
      setFormData({
        account_id: editingTransfer.fromLeg.account_id,
        to_account_id: editingTransfer.toLeg.account_id,
        category_id: '',
        title: fromLeg.title || '',
        amount: fromLeg.amount.toString(),
        charge_amount: fromLeg.charge_amount != null ? String(fromLeg.charge_amount) : '',
        type: 'transfer',
        description: '',
        transaction_date: fromLeg.transaction_date
          ? utcToLocalInput(fromLeg.transaction_date, fromLeg.timezone || defaultTimeZone)
          : nowInTZ(defaultTimeZone),
        timezone: fromLeg.timezone || defaultTimeZone,
        notes: fromLeg.notes || '',
      });
      setPayeeId(''); setPayeeInput('');
      setPayerId(''); setPayerInput('');
      setIsSplit(false); setSplits([]);
      setCustomRate(fromLeg.custom_rate != null ? String(fromLeg.custom_rate) : '');

    } else if (editingTransaction) {
      setFormData({
        account_id: editingTransaction.account_id,
        to_account_id: '',
        category_id: editingTransaction.category_id || '',
        title: editingTransaction.title || '',
        amount: editingTransaction.amount.toString(),
        charge_amount: editingTransaction.charge_amount != null ? String(editingTransaction.charge_amount) : '',
        type: editingTransaction.type as 'income' | 'expense' | 'transfer',
        description: editingTransaction.description || '',
        transaction_date: editingTransaction.transaction_date
          ? utcToLocalInput(editingTransaction.transaction_date, editingTransaction.timezone || defaultTimeZone)
          : nowInTZ(defaultTimeZone),
        timezone: editingTransaction.timezone || defaultTimeZone,
        notes: editingTransaction.notes || '',
      });
      if (editingTransaction.payee_id) {
        setPayeeId(editingTransaction.payee_id);
      }
      if (editingTransaction.payer_id) {
        setPayerId(editingTransaction.payer_id);
      }
      setCustomRate(editingTransaction.custom_rate != null ? String(editingTransaction.custom_rate) : '');

    } else {
      setFormData(blankForm());
      setPayeeId('');
      setPayeeInput('');
      setPayerId('');
      setPayerInput('');
      setIsSplit(false);
      setSplits([]);
      setCustomRate('');
    }
    setDateTouched(false);
    setError(null);
    const src = editingTransfer?.fromLeg ?? editingTransaction;
    setMoreOpen(!!src && (
      Number(src.charge_amount ?? 0) > 0 || src.custom_rate != null ||
      (!!src.timezone && src.timezone !== defaultTimeZone)
    ));
  }, [isOpen, editingTransaction, editingTransfer, blankForm, defaultTimeZone]);

  // When opening a NEW transaction form, ensure it shows "now" in the selected timezone
  useEffect(() => {
    if (!isOpen) return;
    if (editingTransaction || editingTransfer) return;
    setFormData((prev) => ({
      ...prev,
      transaction_date: nowInTZ(prev.timezone || defaultTimeZone),
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
    let savedIds: string[] = [];

    const resolvedPayeeId = formData.type === 'expense' ? await resolvePayee() : null;
    const resolvedPayerId = formData.type === 'income' ? await resolvePayer() : null;

    // Helper to pick a sensible currency for a given account
    const getCurrencyForAccount = (accountId: string | undefined | null) => {
      if (!accountId) return displayCurrency || 'USD';
      const acc = accounts.find((a) => a.id === accountId);
      return acc?.currency || displayCurrency || 'USD';
    };

    const parsedCustomRate = customRate.trim() !== '' ? parseFloat(customRate) : null;
    const parsedChargeAmount = formData.charge_amount.trim() !== '' ? parseFloat(formData.charge_amount) : null;

    // Convert the datetime-local string from the user's timezone to a proper UTC ISO string.
    // Without this, Postgres interprets the bare datetime as UTC, causing a day shift.
    const utcTransactionDate = tzLocalToUTC(
      formData.transaction_date,
      formData.timezone || defaultTimeZone,
    );

    if (formData.type === 'transfer') {
      const amount = parseFloat(formData.amount);
      const fromAccount = accounts.find((a) => a.id === formData.account_id);
      const toAccount = accounts.find((a) => a.id === formData.to_account_id);
      const title = formData.title || 'Transfer';

      if (editingTransfer) {
        // UPDATE both existing legs
        const [r1, r2] = await Promise.all([
          supabase.from('transactions').update({
            account_id: formData.account_id,
            amount,
            title,
            description: `Account transfer${toAccount ? ` (to ${toAccount.name})` : ''}`,
            transaction_date: utcTransactionDate,
            timezone: formData.timezone,
            currency: getCurrencyForAccount(formData.account_id),
            custom_rate: parsedCustomRate,
            charge_amount: parsedChargeAmount,
            notes: formData.notes || null,
          }).eq('id', editingTransfer.fromLeg.id),
          supabase.from('transactions').update({
            account_id: formData.to_account_id,
            amount,
            title,
            description: `Account transfer${fromAccount ? ` (from ${fromAccount.name})` : ''}`,
            transaction_date: utcTransactionDate,
            timezone: formData.timezone,
            currency: getCurrencyForAccount(formData.to_account_id),
            custom_rate: parsedCustomRate,
            charge_amount: parsedChargeAmount,
            notes: formData.notes || null,
          }).eq('id', editingTransfer.toLeg.id),
        ]);
        if (r1.error || r2.error) {
          setError(r1.error?.message || r2.error?.message || 'Update failed');
          setSubmitting(false);
          return;
        }
        savedIds = [editingTransfer.fromLeg.id, editingTransfer.toLeg.id];
      } else {
        // INSERT new transfer pair
        const transferPairId = crypto.randomUUID();
        const { data: ins, error: err } = await supabase.from('transactions').insert([
          {
            user_id: user.id,
            account_id: formData.account_id,
            category_id: null,
            amount,
            type: 'expense',
            title,
            description: `Account transfer${toAccount ? ` (to ${toAccount.name})` : ''}`,
            transaction_date: utcTransactionDate,
            timezone: formData.timezone,
            currency: getCurrencyForAccount(formData.account_id),
            custom_rate: parsedCustomRate,
            charge_amount: parsedChargeAmount,
            transfer_pair_id: transferPairId,
            notes: formData.notes || null,
          },
          {
            user_id: user.id,
            account_id: formData.to_account_id,
            category_id: null,
            amount,
            type: 'income',
            title,
            description: `Account transfer${fromAccount ? ` (from ${fromAccount.name})` : ''}`,
            transaction_date: utcTransactionDate,
            timezone: formData.timezone,
            currency: getCurrencyForAccount(formData.to_account_id),
            custom_rate: parsedCustomRate,
            charge_amount: parsedChargeAmount,
            transfer_pair_id: transferPairId,
            notes: formData.notes || null,
          },
        ]).select('id');
        if (err) { setError(err.message); setSubmitting(false); return; }
        savedIds = (ins ?? []).map((r) => r.id);

        // Investments: money moved in/out changes what they're worth too, so
        // the gain (worth − put in) isn't distorted until the next revaluation.
        const bump = async (acc: Account | undefined, delta: number) => {
          if (acc?.type !== 'investment' || acc.current_value == null) return;
          await supabase.from('accounts').update({ current_value: Math.max(0, Number(acc.current_value) + delta) }).eq('id', acc.id);
        };
        await Promise.all([bump(toAccount, amount), bump(fromAccount, -amount)]);
      }

    } else if (isSplit && splits.length > 0) {
      const mainTitle = formData.title || 'Split';
      const splitGroupId = crypto.randomUUID();
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
            transaction_date: utcTransactionDate,
            timezone: formData.timezone,
            currency: getCurrencyForAccount(accountId),
            custom_rate: parsedCustomRate,
            charge_amount: parsedChargeAmount,
            notes: formData.notes || null,
            split_group_id: splitGroupId,
          };
        });
      if (payload.length > 0) {
        const { data: ins, error: err } = await supabase.from('transactions').insert(payload).select('id');
        if (err) { setError(err.message); setSubmitting(false); return; }
        savedIds = (ins ?? []).map((r) => r.id);
      }
    } else {
      const transactionData = {
        user_id: user.id,
        account_id: formData.account_id,
        category_id: formData.category_id || null,
        payee_id: resolvedPayeeId,
        payer_id: resolvedPayerId,
        amount: parseFloat(formData.amount),
        type: formData.type,
        // Title is optional in the redesigned form: fall back to payee → category → type
        title: formData.title.trim()
          || (formData.type === 'expense' ? payeeInput.trim() : payerInput.trim())
          || categories.find((c) => c.id === formData.category_id)?.name
          || (formData.type === 'income' ? 'Income' : 'Expense'),
        description: formData.description,
        transaction_date: utcTransactionDate,
        timezone: formData.timezone,
        currency: getCurrencyForAccount(formData.account_id),
        custom_rate: parsedCustomRate,
        charge_amount: parsedChargeAmount,
        notes: formData.notes,
      };

      if (editingTransaction) {
        const { error: err } = await supabase.from('transactions').update(transactionData).eq('id', editingTransaction.id);
        if (err) { setError(err.message); setSubmitting(false); return; }
        savedIds = [editingTransaction.id];
      } else {
        const { data: ins, error: err } = await supabase.from('transactions').insert(transactionData).select('id').single();
        if (err) { setError(err.message); setSubmitting(false); return; }
        savedIds = ins ? [ins.id] : [];
      }
    }

    /* Receipt: upload after the row exists (the path is keyed by its id).
     * A failed upload doesn't undo the save — it just says so. */
    let receiptNote = '';
    if (formData.type !== 'transfer' && savedIds.length) {
      if (receiptFile) {
        const blob = await compressImage(receiptFile, 1600, 0.8);
        const path = mediaPath(user.id, 'receipts', savedIds[0]);
        const { error: upErr } = await uploadImage(path, blob);
        if (upErr) receiptNote = ` — receipt not attached: ${upErr}`;
        else {
          await supabase.from('transactions').update({ receipt_path: path }).in('id', savedIds);
          if (existingReceipt) removeImages([existingReceipt]);
        }
      } else if (receiptRemoved && existingReceipt) {
        await supabase.from('transactions').update({ receipt_path: null }).in('id', savedIds);
        removeImages([existingReceipt]);
      }
    }
    markFresh(savedIds);

    setSubmitting(false);
    const cur = getCurrencyForAccount(formData.account_id);
    const catName = formData.type === 'transfer' ? '' : categories.find((c) => c.id === formData.category_id)?.name;
    const kindWord = formData.type === 'transfer' ? ' transfer' : '';
    const savedMsg = editingTransaction || editingTransfer
      ? 'Changes saved'
      : `Saved · ${formatMoney(parseFloat(formData.amount) || 0, cur)}${catName ? ` · ${catName}` : kindWord}`;
    setReceiptFile(null); setReceiptPreview(null); setReceiptRemoved(false); setExistingReceipt(null);

    if (keepOpen && !editingTransaction && !editingTransfer) {
      // "Add another after saving": stay open, keep type/account/category/date,
      // clear the per-entry fields. Hosts (e.g. the app shell) close the modal
      // inside onSaved, so broadcast the change directly instead.
      window.dispatchEvent(new Event('ft-data-changed'));
      toast.show(`${savedMsg} — add the next one${receiptNote}`);
      setFormData((f) => ({
        ...f,
        amount: '',
        charge_amount: '',
        title: '',
        description: '',
        notes: '',
        transaction_date: dateTouched ? f.transaction_date : nowInTZ(f.timezone || defaultTimeZone),
      }));
      setPayeeId(''); setPayeeInput('');
      setPayerId(''); setPayerInput('');
      setIsSplit(false); setSplits([]);
      amountRef.current?.focus();
      return;
    }

    toast.show(savedMsg + receiptNote);
    onSaved();
    onClose();
  };

  const splitTotal = splits.reduce((s, sp) => s + (sp.amount ? parseFloat(sp.amount) : 0), 0);

  if (!isOpen) return null;

  const isEditing = !!(editingTransaction || editingTransfer);
  const heading = editingTransfer ? 'Edit transfer' : editingTransaction ? 'Edit transaction' : 'New transaction';
  const acc = accounts.find((a) => a.id === formData.account_id);
  const accCurrency = acc?.currency || displayCurrency;
  const foreign = !!acc?.currency && acc.currency !== displayCurrency;
  const suggestedRate = foreign ? manualRates[accCurrency] ?? null : null;
  const effectiveRate = customRate.trim() !== '' ? parseFloat(customRate) : suggestedRate;
  const amountNum = parseFloat(formData.amount);
  const convHint = foreign && effectiveRate && amountNum > 0
    ? `≈ ${formatMoney(amountNum * effectiveRate, displayCurrency)}`
    : foreign ? `${accCurrency} → ${displayCurrency}` : '';
  const toAcc = accounts.find((a) => a.id === formData.to_account_id);
  const splitMismatch = isSplit && !!formData.amount && Math.abs(splitTotal - Number(formData.amount)) > 0.001;
  const accountItems = accounts.map((a) => ({ id: a.id, label: a.name, meta: a.currency || a.type.replace('_', ' ') }));

  const setType = (t: 'expense' | 'income' | 'transfer') => {
    setFormData((f) => ({ ...f, type: t }));
    setPayeeId(''); setPayeeInput('');
    setPayerId(''); setPayerInput('');
  };

  const dateField = (
    <div>
      <label className={labelCls}>Date &amp; time</label>
      <input required type="datetime-local" value={formData.transaction_date}
        onChange={(e) => {
          setDateTouched(true);
          setFormData((f) => ({ ...f, transaction_date: e.target.value }));
        }}
        className={fieldCls} />
    </div>
  );

  // Portalled to <body> (see Modal) and centred on the viewport on web.
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-stretch md:items-center justify-center md:p-6 bg-slate-200/45 dark:bg-black/60 anim-fade"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <form
        id="txn-form"
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); (e.currentTarget as HTMLFormElement).requestSubmit(); }
        }}
        className="w-full md:w-[560px] h-full md:h-auto md:max-h-full bg-app md:shadow-ds-lg flex flex-col pt-safe md:pt-0 anim-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-5 py-3.5 md:py-4 rule-b shrink-0">
          <h3 className="text-lg font-extrabold text-slate-100 flex-1 min-w-0 truncate">{heading}</h3>
          <IconButton bordered={false} onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-1.5 md:order-last">
            <X size={18} />
          </IconButton>
          <SegmentedControl
            className="w-full md:w-auto"
            stretch={false}
            value={formData.type}
            onChange={setType}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
              { value: 'transfer', label: 'Transfer' },
            ]}
          />
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 min-h-0 p-5 flex flex-col gap-4">
          {/* Amount */}
          <div className={cx('flex items-baseline gap-2 pb-1.5 border-b-2', error && !formData.amount ? 'border-red-500' : 'border-slate-100')}>
            <span className="text-[32px] font-extrabold text-slate-400 leading-none">{currencySymbol(accCurrency).trim()}</span>
            <input
              ref={amountRef}
              required
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={formData.amount}
              onChange={(e) => setFormData((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0"
              aria-label="Amount"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[40px] font-extrabold tracking-[-0.02em] leading-tight text-slate-100 placeholder-slate-600 tabular-nums no-mask"
            />
            {convHint && <span className="text-[13px] text-slate-400 tabular-nums whitespace-nowrap">{convHint}</span>}
          </div>

          {formData.type !== 'transfer' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{formData.type === 'expense' ? 'Payee' : 'From (payer)'}</label>
                {formData.type === 'expense' ? (
                  <PayeeCombobox
                    payees={payees}
                    value={payeeId}
                    inputValue={payeeInput}
                    onInputChange={(txt) => { setPayeeInput(txt); setPayeeId(''); }}
                    onSelect={(id, name) => { setPayeeId(id); setPayeeInput(name); }}
                    onClear={() => { setPayeeId(''); setPayeeInput(''); }}
                  />
                ) : (
                  <PayeeCombobox
                    payees={payees}
                    value={payerId}
                    inputValue={payerInput}
                    placeholder="Who paid you?"
                    onInputChange={(txt) => { setPayerInput(txt); setPayerId(''); }}
                    onSelect={(id, name) => { setPayerId(id); setPayerInput(name); }}
                    onClear={() => { setPayerId(''); setPayerInput(''); }}
                  />
                )}
              </div>
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
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                {formData.type === 'transfer' ? 'From account' : formData.type === 'income' ? 'Received in' : 'Paid from'}
              </label>
              <SelectCombobox
                required
                items={accountItems}
                value={formData.account_id}
                onSelect={(id) => setFormData((f) => ({ ...f, account_id: id }))}
                placeholder="Select account…"
              />
            </div>
            {formData.type === 'transfer' ? (
              <div>
                <label className={labelCls}>To account</label>
                <SelectCombobox
                  required
                  items={accountItems.filter((a) => a.id !== formData.account_id)}
                  value={formData.to_account_id}
                  onSelect={(id) => setFormData((f) => ({ ...f, to_account_id: id }))}
                  placeholder="Select account…"
                />
              </div>
            ) : dateField}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {formData.type === 'transfer' && dateField}
            <div className={formData.type === 'transfer' ? '' : 'sm:col-span-2'}>
              <label className={labelCls}>
                Title <span className="text-slate-400">{formData.type === 'transfer' ? '(defaults to “Transfer”)' : '(optional — defaults to payee)'}</span>
              </label>
              <input type="text" value={formData.title}
                onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                placeholder={formData.type === 'transfer' ? 'Transfer' : 'e.g. Grocery run'} className={fieldCls} />
            </div>
          </div>

          {formData.type === 'transfer' && toAcc && acc && toAcc.currency !== acc.currency && (
            <p className="text-xs text-slate-400 -mt-1.5">Crossing currencies ({acc.currency} → {toAcc.currency}). Set a custom rate under More options if needed.</p>
          )}

          <div>
            <label className={labelCls}>Note</label>
            <textarea value={formData.notes}
              onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional"
              className={cx(fieldCls, 'resize-y')} rows={2} />
          </div>

          {formData.type !== 'transfer' && (
            <ReceiptField preview={receiptPreview} onPick={pickReceipt} onRemove={clearReceipt} />
          )}

          {/* ── More options (quiet) ── */}
          <div className="rule-t pt-1">
            <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}
              className="w-full flex items-center gap-2 h-10 text-left t-th hover:text-slate-100 transition-colors">
              <span className="flex-1">More options</span>
              <span className="normal-case tracking-normal font-normal text-xs text-slate-400 truncate">
                {moreOpen ? '' : ['Charge', foreign && 'Rate', 'Timezone', formData.type !== 'transfer' && 'Split'].filter(Boolean).join(' · ')}
              </span>
              <ChevronDown size={16} className={cx('transition-transform', moreOpen && 'rotate-180')} />
            </button>

            {moreOpen && (
              <div className="flex flex-col gap-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Charge <span className="text-slate-400">(deducted from balance)</span></label>
                    <input type="number" inputMode="decimal" step="0.01" min="0" value={formData.charge_amount}
                      onChange={(e) => setFormData((f) => ({ ...f, charge_amount: e.target.value }))}
                      placeholder="0.00"
                      className={cx(fieldCls, 'tabular-nums no-mask')} />
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
                            : nowInTZ(tz),
                        }));
                      }}
                      className={fieldCls}>
                      {!['UTC', 'Europe/London', 'Europe/Berlin', 'Asia/Dhaka', 'Asia/Kolkata', 'Asia/Singapore', 'America/New_York', 'America/Los_Angeles'].includes(formData.timezone) && formData.timezone && (
                        <option value={formData.timezone}>{formData.timezone}</option>
                      )}
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

                  {formData.type === 'expense' && (
                    <div>
                      <label className={labelCls}>Description</label>
                      <input type="text" value={formData.description}
                        onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                        className={fieldCls} placeholder="Optional description" />
                    </div>
                  )}
                </div>

                {/* Exchange rate override — only when account currency ≠ default currency */}
                {foreign && (() => {
                  const convertedAmt = formData.amount && effectiveRate
                    ? formatMoney(parseFloat(formData.amount) * effectiveRate, displayCurrency)
                    : null;
                  const convertedCharge = formData.charge_amount && effectiveRate
                    ? formatMoney(parseFloat(formData.charge_amount) * effectiveRate, displayCurrency)
                    : null;
                  return (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="t-th flex-1">Exchange rate · {accCurrency} → {displayCurrency}</span>
                        {customRate.trim() !== '' && <Badge tone="outline">Manual override</Badge>}
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className={labelCls}>1 {accCurrency} =</label>
                          <div className="relative">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={customRate}
                              onChange={(e) => setCustomRate(e.target.value)}
                              placeholder={suggestedRate != null ? suggestedRate.toFixed(6) : 'Enter rate'}
                              className={cx(fieldCls, 'pr-14 tabular-nums no-mask')}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">
                              {displayCurrency}
                            </span>
                          </div>
                        </div>
                        {customRate.trim() !== '' && (
                          <IconButton title="Use your manual rate" aria-label="Use your manual rate" onClick={() => setCustomRate('')}>
                            <X size={14} />
                          </IconButton>
                        )}
                      </div>
                      {convertedAmt && (
                        <p className="text-xs text-slate-400">
                          ≈ <span className="text-slate-100 font-semibold tabular-nums">{convertedAmt}</span>
                          {customRate.trim() !== '' ? ' (custom rate)' : suggestedRate != null ? ' (your manual rate)' : ''}
                          {convertedCharge && <> · charge ≈ <span className="tabular-nums">{convertedCharge}</span></>}
                        </p>
                      )}
                      {suggestedRate == null && customRate.trim() === '' && (
                        <p className="text-xs text-red-400">
                          No manual rate set for {accCurrency}/{displayCurrency}. Set one in Currencies, or enter a rate above.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Split */}
                {formData.type !== 'transfer' && (
                  <label className="flex items-center gap-2 text-sm text-slate-100 cursor-pointer w-fit">
                    <input type="checkbox" checked={isSplit}
                      onChange={(e) => {
                        setIsSplit(e.target.checked);
                        if (e.target.checked && splits.length === 0) {
                          setSplits([
                            { title: '', category_id: formData.category_id, account_id: formData.account_id, amount: '', description: '' },
                            { title: '', category_id: formData.category_id, account_id: formData.account_id, amount: '', description: '' },
                          ]);
                        }
                      }}
                      className="w-4 h-4 m-0 accent-blue-500" />
                    Split this transaction
                  </label>
                )}

                {isSplit && formData.type !== 'transfer' && (
                  <div className="flex flex-col gap-2.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_110px_32px] gap-2 t-th">
                      <span>Category · account · title</span><span className="text-right">Amount</span><span />
                    </div>
                    {splits.map((split, i) => (
                      <div key={i} className="grid grid-cols-[minmax(0,1fr)_110px_32px] gap-2 items-start pb-2.5 row-rule">
                        <div className="flex flex-col gap-1.5 min-w-0">
                          <select
                            value={split.category_id}
                            onChange={(e) =>
                              setSplits((p) =>
                                p.map((s, idx) => (idx === i ? { ...s, category_id: e.target.value } : s))
                              )
                            }
                            className={fieldCls}
                            aria-label="Split category"
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
                          <div className="grid grid-cols-2 gap-1.5">
                            <SelectCombobox
                              items={accountItems}
                              value={split.account_id || formData.account_id}
                              onSelect={(id) =>
                                setSplits((p) =>
                                  p.map((s, idx) => (idx === i ? { ...s, account_id: id } : s))
                                )
                              }
                              placeholder="Account…"
                            />
                            <input
                              type="text"
                              placeholder="Title"
                              value={split.title}
                              onChange={(e) =>
                                setSplits((p) =>
                                  p.map((s, idx) => (idx === i ? { ...s, title: e.target.value } : s))
                                )
                              }
                              className={fieldCls}
                            />
                          </div>
                        </div>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          required
                          value={split.amount}
                          aria-label="Split amount"
                          onChange={(e) =>
                            setSplits((p) =>
                              p.map((s, idx) => (idx === i ? { ...s, amount: e.target.value } : s))
                            )
                          }
                          className={cx(fieldCls, 'text-right tabular-nums no-mask')}
                        />
                        <IconButton
                          bordered={false}
                          className="w-8 h-9"
                          disabled={splits.length <= 1}
                          onClick={() => setSplits((p) => p.filter((_, idx) => idx !== i))}
                          aria-label="Remove split"
                          title="Remove split"
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-3">
                      <Button variant="ghost" size="sm"
                        onClick={() => setSplits((p) => [...p, { title: '', category_id: '', account_id: '', amount: '', description: '' }])}>
                        <Plus size={14} />Add line
                      </Button>
                      <span className={cx('text-[13px] font-semibold tabular-nums', splitMismatch ? 'text-red-400' : 'text-slate-300')}>
                        {formatMoney(splitTotal, accCurrency)}{formData.amount && ` of ${formatMoney(Number(formData.amount), accCurrency)}`}
                        {splitMismatch && ' · doesn’t match'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2.5 px-5 py-3.5 rule-t shrink-0 pb-[max(14px,env(safe-area-inset-bottom))]">
          {!isEditing && (
            <label className="flex items-center gap-2 text-[13px] text-slate-100 cursor-pointer">
              <input type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} className="w-4 h-4 m-0 accent-blue-500" />
              Add another after saving
            </label>
          )}
          <span className="flex-1 min-w-0 text-xs font-semibold text-red-400 basis-full sm:basis-0 order-first sm:order-none" role="alert">{error}</span>
          <Button variant="secondary" onClick={onClose} className="ml-auto sm:ml-0">Cancel</Button>
          <Button type="submit" disabled={submitting} className="gap-2.5">
            {submitting ? 'Saving…' : isEditing ? 'Save changes' : 'Save'}
            <span className="hidden md:inline text-[11px] font-semibold px-[5px] py-px border border-app/60 leading-[1.4]">↵</span>
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
