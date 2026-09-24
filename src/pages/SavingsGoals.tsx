import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { Plus, Pencil, Trash2, Undo2, X, Target } from 'lucide-react';
import { Button, IconButton, PageHeader, EmptyState, ListSkeleton, Modal, Input, Select, Progress, burst, fieldCls, labelCls, cx, useToast } from '../components/ui';
import { milestoneCrossed } from '../lib/notifications';
import { formatMoney, currencySymbol } from '../lib/money';
import type { Database } from '../lib/database.types';

type SavingsGoal = Database['public']['Tables']['savings_goals']['Row'];
type Account = Database['public']['Tables']['accounts']['Row'];
type SavingsAllocation = Database['public']['Tables']['savings_goal_allocations']['Row'];

type GoalTimeline = SavingsGoal['timeline'];

const TIMELINE_LABEL: Record<GoalTimeline, string> = {
  short_term: 'Short term',
  mid_term: 'Mid term',
  long_term: 'Long term',
};

function suggestTimeline(deadline: string): GoalTimeline {
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return 'short_term';
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return 'short_term';
  if (days <= 180) return 'short_term';     // <= ~6 months
  if (days <= 730) return 'mid_term';       // <= ~2 years
  return 'long_term';
}

const notifyChanged = () => window.dispatchEvent(new Event('ft-data-changed'));

/** Months left until the deadline (at least 1), or null if no/past deadline. */
function monthsUntil(deadline: string | null): number | null {
  if (!deadline) return null;
  const today = new Date();
  const deadlineDate = new Date(deadline);
  if (!(deadlineDate > today)) return null;
  let months = (deadlineDate.getFullYear() - today.getFullYear()) * 12 + (deadlineDate.getMonth() - today.getMonth());
  if (deadlineDate.getDate() > today.getDate()) months += 1;
  return Math.max(1, months);
}

