import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPrefs } from '../contexts/UserPrefsContext';
import { usePrivacy } from '../contexts/PrivacyContext';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';
import { AlertCircle, Check, ChevronRight, Download, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { TIMEZONE_OPTIONS } from '../lib/dateUtils';
import { canInstall, isStandalone, onInstallAvailability, promptInstall } from '../lib/pwa';
import { ProfilePhoto } from '../components/settings/ProfilePhoto';
import { AppLockSetting } from '../components/lock/AppLockSetting';
import {
  Button, Field, Input, PageHeader, SegmentedControl, Select, Skeleton, Switch, cx, fieldCls,
} from '../components/ui';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const ALL_CURRENCIES = [
  'USD','EUR','GBP','JPY','CHF','CAD','AUD','NZD','CNY','HKD',
  'SGD','INR','BRL','MXN','ZAR','SEK','NOK','DKK','PLN','TRY',
  'AED','SAR','KRW','THB','IDR','MYR','PHP','NGN','BDT',
];

const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
];

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function StatusMsg({ status, error, savedText = 'Saved' }: { status: SaveStatus; error?: string; savedText?: string }) {
  if (status === 'saved') return <span className="flex items-center gap-1.5 text-xs text-slate-300"><Check size={13} /> {savedText}</span>;
  if (status === 'error') return <span className="flex items-center gap-1.5 text-xs text-red-400"><AlertCircle size={13} /> {error}</span>;
  return null;
}

/** 220px label column | content, separated by a 2px rule (stacks on phone). */
function Section({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-3 md:gap-6 rule-t pt-[18px]">
      <div>
        <h2 className="text-[17px] font-extrabold text-slate-100">{title}</h2>
        {meta && <p className="text-xs text-slate-400 mt-1 max-w-[200px]">{meta}</p>}
      </div>
      <div className="flex flex-col min-w-0">{children}</div>
    </section>
  );
}

