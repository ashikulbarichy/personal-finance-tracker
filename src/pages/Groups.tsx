import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../lib/database.types';
import { Plus, CreditCard as Edit2, Trash2 } from 'lucide-react';

type Group = Database['public']['Tables']['transaction_groups']['Row'];

export function Groups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    color: '#6B7280',
  });

  const loadGroups = useCallback(async () => {
    if (!user) {
      setGroups([]);
      return;
    }

    const { data } = await supabase
      .from('transaction_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setGroups(data);
  }, [user]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      user_id: user.id,
      name: formData.name,
      color: formData.color,
    };

    if (editingGroup) {
      await supabase.from('transaction_groups').update(payload).eq('id', editingGroup.id);
    } else {
      await supabase.from('transaction_groups').insert(payload);
    }

    setShowForm(false);
    setEditingGroup(null);
    setFormData({ name: '', color: '#6B7280' });
    loadGroups();
  };

  const handleEdit = (group: Group) => {
    setEditingGroup(group);
    setFormData({ name: group.name, color: group.color });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this group?')) {
      await supabase.from('transaction_groups').delete().eq('id', id);
      loadGroups();
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">Transaction Groups</h3>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingGroup(null);
            setFormData({ name: '', color: '#6B7280' });
          }}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
        >
          <Plus size={20} />
          <span>Add Group</span>
        </button>
      </div>

      {showForm && (
        <div className="bg-[#141927] p-6 rounded-xl border border-slate-800">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">
            {editingGroup ? 'Edit Group' : 'New Group'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Vacation, Business Trip"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Color</label>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-16 h-10 border border-slate-600 rounded-lg cursor-pointer"
                />
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
              >
                {editingGroup ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingGroup(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-[0.97] text-slate-300 text-sm font-medium rounded-xl border border-slate-700/60 transition-all duration-150"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((group) => (
          <div
            key={group.id}
            className="bg-[#141927] p-6 rounded-xl border border-slate-800 flex items-center justify-between"
          >
            <div className="flex items-center space-x-3">
              <div
                className="w-8 h-8 rounded-full"
                style={{ backgroundColor: `${group.color}33` }}
              />
              <div>
                <h4 className="font-semibold text-slate-100">{group.name}</h4>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleEdit(group)}
                className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={() => handleDelete(group.id)}
                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {groups.length === 0 && !showForm && (
        <div className="text-center py-12 text-slate-500">
          <p>No groups yet. Create transaction groups to organize related entries.</p>
        </div>
      )}
    </div>
  );
}

