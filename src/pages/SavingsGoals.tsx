import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { Plus, CreditCard as Edit2, Trash2, TrendingUp } from 'lucide-react';
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

export function SavingsGoals() {
  const { user } = useAuth();
  const { fmt } = useUserPrefs();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allocations, setAllocations] = useState<SavingsAllocation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [showAllocateModal, setShowAllocateModal] = useState<SavingsGoal | null>(null);
  const [allocateAmount, setAllocateAmount] = useState('');
  const [allocateAccountId, setAllocateAccountId] = useState('');
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
  }, [user]);

  useEffect(() => {
    loadData();
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
  };

  const handleAllocate = async () => {
    if (!showAllocateModal || !allocateAmount || !allocateAccountId || !user) return;

    const amount = parseFloat(allocateAmount);
    if (!amount || amount <= 0) return;

    const newAmount = Number(showAllocateModal.current_amount) + amount;
    const isCompleted = newAmount >= Number(showAllocateModal.target_amount);

    const { error: allocError } = await supabase.from('savings_goal_allocations').insert({
      user_id: user.id,
      goal_id: showAllocateModal.id,
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
        .eq('id', showAllocateModal.id);
    }

    setShowAllocateModal(null);
    setAllocateAmount('');
    setAllocateAccountId('');
    loadData();
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
    }
  };

  const totalSaved = goals.reduce((sum, g) => sum + Number(g.current_amount), 0);
  const totalTarget = goals.reduce((sum, g) => sum + Number(g.target_amount), 0);
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

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#141927] p-6 rounded-xl border border-slate-800">
          <p className="text-sm text-slate-400">Total Saved</p>
          <p className="text-3xl font-bold text-emerald-400 mt-1">
            {displayCurrency} {totalSaved.toFixed(2)}
          </p>
        </div>
        <div className="bg-[#141927] p-6 rounded-xl border border-slate-800">
          <p className="text-sm text-slate-400">Total Target</p>
          <p className="text-3xl font-bold text-slate-100 mt-1">
            {displayCurrency} {totalTarget.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">Savings Goals</h3>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingGoal(null);
            resetForm();
          }}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
        >
          <Plus size={20} />
          <span>Add Goal</span>
        </button>
      </div>

      {showForm && (
        <div className="bg-[#141927] p-6 rounded-xl border border-slate-800">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">
            {editingGoal ? 'Edit Savings Goal' : 'New Savings Goal'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Goal Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Emergency Fund"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Goal Type (Timeline)
                </label>
                <select
                  value={formData.timeline}
                  onChange={(e) => setFormData({ ...formData, timeline: e.target.value as GoalTimeline })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="short_term">Short term</option>
                  <option value="mid_term">Mid term</option>
                  <option value="long_term">Long term</option>
                </select>
                {formData.deadline && (
                  <p className="text-xs text-slate-500 mt-1">
                    Suggested: <span className="font-semibold text-slate-300">{TIMELINE_LABEL[suggestTimeline(formData.deadline)]}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Target Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.target_amount}
                  onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Current Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.current_amount}
                  onChange={(e) => setFormData({ ...formData, current_amount: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Deadline (Optional)
                </label>
                <input
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
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
              >
                {editingGoal ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingGoal(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-[0.97] text-slate-300 text-sm font-medium rounded-xl border border-slate-700/60 transition-all duration-150"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showAllocateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#141927] p-6 rounded-lg max-w-md w-full">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">
              Allocate Money to {showAllocateModal.name}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={allocateAmount}
                  onChange={(e) => setAllocateAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter amount to allocate"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  From Account
                </label>
                <select
                  value={allocateAccountId}
                  onChange={(e) => setAllocateAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleAllocate}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
                >
                  Allocate
                </button>
                <button
                  onClick={() => {
                    setShowAllocateModal(null);
                    setAllocateAmount('');
                    setAllocateAccountId('');
                  }}
                  className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-[0.97] text-slate-300 text-sm font-medium rounded-xl border border-slate-700/60 transition-all duration-150"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {goals.map((goal) => {
          const percentage = (Number(goal.current_amount) / Number(goal.target_amount)) * 100;
          const remaining = Number(goal.target_amount) - Number(goal.current_amount);

          const goalAllocations = allocations.filter((a) => a.goal_id === goal.id);
          const lastAllocation = goalAllocations[0];

          let monthlyNeeded: number | null = null;
          if (!goal.is_completed && goal.deadline) {
            const today = new Date();
            const deadlineDate = new Date(goal.deadline);
            if (deadlineDate > today && remaining > 0) {
              const yearDiff = deadlineDate.getFullYear() - today.getFullYear();
              const monthDiff = deadlineDate.getMonth() - today.getMonth();
              let months = yearDiff * 12 + monthDiff;
              if (deadlineDate.getDate() > today.getDate()) {
                months += 1;
              }
              if (months < 1) {
                months = 1;
              }
              monthlyNeeded = remaining / months;
            }
          }

          return (
            <div
              key={goal.id}
              className={`bg-[#141927] p-6 rounded-lg border-2 ${
                goal.is_completed ? 'border-green-500' : 'border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-slate-100">{goal.name}</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                      {TIMELINE_LABEL[(goal.timeline ?? 'short_term') as GoalTimeline]}
                    </span>
                  </div>
                  {goal.deadline && (
                    <p className="text-xs text-slate-500 mt-1">
                      Due: {fmt(goal.deadline)}
                    </p>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setShowAllocateModal(goal)}
                    className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all"
                  >
                    <TrendingUp size={16} />
                  </button>
                  <button
                    onClick={() => handleEdit(goal)}
                    className="p-2 text-slate-500 hover:text-blue-600"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(goal.id)}
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Progress</span>
                  <span className="font-semibold">
                    {displayCurrency} {Number(goal.current_amount).toFixed(2)} /{' '}
                    {displayCurrency} {Number(goal.target_amount).toFixed(2)}
                  </span>
                </div>

                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      goal.is_completed ? 'bg-emerald-500/100' : 'bg-blue-500/100'
                    }`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {goal.is_completed
                      ? 'Completed!'
                      : `${displayCurrency} ${remaining.toFixed(2)} remaining`}
                  </span>
                  <span className="text-xs text-slate-500">{percentage.toFixed(1)}%</span>
                </div>

                {!goal.is_completed && monthlyNeeded !== null && (
                  <div className="mt-1 text-xs text-slate-500">
                    Need to save approximately{' '}
                    <span className="font-semibold">
                      {displayCurrency} {monthlyNeeded.toFixed(2)}
                    </span>{' '}
                    per month to reach this goal.
                  </div>
                )}

                {/* Undo last allocation helper */}
                {lastAllocation && (
                  <div className="mt-3 pt-3 border-t border-slate-800/70 flex items-center justify-between">
                    <div className="text-[11px] text-slate-500">
                      Last allocation:{' '}
                      <span className="font-semibold text-slate-200">
                        {displayCurrency} {Number(lastAllocation.amount).toFixed(2)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUndoAllocation(goal, lastAllocation)}
                      className="text-[11px] px-2 py-1 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-amber-300 transition-colors"
                    >
                      Undo last
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {goals.length === 0 && !showForm && (
        <div className="text-center py-12 text-slate-500">
          <p>No savings goals yet. Create your first goal to start saving.</p>
        </div>
      )}
    </div>
  );
}
