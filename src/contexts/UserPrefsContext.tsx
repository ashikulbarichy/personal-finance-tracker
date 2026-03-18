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

  const fetchPrefs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('timezone, date_format, default_currency')
      .eq('id', user.id)
      .single();

    if (data) {
      setPrefs({
        timezone: data.timezone || DEFAULT_PREFS.timezone,
        dateFormat: data.date_format || DEFAULT_PREFS.dateFormat,
        defaultCurrency: data.default_currency || DEFAULT_PREFS.defaultCurrency,
      });
    }
    setPrefsLoaded(true);
  }, [user]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const fmt = useCallback(
    (dateStr: string | null | undefined) =>
      formatDate(dateStr, prefs.dateFormat, prefs.timezone),
    [prefs.dateFormat, prefs.timezone],
  );

  const value = useMemo(
    () => ({ ...prefs, refreshPrefs: fetchPrefs, fmt, prefsLoaded }),
    [prefs, fetchPrefs, fmt, prefsLoaded],
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
