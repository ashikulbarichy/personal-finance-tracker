import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, CreditCard as Edit2, Trash2, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Database } from '../lib/database.types';

type Loan = Database['public']['Tables']['loans']['Row'];
type Account = Database['public']['Tables']['accounts']['Row'];
type LoanPayment = Database['public']['Tables']['loan_payments']['Row'];

interface LoanWithAccount extends Loan {
  accounts: { name: string } | null;
}

export function Loans() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loans, setLoans] = useState<LoanWithAccount[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<LoanPayment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<Loan | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    from_account_id: '',
    to_account_id: '',
    payment_type: 'repayment' as 'disbursement' | 'repayment',
    notes: '',
    payment_date: new Date().toISOString().slice(0, 16),
  });
  const [formData, setFormData] = useState({
    name: '',
    type: 'borrowing' as Loan['type'],
    principal_amount: '',
    current_balance: '',
    interest_rate: '0',
    lender_borrower: '',
    due_date: '',
    account_id: '',
  });

  const loadData = useCallback(async () => {
    if (!user) {
      setLoans([]);
      setAccounts([]);
      return;
    }

    const [loansRes, accountsRes, paymentsRes] = await Promise.all([
      supabase
        .from('loans')
        .select('*, accounts(name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase
        .from('loan_payments')
        .select('*')
        .eq('user_id', user.id)
        .order('payment_date', { ascending: false }),
    ]);

    if (loansRes.data) setLoans(loansRes.data as LoanWithAccount[]);
    if (accountsRes.data) setAccounts(accountsRes.data);
    if (paymentsRes.data) setPayments(paymentsRes.data);
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const principal = parseFloat(formData.principal_amount);

    const loanData = {
      user_id: user.id,
      name: formData.name,
      type: formData.type,
      principal_amount: principal,
      // New loans start with current_balance = principal (full amount owed/outstanding).
      // Only repayment payments reduce this balance toward 0 (paid off).
      current_balance: editingLoan
        ? parseFloat(formData.current_balance || formData.principal_amount)
        : principal,
      interest_rate: parseFloat(formData.interest_rate),
      lender_borrower: formData.lender_borrower,
      due_date: formData.due_date || null,
      account_id: formData.account_id || null,
    };

    if (editingLoan) {
      await supabase.from('loans').update(loanData).eq('id', editingLoan.id);
    } else {
      const { data: insertedLoan } = await supabase
        .from('loans')
        .insert(loanData)
        .select('*')
        .single();

      // Create initial disbursement to set balance and adjust accounts
      if (insertedLoan && insertedLoan.account_id) {
        await supabase.from('loan_payments').insert({
          user_id: insertedLoan.user_id,
          loan_id: insertedLoan.id,
          from_account_id: insertedLoan.type === 'lending' ? insertedLoan.account_id : null,
          to_account_id: insertedLoan.type === 'borrowing' ? insertedLoan.account_id : null,
          amount: principal,
          payment_type: 'disbursement',
          payment_date: new Date().toISOString(),
          notes: 'Initial loan disbursement',
        });
      }
    }

    setShowForm(false);
    setEditingLoan(null);
    resetForm();
    loadData();
  };

  const handlePayment = async () => {
    if (!user || !showPaymentModal || !paymentForm.amount) return;

    const amount = parseFloat(paymentForm.amount);
    if (!amount || Number.isNaN(amount)) return;

    await supabase.from('loan_payments').insert({
      user_id: user.id,
      loan_id: showPaymentModal.id,
      from_account_id: paymentForm.from_account_id || null,
      to_account_id: paymentForm.to_account_id || null,
      amount,
      payment_type: paymentForm.payment_type,
      payment_date: paymentForm.payment_date,
      notes: paymentForm.notes || null,
    });

    setShowPaymentModal(null);
    setPaymentForm({
      amount: '',
      from_account_id: '',
      to_account_id: '',
      payment_type: 'repayment',
      notes: '',
      payment_date: new Date().toISOString().slice(0, 16),
    });
    loadData();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'borrowing',
      principal_amount: '',
      current_balance: '',
      interest_rate: '0',
      lender_borrower: '',
      due_date: '',
      account_id: '',
    });
  };

  const handleEdit = (loan: Loan) => {
    setEditingLoan(loan);
    setFormData({
      name: loan.name,
      type: loan.type,
      principal_amount: loan.principal_amount.toString(),
      current_balance: loan.current_balance.toString(),
      interest_rate: loan.interest_rate.toString(),
      lender_borrower: loan.lender_borrower,
      due_date: loan.due_date || '',
      account_id: loan.account_id || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this loan?')) {
      await supabase.from('loans').delete().eq('id', id);
      loadData();
    }
  };

  const [displayCurrency, setDisplayCurrency] = useState('USD');

  const accountsById = useMemo(
    () =>
      accounts.reduce<Record<string, Account>>((map, acc) => {
        map[acc.id] = acc;
        return map;
      }, {}),
    [accounts]
  );

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

  const totalBorrowing = loans
    .filter((l) => l.type === 'borrowing')
    .reduce((sum, l) => sum + Number(l.current_balance), 0);

  const totalLending = loans
    .filter((l) => l.type === 'lending')
    .reduce((sum, l) => sum + Number(l.current_balance), 0);

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#141927] p-6 rounded-xl border border-slate-800">
          <p className="text-sm text-slate-400">Total Borrowing</p>
          <p className="text-3xl font-bold text-red-400 mt-1">
            {displayCurrency} {totalBorrowing.toFixed(2)}
          </p>
        </div>
        <div className="bg-[#141927] p-6 rounded-xl border border-slate-800">
          <p className="text-sm text-slate-400">Total Lending</p>
          <p className="text-3xl font-bold text-emerald-400 mt-1">
            {displayCurrency} {totalLending.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">Loans</h3>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingLoan(null);
            resetForm();
          }}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
        >
          <Plus size={20} />
          <span>Add Loan</span>
        </button>
      </div>

      {showForm && (
        <div className="bg-[#141927] p-6 rounded-xl border border-slate-800">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">
            {editingLoan ? 'Edit Loan' : 'New Loan'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Loan Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Personal Loan"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value as Loan['type'] })
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="borrowing">Borrowing (I owe)</option>
                  <option value="lending">Lending (Owed to me)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Principal Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.principal_amount}
                  onChange={(e) => setFormData({ ...formData, principal_amount: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Current Balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.current_balance}
                  onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Interest Rate (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.interest_rate}
                  onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {formData.type === 'borrowing' ? 'Lender' : 'Borrower'}
                </label>
                <input
                  type="text"
                  required
                  value={formData.lender_borrower}
                  onChange={(e) => setFormData({ ...formData, lender_borrower: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Name of person/institution"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Due Date (Optional)
                </label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Account (Optional)
                </label>
                <select
                  value={formData.account_id}
                  onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
              >
                {editingLoan ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingLoan(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-[0.97] text-slate-300 text-sm font-medium rounded-xl border border-slate-700/60 transition-all duration-150"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#141927] p-6 rounded-lg max-w-md w-full">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">
              Record Payment for {showPaymentModal.name}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Payment Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm((f) => ({
                      ...f,
                      amount: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter payment amount"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Payment Type
                </label>
                <select
                  value={paymentForm.payment_type}
                  onChange={(e) =>
                    setPaymentForm((f) => ({
                      ...f,
                      payment_type: e.target.value as 'disbursement' | 'repayment',
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="repayment">
                    {showPaymentModal.type === 'borrowing'
                      ? 'Repayment (I pay back)'
                      : 'Repayment received'}
                  </option>
                  <option value="disbursement">
                    {showPaymentModal.type === 'borrowing'
                      ? 'Money received (borrow more)'
                      : 'Money lent out'}
                  </option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    {showPaymentModal.type === 'borrowing'
                      ? paymentForm.payment_type === 'repayment'
                        ? 'From account (I pay with)'
                        : 'From account (optional)'
                      : paymentForm.payment_type === 'repayment'
                      ? 'From account (optional)'
                      : 'From account (I lend from)'}
                  </label>
                  <select
                    value={paymentForm.from_account_id}
                    onChange={(e) =>
                      setPaymentForm((f) => ({
                        ...f,
                        from_account_id: e.target.value,
                      }))
                    }
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
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    {showPaymentModal.type === 'borrowing'
                      ? paymentForm.payment_type === 'repayment'
                        ? 'To account (optional)'
                        : 'To account (I receive to)'
                      : paymentForm.payment_type === 'repayment'
                      ? 'To account (I receive to)'
                      : 'To account (optional)'}
                  </label>
                  <select
                    value={paymentForm.to_account_id}
                    onChange={(e) =>
                      setPaymentForm((f) => ({
                        ...f,
                        to_account_id: e.target.value,
                      }))
                    }
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
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Payment Date
                </label>
                <input
                  type="datetime-local"
                  value={paymentForm.payment_date}
                  onChange={(e) =>
                    setPaymentForm((f) => ({
                      ...f,
                      payment_date: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) =>
                    setPaymentForm((f) => ({
                      ...f,
                      notes: e.target.value,
                    }))
                  }
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handlePayment}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all duration-150"
                >
                  Record Payment
                </button>
                <button
                  onClick={() => {
                    setShowPaymentModal(null);
                    setPaymentForm({
                      amount: '',
                      from_account_id: '',
                      to_account_id: '',
                      payment_type: 'repayment',
                      notes: '',
                      payment_date: new Date().toISOString().slice(0, 16),
                    });
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

      <div className="space-y-6">
        {['borrowing', 'lending'].map((type) => {
          const filteredLoans = loans.filter((l) => l.type === type);
          if (filteredLoans.length === 0) return null;

          return (
            <div key={type}>
              <h4 className="text-md font-semibold text-slate-100 mb-3 capitalize">
                {type === 'borrowing' ? 'I Owe' : 'Owed to Me'}
              </h4>
              <div className="space-y-3">
                {filteredLoans.map((loan) => {
                  const principal = Number(loan.principal_amount ?? 0);
                  const balance = Number(loan.current_balance);
                  const repaid = Math.max(0, principal - balance);
                  const percentage = principal > 0 ? (repaid / principal) * 100 : 0;
                  const isCompleted = principal > 0 && balance <= 0;
                  const loanPayments = payments.filter((p) => p.loan_id === loan.id);

                  return (
                    <div
                      key={loan.id}
                      className={`bg-[#141927] p-6 rounded-xl border cursor-pointer transition-all ${
                        isCompleted
                          ? 'opacity-60 border-green-300'
                          : 'border-slate-800'
                      }`}
                      onClick={() => navigate(`/loans/${loan.id}`)}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`font-semibold ${isCompleted ? 'line-through text-slate-600' : 'text-slate-100'}`}>
                            {loan.name}
                          </h4>
                          {isCompleted && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              Paid off
                            </span>
                          )}
                          </div>
                          <p className="text-sm text-slate-500 mt-1">
                            {type === 'borrowing' ? 'Lender' : 'Borrower'}: {loan.lender_borrower}
                          </p>
                          {loan.due_date && (
                            <p className="text-xs text-slate-500 mt-1">
                              Due: {new Date(loan.due_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          {loan.is_active && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowPaymentModal(loan);
                              }}
                              className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all"
                            >
                              <DollarSign size={16} />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(loan);
                            }}
                            className="p-2 text-slate-500 hover:text-blue-600"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(loan.id);
                            }}
                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                        <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-400">Repaid</span>
                          <span className="font-semibold">
                            {displayCurrency} {repaid.toFixed(2)} /{' '}
                            {displayCurrency} {principal.toFixed(2)}
                          </span>
                        </div>

                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              isCompleted
                                ? 'bg-emerald-500/100'
                                : type === 'borrowing'
                                ? 'bg-red-500/100'
                                : 'bg-blue-500/100'
                            }`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Interest: {Number(loan.interest_rate).toFixed(2)}%</span>
                          <span>
                            {isCompleted ? '100% — Fully paid off ✓' : `${percentage.toFixed(1)}% repaid`}
                          </span>
                        </div>

                        {loanPayments.length > 0 && (
                          <div className="mt-3 border-top border-slate-800/60 pt-3 space-y-2">
                            <p className="text-xs font-semibold text-slate-300">
                              Payment history
                            </p>
                            <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
                              {loanPayments.map((p) => {
                                const fromAcc = p.from_account_id
                                  ? accountsById[p.from_account_id]
                                  : undefined;
                                const toAcc = p.to_account_id
                                  ? accountsById[p.to_account_id]
                                  : undefined;

                                const signedAmount =
                                  p.payment_type === 'repayment'
                                    ? loan.type === 'borrowing'
                                      ? -Number(p.amount)
                                      : Number(p.amount)
                                    : loan.type === 'borrowing'
                                    ? Number(p.amount)
                                    : -Number(p.amount);

                                return (
                                  <div
                                    key={p.id}
                                    className="flex items-start justify-between gap-2"
                                  >
                                    <div className="flex-1">
                                      <div className="flex items-center gap-1">
                                        <span
                                          className={`font-semibold ${
                                            signedAmount < 0
                                              ? 'text-red-400'
                                              : 'text-emerald-400'
                                          }`}
                                        >
                                          {signedAmount < 0 ? '-' : '+'}
                                          {displayCurrency}{' '}
                                          {Number(p.amount).toFixed(2)}
                                        </span>
                                        <span className="text-[10px] uppercase text-slate-500">
                                          {p.payment_type === 'repayment'
                                            ? 'Repayment'
                                            : 'Disbursement'}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-slate-500">
                                        {new Date(p.payment_date).toLocaleDateString()}
                                        {fromAcc || toAcc ? ' · ' : ''}
                                        {fromAcc && `From ${fromAcc.name}`}
                                        {fromAcc && toAcc && ' → '}
                                        {toAcc && `To ${toAcc.name}`}
                                      </p>
                                      {p.notes && (
                                        <p className="text-[11px] text-slate-500">
                                          {p.notes}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {loans.length === 0 && !showForm && (
        <div className="text-center py-12 text-slate-500">
          <p>No loans yet. Track money you owe or that others owe you.</p>
        </div>
      )}
    </div>
  );
}
