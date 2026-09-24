import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/* "Hide balances" — masks every money figure (.tabular-nums / .money) via a
 * class on <html>, so pages don't need to know about it. */
const KEY = 'ft-hide-amounts';

type Ctx = { hidden: boolean; toggle: () => void; setHidden: (v: boolean) => void };
const PrivacyContext = createContext<Ctx | undefined>(undefined);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('hide-amounts', hidden);
    try { localStorage.setItem(KEY, hidden ? '1' : '0'); } catch { /* ignore */ }
  }, [hidden]);

  const toggle = useCallback(() => setHidden((h) => !h), []);
  return <PrivacyContext.Provider value={{ hidden, toggle, setHidden }}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy() {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error('usePrivacy must be used within PrivacyProvider');
  return ctx;
}
