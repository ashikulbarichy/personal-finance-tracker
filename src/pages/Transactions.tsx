import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isFresh } from '../lib/fresh';
import { removeImages, signedUrl } from '../lib/media';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftRight, Check, ChevronLeft, ChevronDown, ChevronUp, Copy, Download, Paperclip, Pencil, Plus, Repeat, Search, Tag, Trash2, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import type { Database } from '../lib/database.types';
import { TransactionFormModal } from '../components/transactions/TransactionFormModal';
import { Avatar, Button, Drawer, EmptyState, IconButton, PageHeader, SearchInput, Skeleton, Tabs, cx, fieldCls, labelCls, useToast } from '../components/ui';
import { formatMoney } from '../lib/money';
import { convertManual, loadManualRates } from '../lib/manualRates';

type Tx = Database['public']['Tables']['transactions']['Row'];
type TxInsert = Database['public']['Tables']['transactions']['Insert'];
type Account = Database['public']['Tables']['accounts']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];
type Payee = Database['public']['Tables']['payees']['Row'];
type Recurring = { id: string; name: string; account_id: string; frequency: string; is_active: boolean };
type Kind = 'expense' | 'income' | 'transfer';
type DateFilter = 'month' | '7d';

/** One visible row — a single transaction or a transfer pair (both legs). */
interface Item {
  key: string;
  kind: Kind;
  tx: Tx; // the only leg, or the "from" (expense) leg of a transfer
  toLeg?: Tx;
  date: string;
  amount: number;
  currency: string;
  payee: string;
  sub: string;
  categoryId: string | null;
  categoryName: string;
  accountName: string;
  toAccountName?: string;
  recurring?: Recurring;
  haystack: string;
}

const PAGE = 150;
const HINT_KEY = 'ft-swipe-hint-dismissed';

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};
const changed = () => window.dispatchEvent(new Event('ft-data-changed'));
const kindLabel = (k: Kind) => (k === 'expense' ? 'Expense' : k === 'income' ? 'Income' : 'Transfer');

/** Money as the design shows it: income "+" bold, expense "−", transfer plain. */
const amountText = (it: Pick<Item, 'kind' | 'amount' | 'currency'>) =>
  it.kind === 'expense'
    ? formatMoney(-it.amount, it.currency)
    : it.kind === 'income'
      ? formatMoney(it.amount, it.currency, { sign: true })
      : formatMoney(it.amount, it.currency);

