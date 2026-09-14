'use client';

import type { FormEvent } from 'react';
import { GoogleSignInButton } from './GoogleSignInButton';

/** "Enter your email to reset password" view. */

type Props = {
  email: string;
  error: string | null;
  busy: boolean;
  googleBusy: boolean;
  onEmailChange: (value: string) => void;
  onGoogle: () => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

export function AuthResetRequestView({
  email,
  error,
  busy,
  googleBusy,
  onEmailChange,
  onGoogle,
  onSubmit,
  onCancel,
}: Props) {
  return (
    <div id="auth-reset-request-view" style={{ width: '100%' }}>
      <div className="auth-modal-header" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, color: '#202124', textAlign: 'center' }}>
          Enter your email to reset password
        </h2>
      </div>

      <GoogleSignInButton
        id="auth-reset-google-btn"
        onClick={onGoogle}
        disabled={googleBusy}
      />

      <div className="auth-divider">
        <span>or</span>
      </div>

      <form id="auth-reset-form" onSubmit={onSubmit}>
        <div className="auth-input-group">
          <label htmlFor="auth-reset-email">Email</label>
          <input
            type="email"
            id="auth-reset-email"
            required
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
          />
        </div>

        {error && (
          <div id="auth-reset-error-msg" className="auth-error-msg">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="auth-submit-btn"
          id="auth-reset-submit-btn"
          style={{ marginTop: 16 }}
          disabled={busy}
        >
          {busy ? '…' : 'Reset password'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a
            href="#"
            id="auth-reset-cancel-link"
            style={{
              fontSize: 15,
              color: '#006BD6',
              textDecoration: 'underline',
              display: 'inline-block',
            }}
            onClick={(e) => {
              e.preventDefault();
              onCancel();
            }}
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
