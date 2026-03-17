import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, CreditCard as Edit2, Trash2 } from 'lucide-react';
import type { Database } from '../lib/database.types';

type Category = Database['public']['Tables']['categories']['Row'];

const colorOptions = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#14B8A6'];

export function Categories() {
  const { user } = useAuth();
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
  }, [loadCategories]);

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
    loadCategories();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'expense',
      icon: 'shopping-cart',
      color: '#3B82F6',
    });
  };

  const handleEdit = (category: Category) => {
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
      loadCategories();
    }
  };

  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const incomeCategories = categories.filter((c) => c.type === 'income');

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">Manage Categories</h3>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingCategory(null);
            resetForm();
          }}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
        >
          <Plus size={20} />
          <span>Add Category</span>
        </button>
      </div>

      {showForm && (
        <div className="bg-[#141927] p-6 rounded-xl border border-slate-800">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">
            {editingCategory ? 'Edit Category' : 'New Category'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Groceries"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value as Category['type'] })
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Color</label>
              <div className="flex space-x-2">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-10 h-10 rounded-lg border-2 ${
                      formData.color === color ? 'border-gray-900' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
              >
                {editingCategory ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingCategory(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-[0.97] text-slate-300 text-sm font-medium rounded-xl border border-slate-700/60 transition-all duration-150"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <h4 className="text-md font-semibold text-slate-100 mb-3">Expense Categories</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {expenseCategories.map((category) => (
              <div
                key={category.id}
                className="bg-[#141927] p-4 rounded-xl border border-slate-800 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${category.color}20` }}
                  >
                    <span style={{ color: category.color }} className="text-lg font-bold">
                      {category.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="font-medium text-slate-100">{category.name}</span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEdit(category)}
                    className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(category.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {expenseCategories.length === 0 && (
            <p className="text-slate-500 text-sm">No expense categories yet</p>
          )}
        </div>

        <div>
          <h4 className="text-md font-semibold text-slate-100 mb-3">Income Categories</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {incomeCategories.map((category) => (
              <div
                key={category.id}
                className="bg-[#141927] p-4 rounded-xl border border-slate-800 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${category.color}20` }}
                  >
                    <span style={{ color: category.color }} className="text-lg font-bold">
                      {category.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="font-medium text-slate-100">{category.name}</span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEdit(category)}
                    className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(category.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {incomeCategories.length === 0 && (
            <p className="text-slate-500 text-sm">No income categories yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
