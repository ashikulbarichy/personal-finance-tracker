import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AuthBrand, AuthError, AuthLayout } from '../components/auth/Login';
import { Button, Field, Input } from '../components/ui';

export function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);

  const { clearRecovery } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      // 1. Check for error parameters in the URL hash or search (Supabase returns errors on expired/invalid links)
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.substring(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(hash);
      const searchParams = new URLSearchParams(window.location.search);

      const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');
      const errorCode = hashParams.get('error_code') || searchParams.get('error_code');

      if (errorCode || errorDesc) {
        if (!isMounted) return;
        setInvalidToken(true);
        setError(errorDesc?.replace(/\+/g, ' ') || 'The password reset link is invalid or has expired.');
        setSessionChecking(false);
        return;
      }

      // 2. If PKCE 'code' query parameter is present, exchange it for an active session
      const code = searchParams.get('code');
      if (code) {
        try {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!isMounted) return;
          if (exchangeError) {
            setInvalidToken(true);
            setError(exchangeError.message);
            setSessionChecking(false);
            return;
          }
          if (data.session) {
            setHasValidSession(true);
            setSessionChecking(false);
            return;
          }
        } catch (err: unknown) {
          if (!isMounted) return;
          setInvalidToken(true);
          setError(err instanceof Error ? err.message : 'Failed to verify recovery code.');
          setSessionChecking(false);
          return;
        }
      }

      // 3. If 'token_hash' query parameter is present, verify OTP
      const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash');
      if (tokenHash) {
        try {
          const { data, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (!isMounted) return;
          if (verifyError) {
            setInvalidToken(true);
            setError(verifyError.message);
            setSessionChecking(false);
            return;
          }
          if (data.session) {
            setHasValidSession(true);
            setSessionChecking(false);
            return;
          }
        } catch (err: unknown) {
          if (!isMounted) return;
          setInvalidToken(true);
          setError(err instanceof Error ? err.message : 'Failed to verify recovery token.');
          setSessionChecking(false);
          return;
        }
      }

      // 4. Check if a session is already present (e.g. from hash tokens parsed by supabase-js)
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (session) {
        setHasValidSession(true);
        setSessionChecking(false);
        return;
      }

      // 5. If hash contains access_token, give supabase-js a moment to parse it via onAuthStateChange
      if (window.location.hash.includes('access_token')) {
        const timeout = setTimeout(async () => {
          if (!isMounted) return;
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          if (retrySession) {
            setHasValidSession(true);
          } else {
            setInvalidToken(true);
            setError('Could not establish an authenticated recovery session. Please try requesting a new reset link.');
          }
          setSessionChecking(false);
        }, 1200);

        return () => clearTimeout(timeout);
      }

      // No token and no session found
      setSessionChecking(false);
    }

    initSession();

    // Listen to auth state changes in case Supabase parses the token asynchronously
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) {
        setHasValidSession(true);
        setSessionChecking(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // Ensure session is actually active before attempting updateUser
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active recovery session found. The link may have expired or was already used. Please request a new reset from Supabase dashboard.');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      clearRecovery();

      // Automatically redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update password. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="lg:hidden mb-10">
        <AuthBrand />
      </div>
      <div className="mb-7">
        <div className="text-[13px] text-slate-400 mb-1">Supabase Account Recovery</div>
        <h1 className="text-[28px] md:text-[32px] font-extrabold tracking-[-0.02em] leading-[1.12] text-slate-100">
          Reset password
        </h1>
      </div>

      {sessionChecking ? (
        <div className="flex flex-col gap-4 rule-t pt-5">
          <p className="text-sm text-slate-400 font-medium animate-pulse">
            Verifying recovery session…
          </p>
        </div>
      ) : invalidToken || !hasValidSession ? (
        <div className="flex flex-col gap-5 rule-t pt-5">
          <AuthError>
            {error || 'No active password reset session found. The link may be invalid, expired, or already used.'}
          </AuthError>
          <p className="text-sm text-slate-400">
            Please ask an administrator to send a new password reset link from the Supabase dashboard.
          </p>
          <Button variant="secondary" onClick={() => navigate('/login', { replace: true })}>
            Back to Sign in
          </Button>
        </div>
      ) : success ? (
        <div className="flex flex-col gap-5 rule-t pt-5">
          <div className="border-l-2 border-green-500 bg-green-950/60 text-green-400 px-3.5 py-3 text-sm">
            <p className="font-bold">Password updated successfully!</p>
            <p className="text-xs text-green-300 mt-1">Redirecting you to the dashboard...</p>
          </div>
          <Button variant="primary" onClick={() => navigate('/dashboard', { replace: true })}>
            Go to Dashboard now
          </Button>
        </div>
      ) : (
        <form className="flex flex-col gap-4 rule-t pt-5" onSubmit={handleSubmit}>
          {error && <AuthError>{error}</AuthError>}

          <Field label="New password">
            <Input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="min-h-[44px]"
            />
          </Field>

          <Field label="Confirm new password">
            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="min-h-[44px]"
            />
          </Field>

          <Button type="submit" size="lg" block disabled={loading}>
            {loading ? 'Updating password…' : 'Set new password'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