/** A label/description row with a control on the right. */
function SettingRow({ label, desc, children, first }: { label: ReactNode; desc?: ReactNode; children: ReactNode; first?: boolean }) {
  return (
    <div className={cx('flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 row-rule min-h-[60px] sm:min-h-0', first ? 'pb-3.5' : 'py-3.5')}>
      <div className="flex flex-col min-w-0">
        <span className="text-[15px] sm:text-sm font-semibold text-slate-100">{label}</span>
        {desc && <span className="text-xs text-slate-400">{desc}</span>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('; ') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { refreshPrefs, defaultCurrency: ctxCurrency } = useUserPrefs();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const { mode, setMode } = useTheme();
  const [loading, setLoading] = useState(true);

  /* Profile info */
  const [fullName, setFullName] = useState('');
  const [profession, setProfession] = useState('');
  const [email, setEmail] = useState('');
  const [profileStatus, setProfileStatus] = useState<SaveStatus>('idle');
  const [profileErr, setProfileErr] = useState('');

  /* Email change */
  const [newEmail, setNewEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<SaveStatus>('idle');
  const [emailErr, setEmailErr] = useState('');

  /* Password change */
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<SaveStatus>('idle');
  const [passwordErr, setPasswordErr] = useState('');

  /* Preferences */
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [tzSearch, setTzSearch] = useState('');
  const [prefStatus, setPrefStatus] = useState<SaveStatus>('idle');
  const [prefErr, setPrefErr] = useState('');

  /* App & data */
  const [installable, setInstallable] = useState(canInstall());
  const [standalone] = useState(isStandalone());
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  useEffect(() => onInstallAvailability(() => setInstallable(canInstall())), []);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('full_name, profession, email, default_currency, timezone, date_format')
      .eq('id', user.id)
      .single();
    if (data) {
      setFullName(data.full_name ?? '');
      setProfession(data.profession ?? '');
      setEmail(data.email ?? user.email ?? '');
      setNewEmail(data.email ?? user.email ?? '');
      setDefaultCurrency(data.default_currency ?? 'USD');
      setTimezone(data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC');
      setDateFormat(data.date_format ?? 'DD/MM/YYYY');
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const saveProfile = async () => {
    if (!user) return;
    setProfileStatus('saving'); setProfileErr('');
    const { error } = await supabase.from('profiles')
      .update({ full_name: fullName, profession, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) { setProfileErr(error.message); setProfileStatus('error'); return; }
    refreshPrefs();
    setProfileStatus('saved');
    setTimeout(() => setProfileStatus('idle'), 3000);
  };

  const changeEmail = async () => {
    if (!user || !newEmail.trim() || newEmail === email) return;
    setEmailStatus('saving'); setEmailErr('');
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) { setEmailErr(error.message); setEmailStatus('error'); return; }
    await supabase.from('profiles').update({ email: newEmail.trim() }).eq('id', user.id);
    setEmailStatus('saved');
    setTimeout(() => setEmailStatus('idle'), 5000);
  };

  const changePassword = async () => {
    if (!user) return;
    setPasswordErr('');
    if (!newPassword) { setPasswordErr('Enter a new password.'); setPasswordStatus('error'); return; }
    if (newPassword.length < 6) { setPasswordErr('Password must be at least 6 characters.'); setPasswordStatus('error'); return; }
    if (newPassword !== confirmPassword) { setPasswordErr('Passwords do not match.'); setPasswordStatus('error'); return; }
    setPasswordStatus('saving');
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (signInErr) { setPasswordErr('Current password is incorrect.'); setPasswordStatus('error'); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setPasswordErr(error.message); setPasswordStatus('error'); return; }
    setPasswordStatus('saved');
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    setTimeout(() => setPasswordStatus('idle'), 3000);
  };

  const savePrefs = async () => {
    if (!user) return;
    setPrefStatus('saving'); setPrefErr('');
    const { data, error } = await supabase.from('profiles')
      .update({ default_currency: defaultCurrency, timezone, date_format: dateFormat })
      .eq('id', user.id)
      .select('id');
    // 0 rows updated = missing profile row; Postgres doesn't call that an error.
    if (error || !data?.length) {
      setPrefErr(error?.message ?? 'Your profile wasn’t found. Reload the page and try again.');
      setPrefStatus('error');
      refreshPrefs();
      return;
    }
    setPrefStatus('saved');
    await refreshPrefs();
    setTimeout(() => setPrefStatus('idle'), 2500);
    if (defaultCurrency !== ctxCurrency) setTimeout(() => window.location.reload(), 400);
  };

  const install = async () => {
    await promptInstall();
    setInstallable(canInstall());
  };

  /** Client-side CSV of every transaction. */
  const exportAll = async () => {
    if (!user) return;
    setExporting(true); setExportMsg('');
    const rows: Record<string, unknown>[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await supabase
        .from('transactions')
        .select('transaction_date, title, type, amount, currency, description, notes, accounts(name), categories(name)')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false })
        .range(from, from + page - 1);
      if (error) { setExportMsg(error.message); setExporting(false); return; }
      rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
      if (!data || data.length < page) break;
    }
    const header = ['Date', 'Title', 'Type', 'Amount', 'Currency', 'Account', 'Category', 'Description', 'Notes'];
    const lines = rows.map((r) => {
      const acct = r.accounts as { name?: string } | null;
      const cat = r.categories as { name?: string } | null;
      return [
        r.transaction_date, r.title, r.type, r.amount, r.currency,
        acct?.name ?? '', cat?.name ?? '', r.description, r.notes,
      ].map(csvCell).join(',');
    });
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keel-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportMsg(`Exported ${rows.length} transaction${rows.length === 1 ? '' : 's'}`);
    setExporting(false);
  };

  const filteredTZ = tzSearch.trim()
    ? TIMEZONE_OPTIONS.filter((tz) => tz.label.toLowerCase().includes(tzSearch.toLowerCase()) || tz.value.toLowerCase().includes(tzSearch.toLowerCase()))
    : TIMEZONE_OPTIONS;
  const tzList = filteredTZ.some((t) => t.value === timezone) ? filteredTZ : [{ value: timezone, label: timezone }, ...filteredTZ];

  if (loading) {
    return (
      <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 flex flex-col gap-4 max-w-[860px]">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const pwMismatch = !!confirmPassword && confirmPassword !== newPassword;

  return (
    <div className="px-5 md:px-8 pt-3 md:pt-7 pb-8 md:pb-[120px] flex flex-col gap-7 max-w-[860px]">
      <PageHeader className="hidden md:flex" />

      {/* Profile */}
      <Section title="Profile" meta={user?.created_at ? `Member since ${new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : undefined}>
        <ProfilePhoto />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
          <Field label="Name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" autoComplete="name" />
          </Field>
          <Field label="Profession">
            <Input value={profession} onChange={(e) => setProfession(e.target.value)} placeholder="e.g. Software engineer" />
          </Field>
        </div>
        <div className="flex items-center gap-3 pt-3 pb-4 row-rule">
          <Button variant="secondary" onClick={saveProfile} disabled={profileStatus === 'saving'}>
            {profileStatus === 'saving' ? 'Saving…' : 'Save profile'}
          </Button>
          <StatusMsg status={profileStatus} error={profileErr} />
        </div>
        <div className="pt-4 flex flex-col gap-2">
          <Field label="Email">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input type="email" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setEmailStatus('idle'); }} placeholder="you@example.com" autoComplete="email" />
              <Button variant="secondary" onClick={changeEmail} disabled={emailStatus === 'saving' || !newEmail.trim() || newEmail === email} className="shrink-0 self-start">
                {emailStatus === 'saving' ? 'Sending…' : 'Change email'}
              </Button>
            </div>
          </Field>
          {emailStatus === 'saved' && (
            <p className="text-xs text-slate-300 flex items-center gap-1.5"><Check size={13} /> Confirmation link sent to {newEmail}. Check your inbox.</p>
          )}
          {emailStatus === 'error' && <StatusMsg status="error" error={emailErr} />}
          {newEmail === email && <p className="text-xs text-slate-400">Changing it sends a confirmation link to the new address.</p>}
        </div>
      </Section>

      {/* Preferences */}
      <Section title="Preferences">
        <SettingRow first label="Appearance" desc="System follows your device setting">
          <SegmentedControl options={THEME_OPTIONS} value={mode} onChange={setMode} />
        </SettingRow>
        <SettingRow label="Date format" desc="How dates are shown across the app">
          <SegmentedControl options={DATE_FORMATS} value={dateFormat} onChange={setDateFormat} />
        </SettingRow>
        <SettingRow
          label="Base currency"
          desc={defaultCurrency !== ctxCurrency
            ? <span className="flex items-center gap-1 text-blue-400"><RefreshCw size={11} /> Saving reloads the app to apply it</span>
            : 'Used for totals and conversions'}
        >
          <div className="flex items-center gap-2">
            <Select value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} className="w-[110px]" aria-label="Base currency">
              {ALL_CURRENCIES.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
            </Select>
            <Button variant="ghost" size="sm" onClick={() => navigate('/currencies')}>Manage <ChevronRight size={14} /></Button>
          </div>
        </SettingRow>
        <div className="flex flex-col gap-2 py-3.5 row-rule">
          <div className="flex flex-col">
            <span className="text-[15px] sm:text-sm font-semibold text-slate-100">Time zone</span>
            <span className="text-xs text-slate-400">Transactions are stored in UTC and shown in this zone · now {timezone}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-2">
            <input type="text" value={tzSearch} onChange={(e) => setTzSearch(e.target.value)} placeholder="Filter time zones…" className={fieldCls} aria-label="Filter time zones" />
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)} aria-label="Time zone">
              {tzList.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-3.5">
          <Button onClick={savePrefs} disabled={prefStatus === 'saving'}>
            {prefStatus === 'saving' ? 'Saving…' : 'Save preferences'}
          </Button>
          <StatusMsg status={prefStatus} error={prefErr} />
        </div>
      </Section>

      {/* Privacy & security */}
      <Section title="Privacy and security">
        <SettingRow first label="Hide balances" desc="Mask every amount until you tap the eye icon">
          <Switch checked={hidden} onChange={() => togglePrivacy()} label="Hide balances" />
        </SettingRow>
        <AppLockSetting />
        <div className="flex flex-col gap-3 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] sm:text-sm font-semibold text-slate-100">Change password</span>
            <button type="button" onClick={() => setShowPw((v) => !v)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100">
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />} {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Current password">
              <Input type={showPw ? 'text' : 'password'} value={currentPassword} autoComplete="current-password"
                onChange={(e) => { setCurrentPassword(e.target.value); setPasswordStatus('idle'); }} />
            </Field>
            <Field label="New password">
              <Input type={showPw ? 'text' : 'password'} value={newPassword} autoComplete="new-password" placeholder="Min. 6 characters"
                onChange={(e) => { setNewPassword(e.target.value); setPasswordStatus('idle'); }} />
            </Field>
            <Field label="Confirm new password">
              <Input type={showPw ? 'text' : 'password'} value={confirmPassword} autoComplete="new-password"
                className={pwMismatch ? '!border-red-500' : undefined}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordStatus('idle'); }} />
            </Field>
          </div>
          {pwMismatch && <p className="text-xs text-red-400">Passwords do not match</p>}
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={changePassword}
              disabled={passwordStatus === 'saving' || !currentPassword || !newPassword || !confirmPassword}>
              {passwordStatus === 'saving' ? 'Updating…' : 'Update password'}
            </Button>
            <StatusMsg status={passwordStatus} error={passwordErr} savedText="Password updated" />
          </div>
        </div>
      </Section>

      {/* App and data */}
      <Section title="App and data">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          {installable && !standalone && (
            <Button onClick={install}><Download size={16} /> Install Keel on this device</Button>
          )}
          <Button variant="secondary" onClick={exportAll} disabled={exporting}>
            {exporting ? 'Preparing CSV…' : 'Export all data (CSV)'}
          </Button>
        </div>
        <div className="flex flex-col gap-1 pt-2.5">
          {!installable && (
            <p className="text-xs text-slate-400">
              {standalone
                ? 'Keel is already installed on this device.'
                : isIOS()
                  ? 'To install: on iPhone, tap Share → Add to Home Screen.'
                  : 'Already installed, or your browser doesn’t offer installing. On iPhone: Share → Add to Home Screen.'}
            </p>
          )}
          {exportMsg && <p className="text-xs text-slate-300">{exportMsg}</p>}
        </div>
      </Section>
    </div>
  );
}
