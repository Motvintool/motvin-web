'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { FALLBACK_COVER_SHOTS, loadAppCoverShots, type CoverShot } from '@/lib/inspirations/coverShots';

const GOOGLE_LOGO_FALLBACK =
  'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg';

// Message from buildAuthErrorMessage in lib/firebase/auth.ts — matched so the login error can point to sign-up.
const MSG_INVALID_LOGIN = 'Invalid email or password.';

type Shot = CoverShot;

const COLUMNS = 5;
const PER_COLUMN = 7;

function MailIcon() {
  return (
    <svg className="ins-login-field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7.5 8 5.5 8-5.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="ins-login-field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="3" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

// Stays null until the real screens are in (or have failed to arrive), so the
// collage fades in once instead of swapping its pictures out in front of you.
function useCollage(): Shot[][] | null {
  const [shots, setShots] = useState<Shot[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fallback = window.setTimeout(() => {
      if (!cancelled) setShots((current) => current ?? FALLBACK_COVER_SHOTS);
    }, 2500);

    loadAppCoverShots()
      .then((loaded) => {
        if (!cancelled) setShots(loaded.length >= 4 ? loaded : FALLBACK_COVER_SHOTS);
      })
      .catch(() => {
        if (!cancelled) setShots(FALLBACK_COVER_SHOTS);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, []);

  if (!shots) return null;
  const cells: Shot[] = [];
  while (cells.length < COLUMNS * PER_COLUMN) cells.push(...shots);
  return Array.from({ length: COLUMNS }, (_, i) =>
    cells.slice(i * PER_COLUMN, (i + 1) * PER_COLUMN),
  );
}

function ArtCard({ shot }: { shot: Shot }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className={`ins-login-art-card${loaded ? ' is-loaded' : ''}`}
      style={{ aspectRatio: `${shot.ratio}` }}
    >
      <img
        src={shot.src}
        alt=""
        draggable={false}
        onLoad={() => setLoaded(true)}
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0) setLoaded(true);
        }}
      />
    </div>
  );
}

export function InspirationsLogin({
  defaultMode = 'login',
  backHref = '/inspirations',
}: {
  defaultMode?: 'login' | 'signup';
  /** Where the logo leads: the page that sent the visitor here, or the library. */
  backHref?: string;
}) {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset } = useAuth();
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [mode, setMode] = useState<'login' | 'signup'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const columns = useCollage();

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = () => {
    void run(async () => {
      await signInWithGoogle();
    });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step === 'email') {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        setError('Enter a valid email address.');
        return;
      }
      setError(null);
      setNotice(null);
      setStep('password');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    void run(async () => {
      if (mode === 'signup') await signUpWithEmail(email.trim(), password);
      else await signInWithEmail(email.trim(), password);
    });
  };

  const onForgot = () => {
    void run(async () => {
      await sendPasswordReset(email.trim());
      setNotice(`Password reset link sent to ${email.trim()}.`);
    });
  };

  const switchMode = (next: 'login' | 'signup') => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  // A new visitor on the login form gets a way across instead of a dead-end message.
  const showCreateHint = error === MSG_INVALID_LOGIN && mode === 'login';

  const backToEmail = () => {
    setStep('email');
    setPassword('');
    setShowPassword(false);
    setError(null);
    setNotice(null);
  };

  return (
    <div className="ins-login">
      <div className="ins-login-pane">
        <div className="ins-login-card">
          {/* The way back to browsing (to the page that sent the visitor here):
              this page has no header of its own. */}
          <Link href={backHref} className="ins-login-logo-link" aria-label="Back to Motvin Inspirations">
            <img
              src="/ASSET/svg/Motvin/login/login-signup-motvin-logo.svg"
              alt=""
              className="ins-login-logo"
              width={48}
              height={48}
            />
          </Link>
          <h1 className="ins-login-title">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="ins-login-sub">
            {mode === 'signup'
              ? 'Create an account to start exploring real app screens.'
              : 'Log in to browse real app screens, flows and patterns.'}
          </p>

          <button type="button" className="ins-login-google" onClick={onGoogle} disabled={busy}>
            <img
              src="/ASSET/Icons/google.svg"
              alt=""
              width={20}
              height={20}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = GOOGLE_LOGO_FALLBACK;
              }}
            />
            Continue with Google
          </button>

          <div className="ins-login-or" aria-hidden="true">
            <span>or</span>
          </div>

          <form className="ins-login-form" onSubmit={onSubmit} noValidate>
            {step === 'email' ? (
              <div className="ins-login-field">
                <MailIcon />
                <input
                  className="ins-login-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address"
                  aria-label="Email address"
                  name="email"
                  autoComplete={mode === 'login' ? 'username' : 'email'}
                  autoFocus
                  disabled={busy}
                />
              </div>
            ) : (
              <>
                <button type="button" className="ins-login-identity" onClick={backToEmail}>
                  <span className="ins-login-identity-email">{email.trim()}</span>
                  <span className="ins-login-identity-change">Change</span>
                </button>
                {/* Lets browsers and password managers pair this password with the
                    email from the previous step. Kept off-screen, not display:none,
                    because managers skip fields that aren't rendered. */}
                <input
                  className="ins-login-autofill-username"
                  type="email"
                  name="email"
                  autoComplete="username"
                  value={email.trim()}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                />
                <div className="ins-login-field">
                  <LockIcon />
                  <input
                    className="ins-login-input ins-login-input--has-action"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'Create a password' : 'Enter password'}
                    aria-label="Password"
                    name="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    autoFocus
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="ins-login-reveal"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {mode === 'login' ? (
                  <button type="button" className="ins-login-forgot" onClick={onForgot} disabled={busy}>
                    Forgot password?
                  </button>
                ) : null}
              </>
            )}
            <button type="submit" className="ins-login-continue" disabled={busy} aria-busy={busy}>
              {busy ? (
                <>
                  <span className="ins-login-loader" aria-hidden="true" />
                  Please wait…
                </>
              ) : (
                'Continue'
              )}
            </button>
          </form>

          {error ? (
            <div className="ins-login-error" role="alert">
              <p>{error}</p>
              {showCreateHint ? (
                <p className="ins-login-error-hint">
                  No account yet?{' '}
                  <button type="button" onClick={() => switchMode('signup')}>
                    Create one
                  </button>
                </p>
              ) : null}
            </div>
          ) : null}
          {notice ? <p className="ins-login-notice">{notice}</p> : null}

          <p className="ins-login-switch">
            {mode === 'login' ? 'New to Motvin?' : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            >
              {mode === 'login' ? 'Create an account' : 'Log in'}
            </button>
          </p>
        </div>

        <p className="ins-login-terms">
          By continuing, you agree to Motvin&apos;s <Link href="/terms" target="_blank" rel="noopener noreferrer">Terms</Link> and{' '}
          <Link href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.
        </p>
      </div>

      <div className="ins-login-art" aria-hidden="true">
        <div className={`ins-login-art-grid${columns ? ' is-ready' : ''}`}>
          {(columns ?? []).map((column, c) => (
            <div className="ins-login-art-col" key={c}>
              <div className="ins-login-art-track">
                {[0, 1].map((copy) => (
                  <div className="ins-login-art-set" key={copy}>
                    {column.map((shot, i) => (
                      <ArtCard shot={shot} key={`${c}-${copy}-${i}`} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
