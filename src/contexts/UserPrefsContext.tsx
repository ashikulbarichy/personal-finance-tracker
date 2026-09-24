import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { formatDate } from '../lib/dateUtils';
import { signedUrl } from '../lib/media';
import { syncManualRates } from '../lib/manualRates';

export interface UserPrefs {
  timezone: string;
  dateFormat: string;
  defaultCurrency: string;
}

interface UserPrefsContextType extends UserPrefs {
  /** Re-fetch prefs from DB (call after saving in Preferences) */
  refreshPrefs: () => Promise<void>;
  /** Format a date string using the user's timezone + date format preference */
  fmt: (dateStr: string | null | undefined) => string;
  prefsLoaded: boolean;
  /** Profile basics shown in the sidebar / More screen. */
  fullName: string;
  avatarPath: string | null;
  /** Signed URL for the profile photo (null → show initials). */
  avatarUrl: string | null;
}

const DEFAULT_PREFS: UserPrefs = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  dateFormat: 'DD/MM/YYYY',
  defaultCurrency: 'USD',
};

const UserPrefsContext = createContext<UserPrefsContextType | undefined>(undefined);

export function UserPrefsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [fullName, setFullName] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const fetchPrefs = useCallback(async () => {
    if (!user) return;
    const query = () => supabase
      .from('profiles')
      // '*' so this keeps working before/after optional columns (avatar_path) exist.
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    let { data } = await query();

    // Self-heal: every table references profiles(id), so a missing profile
    // (e.g. after a schema rebuild) silently breaks every save. Recreate it
    // — RLS allows a user to insert their own row. The time zone starts as
    // this device's.
    if (!data) {
      const { error } = await supabase.from('profiles').insert({
        id: user.id,
        email: user.email ?? '',
        full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
        timezone: DEFAULT_PREFS.timezone,
      });
      if (!error || error.code === '23505') {
        ({ data } = await query());
        // Pages that loaded in parallel saw no profile — let them reload.
        window.dispatchEvent(new Event('ft-data-changed'));
      } else console.error('Could not create profile:', error.message);
    }

    if (data) {
      setPrefs({
        timezone: data.timezone || DEFAULT_PREFS.timezone,
        dateFormat: data.date_format || DEFAULT_PREFS.dateFormat,
        defaultCurrency: data.default_currency || DEFAULT_PREFS.defaultCurrency,
      });
      setFullName(data.full_name || user.email?.split('@')[0] || '');
      setAvatarPath(data.avatar_path ?? null);
      // Exchange rates are synced through the profile.
      if ('manual_rates' in data && syncManualRates(user.id, data.manual_rates)) {
        window.dispatchEvent(new Event('ft-data-changed'));
      }
    }
    setPrefsLoaded(true);
  }, [user]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  useEffect(() => {
    let live = true;
    signedUrl(avatarPath).then((u) => live && setAvatarUrl(u));
    return () => { live = false; };
  }, [avatarPath]);

  const fmt = useCallback(
    (dateStr: string | null | undefined) =>
      formatDate(dateStr, prefs.dateFormat, prefs.timezone),
    [prefs.dateFormat, prefs.timezone],
  );

  const value = useMemo(
    () => ({ ...prefs, refreshPrefs: fetchPrefs, fmt, prefsLoaded, fullName, avatarPath, avatarUrl }),
    [prefs, fetchPrefs, fmt, prefsLoaded, fullName, avatarPath, avatarUrl],
  );

  return (
    <UserPrefsContext.Provider value={value}>{children}</UserPrefsContext.Provider>
  );
}

export function useUserPrefs() {
  const ctx = useContext(UserPrefsContext);
  if (!ctx) throw new Error('useUserPrefs must be used within UserPrefsProvider');
  return ctx;
}
