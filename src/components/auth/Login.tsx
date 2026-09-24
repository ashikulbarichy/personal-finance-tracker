import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Field, Input } from '../ui';

/** 28px accent square with a bold K + the "Keel" wordmark. */
export function AuthBrand({ inverted }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={
          'w-7 h-7 grid place-items-center font-extrabold text-base shrink-0 ' +
          (inverted ? 'bg-app text-blue-600' : 'bg-blue-600 text-app')
        }
      >
        K
      </div>
      <span className={'text-[19px] font-extrabold tracking-[-0.02em] ' + (inverted ? 'text-app' : 'text-slate-100')}>Keel</span>
    </div>
  );
}

/** Shared auth layout: solid accent panel on wide screens, 400px flush-left form column. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-app text-slate-100 flex">
      <aside className="hidden lg:flex w-[44%] max-w-[620px] bg-blue-600 text-app flex-col justify-between p-12">
        <AuthBrand inverted />
        <div className="flex flex-col gap-4">
          <p className="text-[40px] leading-[1.08] font-extrabold tracking-[-0.02em] max-w-[440px]">
            Every account, every currency, one honest ledger.
          </p>
          <div className="h-[2px] w-16 bg-app" />
          <p className="text-sm opacity-90 max-w-[380px]">
            Track spending, budgets, loans and goals — on the web or installed on your phone.
          </p>
        </div>
        <span className="text-xs opacity-75">Keel · personal finance</span>
      </aside>
      <main className="flex-1 flex items-center px-5 sm:px-10 lg:px-16 py-10">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="border-l-2 border-red-500 bg-red-900 text-red-400 px-3.5 py-2.5 text-sm">
      {children}
    </div>
  );
}

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password, rememberMe);
    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  return (
    <AuthLayout>
      <div className="lg:hidden mb-10"><AuthBrand /></div>
      <div className="mb-7">
        <div className="text-[13px] text-slate-400 mb-1">Sign in to Keel</div>
        <h1 className="text-[28px] md:text-[32px] font-extrabold tracking-[-0.02em] leading-[1.12] text-slate-100">Welcome back</h1>
      </div>

      <form className="flex flex-col gap-4 rule-t pt-5" onSubmit={handleSubmit}>
        {error && <AuthError>{error}</AuthError>}
        <Field label="Email address">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="min-h-[44px]"
          />
        </Field>
        <Field label="Password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="min-h-[44px]"
          />
        </Field>
        <label className="inline-flex items-center gap-2 text-[13px] text-slate-300 select-none cursor-pointer self-start min-h-[32px]">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          <span>Keep me logged in</span>
        </label>

        <Button type="submit" size="lg" block disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

    </AuthLayout>
  );
}
