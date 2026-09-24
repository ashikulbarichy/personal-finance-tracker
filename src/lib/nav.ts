/* Single source for the app's information architecture — used by the web
 * sidebar, the command palette, page titles and the phone "More" screen. */
import {
  LayoutDashboard, BarChart3, ArrowLeftRight, Repeat, Users, Wallet, Landmark,
  Target, Tag, Coins, Settings, LineChart, Flag, Receipt,
} from 'lucide-react';

export type NavItem = { path: string; label: string; icon: React.ElementType };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { label: '', items: [
    { path: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { path: '/reports', label: 'Analytics', icon: BarChart3 },
  ] },
  { label: 'Money', items: [
    { path: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
    { path: '/recurring', label: 'Recurring', icon: Repeat },
    { path: '/payees', label: 'Payees', icon: Users },
  ] },
  { label: 'Accounts', items: [
    { path: '/accounts', label: 'Accounts', icon: Wallet },
    { path: '/investments', label: 'Assets & investments', icon: LineChart },
    { path: '/loans', label: 'Loans', icon: Landmark },
  ] },
  { label: 'Planning', items: [
    { path: '/goals', label: 'Goals', icon: Target },
    { path: '/debt', label: 'Debt-free plan', icon: Flag },
    { path: '/tax', label: 'Tax summary', icon: Receipt },
    { path: '/categories', label: 'Categories', icon: Tag },
  ] },
  { label: 'Setup', items: [
    { path: '/currencies', label: 'Currencies', icon: Coins },
    { path: '/settings', label: 'Settings', icon: Settings },
  ] },
];

export const PAGE_TITLES: Record<string, string> = {
  '/': 'Home',
  '/dashboard': 'Home',
  '/reports': 'Analytics',
  '/transactions': 'Transactions',
  '/recurring': 'Recurring',
  '/payees': 'Payees',
  '/accounts': 'Accounts',
  '/loans': 'Loans',
  '/investments': 'Assets & investments',
  '/debt': 'Debt-free plan',
  '/tax': 'Tax summary',
  '/goals': 'Goals',
  '/categories': 'Categories',
  '/currencies': 'Currencies',
  '/settings': 'Settings',
  '/plan': 'Plan',
  '/more': 'More',
};

export function titleFor(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/accounts/')) return 'Account';
  if (pathname.startsWith('/loans/')) return 'Loan';
  return 'Keel';
}

/** Phone tab roots — every other page is a "sub" page reached from More. */
export const PHONE_ROOTS = ['/dashboard', '/transactions', '/plan', '/more', '/goals'];
