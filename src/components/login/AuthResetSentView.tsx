'use client';

/** Confirmation shown after a password-reset request is sent. */

type Props = {
  email: string;
  onBack: () => void;
};

export function AuthResetSentView({ email, onBack }: Props) {
  return (
    <div id="auth-reset-msg-view" style={{ width: '100%' }}>
      <div className="auth-modal-header" style={{ marginBottom: 16 }}>
        <h2
          style={{
            fontSize: 24,
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

      <p
        style={{
          fontSize: 15,
          lineHeight: '22px',
          color: '#000',
          textAlign: 'center',
          marginBottom: 24,
        }}
      >
        If an account exists for{' '}
        <span id="auth-reset-email-display" style={{ fontWeight: 600 }}>
          {email}
        </span>
        , you will get an email with instructions on resetting your password. If it
        doesn&apos;t arrive, be sure to check your spam folder.
      </p>

      <button
        type="button"
        className="auth-submit-btn"
        id="auth-reset-back-btn"
        onClick={onBack}
      >
        Back to Log in
      </button>
    </div>
  );
}
