import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Receipt,
  Target,
  HandCoins,
  FolderOpen,
  BarChart3,
  Download,
  Zap,
  User,
  LogOut,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Repeat2,
  Users,
  ChevronRight,
  Layers,
  Package,
  Settings,
  DollarSign,
  ArrowRightLeft,
  Globe,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  isMobileOpen: boolean;
  onClose: () => void;
}

type NavItem = {
  path: string;
  label: string;
  icon: React.ElementType;
  children?: { path: string; label: string; icon: React.ElementType }[];
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { path: '/budgets', label: 'Budgets', icon: Receipt },
      { path: '/goals', label: 'Goals', icon: Target },
      { path: '/subscriptions', label: 'Subscriptions', icon: RefreshCw },
      { path: '/tax', label: 'Tax', icon: DollarSign },
    ],
  },
  {
    id: 'transactions',
    label: 'Transaction Management',
    items: [
      {
        path: '/transactions',
        label: 'Transactions',
        icon: ArrowLeftRight,
        children: [
          { path: '/expenses', label: 'Expenses', icon: TrendingDown },
          { path: '/income', label: 'Income', icon: TrendingUp },
          { path: '/transfers', label: 'Transfers', icon: ArrowRightLeft },
        ],
      },
      {
        path: '/automation-group',
        label: 'Automation',
        icon: Zap,
        children: [
          { path: '/recurring', label: 'Recurring Cost', icon: Repeat2 },
          { path: '/automation', label: 'Rules Automation', icon: Layers },
        ],
      },
    ],
  },
  {
    id: 'accounts',
    label: 'Account Management',
    items: [
      { path: '/accounts', label: 'Accounts', icon: Wallet },
      { path: '/loans', label: 'Loans', icon: HandCoins },
      { path: '/payees', label: 'Payees', icon: UserCheck },
      { path: '/assets', label: 'Assets', icon: Package },
    ],
  },
  {
    id: 'classification',
    label: 'Classification',
    items: [
      { path: '/categories', label: 'Categories', icon: FolderOpen },
      { path: '/groups', label: 'Groups', icon: Users },
    ],
  },
  {
    id: 'profile',
    label: 'Profile',
    items: [
      { path: '/preferences', label: 'Preferences', icon: Settings },
      { path: '/currencies', label: 'Currencies', icon: DollarSign },
      { path: '/exchange-rates', label: 'Exchange Rates', icon: Globe },
      { path: '/profile', label: 'Profile', icon: User },
    ],
  },
];

const STANDALONE: NavItem[] = [
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/export', label: 'Export Data', icon: Download },
];

const activeLink =
  'flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30';
const idleLink =
  'flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all';
const subActiveLink =
  'flex items-center space-x-2 pl-8 pr-3 py-1.5 rounded-lg text-xs font-medium text-blue-400 bg-blue-600/10';
const subIdleLink =
  'flex items-center space-x-2 pl-8 pr-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-all';

function NavItemRow({
  item,
  onClose,
}: {
  item: NavItem;
  onClose: () => void;
}) {
  const location = useLocation();
  const hasChildren = item.children && item.children.length > 0;

  // For items with children but no real page (automation-group), expand based on child active state
  const isGroupActive =
    hasChildren && item.children!.some((c) => location.pathname === c.path);
  const [open, setOpen] = useState(isGroupActive);

  // Items with path '/automation-group' are group headers, not real routes
  const isGroupHeader = item.path === '/automation-group';

  const toggleOpen = () => setOpen((v) => !v);

  return (
    <div>
      {isGroupHeader ? (
        <button
          type="button"
          onClick={toggleOpen}
          className={`w-full ${isGroupActive ? activeLink : idleLink} justify-between`}
        >
          <div className="flex items-center space-x-3">
            <item.icon size={16} />
            <span>{item.label}</span>
          </div>
          <ChevronRight
            size={13}
            className={`shrink-0 text-slate-600 transition-transform ${open ? 'rotate-90' : ''}`}
          />
        </button>
      ) : (
        <div className="flex items-center">
          <NavLink
            to={item.path}
            onClick={onClose}
            className={({ isActive }) =>
              `flex-1 ${isActive ? activeLink : idleLink}`
            }
          >
            <item.icon size={16} />
            <span>{item.label}</span>
          </NavLink>
          {hasChildren && (
            <button
              type="button"
              onClick={toggleOpen}
              className="p-2 text-slate-600 hover:text-slate-400 transition-colors"
            >
              <ChevronRight
                size={13}
                className={`transition-transform ${open ? 'rotate-90' : ''}`}
              />
            </button>
          )}
        </div>
      )}

      {hasChildren && open && (
        <div className="mt-0.5 space-y-0.5">
          {item.children!.map((child) => (
            <NavLink
              key={child.path}
              to={child.path}
              onClick={onClose}
              className={({ isActive }) => (isActive ? subActiveLink : subIdleLink)}
            >
              <child.icon size={13} />
              <span>{child.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleGroup({
  group,
  onClose,
}: {
  group: NavGroup;
  location: ReturnType<typeof useLocation>;
  onClose: () => void;
}) {
  const location = useLocation();
  const allPaths = group.items.flatMap((i) => [
    i.path,
    ...(i.children?.map((c) => c.path) ?? []),
  ]);
  const groupActive = allPaths.some((p) => location.pathname === p);
  const [open, setOpen] = useState(groupActive);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold tracking-widest uppercase text-slate-500 hover:text-slate-300 transition-colors"
      >
        <span>{group.label}</span>
        <ChevronRight
          size={11}
          className={`transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <div className="space-y-0.5 mt-0.5">
          {group.items.map((item) => (
            <NavItemRow key={item.path} item={item} onClose={onClose} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ isMobileOpen, onClose }: SidebarProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const content = (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Wallet size={16} className="text-white" />
          </div>
          <h1 className="text-base font-bold text-slate-100 tracking-tight">Finance Tracker</h1>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {/* Dashboard standalone */}
        <NavLink
          to="/dashboard"
          onClick={onClose}
          className={({ isActive }) => (isActive ? activeLink : idleLink)}
        >
          <LayoutDashboard size={16} />
          <span>Dashboard</span>
        </NavLink>

        {/* Collapsible groups */}
        {NAV_GROUPS.map((group) => (
          <CollapsibleGroup
            key={group.id}
            group={group}
            location={location}
            onClose={onClose}
          />
        ))}

        {/* Standalone items */}
        <div className="mt-2 pt-2 border-t border-slate-800/60 space-y-0.5">
          {STANDALONE.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => (isActive ? activeLink : idleLink)}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-slate-800 shrink-0">
        <button
          type="button"
          onClick={async () => {
            await signOut();
            navigate('/login', { replace: true });
          }}
          className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex w-60 bg-[#0f1421] border-r border-slate-800 flex-col h-screen">
        {content}
      </div>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-40 md:hidden ${
          isMobileOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity ${
            isMobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={onClose}
        />
        <div
          className={`absolute left-0 top-0 h-full w-60 bg-[#0f1421] border-r border-slate-800 flex flex-col transform transition-transform ${
            isMobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {content}
        </div>
      </div>
    </>
  );
}