export function Transactions() {
  const { user } = useAuth();
  const { defaultCurrency, timezone } = useUserPrefs();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  /* ── Data ── */
  const [rawTx, setRawTx] = useState<Tx[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Edit modal (existing full form) ── */
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Tx | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<{ fromLeg: Tx; toLeg: Tx } | null>(null);

  /* ── UI state ── */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pill, setPill] = useState<string | null>(null);
  const [recatOpen, setRecatOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [swipedKey, setSwipedKey] = useState<string | null>(null);
  const [hint, setHint] = useState(() => {
    try { return localStorage.getItem(HINT_KEY) !== '1'; } catch { return true; }
  });

  const loadData = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const [txRes, accRes, catRes, payeesRes, recRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', user.id).order('transaction_date', { ascending: false }),
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('payees').select('*').eq('user_id', user.id).order('name'),
      supabase.from('recurring_transactions').select('id, name, account_id, frequency, is_active').eq('user_id', user.id),
    ]);
    if (txRes.data) setRawTx(txRes.data as Tx[]);
    if (accRes.data) setAccounts(accRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (payeesRes.data) setPayees(payeesRes.data);
    if (recRes.data) setRecurring(recRes.data as Recurring[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const h = () => { loadData(); };
    window.addEventListener('ft-data-changed', h);
    return () => window.removeEventListener('ft-data-changed', h);
  }, [loadData]);

  const rates = useMemo(() => loadManualRates(user?.id), [user?.id, rawTx]); // eslint-disable-line react-hooks/exhaustive-deps
  const toDefault = useCallback(
    (amt: number, cur: string) => convertManual(amt, cur, defaultCurrency, defaultCurrency, rates),
    [defaultCurrency, rates],
  );

  /* ── Dates in the user's timezone ── */
  const tz = useMemo(() => {
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); return timezone; } catch { return undefined; }
  }, [timezone]);
  const keyFmt = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }), [tz]);
  const dayKey = useCallback((d: string | number | Date) => keyFmt.format(new Date(d)), [keyFmt]);
  const todayKey = dayKey(Date.now());
  const yesterdayKey = dayKey(Date.now() - 86_400_000);
  const fromKey = (k: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' }).format(new Date(`${k}T12:00:00Z`));
  const shortDate = (d: string) => {
    const k = dayKey(d);
    const base = fromKey(k, { month: 'short', day: 'numeric' });
    return k.slice(0, 4) === todayKey.slice(0, 4) ? base : `${base} ’${k.slice(2, 4)}`;
  };
  const dayLabel = (k: string) => {
    if (k === todayKey) return 'Today';
    if (k === yesterdayKey) return 'Yesterday';
    return fromKey(k, { weekday: 'long', month: 'short', day: 'numeric', ...(k.slice(0, 4) !== todayKey.slice(0, 4) ? { year: 'numeric' } : {}) });
  };
  const longDate = (d: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(d));

  /* ── Build rows ── */
  const items = useMemo<Item[]>(() => {
    const accMap = new Map(accounts.map((a) => [a.id, a]));
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const payeeMap = new Map(payees.map((p) => [p.id, p]));
    const recByName = new Map<string, Recurring>();
    recurring.filter((r) => r.is_active).forEach((r) => recByName.set(r.name.trim().toLowerCase(), r));

    const pairs = new Map<string, Tx[]>();
    const singles: Tx[] = [];
    for (const t of rawTx) {
      if (t.transfer_pair_id) pairs.set(t.transfer_pair_id, [...(pairs.get(t.transfer_pair_id) ?? []), t]);
      else singles.push(t);
    }
    const out: Item[] = [];
    const single = (t: Tx) => {
      const pName = (t.payee_id && payeeMap.get(t.payee_id)?.name) || (t.payer_id && payeeMap.get(t.payer_id)?.name) || '';
      const payee = pName || t.title || t.description || (t.type === 'income' ? 'Income' : 'Expense');
      const sub = (t.title && t.title !== payee ? t.title : '') || t.notes || (t.description && t.description !== payee ? t.description : '') || '';
      const cat = t.category_id ? catMap.get(t.category_id) : undefined;
      const accountName = accMap.get(t.account_id)?.name ?? '—';
      const rec = recByName.get((t.title || '').trim().toLowerCase()) ?? (pName ? recByName.get(pName.trim().toLowerCase()) : undefined);
      out.push({
        key: t.id, kind: t.type, tx: t, date: t.transaction_date, amount: Number(t.amount), currency: t.currency,
        payee, sub, categoryId: cat ? cat.id : null, categoryName: t.is_adjustment ? 'Balance adjustment' : cat?.name ?? 'Uncategorized', accountName,
        recurring: rec && (rec.account_id === t.account_id || !rec.account_id) ? rec : undefined,
        haystack: [payee, sub, t.title, t.description, t.notes, cat?.name, accountName].filter(Boolean).join(' ').toLowerCase(),
      });
    };
    for (const [, legs] of pairs) {
      const from = legs.find((l) => l.type === 'expense');
      const to = legs.find((l) => l.type === 'income');
      if (!from || !to) { legs.forEach(single); continue; }
      const a = accMap.get(from.account_id)?.name ?? '—';
      const b = accMap.get(to.account_id)?.name ?? '—';
      const payee = from.title || 'Transfer';
      out.push({
        key: from.id, kind: 'transfer', tx: from, toLeg: to, date: from.transaction_date, amount: Number(from.amount), currency: from.currency,
        payee, sub: from.notes || `${a} → ${b}`, categoryId: null, categoryName: 'Transfer', accountName: a, toAccountName: b,
        haystack: [payee, from.notes, a, b, 'transfer'].filter(Boolean).join(' ').toLowerCase(),
      });
    }
    singles.forEach(single);
    out.sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());
    return out;
  }, [rawTx, accounts, categories, payees, recurring]);

  /* ── Filters (URL-backed so other pages can deep-link) ── */
  const setParam = useCallback((patch: Record<string, string | null>) => {
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
      return n;
    }, { replace: true });
  }, [setParams]);

  const qParam = params.get('q') ?? '';
  const [q, setQ] = useState(qParam);
  useEffect(() => { setQ(qParam); }, [qParam]);
  const onSearch = (v: string) => { setQ(v); setParam({ q: v || null }); };

  const pType = params.get('type');
  const typeF: Kind | null = pType === 'expense' || pType === 'income' || pType === 'transfer' ? pType : null;
  const catF = params.get('category');
  const acctF = params.get('account');
  const pDate = params.get('date');
  const dateF: DateFilter | null = pDate === 'month' || pDate === '7d' ? pDate : null;
  const pView = params.get('view');
  const view: string = pView && (pView === 'uncat' || pView === 'income' || pView.startsWith('cur-')) ? pView : 'all';

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const weekAgo = Date.now() - 7 * 86_400_000;
    const month = todayKey.slice(0, 7);
    return items.filter((it) => {
      if (view === 'uncat' && (it.kind === 'transfer' || it.categoryId || it.tx.is_adjustment)) return false;
      if (view === 'income' && it.kind !== 'income') return false;
      if (view.startsWith('cur-')) {
        const c = view.slice(4);
        if (it.currency !== c && it.toLeg?.currency !== c) return false;
      }
      if (typeF && it.kind !== typeF) return false;
      if (catF && it.categoryId !== catF) return false;
      if (acctF && it.tx.account_id !== acctF && it.toLeg?.account_id !== acctF) return false;
      if (dateF === '7d' && new Date(it.date).getTime() < weekAgo) return false;
      if (dateF === 'month' && dayKey(it.date).slice(0, 7) !== month) return false;
      if (term && !it.haystack.includes(term)) return false;
      return true;
    });
  }, [items, q, view, typeF, catF, acctF, dateF, dayKey, todayKey]);

  useEffect(() => { setLimit(PAGE); }, [q, view, typeF, catF, acctF, dateF]);

  const uncatCount = items.filter((it) => it.kind !== 'transfer' && !it.categoryId && !it.tx.is_adjustment).length;
  const otherCurrencies = useMemo(
    () => [...new Set(items.flatMap((it) => [it.currency, it.toLeg?.currency]).filter((c): c is string => !!c && c !== defaultCurrency))].sort(),
    [items, defaultCurrency],
  );

  const totals = useMemo(() => {
    let out = 0, inn = 0;
    for (const it of filtered) {
      if (it.kind === 'expense') out += toDefault(it.amount, it.currency);
      else if (it.kind === 'income') inn += toDefault(it.amount, it.currency);
    }
    return { out, inn };
  }, [filtered, toDefault]);

  const anyFilter = !!(q || typeF || catF || acctF || dateF);
  const clearFilters = (all = false) => {
    setQ('');
    setParam({ q: null, type: null, category: null, account: null, date: null, ...(all ? { view: null } : {}) });
  };

  const visible = filtered.slice(0, limit);
  const openIdx = openKey ? filtered.findIndex((it) => it.key === openKey) : -1;
  const openItem = openIdx >= 0 ? filtered[openIdx] : openKey ? items.find((it) => it.key === openKey) ?? null : null;

  /* Drop selections / open row that no longer exist */
  useEffect(() => {
    const keys = new Set(items.map((i) => i.key));
    setSelected((s) => {
      const n = new Set([...s].filter((k) => keys.has(k)));
      return n.size === s.size ? s : n;
    });
    if (openKey && !keys.has(openKey) && !loading) setOpenKey(null);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Mutations ── */
  const patchLocal = (ids: string[], patch: Partial<Tx>) =>
    setRawTx((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, ...patch } : r)));

  const catName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? 'category' : 'Uncategorized');

  const setCategory = async (it: Item, catId: string | null) => {
    if (it.kind === 'transfer' || it.categoryId === catId) return;
    const prev = it.categoryId;
    patchLocal([it.tx.id], { category_id: catId });
    const { error } = await supabase.from('transactions').update({ category_id: catId }).eq('id', it.tx.id);
    if (error) { toast.show(`Couldn't update: ${error.message}`); loadData(); return; }
    changed();
    toast.show(catId ? `Categorized as ${catName(catId)}` : 'Category removed', async () => {
      await supabase.from('transactions').update({ category_id: prev }).eq('id', it.tx.id);
      changed();
    });
  };

  const bulkCategorize = async (catId: string) => {
    const targets = items.filter((it) => selected.has(it.key) && it.kind !== 'transfer');
    setRecatOpen(false);
    if (!targets.length) { toast.show('Transfers can’t be categorized'); return; }
    const prev = targets.map((t) => ({ id: t.tx.id, cat: t.categoryId }));
    const ids = prev.map((p) => p.id);
    patchLocal(ids, { category_id: catId });
    const { error } = await supabase.from('transactions').update({ category_id: catId }).in('id', ids);
    if (error) { toast.show(`Couldn't update: ${error.message}`); loadData(); return; }
    setSelected(new Set());
    changed();
    toast.show(`${ids.length} categorized as ${catName(catId)}`, async () => {
      const byCat = new Map<string | null, string[]>();
      prev.forEach((p) => byCat.set(p.cat, [...(byCat.get(p.cat) ?? []), p.id]));
      await Promise.all([...byCat].map(([cat, idsFor]) => supabase.from('transactions').update({ category_id: cat }).in('id', idsFor)));
      changed();
    });
  };

  const deleteItems = async (its: Item[]) => {
    if (!its.length) return;
    const rows = its.flatMap((it) => (it.toLeg ? [it.tx, it.toLeg] : [it.tx]));
    const ids = rows.map((r) => r.id);
    setRawTx((rs) => rs.filter((r) => !ids.includes(r.id)));
    setSelected(new Set());
    setSwipedKey(null);
    if (openKey && its.some((it) => it.key === openKey)) setOpenKey(null);
    const { error } = await supabase.from('transactions').delete().in('id', ids);
    if (error) { toast.show(`Delete failed: ${error.message}`); loadData(); return; }
    changed();
    const label = its.length === 1 ? (its[0].kind === 'transfer' ? 'Transfer deleted' : 'Transaction deleted') : `${its.length} transactions deleted`;
    let undone = false;
    toast.show(label, async () => {
      undone = true;
      const { error: e2 } = await supabase.from('transactions').insert(rows as TxInsert[]);
      if (e2) toast.show(`Couldn't restore: ${e2.message}`);
      changed();
    });
    // Once Undo has expired, delete receipt photos nothing else points at
    // (split lines and duplicates share one file).
    const paths = [...new Set(rows.map((r) => r.receipt_path).filter((p): p is string => !!p))];
    if (paths.length) {
      window.setTimeout(async () => {
        if (undone) return;
        const { data } = await supabase.from('transactions').select('receipt_path').in('receipt_path', paths);
        const inUse = new Set((data ?? []).map((r) => r.receipt_path));
        removeImages(paths.filter((p) => !inUse.has(p)));
      }, 6000);
    }
  };

  const duplicate = async (it: Item) => {
    const pair = it.toLeg ? crypto.randomUUID() : null;
    const now = new Date().toISOString();
    const rows = (it.toLeg ? [it.tx, it.toLeg] : [it.tx]).map((r) => {
      const c = { ...r } as Record<string, unknown>;
      delete c.id; delete c.created_at; delete c.updated_at;
      c.transaction_date = now;
      c.loan_payment_id = null;
      if (pair) c.transfer_pair_id = pair;
      return c as unknown as TxInsert;
    });
    const { error } = await supabase.from('transactions').insert(rows);
    if (error) { toast.show(`Couldn't duplicate: ${error.message}`); return; }
    changed();
    toast.show('Duplicated with today’s date');
  };

  const saveNote = async (it: Item, note: string) => {
    const v = note.trim() || null;
    if ((it.tx.notes || null) === v) return;
    const ids = it.toLeg ? [it.tx.id, it.toLeg.id] : [it.tx.id];
    patchLocal(ids, { notes: v });
    const { error } = await supabase.from('transactions').update({ notes: v }).in('id', ids);
    if (error) { toast.show(`Couldn't save note: ${error.message}`); loadData(); return; }
    changed();
    toast.show('Note saved');
  };

  const editAll = (it: Item) => {
    setOpenKey(null);
    if (it.toLeg) { setEditingTransaction(null); setEditingTransfer({ fromLeg: it.tx, toLeg: it.toLeg }); }
    else { setEditingTransfer(null); setEditingTransaction(it.tx); }
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingTransaction(null); setEditingTransfer(null); };

  const exportCsv = () => {
    const esc = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['Date', 'Type', 'Payee', 'Title', 'Category', 'Account', 'To account', 'Amount', 'Currency', 'Charge', 'Note'];
    const lines = filtered.map((it) => [
      dayKey(it.date), kindLabel(it.kind), it.payee, it.tx.title ?? '', it.kind === 'transfer' ? '' : it.categoryId ? it.categoryName : '',
      it.accountName, it.toAccountName ?? '', it.kind === 'expense' ? -it.amount : it.amount, it.currency,
      Number(it.tx.charge_amount ?? 0) || '', it.tx.notes || it.tx.description || '',
    ].map(esc).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${todayKey}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ── Keyboard: J / K in the drawer, Esc clears selection ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey || showForm) return;
      if (openKey) {
        if ((e.key === 'j' || e.key === 'J') && openIdx >= 0 && openIdx < filtered.length - 1) { e.preventDefault(); setOpenKey(filtered[openIdx + 1].key); }
        if ((e.key === 'k' || e.key === 'K') && openIdx > 0) { e.preventDefault(); setOpenKey(filtered[openIdx - 1].key); }
      } else if (e.key === 'Escape') {
        if (recatOpen) setRecatOpen(false);
        else if (pill) setPill(null);
        else if (selected.size) setSelected(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openKey, openIdx, filtered, selected.size, showForm, pill, recatOpen]);

  const toggleSel = (key: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const allSel = filtered.length > 0 && filtered.every((it) => selected.has(it.key));
  const toggleAll = () => setSelected(allSel ? new Set() : new Set(filtered.map((it) => it.key)));

  const dismissHint = () => { setHint(false); try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignore */ } };

  /* ── Filter pills ── */
  const activeAccounts = accounts.filter((a) => a.is_active);
  const pills: { id: string; label: string; active: string | null; clear: () => void; options: { value: string; label: string; sub?: string }[]; pick: (v: string) => void; current: string | null }[] = [
    {
      id: 'account', label: 'Account', current: acctF,
      active: acctF ? accounts.find((a) => a.id === acctF)?.name ?? 'Account' : null,
      clear: () => setParam({ account: null }),
      options: activeAccounts.map((a) => ({ value: a.id, label: a.name, sub: a.currency })),
      pick: (v) => setParam({ account: v === acctF ? null : v }),
    },
    {
      id: 'category', label: 'Category', current: catF,
      active: catF ? categories.find((c) => c.id === catF)?.name ?? 'Category' : null,
      clear: () => setParam({ category: null }),
      options: [...categories].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'expense' ? -1 : 1))
        .map((c) => ({ value: c.id, label: c.name, sub: c.type === 'income' ? 'Income' : 'Expense' })),
      pick: (v) => setParam({ category: v === catF ? null : v }),
    },
    {
      id: 'type', label: 'Type', current: typeF,
      active: typeF ? kindLabel(typeF) : null,
      clear: () => setParam({ type: null }),
      options: (['expense', 'income', 'transfer'] as Kind[]).map((k) => ({ value: k, label: kindLabel(k) })),
      pick: (v) => setParam({ type: v === typeF ? null : v }),
    },
    {
      id: 'date', label: 'Date', current: dateF ?? 'all',
      active: dateF === 'month' ? 'This month' : dateF === '7d' ? 'Last 7 days' : null,
      clear: () => setParam({ date: null }),
      options: [{ value: 'all', label: 'All time' }, { value: 'month', label: 'This month' }, { value: '7d', label: 'Last 7 days' }],
      pick: (v) => setParam({ date: v === 'all' ? null : v }),
    },
  ];

  const viewTabs = [
    { value: 'all', label: 'All' },
    { value: 'uncat', label: 'Uncategorized', count: uncatCount || undefined, accent: true },
    { value: 'income', label: 'Income' },
    ...otherCurrencies.map((c) => ({ value: `cur-${c}`, label: c })),
  ];

  /* ── Phone groups ── */
  const groups = useMemo(() => {
    const g: { key: string; rows: Item[]; net: number }[] = [];
    for (const it of visible) {
      const k = dayKey(it.date);
      let grp = g[g.length - 1];
      if (!grp || grp.key !== k) { grp = { key: k, rows: [], net: 0 }; g.push(grp); }
      grp.rows.push(it);
      if (it.kind === 'income') grp.net += toDefault(it.amount, it.currency);
      else if (it.kind === 'expense') grp.net -= toDefault(it.amount, it.currency);
    }
    return g;
  }, [visible, dayKey, toDefault]);

  const phoneChip = typeF === 'expense' && view === 'all' ? 'expense' : (typeF === 'income' || view === 'income') ? 'income' : view === 'uncat' && !typeF ? 'uncat' : !typeF && view === 'all' ? 'all' : null;
  const setPhoneChip = (c: 'all' | 'expense' | 'income' | 'uncat') =>
    setParam({ type: c === 'expense' || c === 'income' ? c : null, view: c === 'uncat' ? 'uncat' : null });

  const expenseCats = categories.filter((c) => c.type === 'expense');
  const incomeCats = categories.filter((c) => c.type === 'income');

  const noData = !loading && items.length === 0;
  const moreBtn = filtered.length > limit && (
    <div className="pt-4 px-5 md:px-0">
      <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
        Show more <span className="text-slate-400 font-semibold tabular-nums">{filtered.length - limit} left</span>
      </Button>
    </div>
  );
  const emptyFiltered = (
    <EmptyState
      title="No transactions match"
      description="Try removing a filter or searching for something else."
      action={<Button variant="secondary" onClick={() => clearFilters(true)}>Clear filters</Button>}
    />
  );
  const emptyAll = (
    <EmptyState
      title="No transactions yet"
      description="Add your first expense, income or transfer and it will show up here."
      action={<Button onClick={() => { setEditingTransaction(null); setEditingTransfer(null); setShowForm(true); }}><Plus size={16} />New transaction</Button>}
    />
  );

  return (
    <>
      <TransactionFormModal
        isOpen={showForm}
        onClose={closeForm}
        onSaved={() => { loadData(); changed(); }}
        editingTransaction={editingTransaction}
        editingTransfer={editingTransfer}
      />

      {/* ═════════════ WEB ═════════════ */}
      <div className="hidden md:flex px-8 pt-7 pb-[120px] flex-col gap-5">
        <PageHeader
          title="Transactions"
          description={<span className="tabular-nums no-mask">{loading ? 'Loading…' : `${items.length.toLocaleString()} transaction${items.length === 1 ? '' : 's'}`}</span>}
          actions={<Button variant="secondary" onClick={exportCsv} disabled={!filtered.length}><Download size={16} />Export</Button>}
        />

        <Tabs options={viewTabs} value={view} onChange={(v) => setParam({ view: v === 'all' ? null : v })} />

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Filter by payee, note, category" className="w-[260px]" />
          {pills.map((p) => (
            <div key={p.id} className="relative">
              <button
                type="button"
                onClick={() => setPill(pill === p.id ? null : p.id)}
                className={cx(
                  'flex items-center gap-1.5 h-9 px-2.5 text-[13px] border transition-colors hover:border-slate-100',
                  p.active ? 'border-solid border-slate-100 bg-slate-100/[0.07] text-slate-100 font-semibold' : 'border-dashed border-slate-500 text-slate-300 font-medium',
                  pill === p.id && 'relative z-[31]',
                )}
              >
                {!p.active && <Plus size={14} />}
                <span className="max-w-[160px] truncate">{p.active ?? p.label}</span>
                {p.active && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Clear ${p.label}`}
                    onClick={(e) => { e.stopPropagation(); p.clear(); setPill(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); p.clear(); } }}
                    className="grid place-items-center ml-0.5 opacity-80 hover:opacity-100"
                  >
                    <X size={14} />
                  </span>
                )}
              </button>
              {pill === p.id && (
                <div className="absolute top-[calc(100%+6px)] left-0 z-[31] min-w-[240px] max-h-[320px] overflow-auto bg-app border border-line-strong shadow-ds-md p-1.5 flex flex-col">
                  {p.options.length === 0 && <div className="px-2.5 py-2 text-sm text-slate-400">Nothing to filter by yet</div>}
                  {p.options.map((o) => {
                    const on = p.current === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => { p.pick(o.value); setPill(null); }}
                        className={cx('flex items-center gap-2.5 px-2.5 py-2 text-sm text-left text-slate-100 hover:bg-slate-100/[0.07]', on && 'bg-slate-100/[0.04]')}
                      >
                        <span className="w-3.5 text-blue-400">{on && <Check size={14} />}</span>
                        <span className="flex-1 truncate">{o.label}</span>
                        {o.sub && <span className="text-xs text-slate-400">{o.sub}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {anyFilter && <Button variant="ghost" size="sm" onClick={() => clearFilters()}>Clear</Button>}
          <div className="ml-auto text-[13px] text-slate-400 tabular-nums">
            {filtered.length.toLocaleString()} shown · {formatMoney(-totals.out, defaultCurrency)} out · {formatMoney(totals.inn, defaultCurrency, { sign: true })} in
          </div>
        </div>
        {pill && <div className="fixed inset-0 z-30" onClick={() => setPill(null)} />}

        {/* Table */}
        <div className="rule-t">
          <div className="grid grid-cols-[40px_84px_minmax(0,1fr)_130px_120px] lg:grid-cols-[40px_84px_minmax(0,1.7fr)_150px_160px_140px] items-center h-[38px] rule-b t-th">
            <label className="grid place-items-center cursor-pointer">
              <input type="checkbox" checked={allSel} onChange={toggleAll} aria-label="Select all" className="w-4 h-4 m-0 accent-blue-500" />
            </label>
            <span>Date</span>
            <span>Payee</span>
            <span>Category</span>
            <span className="hidden lg:block">Account</span>
            <span className="text-right pr-3">Amount</span>
          </div>

          {loading ? (
            <div className="flex flex-col">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 h-[54px] row-rule pl-12">
                  <Skeleton className="w-8 h-8" /><Skeleton className="h-3 w-48" /><Skeleton className="h-3 w-24 ml-auto mr-3" />
                </div>
              ))}
            </div>
          ) : noData ? emptyAll : filtered.length === 0 ? emptyFiltered : (
            <div className="stagger">{visible.map((it) => {
              const sel = selected.has(it.key);
              const on = it.key === openKey;
              const charge = Number(it.tx.charge_amount ?? 0);
              return (
                <div
                  key={it.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenKey(it.key)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setOpenKey(it.key); }}
                  className={cx(
                    'grid grid-cols-[40px_84px_minmax(0,1fr)_130px_120px] lg:grid-cols-[40px_84px_minmax(0,1.7fr)_150px_160px_140px] items-center min-h-[54px] row-rule cursor-pointer hover-tint',
                    (sel || on) && 'bg-slate-100/[0.05]',
                    (isFresh(it.tx.id) || isFresh(it.key)) && 'flash-new',
                  )}
                >
                  <label onClick={(e) => e.stopPropagation()} className="grid place-items-center self-stretch cursor-pointer">
                    <input type="checkbox" checked={sel} onChange={() => toggleSel(it.key)} aria-label={`Select ${it.payee}`} className="w-4 h-4 m-0 accent-blue-500" />
                  </label>
                  <span className="text-[13px] text-slate-300 whitespace-nowrap">{shortDate(it.date)}</span>
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    {it.kind === 'transfer'
                      ? <span className="avatar-sq"><ArrowLeftRight size={14} /></span>
                      : <Avatar name={it.payee} />}
                    <div className="min-w-0 flex flex-col leading-[1.3]">
                      <span className="text-sm font-semibold text-slate-100 flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{it.payee}</span>
                        {it.recurring && <span title="Recurring" className="text-slate-400 shrink-0"><Repeat size={12} /></span>}
                        {it.tx.receipt_path && <span title="Has a receipt" className="text-slate-400 shrink-0"><Paperclip size={12} /></span>}
                      </span>
                      {it.sub && <span className="text-xs text-slate-400 truncate">{it.sub}</span>}
                    </div>
                  </div>
                  <div className="min-w-0 pr-2">
                    <CatTag it={it} />
                  </div>
                  <span className="hidden lg:block text-[13px] text-slate-300 truncate pr-2">
                    {it.kind === 'transfer' ? `${it.accountName} → ${it.toAccountName}` : it.accountName}
                  </span>
                  <span className="text-right pr-3 flex flex-col items-end leading-tight">
                    <span className={cx('text-sm tabular-nums text-slate-100 whitespace-nowrap', it.kind === 'income' ? 'font-extrabold' : 'font-normal')}>{amountText(it)}</span>
                    {charge > 0 && <span className="text-[11px] text-slate-400 tabular-nums">+{formatMoney(charge, it.currency)} fee</span>}
                  </span>
                </div>
              );
            })}</div>
          )}
          {!loading && moreBtn}
        </div>
        <div className="text-xs text-slate-400">Tip: click a row to open it, then use J / K to move between transactions.</div>
      </div>

      {/* ═════════════ PHONE ═════════════ */}
      <div className="md:hidden flex flex-col">
        <div className="sticky top-0 z-10 bg-app px-5 pt-3 pb-2.5 flex flex-col gap-2.5 rule-b">
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-slate-100 leading-[1.12]">Activity</h1>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={q}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search payee, account, note"
              className="w-full h-11 pl-9 pr-3 bg-surface border border-line-strong text-[15px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5">
            {([
              ['all', 'All'], ['expense', 'Expenses'], ['income', 'Income'], ['uncat', uncatCount ? `Uncategorized ${uncatCount}` : 'Uncategorized'],
            ] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setPhoneChip(v)}
                className={cx('shrink-0 h-[34px] px-3 border text-[13px] font-semibold transition-colors',
                  phoneChip === v ? 'bg-slate-100 text-app border-slate-100' : 'bg-transparent text-slate-100 border-slate-500')}>
                {l}
              </button>
            ))}
            {pills.filter((p) => p.id !== 'type' && p.active).map((p) => (
              <button key={p.id} type="button" onClick={p.clear}
                className="shrink-0 h-[34px] px-3 border border-slate-100 bg-slate-100 text-app text-[13px] font-semibold inline-flex items-center gap-1.5">
                {p.active}<X size={14} />
              </button>
            ))}
          </div>
        </div>

        {hint && items.length > 0 && (
          <div className="mx-5 mt-3 py-2.5 pl-3 pr-1.5 bg-surface flex items-center gap-2.5 text-[13px] text-slate-100">
            <ChevronLeft size={16} className="shrink-0" />
            <span className="flex-1">Swipe a row left to categorize or delete it</span>
            <button type="button" onClick={dismissHint} aria-label="Dismiss" className="w-8 h-8 grid place-items-center"><X size={14} /></button>
          </div>
        )}

        {loading ? (
          <div className="px-5 pt-4 flex flex-col">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 h-16 row-rule"><Skeleton className="w-[38px] h-[38px]" /><Skeleton className="h-3 w-40" /><Skeleton className="h-3 w-16 ml-auto" /></div>
            ))}
          </div>
        ) : noData ? <div className="px-5">{emptyAll}</div> : filtered.length === 0 ? (
          <div className="px-5 py-10 flex flex-col items-start gap-3">
            <p className="text-[15px] text-slate-400">Nothing here. Try another filter.</p>
            {(anyFilter || view !== 'all') && <Button variant="secondary" onClick={() => clearFilters(true)}>Clear filters</Button>}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <div className="flex justify-between px-5 pt-4 pb-1.5 t-kicker rule-b">
                <span>{dayLabel(g.key)}</span>
                <span className="tabular-nums">{formatMoney(g.net, defaultCurrency, { sign: true })}</span>
              </div>
              {g.rows.map((it) => (
                <SwipeRow
                  key={it.key}
                  fresh={isFresh(it.tx.id) || isFresh(it.key)}
                  open={swipedKey === it.key}
                  onOpenChange={(o) => setSwipedKey(o ? it.key : null)}
                  width={it.kind === 'transfer' ? 80 : 160}
                  onTap={() => { setSwipedKey(null); setOpenKey(it.key); }}
                  actions={
                    <>
                      {it.kind !== 'transfer' && (
                        <button type="button" onClick={() => { setSwipedKey(null); setOpenKey(it.key); }}
                          className="w-20 bg-slate-100 text-app text-xs font-bold flex flex-col items-center justify-center gap-1">
                          <Tag size={18} />Categorize
                        </button>
                      )}
                      <button type="button" onClick={() => deleteItems([it])}
                        className="w-20 bg-red-500 text-app text-xs font-bold flex flex-col items-center justify-center gap-1">
                        <Trash2 size={18} />Delete
                      </button>
                    </>
                  }
                >
                  {it.kind === 'transfer'
                    ? <span className="avatar-sq" style={{ width: 38, height: 38 }}><ArrowLeftRight size={16} /></span>
                    : <Avatar name={it.payee} size={38} />}
                  <div className="flex flex-col leading-[1.3] min-w-0">
                    <span className="text-[15px] font-semibold text-slate-100 truncate flex items-center gap-1.5">
                      <span className="truncate">{it.payee}</span>
                      {it.recurring && <Repeat size={12} className="text-slate-400 shrink-0" />}
                    </span>
                    <span className={cx('text-xs truncate', it.kind !== 'transfer' && !it.categoryId && !it.tx.is_adjustment ? 'text-red-400' : 'text-slate-400')}>
                      {it.kind === 'transfer' ? `${it.accountName} → ${it.toAccountName}` : `${it.categoryName} · ${it.accountName}`}
                    </span>
                  </div>
                  <span className={cx('text-[15px] tabular-nums text-slate-100 whitespace-nowrap', it.kind === 'income' ? 'font-extrabold' : 'font-normal')}>
                    {amountText(it)}
                  </span>
                </SwipeRow>
              ))}
            </div>
          ))
        )}
        {!loading && moreBtn}
        <div className="h-6" />
      </div>

      {/* ═════════════ Bulk action bar (web) ═════════════ */}
      <div
        className={cx(
          'hidden md:flex fixed bottom-7 left-[calc(50%+var(--sidebar-w,232px)/2)] z-[35] items-center bg-slate-100 text-app shadow-ds-lg transition-[transform,opacity] duration-300 ease-ds',
          selected.size ? 'opacity-100 -translate-x-1/2 translate-y-0' : 'opacity-0 -translate-x-1/2 translate-y-6 pointer-events-none',
        )}
      >
        <span className="px-4 text-sm font-bold tabular-nums no-mask whitespace-nowrap">{selected.size} selected</span>
        <div className="relative border-l border-slate-400">
          <button type="button" onClick={() => setRecatOpen((o) => !o)} className="flex items-center gap-2 h-11 px-3.5 text-sm hover:bg-slate-300">
            <Tag size={16} />Categorize<ChevronUp size={14} />
          </button>
          {recatOpen && (
            <div className="absolute bottom-[calc(100%+8px)] left-0 min-w-[240px] max-h-[340px] overflow-auto bg-app text-slate-100 border border-line-strong shadow-ds-lg p-1.5 flex flex-col">
              {[['Expense', expenseCats], ['Income', incomeCats]].map(([label, list]) =>
                (list as Category[]).length ? (
                  <div key={label as string} className="flex flex-col">
                    <div className="t-th px-2.5 pt-2 pb-1">{label as string}</div>
                    {(list as Category[]).map((c) => (
                      <button key={c.id} type="button" onClick={() => bulkCategorize(c.id)} className="px-2.5 py-2 text-sm text-left hover:bg-slate-100/[0.07]">{c.name}</button>
                    ))}
                  </div>
                ) : null,
              )}
              {!categories.length && <div className="px-2.5 py-2 text-sm text-slate-400">No categories yet</div>}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => deleteItems(items.filter((it) => selected.has(it.key)))}
          className="flex items-center gap-2 h-11 px-3.5 text-sm border-l border-slate-400 hover:bg-slate-300"
        >
          <Trash2 size={16} />Delete
        </button>
        <button type="button" onClick={() => { setSelected(new Set()); setRecatOpen(false); }} title="Clear selection (Esc)" aria-label="Clear selection"
          className="grid place-items-center w-11 h-11 border-l border-slate-400 hover:bg-slate-300">
          <X size={16} />
        </button>
      </div>

      {/* ═════════════ Detail drawer / phone sheet ═════════════ */}
      <Drawer
        open={!!openItem}
        onClose={() => setOpenKey(null)}
        kicker={openItem ? kindLabel(openItem.kind) : ''}
        headerExtra={openItem && openIdx >= 0 ? (
          <div className="hidden md:flex items-center gap-1">
            <span className="text-xs text-slate-400 mr-1.5 tabular-nums no-mask">{openIdx + 1} of {filtered.length}</span>
            <IconButton className="w-8 h-8" title="Previous (K)" aria-label="Previous" disabled={openIdx <= 0} onClick={() => setOpenKey(filtered[openIdx - 1].key)}><ChevronUp size={16} /></IconButton>
            <IconButton className="w-8 h-8" title="Next (J)" aria-label="Next" disabled={openIdx >= filtered.length - 1} onClick={() => setOpenKey(filtered[openIdx + 1].key)}><ChevronDown size={16} /></IconButton>
          </div>
        ) : null}
        footer={openItem ? (
          <>
            <Button variant="secondary" className="!text-red-400 h-11 md:h-9" onClick={() => deleteItems([openItem])}><Trash2 size={16} />Delete</Button>
            <Button variant="secondary" className="h-11 md:h-9" onClick={() => duplicate(openItem)} title="Duplicate"><Copy size={16} /><span className="hidden sm:inline">Duplicate</span></Button>
            <Button variant="secondary" className="h-11 md:h-9" onClick={() => editAll(openItem)} title="Edit all details"><Pencil size={16} /><span className="hidden sm:inline">Edit all details</span><span className="sm:hidden">Edit</span></Button>
            <Button className="ml-auto h-11 md:h-9 flex-1 md:flex-none !justify-start md:!justify-center" onClick={() => setOpenKey(null)}>Done</Button>
          </>
        ) : null}
      >
        {openItem && (
          <DetailBody
            key={openItem.key}
            it={openItem}
            longDate={longDate(openItem.date)}
            defaultCurrency={defaultCurrency}
            converted={openItem.currency !== defaultCurrency ? toDefault(openItem.amount, openItem.currency) : null}
            hasRate={openItem.currency === defaultCurrency || !!rates[openItem.currency]}
            accountCurrency={accounts.find((a) => a.id === openItem.tx.account_id)?.currency}
            expenseCats={expenseCats}
            incomeCats={incomeCats}
            onCategory={(id) => setCategory(openItem, id)}
            onNote={(n) => saveNote(openItem, n)}
            onRecurring={() => navigate('/recurring')}
          />
        )}
      </Drawer>
    </>
  );
}

/* ─── Category tag in the web table ─── */
function CatTag({ it }: { it: Item }) {
  if (it.kind === 'transfer')
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-[3px] border border-line-strong text-slate-400 max-w-full truncate"><ArrowLeftRight size={11} />Transfer</span>;
  if (it.tx.is_adjustment)
    return <span className="inline-flex text-xs px-2 py-[3px] border border-line-strong text-slate-400 max-w-full truncate">Balance adjustment</span>;
  if (!it.categoryId)
    return <span className="inline-flex text-xs px-2 py-[3px] border border-red-500 text-red-400">Uncategorized</span>;
  return <span className="inline-flex text-xs px-2 py-[3px] bg-slate-900 text-slate-300 border border-transparent max-w-full truncate">{it.categoryName}</span>;
}

/* ─── Drawer body (web right panel / phone bottom sheet) ─── */
function DetailBody({
  it, longDate, defaultCurrency, converted, hasRate, accountCurrency, expenseCats, incomeCats, onCategory, onNote, onRecurring,
}: {
  it: Item;
  longDate: string;
  defaultCurrency: string;
  converted: number | null;
  hasRate: boolean;
  accountCurrency?: string;
  expenseCats: Category[];
  incomeCats: Category[];
  onCategory: (id: string | null) => void;
  onNote: (note: string) => void;
  onRecurring: () => void;
}) {
  const [note, setNote] = useState(it.tx.notes ?? '');
  useEffect(() => { setNote(it.tx.notes ?? ''); }, [it.tx.notes]);
  const cats = it.kind === 'income' ? incomeCats : expenseCats;
  const others = it.kind === 'income' ? expenseCats : incomeCats;
  const charge = Number(it.tx.charge_amount ?? 0);
  const row = (label: ReactNode, value: ReactNode, cls?: string) => (
    <div className={cx('grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 py-3 row-rule text-sm', cls)}>
      <span className="text-[13px] text-slate-400">{label}</span>
      <span className="min-w-0 text-slate-100">{value}</span>
    </div>
  );

  return (
    <>
      <div className="flex items-center gap-3.5">
        {it.kind === 'transfer'
          ? <span className="avatar-sq" style={{ width: 44, height: 44 }}><ArrowLeftRight size={18} /></span>
          : <Avatar name={it.payee} size={44} />}
        <div className="flex flex-col leading-[1.3] min-w-0">
          <span className="text-[17px] font-extrabold text-slate-100 truncate">{it.payee}</span>
          <span className="text-[13px] text-slate-400">{longDate}</span>
        </div>
      </div>

      <div className="text-[40px] font-extrabold tracking-[-0.03em] tabular-nums leading-none text-slate-100">{amountText(it)}</div>

      {it.recurring && (
        <button type="button" onClick={onRecurring} className="flex items-center gap-2 text-[13px] text-slate-300 text-left hover:text-slate-100">
          <Repeat size={14} />Recurring {it.recurring.frequency} · linked to Recurring
        </button>
      )}

      <div className="flex flex-col rule-t">
        {it.kind !== 'transfer' && row(
          'Category',
          <select
            value={it.categoryId ?? ''}
            onChange={(e) => onCategory(e.target.value || null)}
            className={fieldCls}
          >
            <option value="">Uncategorized</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            {others.length > 0 && (
              <optgroup label={it.kind === 'income' ? 'Expense categories' : 'Income categories'}>
                {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            )}
          </select>,
          'hidden md:grid',
        )}
        {it.kind === 'transfer'
          ? <>{row('From', it.accountName)}{row('To', <>{it.toAccountName}{it.toLeg && it.toLeg.currency !== it.currency && <span className="text-slate-400"> · {it.toLeg.currency}</span>}</>)}</>
          : row('Account', <>{it.accountName}{accountCurrency && <span className="text-slate-400"> · {accountCurrency}</span>}</>)}
        {converted !== null && row(
          `In ${defaultCurrency}`,
          hasRate
            ? <span className="tabular-nums">{formatMoney(it.kind === 'expense' ? -converted : converted, defaultCurrency, { sign: it.kind === 'income' })}</span>
            : <span className="text-slate-400">No rate set for {it.currency}</span>,
        )}
        {charge > 0 && row('Charge', <span className="tabular-nums">{formatMoney(charge, it.currency)}</span>)}
        {it.tx.custom_rate != null && row('Custom rate', <span className="tabular-nums">1 {it.currency} = {it.tx.custom_rate}</span>)}
        {it.tx.description && it.tx.description !== it.payee && row('Description', <span className="text-slate-300">{it.tx.description}</span>)}
      </div>

      {/* Phone: category chips like the phone detail sheet */}
      {it.kind !== 'transfer' && (
        <div className="md:hidden flex flex-col gap-2.5">
          <div className="t-th">Category · {it.categoryId ? it.categoryName : 'Uncategorized'}</div>
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => (
              <button key={c.id} type="button" onClick={() => onCategory(c.id === it.categoryId ? null : c.id)}
                className={cx('h-9 px-3 border border-slate-100 text-[13px] font-semibold transition-colors',
                  c.id === it.categoryId ? 'bg-slate-100 text-app' : 'bg-transparent text-slate-100')}>
                {c.name}
              </button>
            ))}
            {cats.length === 0 && <span className="text-[13px] text-slate-400">No {it.kind} categories yet</span>}
          </div>
        </div>
      )}

      <div>
        <label className={labelCls}>Note</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => onNote(note)}
          placeholder="Add a note"
          className={cx(fieldCls, 'min-h-[72px] resize-y')}
        />
      </div>

      {it.tx.receipt_path && <ReceiptView path={it.tx.receipt_path} />}
    </>
  );
}

/* ─── Receipt photo in the detail panel (signed URL; bucket is private) ─── */
function ReceiptView({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    signedUrl(path).then((u) => live && setUrl(u));
    return () => { live = false; };
  }, [path]);
  return (
    <div>
      <div className={labelCls}>Receipt</div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" title="Open full size" className="block bg-slate-900 border border-line-strong">
          <img src={url} alt="Receipt" className="w-full max-h-[320px] object-contain anim-fade" />
        </a>
      ) : (
        <Skeleton className="h-40 w-full" />
      )}
    </div>
  );
}

/* ─── Phone row with swipe-left actions (pointer events, pan-y) ─── */
function SwipeRow({
  open, onOpenChange, width, onTap, actions, children, fresh,
}: {
  fresh?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  onTap: () => void;
  actions: ReactNode;
  children: ReactNode;
}) {
  const [dx, setDx] = useState<number | null>(null);
  const st = useRef<{ x: number; y: number; base: number; lock: 'h' | 'v' | null; id: number } | null>(null);
  const moved = useRef(false);
  const offset = dx ?? (open ? -width : 0);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    st.current = { x: e.clientX, y: e.clientY, base: open ? -width : 0, lock: null, id: e.pointerId };
    moved.current = false;
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s) return;
    const ddx = e.clientX - s.x;
    const ddy = e.clientY - s.y;
    if (!s.lock) {
      if (Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy)) {
        s.lock = 'h';
        moved.current = true;
        try { e.currentTarget.setPointerCapture(s.id); } catch { /* ignore */ }
      } else if (Math.abs(ddy) > 8) {
        s.lock = 'v';
        moved.current = true;
      }
    }
    if (s.lock === 'h') setDx(Math.max(-width - 24, Math.min(0, s.base + ddx)));
  };
  const onUp = () => {
    const s = st.current;
    st.current = null;
    if (s?.lock === 'h' && dx !== null) onOpenChange(dx < -width / 2);
    setDx(null);
  };

  return (
    <div className="relative overflow-hidden row-rule">
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={!open}>{actions}</div>
      <div
        role="button"
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => {
          if (moved.current) { moved.current = false; return; }
          if (open) onOpenChange(false);
          else onTap();
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') onTap(); }}
        className="relative grid grid-cols-[38px_minmax(0,1fr)_auto] gap-3 items-center min-h-[64px] px-5 bg-app select-none cursor-pointer active:bg-slate-100/[0.04]"
        style={{
          touchAction: 'pan-y',
          transform: `translateX(${offset}px)`,
          transition: dx === null ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none',
        }}
      >
        {fresh && <span aria-hidden className="absolute inset-0 flash-new pointer-events-none" />}
        {children}
      </div>
    </div>
  );
}
