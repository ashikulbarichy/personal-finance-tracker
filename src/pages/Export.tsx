import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Download, FileText, Database } from 'lucide-react';
import type { Database as Db } from '../lib/database.types';

export function Export() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [exportType, setExportType] = useState<'transactions' | 'all'>('transactions');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const exportToCSV = <T extends Record<string, unknown>>(data: T[], filename: string) => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string' && value.includes(',')) {
              return `"${value}"`;
            }
            return value;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToJSON = <T,>(data: T, filename: string) => {
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportTransactions = async () => {
    if (!user) return;
    setLoading(true);

    try {
      let query = supabase
        .from('transactions')
        .select('*, accounts(name), categories(name)')
        .eq('user_id', user.id);

      if (startDate) query = query.gte('transaction_date', startDate);
      if (endDate) query = query.lte('transaction_date', endDate);

      const { data } = await query.order('transaction_date', { ascending: false });

      if (!data || data.length === 0) {
        alert('No transactions found for the selected period');
        return;
      }

      type TransactionExportRow = Db['public']['Tables']['transactions']['Row'] & {
        accounts: { name: string } | null;
        categories: { name: string } | null;
      };

      const formattedData = (data as TransactionExportRow[]).map((t) => ({
        date: t.transaction_date,
        description: t.description || '',
        amount: t.amount,
        type: t.type,
        account: t.accounts?.name || '',
        category: t.categories?.name || '',
        notes: t.notes || '',
      }));

      const timestamp = new Date().toISOString().split('T')[0];
      if (format === 'csv') {
        exportToCSV(formattedData, `transactions-${timestamp}.csv`);
      } else {
        exportToJSON(formattedData, `transactions-${timestamp}.json`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportAll = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const [
        { data: accounts },
        { data: transactions },
        { data: categories },
        { data: budgets },
        { data: goals },
        { data: loans },
        { data: recurring },
      ] = await Promise.all([
        supabase.from('accounts').select('*').eq('user_id', user.id),
        supabase.from('transactions').select('*').eq('user_id', user.id),
        supabase.from('categories').select('*').eq('user_id', user.id),
        supabase.from('budgets').select('*').eq('user_id', user.id),
        supabase.from('savings_goals').select('*').eq('user_id', user.id),
        supabase.from('loans').select('*').eq('user_id', user.id),
        supabase.from('recurring_transactions').select('*').eq('user_id', user.id),
      ]);

      const allData = {
        accounts: accounts || [],
        transactions: transactions || [],
        categories: categories || [],
        budgets: budgets || [],
        savings_goals: goals || [],
        loans: loans || [],
        recurring_transactions: recurring || [],
        exported_at: new Date().toISOString(),
      };

      const timestamp = new Date().toISOString().split('T')[0];
      if (format === 'csv') {
        (Object.entries(allData) as Array<[string, unknown]>).forEach(([key, value]) => {
          if (Array.isArray(value) && value.length > 0) {
            exportToCSV(value as Record<string, unknown>[], `${key}-${timestamp}.csv`);
          }
        });
      } else {
        exportToJSON(allData, `finance-data-${timestamp}.json`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (exportType === 'transactions') {
      handleExportTransactions();
    } else {
      handleExportAll();
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-100">Export Your Data</h3>
        <p className="text-sm text-slate-400 mt-1">
          Download your financial data in CSV or JSON format
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          onClick={() => setExportType('transactions')}
          className={`bg-[#141927] p-6 rounded-xl border-2 cursor-pointer transition-all ${
            exportType === 'transactions'
              ? 'border-blue-500 ring-2 ring-blue-100'
              : 'border-slate-800 hover:border-slate-600'
          }`}
        >
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <FileText className="text-blue-400" size={24} />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-slate-100">Transactions Only</h4>
              <p className="text-sm text-slate-400 mt-1">
                Export your transaction history with optional date filtering
              </p>
            </div>
          </div>
        </div>

        <div
          onClick={() => setExportType('all')}
          className={`bg-[#141927] p-6 rounded-xl border-2 cursor-pointer transition-all ${
            exportType === 'all'
              ? 'border-blue-500 ring-2 ring-blue-100'
              : 'border-slate-800 hover:border-slate-600'
          }`}
        >
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-emerald-500/10 rounded-lg">
              <Database className="text-emerald-400" size={24} />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-slate-100">Complete Data</h4>
              <p className="text-sm text-slate-400 mt-1">
                Export all your data including accounts, budgets, goals, and loans
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#141927] p-6 rounded-xl border border-slate-800">
        <h4 className="font-semibold text-slate-100 mb-4">Export Settings</h4>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Format</label>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  value="csv"
                  checked={format === 'csv'}
                  onChange={(e) => setFormat(e.target.value as 'csv' | 'json')}
                  className="w-4 h-4 text-blue-400"
                />
                <span className="text-sm text-slate-100">CSV</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  value="json"
                  checked={format === 'json'}
                  onChange={(e) => setFormat(e.target.value as 'csv' | 'json')}
                  className="w-4 h-4 text-blue-400"
                />
                <span className="text-sm text-slate-100">JSON</span>
              </label>
            </div>
          </div>

          {exportType === 'transactions' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Date Range (Optional)
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Start date"
                  />
                </div>
                <div>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="End date"
                  />
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={20} />
            <span>{loading ? 'Exporting...' : 'Export Data'}</span>
          </button>
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-200 rounded-lg p-4">
        <h5 className="font-semibold text-blue-900 mb-2">About Data Export</h5>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• CSV files can be opened in Excel, Google Sheets, or any spreadsheet software</li>
          <li>• JSON files contain complete data structure and can be used for backups</li>
          <li>
            • When exporting all data as CSV, multiple files will be downloaded (one per table)
          </li>
          <li>• All exports exclude sensitive authentication data</li>
        </ul>
      </div>
    </div>
  );
}
