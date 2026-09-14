'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthProvider';

/**
 * Sign in / sign up / reset password modal — port of
 * motvin-ui/COMPONENT/Auth Modal.js.
 *
 * Three views in one dialog, as the original had: the main login/register form,
 * a reset-password request form, and a confirmation. The mode (login vs
 * register) swaps the copy but reuses the same fields.
 *
 * Exposed through context so any component can open it —
 * `useAuthModal().open('login')` — which is how the landing page's Sign in and
 * Get started buttons and the library's profile menu all reach it.
 */

type AuthMode = 'login' | 'register';
type View = 'main' | 'reset-request' | 'reset-msg';

type AuthModalContextValue = {
  open: (mode: AuthMode) => void;
  close: () => void;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function useAuthModal(): AuthModalContextValue {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error('useAuthModal must be used inside <AuthModalProvider>');
  }
  return context;
}

const GOOGLE_LOGO_FALLBACK =
  'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg';

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset } =
    useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');
  const [view, setView] = useState<View>('main');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [sentResetTo, setSentResetTo] = useState('');

  const [error, setError] = useState('');
  const [resetError, setResetError] = useState('');
  const [busy, setBusy] = useState(false);

  const open = useCallback((nextMode: AuthMode) => {
    setMode(nextMode);
    setView('main');
    setEmail('');
    setPassword('');
    setError('');
    setResetError('');
    setBusy(false);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const contextValue = useMemo(() => ({ open, close }), [open, close]);

  const isLogin = mode === 'login';

  const handleGoogle = async () => {
    setError('');
    setBusy(true);
    try {
      await signInWithGoogle();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isLogin) {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setResetError('');
    setBusy(true);
    try {
      await sendPasswordReset(resetEmail);
      setSentResetTo(resetEmail);
      setView('reset-msg');
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const googleButton = (
    <button
      type="button"
      className="auth-google-btn"
      onClick={handleGoogle}
      disabled={busy}
    >
      <img
        src="/ASSET/Icons/google.svg"
        alt="Google Logo"
        onError={(e) => {
          // The local asset 404s on the static site too; fall back as it did.
          e.currentTarget.src = GOOGLE_LOGO_FALLBACK;
        }}
      />
      Continue with Google
    </button>
  );

  return (
    <AuthModalContext.Provider value={contextValue}>
      {children}

      <div
        id="auth-modal"
        className="auth-modal-overlay"
        style={{ display: isOpen ? 'flex' : 'none' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="auth-modal-content">
          <button
            className="auth-modal-close"
            id="auth-modal-close"
            aria-label="Close modal"
            onClick={close}
          >
            &times;
          </button>

          <div id="auth-main-view" style={{ display: view === 'main' ? 'block' : 'none' }}>
            <div className="auth-modal-header">
              <h2 id="auth-modal-title">{isLogin ? 'Sign in' : 'Create Account'}</h2>
              <p id="auth-modal-subtitle">
                {isLogin
                  ? 'Welcome back! Please enter your details.'
                  : 'Start your journey with us today.'}
              </p>
            </div>

            {googleButton}

            <div className="auth-divider">
              <span>or</span>
            </div>

            <form id="auth-modal-form" onSubmit={handleSubmit}>
              <div className="auth-input-group">
                <label htmlFor="auth-email">Email</label>
                <input
                  type="email"
                  id="auth-email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="auth-input-group">
                <label htmlFor="auth-password">Password</label>
                <input
                  type="password"
                  id="auth-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div
                id="auth-error-msg"
                className="auth-error-msg"
                style={{ display: error ? 'block' : 'none', color: '#d93025' }}
              >
                {error}
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                id="auth-modal-submit-btn"
                disabled={busy}
              >
                {isLogin ? 'Log in' : 'Sign up'}
              </button>

              {/* Reset is only offered when signing in — there is nothing to
                  reset for an account that doesn't exist yet. */}
              <div
                id="auth-forgot-password-wrapper"
                style={{
                  display: isLogin ? 'block' : 'none',
                  textAlign: 'center',
                  marginTop: '12px',
                  paddingBottom: '16px',
                }}
              >
                <a
                  href="#"
                  id="auth-forgot-password-link"
                  style={{
                    fontSize: '15px',
                    color: '#006BD6',
                    textDecoration: 'underline',
                    display: 'inline-block',
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    setResetError('');
                    setResetEmail(email); // Carry over anything already typed.
                    setView('reset-request');
                  }}
                >
                  Reset Password
                </a>
              </div>
            </form>

            <div className="auth-modal-footer">
              <span id="auth-toggle-text">
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
              </span>
              <a
                href="#"
                id="auth-toggle-mode"
                onClick={(e) => {
                  e.preventDefault();
                  open(isLogin ? 'register' : 'login');
                }}
              >
                {isLogin ? 'Sign up' : 'Log in'}
              </a>
            </div>
          </div>

          {/* Reset Password Request View */}
          <div
            id="auth-reset-request-view"
            style={{ display: view === 'reset-request' ? 'block' : 'none', width: '100%' }}
          >
            <div className="auth-modal-header" style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', color: '#202124', textAlign: 'center' }}>
                Enter your email to reset password
              </h2>
            </div>

            {googleButton}

            <div className="auth-divider">
              <span>or</span>
            </div>

            <form id="auth-reset-form" onSubmit={handleReset}>
              <div className="auth-input-group">
                <label htmlFor="auth-reset-email">Email</label>
                <input
                  type="email"
                  id="auth-reset-email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
              </div>

              <div
                id="auth-reset-error-msg"
                className="auth-error-msg"
                style={{ display: resetError ? 'block' : 'none', color: '#d93025' }}
              >
                {resetError}
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                id="auth-reset-submit-btn"
                style={{ marginTop: '16px' }}
                disabled={busy}
              >
                Reset password
              </button>

              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <a
                  href="#"
                  id="auth-reset-cancel-link"
                  style={{
                    fontSize: '15px',
                    color: '#006BD6',
                    textDecoration: 'underline',
                    display: 'inline-block',
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    setView('main');
                  }}
                >
                  Cancel
                </a>
              </div>
            </form>
          </div>

          {/* Reset Password Msg View */}
          <div
            id="auth-reset-msg-view"
            style={{ display: view === 'reset-msg' ? 'block' : 'none', width: '100%' }}
          >
            <div className="auth-modal-header" style={{ marginBottom: '16px' }}>
              <h2
                style={{
                  fontSize: '24px',
                  color: '#202124',
                  textAlign: 'center',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.2,
                }}
              >
                Received your password
                <br />
                reset request
              </h2>
            </div>

            {/* Deliberately does not confirm whether the account exists. */}
            <p
              style={{
                fontSize: '15px',
                lineHeight: '22px',
                color: '#000000',
                textAlign: 'center',
                marginBottom: '24px',
              }}
            >
              If an account exists for{' '}
              <span id="auth-reset-email-display" style={{ fontWeight: 600 }}>
                {sentResetTo}
              </span>
              , you will get an email with instructions on resetting your password. If it
              doesn&apos;t arrive, be sure to check your spam folder.
            </p>

            <button
              type="button"
              className="auth-submit-btn"
              id="auth-reset-back-btn"
              onClick={() => setView('main')}
            >
              Back to Log in
            </button>
          </div>
        </div>
      </div>
    </AuthModalContext.Provider>
  );
}
