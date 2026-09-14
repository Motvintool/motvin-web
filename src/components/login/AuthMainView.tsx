'use client';

import type { FormEvent } from 'react';
import { GoogleSignInButton } from './GoogleSignInButton';

/**
 * Main sign-in / sign-up view. Mode toggle swaps the copy and the submit label
 * but reuses the same email + password fields. Ports the primary panel of
 * motvin-ui/login.html.
 */

type Props = {
  mode: 'login' | 'register';
  email: string;
  password: string;
  error: string | null;
  busy: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onGoogle: () => void;
  onSubmit: (event: FormEvent) => void;
  onForgotPassword: () => void;
  onSwitchMode: (mode: 'login' | 'register') => void;
};

export function AuthMainView({
  mode,
  email,
  password,
  error,
  busy,
  onEmailChange,
  onPasswordChange,
  onGoogle,
  onSubmit,
  onForgotPassword,
  onSwitchMode,
}: Props) {
  return (
    <div id="auth-main-view" style={{ width: '100%' }}>
      <div className="auth-modal-header">
        <h2>{mode === 'login' ? 'Welcome to Motvin' : 'Create your account'}</h2>
        <p>
          {mode === 'login'
            ? 'Welcome back! Please enter your details.'
            : 'Sign up to save collections and sync across devices.'}
        </p>
      </div>

      <GoogleSignInButton id="auth-google-btn" onClick={onGoogle} disabled={busy} />

      <div className="auth-divider">
        <span>or</span>
      </div>

      <form id="login-form" onSubmit={onSubmit}>
        <div className="auth-input-group">
          <label htmlFor="auth-email">Email</label>
          <input
            type="email"
            id="auth-email"
            required
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
          />
        </div>

        <div className="auth-input-group">
          <label htmlFor="auth-password">Password</label>
          <input
            type="password"
            id="auth-password"
            required
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
          />
        </div>

        {error && (
          <div id="auth-error-msg" className="auth-error-msg">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="auth-submit-btn"
          id="auth-submit-btn"
          disabled={busy}
        >
          {busy ? '…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a
            href="#"
            id="auth-forgot-password-link"
            style={{
              fontSize: 15,
              color: '#006BD6',
              textDecoration: 'underline',
              display: 'inline-block',
            }}
            onClick={(e) => {
              e.preventDefault();
              onForgotPassword();
            }}
          >
            Reset Password
          </a>
        </div>
      </form>

      <div className="auth-modal-footer">
        {mode === 'login' ? (
          <>
            <span>Don&apos;t have an account? </span>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onSwitchMode('register');
              }}
            >
              Sign up
            </a>
          </>
        ) : (
          <>
            <span>Already have an account? </span>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onSwitchMode('login');
              }}
            >
              Log in
            </a>
          </>
        )}
      </div>
    </div>
  );
}