export function SavingsGoals({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  const { fmt } = useUserPrefs();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allocations, setAllocations] = useState<SavingsAllocation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  // Inline "Add money" state (one goal at a time)
  const [addingId, setAddingId] = useState<string | null>(null);
  const [allocateAmount, setAllocateAmount] = useState('');
  const [allocateAccountId, setAllocateAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    timeline: 'short_term' as GoalTimeline,
    target_amount: '',
    current_amount: '0',
    deadline: '',
    account_id: '',
  });

  const loadData = useCallback(async () => {
    if (!user) {
      setGoals([]);
      setAccounts([]);
      return;
    }

    const [goalsRes, accountsRes, allocationsRes] = await Promise.all([
      supabase
        .from('savings_goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase
        .from('savings_goal_allocations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ]);

    if (goalsRes.data) setGoals(goalsRes.data);
    if (accountsRes.data) setAccounts(accountsRes.data);
    if (allocationsRes.data) setAllocations(allocationsRes.data);
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    loadData();
    const onChange = () => loadData();
    window.addEventListener('ft-data-changed', onChange);
    return () => window.removeEventListener('ft-data-changed', onChange);
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const goalData = {
      user_id: user.id,
      name: formData.name,
      timeline: formData.timeline,
      target_amount: parseFloat(formData.target_amount),
      current_amount: parseFloat(formData.current_amount),
      deadline: formData.deadline || null,
      account_id: null,
    };

    if (editingGoal) {
      await supabase.from('savings_goals').update(goalData).eq('id', editingGoal.id);
    } else {
      await supabase.from('savings_goals').insert(goalData);
    }

    setShowForm(false);
    setEditingGoal(null);
    resetForm();
    loadData();
    notifyChanged();
  };

  const startAdding = (goal: SavingsGoal) => {
    setAddingId(goal.id);
    setAllocateAmount('');
    setAllocateAccountId((prev) => (prev && accounts.some((a) => a.id === prev) ? prev : accounts[0]?.id ?? ''));
  };

  const cancelAdding = () => {
    setAddingId(null);
    setAllocateAmount('');
  };

  const toast = useToast();

  const handleAllocate = async (goal: SavingsGoal, from?: HTMLElement) => {
    if (!allocateAmount || !allocateAccountId || !user) return;

    const amount = parseFloat(allocateAmount);
    if (!amount || amount <= 0) return;

    setSaving(true);
    const newAmount = Number(goal.current_amount) + amount;
    const isCompleted = newAmount >= Number(goal.target_amount);

    const { error: allocError } = await supabase.from('savings_goal_allocations').insert({
      user_id: user.id,
      goal_id: goal.id,
      account_id: allocateAccountId,
      amount,
    });

    if (!allocError) {
      await supabase
        .from('savings_goals')
        .update({
          current_amount: newAmount,
          is_completed: isCompleted,
        })
        .eq('id', goal.id);
    }

    setSaving(false);
    cancelAdding();
    loadData();
    notifyChanged();

    // Celebrate crossing 25 / 50 / 75 / 100%.
    if (!allocError) {
      const m = milestoneCrossed(Number(goal.current_amount), newAmount, Number(goal.target_amount));
      if (m) {
        const r = from?.getBoundingClientRect();
        burst(r ? r.left + Math.min(r.width / 2, 160) : undefined, r ? r.top + r.height / 2 : undefined);
        toast.show(m === 100 ? `${goal.name} is fully funded. Well done!` : `${goal.name} passed ${m}% — keep going.`);
      }
    }
  };

  // Undo a single allocation (revert the amount from the goal)
  const handleUndoAllocation = async (goal: SavingsGoal, allocation: SavingsAllocation) => {
    if (!user) return;

    const amount = Number(allocation.amount);
    const current = Number(goal.current_amount);
    const target = Number(goal.target_amount);

    const updatedAmount = Math.max(current - amount, 0);
    const isCompleted = updatedAmount >= target;

    // Remove the allocation row first
    const { error: delError } = await supabase
      .from('savings_goal_allocations')
      .delete()
      .eq('id', allocation.id)
      .eq('user_id', user.id);

    if (!delError) {
      await supabase
        .from('savings_goals')
        .update({
          current_amount: updatedAmount,
          is_completed: isCompleted,
        })
        .eq('id', goal.id)
        .eq('user_id', user.id);
    }

    loadData();
    notifyChanged();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      timeline: 'short_term',
      target_amount: '',
      current_amount: '0',
      deadline: '',
      account_id: '',
    });
  };

  const openNew = () => {
    setShowForm(true);
    setEditingGoal(null);
    resetForm();
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingGoal(null);
  };

  const handleEdit = (goal: SavingsGoal) => {
    setEditingGoal(goal);
    setFormData({
      name: goal.name,
      timeline: goal.timeline ?? 'short_term',
      target_amount: goal.target_amount.toString(),
      current_amount: goal.current_amount.toString(),
      deadline: goal.deadline || '',
      account_id: '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this savings goal?')) {
      if (user) {
        // Clean up all allocations tied to this goal so allocated amounts/stat cards stay accurate
        await supabase
          .from('savings_goal_allocations')
          .delete()
          .eq('goal_id', id)
          .eq('user_id', user.id);
      }

      await supabase.from('savings_goals').delete().eq('id', id);
      loadData();
      notifyChanged();
    }
  };

  const [displayCurrency, setDisplayCurrency] = useState('USD');

  useEffect(() => {
    const loadCurrency = async () => {
      if (!user) {
        setDisplayCurrency('USD');
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('default_currency')
        .eq('id', user.id)
        .single();
      setDisplayCurrency(data?.default_currency || 'USD');
    };
    loadCurrency();
  }, [user]);

  const cur = displayCurrency;
  const newGoalButton = (
    <Button variant="secondary" onClick={openNew}>
      <Plus size={16} /> New goal
    </Button>
  );
  // Filler cells keep the 3-col ruled grid solid when the last row is short.
  const fillers = goals.length % 3 === 0 ? 0 : 3 - (goals.length % 3);

  const body = (
    <>
      {goals.length > 0 && (
        <div
          className={cx(
            'flex flex-col gap-3',
            'md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-[2px] md:bg-line-strong md:rule-t md:rule-b',
          )}
        >
          {goals.map((goal) => {
            const saved = Number(goal.current_amount);
            const target = Number(goal.target_amount);
            const percentage = target > 0 ? (saved / target) * 100 : 0;
            const remaining = Math.max(0, target - saved);
            const done = goal.is_completed || (target > 0 && saved >= target);
            const months = done ? null : monthsUntil(goal.deadline);
            const monthlyNeeded = months && remaining > 0 ? remaining / months : null;
            const lastAllocation = allocations.find((a) => a.goal_id === goal.id);
            const timeline = TIMELINE_LABEL[(goal.timeline ?? 'short_term') as GoalTimeline];
            const adding = addingId === goal.id;

            let need: React.ReactNode;
            if (done) need = 'Goal reached — nicely done.';
            else if (monthlyNeeded !== null)
              need = (
                <>
                  Save <span className="font-bold tabular-nums">{formatMoney(monthlyNeeded, cur)}</span>/month to finish by {fmt(goal.deadline)}
                </>
              );
            else if (goal.deadline) need = <>The deadline has passed · <span className="tabular-nums">{formatMoney(remaining, cur)}</span> to go</>;
            else need = 'No deadline set — add one to see a monthly amount.';

            return (
              <div
                key={goal.id}
                className={cx(
                  'bg-surface p-4 flex flex-col gap-3',
                  'md:bg-app md:p-[22px] md:gap-3.5',
                  'md:[&:nth-child(2n+1)]:pl-0 lg:[&:nth-child(2n+1)]:pl-[22px] lg:[&:nth-child(3n+1)]:!pl-0',
                )}
              >
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-[17px] md:text-[19px] font-extrabold text-slate-100 min-w-0 truncate">{goal.name}</span>
                  <span className="text-xs text-slate-400 shrink-0">
                    {goal.deadline ? `by ${fmt(goal.deadline)}` : timeline}
                  </span>
                </div>
                <div>
                  <span className="text-2xl md:text-[30px] font-extrabold tracking-[-0.02em] tabular-nums text-slate-100">
                    {formatMoney(saved, cur)}
                  </span>
                  <span className="text-[13px] md:text-sm text-slate-400">
                    {' '}of <span className="tabular-nums">{formatMoney(target, cur)}</span>
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Progress value={percentage} tone="accent" height={8} className="!bg-slate-800 md:!bg-slate-900" />
                  <div className="hidden md:flex justify-between text-xs">
                    <span className="font-bold text-slate-100">{Math.round(Math.min(percentage, 100))}%</span>
                    <span className="text-slate-400 tabular-nums">
                      {done ? 'Complete' : `${formatMoney(remaining, cur)} left`}
                    </span>
                  </div>
                </div>
                <div className="text-[13px] md:text-sm text-slate-100 md:py-2.5 md:border-y md:border-line">{need}</div>

                {adding ? (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(e) => { e.preventDefault(); handleAllocate(goal, e.currentTarget); }}
                  >
                    <div className="flex gap-2">
                      <div className="relative flex-1 min-w-0">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                          {currencySymbol(cur).trim()}
                        </span>
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={allocateAmount}
                          onChange={(e) => setAllocateAmount(e.target.value)}
                          placeholder="Amount"
                          className={cx(fieldCls, 'pl-8 h-11 md:h-9 tabular-nums')}
                        />
                      </div>
                      <Button type="submit" disabled={saving || !allocateAmount || !allocateAccountId} className="h-11 md:h-9">
                        Add
                      </Button>
                      <IconButton aria-label="Cancel" onClick={cancelAdding} className="w-11 h-11 md:w-9 md:h-9">
                        <X size={14} />
                      </IconButton>
                    </div>
                    {accounts.length > 0 ? (
                      <Select
                        aria-label="From account"
                        value={allocateAccountId}
                        onChange={(e) => setAllocateAccountId(e.target.value)}
                        className="h-11 md:h-9"
                      >
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            From {account.name}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-xs text-red-400">Add an account first — money is reserved from an account.</span>
                    )}
                  </form>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button variant="secondary" onClick={() => startAdding(goal)} className="h-11 md:h-9 flex-1 md:flex-none !justify-start md:!justify-center bg-app md:bg-transparent">
                      <Plus size={16} /> Add money
                    </Button>
                    <span className="flex-1 hidden md:block" />
                    {lastAllocation && (
                      <IconButton
                        bordered={false}
                        aria-label={`Undo last ${formatMoney(Number(lastAllocation.amount), cur)}`}
                        title={`Undo last (${formatMoney(Number(lastAllocation.amount), cur)})`}
                        onClick={() => handleUndoAllocation(goal, lastAllocation)}
                        className="w-11 h-11 md:w-9 md:h-9 text-slate-400"
                      >
                        <Undo2 size={15} />
                      </IconButton>
                    )}
                    <IconButton bordered={false} aria-label="Edit goal" onClick={() => handleEdit(goal)} className="w-11 h-11 md:w-9 md:h-9 text-slate-400">
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton bordered={false} aria-label="Delete goal" onClick={() => handleDelete(goal.id)} className="w-11 h-11 md:w-9 md:h-9 text-slate-400 hover:text-red-400">
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                )}
              </div>
            );
          })}
          {Array.from({ length: fillers }).map((_, i) => (
            <div key={`f${i}`} aria-hidden className="hidden lg:block bg-app" />
          ))}
          {goals.length % 2 === 1 && <div aria-hidden className="hidden md:block lg:hidden bg-app" />}
        </div>
      )}

      {!loaded && <ListSkeleton rows={3} />}

      {loaded && goals.length === 0 && (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="Create a goal and add money as you go — we'll work out the monthly amount."
          action={
            <Button onClick={openNew}>
              <Plus size={16} /> New goal
            </Button>
          }
        />
      )}

      <Modal open={showForm} onClose={closeForm} title={editingGoal ? 'Edit goal' : 'New goal'} maxWidth="max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Goal name</label>
              <Input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Emergency Fund"
              />
            </div>
            <div>
              <label className={labelCls}>Goal type (timeline)</label>
              <Select
                value={formData.timeline}
                onChange={(e) => setFormData({ ...formData, timeline: e.target.value as GoalTimeline })}
              >
                <option value="short_term">Short term</option>
                <option value="mid_term">Mid term</option>
                <option value="long_term">Long term</option>
              </Select>
              {formData.deadline && (
                <p className="text-xs text-slate-400 mt-1">
                  Suggested: <span className="font-semibold text-slate-300">{TIMELINE_LABEL[suggestTimeline(formData.deadline)]}</span>
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Target amount</label>
              <Input
                type="number"
                step="0.01"
                required
                value={formData.target_amount}
                onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Current amount</label>
              <Input
                type="number"
                step="0.01"
                required
                value={formData.current_amount}
                onChange={(e) => setFormData({ ...formData, current_amount: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Deadline (optional)</label>
              <Input
                type="date"
                value={formData.deadline}
                onChange={(e) => {
                  const deadline = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    deadline,
                    // if user hasn't edited timeline yet, keep default; otherwise they can override manually
                    timeline: prev.timeline || (deadline ? suggestTimeline(deadline) : 'short_term'),
                  }));
                }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit">{editingGoal ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-slate-400">Monthly amounts update as you add money</span>
          {newGoalButton}
        </div>
        {body}
      </div>
    );
  }

  return (
    <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-5 md:gap-6">
      <PageHeader description="Monthly amounts update as you add money" actions={newGoalButton} />
      {body}
    </div>
  );
}
