import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { User, Briefcase, Mail, Lock, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface ProfileData {
  full_name: string | null;
  profession: string | null;
  email: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function StatusMsg({ status, error }: { status: SaveStatus; error: string }) {
  if (status === 'saved') return (
    <p className="flex items-center gap-1.5 text-xs text-emerald-400">
      <Check size={13} /> Saved successfully
    </p>
  );
  if (status === 'error') return (
    <p className="flex items-center gap-1.5 text-xs text-red-400">
      <AlertCircle size={13} /> {error}
    </p>
  );
  return null;
}

export function ProfilePage() {
  const { user } = useAuth();

  // Profile info
  const [profile, setProfile] = useState<ProfileData>({ full_name: '', profession: '', email: '' });
  const [loading, setLoading] = useState(true);
  const [profileStatus, setProfileStatus] = useState<SaveStatus>('idle');
  const [profileErr, setProfileErr] = useState('');

  // Change email
  const [newEmail, setNewEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<SaveStatus>('idle');
  const [emailErr, setEmailErr] = useState('');

  // Change password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<SaveStatus>('idle');
  const [passwordErr, setPasswordErr] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('full_name, profession, email')
      .eq('id', user.id)
      .single();
    if (data) {
      setProfile({
        full_name: data.full_name ?? '',
        profession: data.profession ?? '',
        email: data.email ?? user.email ?? '',
      });
      setNewEmail(data.email ?? user.email ?? '');
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  /* ── Save profile info ── */
  const saveProfile = async () => {
    if (!user) return;
    setProfileStatus('saving');
    setProfileErr('');
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: profile.full_name, profession: profile.profession, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) { setProfileErr(error.message); setProfileStatus('error'); return; }
    setProfileStatus('saved');
    setTimeout(() => setProfileStatus('idle'), 3000);
  };

  /* ── Change email ── */
  const changeEmail = async () => {
    if (!user || !newEmail.trim() || newEmail === profile.email) return;
    setEmailStatus('saving');
    setEmailErr('');
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) { setEmailErr(error.message); setEmailStatus('error'); return; }
    setEmailStatus('saved');
    // Update profile table too
    await supabase.from('profiles').update({ email: newEmail.trim() }).eq('id', user.id);
    setTimeout(() => setEmailStatus('idle'), 5000);
  };

  /* ── Change password ── */
  const changePassword = async () => {
    if (!user) return;
    setPasswordErr('');
    if (!newPassword) { setPasswordErr('Enter a new password.'); setPasswordStatus('error'); return; }
    if (newPassword.length < 6) { setPasswordErr('Password must be at least 6 characters.'); setPasswordStatus('error'); return; }
    if (newPassword !== confirmPassword) { setPasswordErr('Passwords do not match.'); setPasswordStatus('error'); return; }

    setPasswordStatus('saving');

    // Re-authenticate with current password first
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPassword,
    });
    if (signInErr) { setPasswordErr('Current password is incorrect.'); setPasswordStatus('error'); return; }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setPasswordErr(error.message); setPasswordStatus('error'); return; }

    setPasswordStatus('saved');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPasswordStatus('idle'), 3000);
  };

  /* ── Avatar initials ── */
  const initials = (profile.full_name?.trim() || profile.email)
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-slate-500';
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1';

  if (loading) return <div className="px-8 py-8 text-slate-400">Loading…</div>;

  return (
    <div className="px-4 py-4 md:px-8 md:py-8 space-y-5 max-w-2xl">

      {/* Avatar + identity header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-blue-950/50 shrink-0">
          {initials || <User size={26} />}
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-100 leading-tight">
            {profile.full_name || 'Your Name'}
          </p>
          {profile.profession && (
            <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-1.5">
              <Briefcase size={12} className="text-slate-500" />{profile.profession}
            </p>
          )}
          <p className="text-xs text-slate-500 mt-0.5">{profile.email}</p>
        </div>
      </div>

      {/* ── Section: Personal info ── */}
      <section className="bg-[#141927] rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
          <User size={15} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-100">Personal Information</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Full Name</label>
              <input
                type="text"
                value={profile.full_name ?? ''}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                placeholder="John Smith"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Profession</label>
              <div className="relative">
                <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={profile.profession ?? ''}
                  onChange={(e) => setProfile({ ...profile, profession: e.target.value })}
                  placeholder="e.g. Software Engineer, Freelancer"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <StatusMsg status={profileStatus} error={profileErr} />
            <button
              onClick={saveProfile}
              disabled={profileStatus === 'saving'}
              className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all disabled:opacity-40"
            >
              {profileStatus === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Section: Change email ── */}
      <section className="bg-[#141927] rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
          <Mail size={15} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-100">Email Address</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Current Email</label>
            <input
              value={profile.email}
              disabled
              className="w-full px-3 py-2 border border-slate-700/50 rounded-lg bg-slate-900/50 text-slate-500 text-sm cursor-not-allowed"
            />
          </div>
          <div>
            <label className={labelCls}>New Email Address</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setEmailStatus('idle'); }}
              placeholder="new@example.com"
              className={inputCls}
            />
          </div>

          {emailStatus === 'saved' && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-300">
              <Check size={13} className="inline mr-1.5" />
              A confirmation link has been sent to <strong>{newEmail}</strong>. Check your inbox to confirm the change.
            </div>
          )}
          {emailStatus === 'error' && (
            <p className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle size={13} /> {emailErr}
            </p>
          )}

          <div className="flex justify-end pt-1">
            <button
              onClick={changeEmail}
              disabled={emailStatus === 'saving' || !newEmail.trim() || newEmail === profile.email}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {emailStatus === 'saving' ? 'Sending…' : 'Update Email'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Section: Change password ── */}
      <section className="bg-[#141927] rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
          <Lock size={15} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-100">Change Password</h2>
        </div>
        <div className="p-5 space-y-4">

          <div>
            <label className={labelCls}>Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setPasswordStatus('idle'); }}
                placeholder="Enter current password"
                className={`${inputCls} pr-10`}
              />
              <button type="button" onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordStatus('idle'); }}
                placeholder="Minimum 6 characters"
                className={`${inputCls} pr-10`}
              />
              <button type="button" onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {/* Password strength indicator */}
            {newPassword && (
              <div className="flex gap-1 mt-2">
                {[1, 2, 3, 4].map((i) => {
                  const strength = newPassword.length >= 12 ? 4 : newPassword.length >= 8 ? 3 : newPassword.length >= 6 ? 2 : 1;
                  return (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= strength
                        ? strength === 1 ? 'bg-red-500'
                          : strength === 2 ? 'bg-amber-500'
                          : strength === 3 ? 'bg-blue-500'
                          : 'bg-emerald-500'
                        : 'bg-slate-700'
                    }`} />
                  );
                })}
                <span className="text-[10px] text-slate-500 ml-1">
                  {newPassword.length >= 12 ? 'Strong' : newPassword.length >= 8 ? 'Good' : newPassword.length >= 6 ? 'Fair' : 'Weak'}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordStatus('idle'); }}
                placeholder="Repeat new password"
                className={`${inputCls} pr-10 ${
                  confirmPassword && confirmPassword !== newPassword ? 'border-red-500/60 focus:ring-red-500' : ''
                }`}
              />
              <button type="button" onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {confirmPassword && confirmPassword !== newPassword && (
              <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <StatusMsg status={passwordStatus} error={passwordErr} />
            <button
              onClick={changePassword}
              disabled={passwordStatus === 'saving' || !currentPassword || !newPassword || !confirmPassword}
              className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-950/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {passwordStatus === 'saving' ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </div>
      </section>

      {/* Account meta */}
      <div className="text-xs text-slate-600 px-1">
        Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
        {' · '}User ID: {user?.id?.slice(0, 8)}…
      </div>
    </div>
  );
}
