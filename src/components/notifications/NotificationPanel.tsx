import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Landmark, PieChart, Repeat, Target } from 'lucide-react';
import { Button, Drawer, IconButton, cx, haptic, useToast } from '../ui';
import { useNotifications } from './NotificationsContext';
import type { NoticeKind, NoticeTone } from '../../lib/notifications';
import { startOfToday } from '../../lib/recurring';

const KIND_ICON: Record<NoticeKind, React.ElementType> = {
  recurring: Repeat, loan: Landmark, budget: PieChart, goal: Target,
};
const TONE: Record<NoticeTone, string> = {
  info: 'bg-blue-100 text-blue-600 dark:text-blue-400',
  good: 'bg-blue-100 text-blue-600 dark:text-blue-400',
  warn: 'bg-slate-900 text-slate-100',
  danger: 'bg-red-900 text-red-400',
};

const ago = (ms: number) => {
  const d = Math.round((startOfToday().getTime() - new Date(ms).setHours(0, 0, 0, 0)) / 86_400_000);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Bell button with an unread count. */
export function NotificationBell({ className, size = 16 }: { className?: string; size?: number }) {
  const { unread, setOpen } = useNotifications();
  return (
    <IconButton
      onClick={() => { haptic(); setOpen(true); }}
      title="Notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      className={cx('relative', className)}
    >
      <Bell size={size} />
      {unread > 0 && (
        <span key={unread} className="anim-pop absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 grid place-items-center bg-red-500 text-app text-[10px] font-extrabold tabular-nums no-mask">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </IconButton>
  );
}

/** Right-hand panel on web, bottom sheet on phone. */
export function NotificationPanel() {
  const { items, unread, open, setOpen, markRead, markAllRead, record } = useNotifications();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const today = startOfToday().getTime();
  const groups = [
    { label: 'Today', list: items.filter((n) => n.at >= today) },
    { label: 'Earlier', list: items.filter((n) => n.at < today) },
  ].filter((g) => g.list.length);

  const onRecord = async (id: string, recurringId: string, title: string) => {
    setBusy(id);
    const err = await record(recurringId);
    setBusy(null);
    if (err) { toast.show(`Couldn't record: ${err}`); return; }
    markRead(id);
    haptic(12);
    toast.show(`Recorded · ${title.replace(/ is due.*$/, '')}`);
  };

  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      kicker={unread ? `Notifications · ${unread} new` : 'Notifications'}
      headerExtra={unread > 0 && (
        <Button variant="ghost" size="sm" onClick={markAllRead}>
          <CheckCheck size={14} /> Mark all read
        </Button>
      )}
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-6 anim-fade">
          <span className="w-10 h-10 grid place-items-center bg-blue-100 text-blue-600 dark:text-blue-400 mb-1"><CheckCheck size={20} /></span>
          <p className="text-[17px] font-extrabold text-slate-100">You’re all caught up</p>
          <p className="text-sm text-slate-400 max-w-xs">Due payments, overdue loans, budgets running low and goal milestones show up here.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label}>
            <div className="t-th mb-1">{g.label}</div>
            <div className="rule-t stagger">
              {g.list.map((n) => {
                const Icon = KIND_ICON[n.kind];
                return (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => { markRead(n.id); setOpen(false); navigate(n.href); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { markRead(n.id); setOpen(false); navigate(n.href); } }}
                    className={cx('flex items-start gap-3 py-3 row-rule hover-tint cursor-pointer -mx-2 px-2', n.read && 'opacity-60')}
                  >
                    <span className={cx('w-8 h-8 shrink-0 grid place-items-center', TONE[n.tone])}><Icon size={15} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className={cx('text-sm text-slate-100 flex-1 min-w-0', !n.read && 'font-bold')}>{n.title}</span>
                        <span className="text-[11px] text-slate-400 shrink-0">{ago(n.at)}</span>
                      </div>
                      <div className="text-[13px] text-slate-400 mt-0.5 tabular-nums">{n.body}</div>
                      {n.recurringId && !n.read && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-2"
                          disabled={busy === n.id}
                          onClick={(e) => { e.stopPropagation(); onRecord(n.id, n.recurringId!, n.title); }}
                        >
                          {busy === n.id ? 'Recording…' : 'Record now'}
                        </Button>
                      )}
                    </div>
                    {!n.read && <span className="w-1.5 h-1.5 mt-2 bg-blue-500 shrink-0" aria-label="Unread" />}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </Drawer>
  );
}
