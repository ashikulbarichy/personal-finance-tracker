import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Pencil, Trash2, Tags } from 'lucide-react';
import { CategoryIconPicker } from '../components/CategoryIconPicker';
import {
  Button, EmptyState, IconButton, Input, Kpi, KpiStrip, ListSkeleton, Modal, PageHeader, Progress, Select, cx, fieldCls, labelCls,
} from '../components/ui';
import { useBudgets, type BudgetRow } from '../components/budgets/useBudgets';
import { daysLeftInMonth, monthProgress } from '../lib/dateUtils';
import { currencySymbol, formatMoney } from '../lib/money';
import type { Database } from '../lib/database.types';

type Category = Database['public']['Tables']['categories']['Row'];

const colorOptions = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#14B8A6'];

/** Inline monthly-budget input: currency symbol prefix, saves on blur / Enter. */
function BudgetInput({
  row, currency, onSave, className, inputClassName,
}: {
  row: BudgetRow;
  currency: string;
  onSave: (id: string, v: number | null) => void;
  className?: string;
  inputClassName?: string;
}) {
  const initial = row.budget > 0 ? String(row.budget) : '';
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(initial); }, [initial]);

  const commit = () => {
    const t = val.replace(/,/g, '').trim();
    const n = t === '' ? null : parseFloat(t);
    if ((n ?? 0) === (row.budget || 0)) return;
    onSave(row.id, n !== null && Number.isFinite(n) && n > 0 ? n : null);
  };

  const sym = currencySymbol(currency).trim();
  return (
    <div className={cx('relative', className)}>
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">{sym}</span>
      <input
        inputMode="decimal"
        value={val}
        placeholder="No budget"
        aria-label={`${row.name} monthly budget`}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setVal(initial); } }}
        className={cx(fieldCls, 'tabular-nums', inputClassName)}
        style={{ paddingLeft: `${Math.max(24, sym.length * 9 + 14)}px` }}
      />
    </div>
  );
}

