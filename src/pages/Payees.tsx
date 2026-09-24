import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { Plus, Trash2, UserCheck, Pencil, ChevronRight } from 'lucide-react';
import {
  Avatar, Button, EmptyState, IconButton, Modal, PageHeader, SearchInput, Skeleton, fieldCls, labelCls,
} from '../components/ui';
import { formatMoney } from '../lib/money';
import { convertManual, loadManualRates } from '../lib/manualRates';

interface Payee {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
}

interface PayeeStats {
  paid: number;       // expenses to this payee, default currency
  received: number;   // income from this payee, default currency
  count: number;
  last: string | null;
  usualCategory: string | null;
}

type TxnRow = {
  payee_id: string | null;
  payer_id: string | null;
  amount: number;
  currency: string;
  type: 'income' | 'expense';
  transaction_date: string;
  category_id: string | null;
};

const emptyForm = { name: '', notes: '' };

export function Payees() {
  const { user } = useAuth();
  const { defaultCurrency } = useUserPrefs();
  const navigate = useNavigate();
  const [payees, setPayees] = useState<Payee[]>([]);
  const [stats, setStats] = useState<Record<string, PayeeStats>>({});
  // Open loans with each person (default currency): lent → owes you, borrowed → you owe.
  const [loanBal, setLoanBal] = useState<Record<string, { owesYou: number; youOwe: number }>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Payee | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!user) { setPayees([]); setLoading(false); return; }

    const [payeesRes, txnRes, catRes, loanRes] = await Promise.all([
      supabase.from('payees').select('*').eq('user_id', user.id).order('name'),
      supabase
        .from('transactions')
        .select('payee_id, payer_id, amount, currency, type, transaction_date, category_id')
        .eq('user_id', user.id)
        .or('payee_id.not.is.null,payer_id.not.is.null'),
      supabase.from('categories').select('id, name').eq('user_id', user.id),
      supabase.from('loans').select('payee_id, type, current_balance, is_active, accounts(currency)')
        .eq('user_id', user.id).not('payee_id', 'is', null),
    ]);

    const rates = loadManualRates(user.id);
    const catName: Record<string, string> = {};
    (catRes.data ?? []).forEach((c: { id: string; name: string }) => { catName[c.id] = c.name; });

    const acc: Record<string, PayeeStats & { cats: Record<string, number> }> = {};
    ((txnRes.data ?? []) as TxnRow[]).forEach((t) => {
      const pid = t.type === 'income' ? (t.payer_id ?? t.payee_id) : (t.payee_id ?? t.payer_id);
      if (!pid) return;
      const e = (acc[pid] ??= { paid: 0, received: 0, count: 0, last: null, usualCategory: null, cats: {} });
      const v = convertManual(Number(t.amount), t.currency, defaultCurrency, defaultCurrency, rates);
      if (t.type === 'income') e.received += v; else e.paid += v;
      e.count += 1;
      if (!e.last || t.transaction_date > e.last) e.last = t.transaction_date;
      if (t.category_id) e.cats[t.category_id] = (e.cats[t.category_id] ?? 0) + 1;
    });
    const out: Record<string, PayeeStats> = {};
    Object.entries(acc).forEach(([id, e]) => {
      const top = Object.entries(e.cats).sort((a, b) => b[1] - a[1])[0];
      out[id] = { paid: e.paid, received: e.received, count: e.count, last: e.last, usualCategory: top ? catName[top[0]] ?? null : null };
    });

    const lb: Record<string, { owesYou: number; youOwe: number }> = {};
    ((loanRes.data ?? []) as unknown as { payee_id: string; type: 'lending' | 'borrowing'; current_balance: number; is_active: boolean; accounts: { currency: string } | null }[])
      .forEach((l) => {
        if (!l.is_active || !(Number(l.current_balance) > 0)) return;
        const v = convertManual(Number(l.current_balance), l.accounts?.currency ?? defaultCurrency, defaultCurrency, defaultCurrency, rates);
        const e = (lb[l.payee_id] ??= { owesYou: 0, youOwe: 0 });
        if (l.type === 'lending') e.owesYou += v; else e.youOwe += v;
      });
    setLoanBal(lb);
    setPayees((payeesRes.data ?? []) as Payee[]);
    setStats(out);
    setLoading(false);
  }, [user, defaultCurrency]);

  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener('ft-data-changed', on);
    return () => window.removeEventListener('ft-data-changed', on);
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      user_id: user.id,
      name: formData.name,
      notes: formData.notes || null,
    };

    if (editing) {
      await supabase.from('payees').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('payees').insert(payload);
    }

    setShowForm(false);
    setEditing(null);
    setFormData(emptyForm);
    window.dispatchEvent(new Event('ft-data-changed'));
  };

  const handleEdit = (p: Payee) => {
    setEditing(p);
    setFormData({ name: p.name, notes: p.notes ?? '' });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this payee?')) {
      await supabase.from('payees').delete().eq('id', id);
      window.dispatchEvent(new Event('ft-data-changed'));
    }
  };

  const openNew = () => { setShowForm(true); setEditing(null); setFormData(emptyForm); };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return payees
      .filter((p) =>
        p.name.toLowerCase().includes(q) ||
        stats[p.id]?.usualCategory?.toLowerCase().includes(q))
      .sort((a, b) => (stats[b.id]?.count ?? 0) - (stats[a.id]?.count ?? 0));
  }, [payees, stats, search]);

  const go = (p: Payee) => navigate(`/transactions?q=${encodeURIComponent(p.name)}`);

  const lastLabel = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

  /** Total shown in the Total column: spend, or +received for pure payers. */
  const totalOf = (p: Payee) => {
    const s = stats[p.id];
    const paid = s?.paid ?? 0;
    const received = s?.received ?? 0;
    if (paid > 0) return { text: formatMoney(paid, defaultCurrency), bold: false, received };
    if (received > 0) return { text: formatMoney(received, defaultCurrency, { sign: true }), bold: true, received: 0 };
    return { text: '—', bold: false, received: 0 };
  };

  const cols = 'minmax(0,1.5fr) 160px 120px 150px 90px 68px 24px';

  return (
    <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-5">
      <PageHeader
        className="hidden md:flex"
        description={`${payees.length} payee${payees.length === 1 ? '' : 's'} · click one to see its transactions`}
        actions={
          <>
            <SearchInput className="w-[260px]" placeholder="Find a payee" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button variant="secondary" onClick={openNew}><Plus size={16} /> New payee</Button>
          </>
        }
      />
      {/* phone toolbar */}
      <div className="md:hidden flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-slate-400">{payees.length} payee{payees.length === 1 ? '' : 's'}</span>
          <Button variant="secondary" size="sm" onClick={openNew}><Plus size={14} /> New payee</Button>
        </div>
        <SearchInput placeholder="Find a payee" value={search} onChange={(e) => setSearch(e.target.value)} className="[&_input]:min-h-[44px]" />
      </div>

      {loading ? (
        <div className="rule-t">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 min-h-[56px] row-rule">
              <Skeleton className="w-8 h-8" />
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3.5 w-20 ml-auto" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title={search ? 'No payees match' : 'No payees yet'}
          description={search ? 'Try a different name.' : 'Add people and companies you regularly pay or get paid by.'}
          action={!search && <Button variant="secondary" onClick={openNew}><Plus size={16} /> New payee</Button>}
        />
      ) : (
        <div className="rule-t">
          <div className="hidden md:grid items-center h-[38px] rule-b t-th" style={{ gridTemplateColumns: cols }}>
            <span>Payee</span><span>Usual category</span><span>Activity</span>
            <span className="text-right">Total · {defaultCurrency}</span><span className="text-right">Last</span><span /><span />
          </div>
          {filtered.map((p) => {
            const s = stats[p.id];
            const total = totalOf(p);
            const cat = s?.usualCategory ?? null;
            const n = s?.count ?? 0;
            const lb = loanBal[p.id];
            const loanLine = lb && (lb.owesYou > 0 || lb.youOwe > 0) ? (
              <button type="button" onClick={(e) => { e.stopPropagation(); navigate('/loans'); }} className="text-xs tabular-nums text-left hover:underline">
                {lb.owesYou > 0 && <span className="text-slate-300">Owes you {formatMoney(lb.owesYou, defaultCurrency)}</span>}
                {lb.owesYou > 0 && lb.youOwe > 0 && <span className="text-slate-400"> · </span>}
                {lb.youOwe > 0 && <span className="text-red-400">You owe {formatMoney(lb.youOwe, defaultCurrency)}</span>}
              </button>
            ) : null;
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => go(p)}
                onKeyDown={(e) => { if (e.key === 'Enter') go(p); }}
                className="row-rule hover-tint cursor-pointer group"
              >
                {/* web row */}
                <div className="hidden md:grid items-center min-h-[52px]" style={{ gridTemplateColumns: cols }}>
                  <span className="flex items-center gap-3 min-w-0">
                    <Avatar name={p.name} />
                    <span className="flex flex-col leading-[1.3] min-w-0">
                      <span className="text-sm font-semibold text-slate-100 truncate">{p.name}</span>
                      {loanLine}
                    </span>
                  </span>
                  <span className="text-[13px] text-slate-400 truncate pr-2">{cat ?? '—'}</span>
                  <span className="text-[13px] text-slate-300">{n} payment{n === 1 ? '' : 's'}</span>
                  <span className="text-right flex flex-col leading-[1.3]">
                    <span className={total.bold ? 'text-sm tabular-nums text-slate-100 font-bold' : 'text-sm tabular-nums text-slate-100'}>{total.text}</span>
                    {total.received > 0 && (
                      <span className="text-xs tabular-nums text-slate-400">{formatMoney(total.received, defaultCurrency, { sign: true })} in</span>
                    )}
                  </span>
                  <span className="text-right text-[13px] text-slate-400">{lastLabel(s?.last ?? null)}</span>
                  <span className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <IconButton bordered={false} className="w-8 h-8" aria-label="Edit payee"
                      onClick={(e) => { e.stopPropagation(); handleEdit(p); }}><Pencil size={14} /></IconButton>
                    <IconButton bordered={false} className="w-8 h-8 text-red-400" aria-label="Delete payee"
                      onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}><Trash2 size={14} /></IconButton>
                  </span>
                  <span className="grid place-items-center text-slate-400"><ChevronRight size={14} /></span>
                </div>
                {/* phone row */}
                <div className="md:hidden grid grid-cols-[38px_minmax(0,1fr)_auto_36px] gap-3 items-center min-h-[60px]">
                  <Avatar name={p.name} size={38} />
                  <span className="flex flex-col leading-[1.3] min-w-0">
                    <span className="text-[15px] font-semibold text-slate-100 truncate">{p.name}</span>
                    <span className="text-xs text-slate-400 truncate">{cat ? `${cat} · ` : ''}{n} payment{n === 1 ? '' : 's'}</span>
                    {loanLine}
                  </span>
                  <span className={total.bold ? 'text-sm tabular-nums text-slate-100 font-bold' : 'text-sm tabular-nums text-slate-100'}>{total.text}</span>
                  <IconButton bordered={false} aria-label="Edit payee" className="-mr-2"
                    onClick={(e) => { e.stopPropagation(); handleEdit(p); }}><Pencil size={14} className="text-slate-400" /></IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        title={editing ? 'Edit payee' : 'New payee'}
        maxWidth="max-w-md"
        footer={
          <>
            {editing && (
              <Button variant="danger" className="mr-auto"
                onClick={() => { const id = editing.id; setShowForm(false); setEditing(null); handleDelete(id); }}>
                <Trash2 size={14} /> Delete
              </Button>
            )}
            <Button variant="secondary" type="button" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
            <Button type="submit" form="payee-form">{editing ? 'Update' : 'Create'}</Button>
          </>
        }
      >
        <form id="payee-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Name *</label>
            <input required type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. John Smith" className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <input type="text" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional note about this payee" className={fieldCls} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
