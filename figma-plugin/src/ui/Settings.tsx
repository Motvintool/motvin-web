import { useEffect, useRef, useState } from 'preact/hooks';
import type { Prefs } from '../shared';
import { Icon } from './icons';

interface Props {
  prefs: Prefs;
  changePrefs: (change: Partial<Prefs>) => void;
  email: string | null;
  /** Whether anything is searched, filtered or coloured, for "Clear search & filters". */
  canReset: boolean;
  onReset: () => void;
  onOpenSite: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

/**
 * The bottom bar's Settings: a small panel that opens upwards with quick
 * actions (clear search and filters, open motvin.com, sign in or out), then the
 * panel's preferences — captions, where added screens land, theme — and a way
 * to clear recent searches. Preferences are saved as they change.
 */
export function Settings({ prefs, changePrefs, email, canReset, onReset, onOpenSite, onSignIn, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div class={open ? 'settings open' : 'settings'} ref={root}>
      <button class="icon-button" aria-label="Settings" aria-expanded={open} title="Settings" onClick={() => setOpen(!open)}>
        <Icon name="settings" size={20} />
      </button>
      {open ? (
        <div class="settings-menu" role="dialog" aria-label="Settings">
          <p class="settings-title">Settings</p>

          <div class="quick-actions">
            <button
              disabled={!canReset}
              onClick={() => {
                onReset();
                setOpen(false);
              }}
            >
              <Icon name="reset" size={20} />
              <span>Clear filters</span>
            </button>
            <button
              onClick={() => {
                onOpenSite();
                setOpen(false);
              }}
            >
              <Icon name="external" size={20} />
              <span title="Open motvin.com">Website</span>
            </button>
            <button
              onClick={() => {
                setOpen(false);
                if (email) onSignOut();
                else onSignIn();
              }}
            >
              <Icon name={email ? 'logout' : 'login'} size={20} />
              <span>{email ? 'Sign out' : 'Sign in'}</span>
            </button>
          </div>
          {email ? (
            <p class="settings-account">
              <span class="avatar" aria-hidden="true">{email.charAt(0).toUpperCase()}</span>
              <span>{email}</span>
            </p>
          ) : null}

          <label class="setting">
            <span class="setting-text">
              <strong>Captions</strong>
              <span>Name and link under each screen</span>
            </span>
            <input
              type="checkbox"
              class="switch"
              checked={prefs.captions}
              onChange={(event) => changePrefs({ captions: (event.target as HTMLInputElement).checked })}
            />
          </label>

          <div class="setting stacked">
            <span class="setting-text">
              <strong>Place new screens</strong>
            </span>
            <div class="segment" role="radiogroup" aria-label="Where screens land">
              {([
                ['view', 'In view'],
                ['selection', 'Next to selection'],
              ] as const).map(([value, label]) => (
                <button role="radio" aria-checked={prefs.placement === value} class={prefs.placement === value ? 'on' : ''} onClick={() => changePrefs({ placement: value })}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div class="setting stacked">
            <span class="setting-text">
              <strong>Theme</strong>
            </span>
            <div class="segment" role="radiogroup" aria-label="Theme">
              {([
                ['auto', 'Figma'],
                ['light', 'Light'],
                ['dark', 'Dark'],
              ] as const).map(([value, label]) => (
                <button role="radio" aria-checked={prefs.theme === value} class={prefs.theme === value ? 'on' : ''} onClick={() => changePrefs({ theme: value })}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {prefs.recent.length ? (
            <button class="setting-action" onClick={() => changePrefs({ recent: [] })}>
              <Icon name="history" size={15} />
              Clear recent searches
              <span class="setting-count">{prefs.recent.length}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