export function Categories() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { rows, income, totals, setBudget, currency, loading } = useBudgets();
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'expense' as Category['type'],
    icon: 'shopping-cart',
    color: '#3B82F6',
  });

  const loadCategories = useCallback(async () => {
    if (!user) {
      setCategories([]);
      return;
    }

    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (data) {
      setCategories(data);
    }
  }, [user]);

  useEffect(() => {
    loadCategories();
    const on = () => loadCategories();
    window.addEventListener('ft-data-changed', on);
    return () => window.removeEventListener('ft-data-changed', on);
  }, [loadCategories]);

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'expense',
      icon: 'shopping-cart',
      color: '#3B82F6',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const categoryData = {
      user_id: user.id,
      name: formData.name,
      type: formData.type,
      icon: formData.icon,
      color: formData.color,
    };

    if (editingCategory) {
      await supabase.from('categories').update(categoryData).eq('id', editingCategory.id);
    } else {
      await supabase.from('categories').insert(categoryData);
    }

    setShowForm(false);
    setEditingCategory(null);
    resetForm();
    window.dispatchEvent(new Event('ft-data-changed'));
  };

  const handleEdit = (id: string) => {
    const category = categories.find((c) => c.id === id);
    if (!category) return;
    setEditingCategory(category);
    setFormData({
      name: category.name,
      type: category.type,
      icon: category.icon,
      color: category.color,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this category?')) {
      await supabase.from('categories').delete().eq('id', id);
      setBudget(id, null);
      window.dispatchEvent(new Event('ft-data-changed'));
    }
  };

  const openNew = () => { setShowForm(true); setEditingCategory(null); resetForm(); };
  const closeForm = () => { setShowForm(false); setEditingCategory(null); };

  /* ---- Derived ---- */
  const now = new Date();
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });
  const daysLeft = daysLeftInMonth(now);
  const marker = monthProgress(now) * 100;
  const left = totals.budget - totals.spent;
  const money = (n: number) => formatMoney(n, currency);
  const txLabel = (n: number) => `${n} transaction${n === 1 ? '' : 's'}`;
  const view = (id: string) => navigate(`/transactions?category=${id}`);

  const rowInfo = (r: BudgetRow) => {
    const has = r.budget > 0;
    const over = has && r.spent > r.budget;
    const pct = has ? (r.spent / r.budget) * 100 : 0;
    const remaining = has
      ? over ? `${money(r.spent - r.budget)} over` : `${money(r.budget - r.spent)} left`
      : 'No budget';
    return { has, over, pct, remaining };
  };

  const expCols = '170px 150px minmax(0,1fr) 120px 150px 56px 64px';
  const incCols = '170px minmax(0,1fr) 150px 56px 64px';

  const rowActions = (id: string) => (
    <span className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <IconButton bordered={false} className="w-8 h-8" aria-label="Edit category" onClick={() => handleEdit(id)}><Pencil size={14} /></IconButton>
      <IconButton bordered={false} className="w-8 h-8 text-red-400" aria-label="Delete category" onClick={() => handleDelete(id)}><Trash2 size={14} /></IconButton>
    </span>
  );

  return (
    <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-7">
      <PageHeader
        className="hidden md:flex"
        description={`Budgets repeat every month until you change them · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left in ${monthName}`}
        actions={<Button variant="secondary" onClick={openNew}><Plus size={16} /> New category</Button>}
      />

      {/* KPI strip (web) */}
      <KpiStrip cols={4} className="hidden md:grid">
        <Kpi label="Budgeted" value={money(totals.budget)} />
        <Kpi label="Spent" value={money(totals.spent)} />
        <Kpi label="Left" value={money(left)} />
        <div className="flex flex-col gap-1 min-w-0">
          <div className="t-kicker mb-1.5">Status</div>
          <div className={cx('text-xl font-extrabold', totals.over > 0 ? 'text-red-400' : 'text-slate-100')}>
            {totals.budget === 0 ? 'No budgets yet' : totals.over > 0 ? `${totals.over} over` : 'All on track'}
          </div>
        </div>
      </KpiStrip>

      {/* Phone summary */}
      <div className="md:hidden flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-slate-400">{daysLeft} days left in {monthName}</span>
          <Button variant="secondary" size="sm" onClick={openNew}><Plus size={14} /> New category</Button>
        </div>
        <div className="flex justify-between items-baseline rule-b pb-2.5">
          <span className="text-[13px] text-slate-400">Left this month</span>
          <span className={cx('text-xl font-extrabold tabular-nums', left < 0 ? 'text-red-400' : 'text-slate-100')}>{money(left)}</span>
        </div>
      </div>

      {/* Expense categories */}
      {loading ? <ListSkeleton rows={6} /> : rows.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No expense categories yet"
          description="Add a category to start organizing your spending and set a monthly budget."
          action={<Button variant="secondary" onClick={openNew}><Plus size={16} /> New category</Button>}
        />
      ) : (
        <>
          <section className="hidden md:block rule-t">
            <div className="grid gap-4 items-center h-[38px] rule-b t-th" style={{ gridTemplateColumns: expCols }}>
              <span>Expense category</span><span>Monthly budget</span><span>Budget vs actual</span>
              <span className="text-right">Spent</span><span className="text-right">Remaining</span><span /><span />
            </div>
            {rows.map((r) => {
              const i = rowInfo(r);
              return (
                <div key={r.id} className="grid gap-4 items-center min-h-[56px] row-rule group" style={{ gridTemplateColumns: expCols }}>
                  <div className="flex flex-col leading-[1.3] min-w-0">
                    <span className="text-sm font-semibold text-slate-100 truncate">{r.name}</span>
                    <span className="text-xs text-slate-400">{txLabel(r.count)}</span>
                  </div>
                  <BudgetInput row={r} currency={currency} onSave={setBudget} />
                  <Progress value={i.pct} marker={i.has ? marker : undefined} tone={i.over ? 'danger' : 'ink'} height={10} />
                  <span className={cx('text-right text-sm tabular-nums', i.over ? 'text-red-400 font-bold' : 'text-slate-100')}>
                    {money(r.spent)}
                  </span>
                  <span className={cx('text-right text-[13px] tabular-nums font-semibold', i.over ? 'text-red-400' : i.has ? 'text-slate-100' : 'text-slate-400 font-normal')}>
                    {i.remaining}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => view(r.id)}>View</Button>
                  {rowActions(r.id)}
                </div>
              );
            })}
          </section>

          {/* Phone list */}
          <section className="md:hidden">
            {rows.map((r) => {
              const i = rowInfo(r);
              return (
                <div key={r.id} className="flex flex-col gap-2 py-3 row-rule">
                  <div className="flex justify-between items-center gap-2.5">
                    <button type="button" onClick={() => handleEdit(r.id)} className="flex-1 min-w-0 text-left text-[15px] font-semibold text-slate-100 truncate">
                      {r.name}
                    </button>
                    <BudgetInput row={r} currency={currency} onSave={setBudget} className="w-[120px]" inputClassName="h-10 text-right text-[15px]" />
                  </div>
                  <Progress value={i.pct} tone={i.over ? 'danger' : 'ink'} height={6} />
                  <div className="flex justify-between text-xs">
                    <button type="button" onClick={() => view(r.id)} className="text-slate-400 tabular-nums text-left">
                      {money(r.spent)} spent · {txLabel(r.count)}
                    </button>
                    <span className={cx('font-semibold tabular-nums', i.over ? 'text-red-400' : i.has ? 'text-slate-100' : 'text-slate-400 font-normal')}>
                      {i.remaining}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}

      {/* Income categories */}
      {income.length > 0 && (
        <section className="rule-t">
          <div className="hidden md:grid gap-4 items-center h-[38px] rule-b t-th" style={{ gridTemplateColumns: incCols }}>
            <span>Income category</span><span>{monthName}</span><span className="text-right">Total · {currency}</span><span /><span />
          </div>
          <div className="md:hidden t-kicker pt-3 pb-1">Income · {monthName}</div>
          {income.map((c) => (
            <div key={c.id} className="row-rule group">
              <div className="hidden md:grid gap-4 items-center min-h-[52px]" style={{ gridTemplateColumns: incCols }}>
                <span className="text-sm font-semibold text-slate-100 truncate">{c.name}</span>
                <span className="text-[13px] text-slate-400">{txLabel(c.count)}</span>
                <span className={cx('text-right text-sm tabular-nums text-slate-100', c.total > 0 && 'font-bold')}>
                  {c.total > 0 ? formatMoney(c.total, currency, { sign: true }) : money(0)}
                </span>
                <Button variant="ghost" size="sm" onClick={() => view(c.id)}>View</Button>
                {rowActions(c.id)}
              </div>
              <div className="md:hidden flex items-center justify-between gap-3 min-h-[56px]">
                <button type="button" onClick={() => handleEdit(c.id)} className="flex flex-col leading-[1.3] text-left min-w-0">
                  <span className="text-[15px] font-semibold text-slate-100 truncate">{c.name}</span>
                  <span className="text-xs text-slate-400">{txLabel(c.count)}</span>
                </button>
                <button type="button" onClick={() => view(c.id)} className={cx('text-sm tabular-nums text-slate-100', c.total > 0 && 'font-bold')}>
                  {c.total > 0 ? formatMoney(c.total, currency, { sign: true }) : money(0)}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Create / edit */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingCategory ? 'Edit category' : 'New category'}
        maxWidth="max-w-xl"
        footer={
          <>
            {editingCategory && (
              <Button variant="danger" className="mr-auto"
                onClick={() => { const id = editingCategory.id; closeForm(); handleDelete(id); }}>
                <Trash2 size={14} /> Delete
              </Button>
            )}
            <Button variant="secondary" type="button" onClick={closeForm}>Cancel</Button>
            <Button type="submit" form="category-form">{editingCategory ? 'Update' : 'Create'}</Button>
          </>
        }
      >
        <form id="category-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Category name</label>
              <Input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Groceries"
              />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <Select
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value as Category['type'] })
                }
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Color</label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Color ${color}`}
                  onClick={() => setFormData({ ...formData, color })}
                  className={cx(
                    'w-9 h-9 border-2 transition-colors',
                    formData.color === color ? 'border-slate-100' : 'border-transparent',
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <CategoryIconPicker
            selectedIcon={formData.icon}
            onSelect={(icon) => setFormData({ ...formData, icon })}
          />
        </form>
      </Modal>
    </div>
  );
}
