import {
  ShoppingCart,
  Utensils,
  Car,
  Home,
  Music,
  Heart,
  Gift,
  Circle,
  Briefcase,
  TrendingUp,
  Zap,
  Plane,
  Dumbbell,
  Gamepad2,
  BookOpen,
  Pill,
  Wifi,
  Smartphone,
  Droplet,
  Flame,
  CreditCard,
  DollarSign,
  BarChart3,
  Target,
  AlertCircle,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import { cx, labelCls } from './ui';

export const ICON_OPTIONS: { name: string; icon: LucideIcon; label: string }[] = [
  { name: 'shopping-cart', icon: ShoppingCart, label: 'Shopping' },
  { name: 'utensils', icon: Utensils, label: 'Dining' },
  { name: 'car', icon: Car, label: 'Transport' },
  { name: 'home', icon: Home, label: 'Home' },
  { name: 'music', icon: Music, label: 'Entertainment' },
  { name: 'heart', icon: Heart, label: 'Health' },
  { name: 'gift', icon: Gift, label: 'Gifts' },
  { name: 'circle', icon: Circle, label: 'General' },
  { name: 'briefcase', icon: Briefcase, label: 'Work' },
  { name: 'trending-up', icon: TrendingUp, label: 'Investment' },
  { name: 'zap', icon: Zap, label: 'Utilities' },
  { name: 'plane', icon: Plane, label: 'Travel' },
  { name: 'dumbbell', icon: Dumbbell, label: 'Fitness' },
  { name: 'gamepad', icon: Gamepad2, label: 'Gaming' },
  { name: 'book', icon: BookOpen, label: 'Education' },
  { name: 'pill', icon: Pill, label: 'Medicine' },
  { name: 'wifi', icon: Wifi, label: 'Internet' },
  { name: 'smartphone', icon: Smartphone, label: 'Mobile' },
  { name: 'droplet', icon: Droplet, label: 'Water' },
  { name: 'flame', icon: Flame, label: 'Gas' },
  { name: 'credit-card', icon: CreditCard, label: 'Card Payment' },
  { name: 'dollar-sign', icon: DollarSign, label: 'Money' },
  { name: 'bar-chart', icon: BarChart3, label: 'Finance' },
  { name: 'target', icon: Target, label: 'Goals' },
  { name: 'alert-circle', icon: AlertCircle, label: 'Alerts' },
  { name: 'inbox', icon: Inbox, label: 'Inbox' },
];

interface CategoryIconPickerProps {
  selectedIcon: string;
  onSelect: (iconName: string) => void;
}

export function CategoryIconPicker({ selectedIcon, onSelect }: CategoryIconPickerProps) {
  return (
    <div>
      <label className={labelCls}>Icon</label>
      <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Category icon">
        {ICON_OPTIONS.map(({ name, icon: Icon, label }) => {
          const on = selectedIcon === name;
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={label}
              onClick={() => onSelect(name)}
              title={label}
              className={cx(
                'h-11 grid place-items-center border transition-colors',
                on
                  ? 'bg-slate-100 border-slate-100 text-app'
                  : 'bg-transparent border-line-strong text-slate-300 hover:border-slate-100 hover:bg-slate-100/[0.07] hover:text-slate-100',
              )}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
