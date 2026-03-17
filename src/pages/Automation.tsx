import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, CreditCard as Edit2, Trash2, Power, PowerOff, Zap } from 'lucide-react';
import type { Database, Json } from '../lib/database.types';

type AutomationRule = Database['public']['Tables']['automation_rules']['Row'];

type Category = Pick<Database['public']['Tables']['categories']['Row'], 'id' | 'name' | 'type'>;

export function Automation() {
  const { user } = useAuth();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    trigger_type: 'transaction_created',
    merchant_pattern: '',
    amount_threshold: '',
    action_type: 'categorize',
    category_id: '',
    savings_percentage: '',
  });

  const loadData = useCallback(async () => {
    if (!user) {
      setRules([]);
      setCategories([]);
      return;
    }

    const [rulesRes, categoriesRes] = await Promise.all([
      supabase
        .from('automation_rules')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('categories').select('id, name, type').eq('user_id', user.id),
    ]);

    if (rulesRes.data) setRules(rulesRes.data);
    if (categoriesRes.data) setCategories(categoriesRes.data);
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trigger_conditions: Record<string, Json | undefined> = {};
    const action_params: Record<string, Json | undefined> = {};

    if (formData.trigger_type === 'transaction_created' && formData.merchant_pattern) {
      trigger_conditions.merchant_pattern = formData.merchant_pattern;
    }
    if (formData.trigger_type === 'transaction_amount' && formData.amount_threshold) {
      trigger_conditions.amount_threshold = formData.amount_threshold;
    }

    if (formData.action_type === 'categorize' && formData.category_id) {
      action_params.category_id = formData.category_id;
    }
    if (formData.action_type === 'move_to_savings' && formData.savings_percentage) {
      action_params.savings_percentage = formData.savings_percentage;
    }

    const ruleData = {
      user_id: user.id,
      name: formData.name,
      description: formData.description,
      trigger_type: formData.trigger_type,
      trigger_conditions,
      action_type: formData.action_type,
      action_params,
    };

    if (editingRule) {
      await supabase.from('automation_rules').update(ruleData).eq('id', editingRule.id);
    } else {
      await supabase.from('automation_rules').insert(ruleData);
    }

    setShowForm(false);
    setEditingRule(null);
    resetForm();
    loadData();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      trigger_type: 'transaction_created',
      merchant_pattern: '',
      amount_threshold: '',
      action_type: 'categorize',
      category_id: '',
      savings_percentage: '',
    });
  };

  const handleEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    const triggerConditions =
      rule.trigger_conditions && typeof rule.trigger_conditions === 'object' && !Array.isArray(rule.trigger_conditions)
        ? (rule.trigger_conditions as Record<string, unknown>)
        : {};
    const actionParams =
      rule.action_params && typeof rule.action_params === 'object' && !Array.isArray(rule.action_params)
        ? (rule.action_params as Record<string, unknown>)
        : {};

    setFormData({
      name: rule.name,
      description: rule.description || '',
      trigger_type: rule.trigger_type,
      merchant_pattern: typeof triggerConditions.merchant_pattern === 'string' ? triggerConditions.merchant_pattern : '',
      amount_threshold:
        typeof triggerConditions.amount_threshold === 'string' ? triggerConditions.amount_threshold : '',
      action_type: rule.action_type,
      category_id: typeof actionParams.category_id === 'string' ? actionParams.category_id : '',
      savings_percentage:
        typeof actionParams.savings_percentage === 'string' ? actionParams.savings_percentage : '',
    });
    setShowForm(true);
  };

  const handleToggle = async (rule: AutomationRule) => {
    await supabase
      .from('automation_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this automation rule?')) {
      await supabase.from('automation_rules').delete().eq('id', id);
      loadData();
    }
  };

  const getTriggerDescription = (rule: AutomationRule) => {
    const triggerConditions =
      rule.trigger_conditions && typeof rule.trigger_conditions === 'object' && !Array.isArray(rule.trigger_conditions)
        ? (rule.trigger_conditions as Record<string, unknown>)
        : {};
    switch (rule.trigger_type) {
      case 'transaction_created':
        return `When transaction contains "${
          typeof triggerConditions.merchant_pattern === 'string' ? triggerConditions.merchant_pattern : 'any'
        }"`;
      case 'transaction_amount':
        return `When transaction amount >= $${
          typeof triggerConditions.amount_threshold === 'string' ? triggerConditions.amount_threshold : 0
        }`;
      case 'income_received':
        return 'When income is received';
      case 'date_based':
        return 'On a specific date';
      case 'balance_threshold':
        return 'When account balance crosses threshold';
      default:
        return rule.trigger_type;
    }
  };

  const getActionDescription = (rule: AutomationRule) => {
    switch (rule.action_type) {
      case 'categorize':
        {
          const categoryId =
            (rule.action_params as Record<string, unknown> | null)?.category_id ?? null;
          const category =
            typeof categoryId === 'string' ? categories.find((c) => c.id === categoryId) : undefined;
          return `Auto-categorize as "${category?.name || 'unknown'}"`;
        }
      case 'move_to_savings':
        {
          const savingsPercentage =
            (rule.action_params as Record<string, unknown> | null)?.savings_percentage ?? 0;
          return `Move ${typeof savingsPercentage === 'string' ? savingsPercentage : 0}% to savings`;
        }
      case 'create_budget_alert':
        return 'Create budget alert';
      case 'send_notification':
        return 'Send notification';
      default:
        return rule.action_type;
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Automation Rules</h3>
          <p className="text-sm text-slate-400 mt-1">
            Create rules to automatically manage your finances
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingRule(null);
            resetForm();
          }}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
        >
          <Plus size={20} />
          <span>Add Rule</span>
        </button>
      </div>

      {showForm && (
        <div className="bg-[#141927] p-6 rounded-xl border border-slate-800">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">
            {editingRule ? 'Edit Automation Rule' : 'New Automation Rule'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Rule Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Auto-categorize Amazon purchases"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Description (Optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Trigger</label>
                <select
                  value={formData.trigger_type}
                  onChange={(e) => setFormData({ ...formData, trigger_type: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="transaction_created">Transaction Created (Merchant Match)</option>
                  <option value="transaction_amount">Transaction Amount Threshold</option>
                  <option value="income_received">Income Received</option>
                </select>
              </div>

              {formData.trigger_type === 'transaction_created' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Merchant Pattern
                  </label>
                  <input
                    type="text"
                    value={formData.merchant_pattern}
                    onChange={(e) => setFormData({ ...formData, merchant_pattern: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Amazon, Walmart"
                  />
                </div>
              )}

              {formData.trigger_type === 'transaction_amount' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Amount Threshold ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount_threshold}
                    onChange={(e) => setFormData({ ...formData, amount_threshold: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 100"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Action</label>
                <select
                  value={formData.action_type}
                  onChange={(e) => setFormData({ ...formData, action_type: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="categorize">Auto-categorize</option>
                  <option value="move_to_savings">Move to Savings</option>
                  <option value="send_notification">Send Notification</option>
                </select>
              </div>

              {formData.action_type === 'categorize' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                  <select
                    required
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.type})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formData.action_type === 'move_to_savings' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Percentage (%)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.savings_percentage}
                    onChange={(e) =>
                      setFormData({ ...formData, savings_percentage: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 10"
                  />
                </div>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
              >
                {editingRule ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingRule(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-[0.97] text-slate-300 text-sm font-medium rounded-xl border border-slate-700/60 transition-all duration-150"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`bg-[#141927] p-6 rounded-xl border-2 ${
              rule.is_active ? 'border-blue-200' : 'border-slate-800'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <Zap size={20} className={rule.is_active ? 'text-blue-600' : 'text-slate-600'} />
                  <h4 className="font-semibold text-slate-100">{rule.name}</h4>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      rule.is_active
                        ? 'bg-emerald-500/10 text-green-700'
                        : 'bg-slate-800/40 text-slate-300'
                    }`}
                  >
                    {rule.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {rule.description && (
                  <p className="text-sm text-slate-400 mt-2">{rule.description}</p>
                )}

                <div className="mt-3 space-y-1">
                  <p className="text-sm text-slate-300">
                    <span className="font-medium">When:</span> {getTriggerDescription(rule)}
                  </p>
                  <p className="text-sm text-slate-300">
                    <span className="font-medium">Then:</span> {getActionDescription(rule)}
                  </p>
                </div>

                <div className="mt-3 flex items-center space-x-4 text-xs text-slate-500">
                  <span>Executed {rule.execution_count} times</span>
                  {rule.last_executed_at && (
                    <span>
                      Last: {new Date(rule.last_executed_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => handleToggle(rule)}
                  className={`p-2 rounded ${
                    rule.is_active
                      ? 'text-emerald-400 hover:bg-emerald-500/10'
                      : 'text-slate-500 hover:bg-slate-800'
                  }`}
                >
                  {rule.is_active ? <Power size={18} /> : <PowerOff size={18} />}
                </button>
                <button
                  onClick={() => handleEdit(rule)}
                  className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
                >
                  <Edit2 size={18} />
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {rules.length === 0 && !showForm && (
        <div className="text-center py-12 text-slate-500 bg-[#141927] rounded-xl border border-slate-800">
          <Zap className="mx-auto mb-4 text-slate-600" size={48} />
          <p className="text-lg font-medium">No automation rules yet</p>
          <p className="text-sm mt-2">
            Create rules to automatically categorize transactions, move money to savings, and more
          </p>
        </div>
      )}

      <div className="bg-blue-500/10 border border-blue-200 rounded-lg p-4">
        <h5 className="font-semibold text-blue-900 mb-2">Example Automation Rules</h5>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Auto-categorize all Amazon purchases as Shopping</li>
          <li>• Move 10% of income to savings automatically</li>
          <li>• Categorize transactions over $500 as Large Expenses</li>
          <li>• Auto-tag all Starbucks purchases as Coffee</li>
        </ul>
      </div>
    </div>
  );
}
