'use client';

/**
 * "Continue with Google" button — used by both the main auth view and the
 * reset-password view. Falls back to Google's hosted svg if the local one is
 * missing.
 */

const GOOGLE_LOGO_FALLBACK =
  'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg';

type Props = {
  id?: string;
  disabled?: boolean;
  onClick: () => void;
};

export function GoogleSignInButton({ id, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      className="auth-google-btn"
      id={id}
      onClick={onClick}
      disabled={disabled}
    >
      <img
        src="/ASSET/Icons/google.svg"
        alt="Google Logo"
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = GOOGLE_LOGO_FALLBACK;
        }}
      />
      Continue with Google
    </button>
  );
}
