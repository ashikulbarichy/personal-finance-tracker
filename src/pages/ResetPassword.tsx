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
  const [invalidToken, setInvalidToken] = useState(false);

  const { user, loading: authLoading, isRecovery, clearRecovery } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check for error parameters in the URL hash or query (Supabase returns errors in hash on expired/invalid links)
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(window.location.search);

    const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');
    const errorCode = hashParams.get('error_code') || searchParams.get('error_code');

    if (errorCode || errorDesc) {
      setInvalidToken(true);
      setError(errorDesc?.replace(/\+/g, ' ') || 'The password reset link is invalid or has expired.');
    }
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

  // Check if there is an active session or recovery token
  const hasRecoveryToken =
    typeof window !== 'undefined' &&
    (window.location.hash.includes('access_token') ||
      window.location.hash.includes('type=recovery') ||
      window.location.search.includes('code='));

  const noActiveSession = !authLoading && !user && !isRecovery && !hasRecoveryToken && !invalidToken;

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

      {invalidToken ? (
        <div className="flex flex-col gap-5 rule-t pt-5">
          <AuthError>{error || 'This password reset link is invalid or has expired.'}</AuthError>
          <p className="text-sm text-slate-400">
            Please ask an administrator to send a new password reset link from the Supabase dashboard.
          </p>
          <Button variant="secondary" onClick={() => navigate('/login', { replace: true })}>
            Back to Sign in
          </Button>
        </div>
      ) : noActiveSession ? (
        <div className="flex flex-col gap-5 rule-t pt-5">
          <div className="border-l-2 border-slate-500 bg-slate-900 text-slate-300 px-3.5 py-3 text-sm">
            No active password reset request found.
          </div>
          <p className="text-sm text-slate-400">
            Password resets are managed by administrators. Please request a password reset directly from the Supabase dashboard.
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
