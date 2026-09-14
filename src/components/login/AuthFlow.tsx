'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/shared/AuthProvider';
import { AuthMainView } from './AuthMainView';
import { AuthPageLogo } from './AuthPageLogo';
import { LoginChrome } from './LoginChrome';
import { AuthResetRequestView } from './AuthResetRequestView';
import { AuthResetSentView } from './AuthResetSentView';

/**
 * Full auth flow: logo + a switcher between the main sign-in/up view, the
 * reset-request view, and the reset-sent confirmation. Both /login and /signup
 * render this — they only differ in `defaultMode`, and `?mode=signup` on
 * /login still flips to register so the deep link keeps working.
 */

type View = 'main' | 'reset-request' | 'reset-msg';

type Props = {
  defaultMode: 'login' | 'register';
};

export function AuthFlow({ defaultMode }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next') || '/icons';
  const modeParam =
    searchParams.get('mode') === 'signup'
      ? 'register'
      : searchParams.get('mode') === 'login'
        ? 'login'
        : defaultMode;

  const { user, signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset } =
    useAuth();

  const [mode, setMode] = useState<'login' | 'register'>(modeParam);
  const [view, setView] = useState<View>('main');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [sentResetTo, setSentResetTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    if (user && !user.isAnonymous) router.replace(nextParam);
  }, [user, nextParam, router]);

  const doGoogle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.replace(nextParam);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }, [signInWithGoogle, router, nextParam]);

  const doEmail = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!email || !password) return;
      setBusy(true);
      setError(null);
      try {
        if (mode === 'login') await signInWithEmail(email, password);
        else await signUpWithEmail(email, password);
        router.replace(nextParam);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
      } finally {
        setBusy(false);
      }
    },
    [email, password, mode, signInWithEmail, signUpWithEmail, router, nextParam],
  );

  const doReset = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!resetEmail) return;
      setResetBusy(true);
      setResetError(null);
      try {
        await sendPasswordReset(resetEmail);
        setSentResetTo(resetEmail);
        setView('reset-msg');
      } catch (err) {
        setResetError(err instanceof Error ? err.message : 'Reset failed');
      } finally {
        setResetBusy(false);
      }
    },
    [resetEmail, sendPasswordReset],
  );

  return (
    <>
      <LoginChrome />
      <AuthPageLogo />

      <div
        className="auth-modal-content"
        style={{ boxShadow: 'none' }}
        id="auth-modal-content"
      >
        {view === 'main' && (
          <AuthMainView
            mode={mode}
            email={email}
            password={password}
            error={error}
            busy={busy}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onGoogle={doGoogle}
            onSubmit={doEmail}
            onForgotPassword={() => {
              // Carry the email the visitor already typed into the reset form,
              // matching the reference at Auth Modal.js:248.
              setResetEmail(email);
              setResetError(null);
              setView('reset-request');
            }}
            onSwitchMode={(next) => {
              setMode(next);
              setError(null);
            }}
          />
        )}

        {view === 'reset-request' && (
          <AuthResetRequestView
            email={resetEmail}
            error={resetError}
            busy={resetBusy}
            googleBusy={busy}
            onEmailChange={setResetEmail}
            onGoogle={doGoogle}
            onSubmit={doReset}
            onCancel={() => {
              setResetError(null);
              setView('main');
            }}
          />
        )}

        {view === 'reset-msg' && (
          <AuthResetSentView
            email={sentResetTo}
            onBack={() => {
              setSentResetTo('');
              setResetEmail('');
              setView('main');
            }}
          />
        )}
      </div>
    </>
  );
}
