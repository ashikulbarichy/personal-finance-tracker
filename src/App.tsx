import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Dashboard } from './pages/Dashboard';
import { Accounts } from './pages/Accounts';
import { AccountDetails } from './pages/AccountDetails';
import { Transactions } from './pages/Transactions';
import { Expenses } from './pages/Expenses';
import { Income } from './pages/Income';
import { Transfers } from './pages/Transfers';
import { Budgets } from './pages/Budgets';
import { RecurringTransactions } from './pages/RecurringTransactions';
import { Subscriptions } from './pages/Subscriptions';
import { SavingsGoals } from './pages/SavingsGoals';
import { Loans } from './pages/Loans';
import { LoanDetails } from './pages/LoanDetails';
import { Payees } from './pages/Payees';
import { Assets } from './pages/Assets';
import { Categories } from './pages/Categories';
import { Automation } from './pages/Automation';
import { Reports } from './pages/Reports';
import { Export } from './pages/Export';
import { Groups } from './pages/Groups';
import { ProfilePage } from './pages/Profile';
import { Preferences } from './pages/Preferences';
import { Currencies } from './pages/Currencies';
import { ExchangeRates } from './pages/ExchangeRates';
import { Tax } from './pages/Tax';
import { Login } from './components/auth/Login';
import { Register } from './components/auth/Register';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UserPrefsProvider } from './contexts/UserPrefsContext';
import { useState } from 'react';

function AppLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0f1a]">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-900 border-t-blue-500 rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-sm text-slate-400">Loading…</p>
      </div>
    </div>
  );
}

function AuthLayout() {
  const { user } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return showRegister ? (
    <Register onToggle={() => setShowRegister(false)} />
  ) : (
    <Login onToggle={() => setShowRegister(true)} />
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AppLoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  // Finance
  '/budgets': 'Budgets',
  '/goals': 'Savings Goals',
  '/subscriptions': 'Subscriptions',
  '/tax': 'Tax',
  // Transaction Management
  '/transactions': 'Transactions',
  '/expenses': 'Expenses',
  '/income': 'Income',
  '/transfers': 'Transfers',
  '/recurring': 'Recurring Cost',
  '/automation': 'Rules Automation',
  // Account Management
  '/accounts': 'Accounts',
  '/loans': 'Loans',
  '/payees': 'Payees',
  '/assets': 'Assets',
  // Classification
  '/categories': 'Categories',
  '/groups': 'Groups',
  // Standalone
  '/reports': 'Reports',
  '/export': 'Export Data',
  // Profile
  '/preferences': 'Preferences',
  '/currencies': 'Currencies',
  '/exchange-rates': 'Exchange Rates',
  '/profile': 'Profile',
};

function MainLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const title = PAGE_TITLES[location.pathname] || 'Finance Tracker';

  return (
    <div className="flex h-screen bg-[#0b0f1a]">
      <Sidebar isMobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title={title}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />
        <main className="flex-1 overflow-y-auto bg-[#0b0f1a]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function IndexRoute() {
  const { user, loading } = useAuth();
  if (loading) return <AppLoadingScreen />;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

function App() {
  return (
    <AuthProvider>
      <UserPrefsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<IndexRoute />} />

          <Route path="/login" element={<AuthLayout />} />
          <Route path="/register" element={<AuthLayout />} />

          <Route element={<RequireAuth />}>
            <Route element={<MainLayout />}>
              {/* Dashboard */}
              <Route path="/dashboard" element={<Dashboard />} />

              {/* Finance */}
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/goals" element={<SavingsGoals />} />
              <Route path="/subscriptions" element={<Subscriptions />} />
              <Route path="/tax" element={<Tax />} />

              {/* Transaction Management */}
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/income" element={<Income />} />
              <Route path="/transfers" element={<Transfers />} />
              <Route path="/recurring" element={<RecurringTransactions />} />
              <Route path="/automation" element={<Automation />} />

              {/* Account Management */}
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/accounts/:id" element={<AccountDetails />} />
              <Route path="/loans" element={<Loans />} />
              <Route path="/loans/:id" element={<LoanDetails />} />
              <Route path="/payees" element={<Payees />} />
              <Route path="/assets" element={<Assets />} />

              {/* Classification */}
              <Route path="/categories" element={<Categories />} />
              <Route path="/groups" element={<Groups />} />

              {/* Standalone */}
              <Route path="/reports" element={<Reports />} />
              <Route path="/export" element={<Export />} />

              {/* Profile */}
              <Route path="/preferences" element={<Preferences />} />
              <Route path="/currencies" element={<Currencies />} />
              <Route path="/exchange-rates" element={<ExchangeRates />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </UserPrefsProvider>
    </AuthProvider>
  );
}

export default App;
