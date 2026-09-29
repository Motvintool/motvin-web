'use client';

/**
 * New app / Old app — one dropdown, shared by Automatic and Manual, so the
 * choice looks and behaves identically wherever screens are added.
 */
export function AppModeSelect({
  mode,
  onChange,
  disabled,
  noApps,
}: {
  mode: 'new' | 'old';
  onChange: (mode: 'new' | 'old') => void;
  disabled?: boolean;
  noApps?: boolean;
}) {
  return (
    <label className="ins-field">
      {/* Never "App" — in "Old app" mode, the very next field is the actual
          app picker, also labeled "App"; two adjacent fields both reading
          "App" is confusing about which one to touch first. */}
      <span className="ins-field-label">New or existing app</span>
      <select
        className="ins-input"
        value={mode}
        onChange={(e) => onChange(e.target.value as 'new' | 'old')}
        disabled={disabled}
      >
        <option value="new">New app</option>
        <option value="old" disabled={noApps} title={noApps ? 'No apps in the library yet' : undefined}>
          Old app{noApps ? ' (none yet)' : ''}
        </option>
      </select>
    </label>
  );
}
