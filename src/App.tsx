import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Accounts } from './pages/Accounts';
import { AccountDetails } from './pages/AccountDetails';
import { Transactions } from './pages/Transactions';
import { RecurringTransactions } from './pages/RecurringTransactions';
import { SavingsGoals } from './pages/SavingsGoals';
import { Loans } from './pages/Loans';
import { LoanDetails } from './pages/LoanDetails';
import { Payees } from './pages/Payees';
import { Categories } from './pages/Categories';
import { Reports } from './pages/Reports';
import { Currencies } from './pages/Currencies';
import { SettingsPage } from './pages/Settings';
import { MorePage } from './pages/More';
import { PlanPage } from './pages/Plan';
import { DebtPlan } from './pages/DebtPlan';
import { Investments } from './pages/Investments';
import { TaxSummary } from './pages/TaxSummary';
import { Login } from './components/auth/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UserPrefsProvider } from './contexts/UserPrefsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { PrivacyProvider } from './contexts/PrivacyContext';
import { ToastProvider } from './components/ui';

function AppLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-app">
      <div className="text-center">
        <div className="w-9 h-9 bg-blue-600 text-app grid place-items-center font-extrabold text-xl mx-auto animate-pulse">K</div>
        <p className="mt-4 text-sm text-slate-400 font-medium">Loading…</p>
      </div>
    </div>
  );
}

/** Sign-in only — new accounts can't be created from the app. */
function AuthLayout() {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;
  return <Login />;
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AppLoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function IndexRoute() {
  const { user, loading } = useAuth();
  if (loading) return <AppLoadingScreen />;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

function App() {
  return (
    <ThemeProvider>
      <PrivacyProvider>
      <AuthProvider>
      <UserPrefsProvider>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<IndexRoute />} />

          <Route path="/login" element={<AuthLayout />} />
          <Route path="/register" element={<Navigate to="/login" replace />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              {/* Overview */}
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/reports" element={<Reports />} />

              {/* Transactions */}
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/recurring" element={<RecurringTransactions />} />
              <Route path="/payees" element={<Payees />} />

              {/* Accounts */}
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/accounts/:id" element={<AccountDetails />} />
              <Route path="/loans" element={<Loans />} />
              <Route path="/loans/:id" element={<LoanDetails />} />

              {/* Planning */}
              <Route path="/goals" element={<SavingsGoals />} />
              <Route path="/debt" element={<DebtPlan />} />
              <Route path="/investments" element={<Investments />} />
              <Route path="/assets" element={<Navigate to="/investments" replace />} />

              {/* Settings */}
              <Route path="/categories" element={<Categories />} />
              <Route path="/currencies" element={<Currencies />} />
              <Route path="/settings" element={<SettingsPage />} />

              {/* Phone tab roots */}
              <Route path="/plan" element={<PlanPage />} />
              <Route path="/more" element={<MorePage />} />

              {/* ── Redirects from removed / merged pages ── */}
              <Route path="/subscriptions" element={<Navigate to="/recurring" replace />} />
              <Route path="/expenses" element={<Navigate to="/transactions?type=expense" replace />} />
              <Route path="/income" element={<Navigate to="/transactions?type=income" replace />} />
              <Route path="/transfers" element={<Navigate to="/transactions?type=transfer" replace />} />
              <Route path="/exchange-rates" element={<Navigate to="/currencies" replace />} />
              <Route path="/profile" element={<Navigate to="/settings" replace />} />
              <Route path="/preferences" element={<Navigate to="/settings" replace />} />
              <Route path="/budgets" element={<Navigate to="/categories" replace />} />
              <Route path="/tax" element={<TaxSummary />} />
              <Route path="/automation" element={<Navigate to="/recurring" replace />} />
              <Route path="/groups" element={<Navigate to="/categories" replace />} />
              <Route path="/export" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
      </UserPrefsProvider>
      </AuthProvider>
      </PrivacyProvider>
    </ThemeProvider>
  );
}

export default App;
