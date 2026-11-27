import { useEffect, useRef, useState } from 'preact/hooks';
import { SITE } from './api';
import { toMain } from './bridge';
import { Icon } from './icons';

/**
 * The paste panel: a big dashed area to paste a "Copy to Figma" code from
 * motvin.com into. ⌘V only reaches the plugin while it has the focus (else
 * Figma pastes onto the canvas), so the area takes the focus as it opens,
 * and again on a click. The paste itself is caught by the panel's own paste
 * handler (App.tsx), which closes this once a code arrives.
 */
/** What a paste is doing, shown in place of the paste area. */
export interface PasteStatus {
  phase: 'finding' | 'adding' | 'done' | 'error';
  title: string;
  /** The screen, screens or flow being added; for an error, what went wrong. */
  detail?: string;
  /** 0–1, while adding. */
  progress?: number;
}

export function PasteSheet({ status, onRetry, onClose }: { status: PasteStatus | null; onRetry: () => void; onClose: () => void }) {
  const zone = useRef<HTMLDivElement>(null);
  const [help, setHelp] = useState(false);

  // The paste area takes the focus whenever it shows (on open, and back from a result).
  useEffect(() => {
    if (!status) zone.current?.focus();
  }, [status]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);

  return (
    <div class="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div class="sheet paste-sheet" role="dialog" aria-modal="true" aria-label="Paste from Motvin">
        <div class="paste-head">
          <strong>Paste from Motvin</strong>
          <button class="icon-button paste-close" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        {status ? (
          <div class={`paste-zone paste-status is-${status.phase}`} role="status" aria-live="polite">
            <span class="paste-status-mark" aria-hidden="true">
              {status.phase === 'done' ? <Icon name="check" size={26} /> : status.phase === 'error' ? <Icon name="close" size={24} /> : <span class="paste-spinner" />}
            </span>
            <p class="paste-title">{status.title}</p>
            {status.detail ? <p class="paste-status-detail">{status.detail}</p> : null}
            {status.phase === 'adding' || status.phase === 'done' ? (
              <span class="paste-progress">
                <span style={{ width: `${Math.round((status.progress ?? 0) * 100)}%` }} />
              </span>
            ) : null}
            {status.phase === 'error' ? (
              <button class="secondary paste-retry" onClick={onRetry}>
                Try again
              </button>
            ) : null}
          </div>
        ) : (
        <div
          ref={zone}
          class="paste-zone"
          tabIndex={0}
          role="button"
          aria-label="Paste area: press Command V to paste"
          onClick={() => zone.current?.focus()}
        >
          {/* Three screens fanned like a hand of cards, the front one about to be added. */}
          <svg class="paste-art" width="150" height="96" viewBox="0 0 150 96" fill="none" aria-hidden="true">
            <g transform="rotate(-12 48 70)">
              <rect x="30" y="16" width="38" height="62" rx="7" class="art-back" />
            </g>
            <g transform="rotate(12 102 70)">
              <rect x="82" y="16" width="38" height="62" rx="7" class="art-back" />
            </g>
            <rect x="53" y="8" width="44" height="72" rx="8" class="art-front" />
            <rect x="59" y="16" width="32" height="9" rx="3" class="art-accent" />
            <rect x="59" y="31" width="24" height="4" rx="2" class="art-line" />
            <rect x="59" y="40" width="30" height="4" rx="2" class="art-line" />
            <rect x="59" y="49" width="18" height="4" rx="2" class="art-line" />
            <rect x="59" y="65" width="32" height="8" rx="4" class="art-line" />
            <circle cx="97" cy="80" r="11" class="art-badge" />
            <path d="M97 75v10M92 80h10" stroke="#fff" stroke-width="2.2" />
          </svg>
          <p class="paste-title">
            Paste screens and flows from{' '}
            <a
              href={`${SITE}/inspirations`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                toMain({ type: 'open-url', url: `${SITE}/inspirations` });
              }}
            >
              Motvin
            </a>
          </p>
          <p class="paste-keys">
            <span class="paste-keys-lead">Press</span>
            <kbd>⌘</kbd>
            <kbd>V</kbd>
            <span>to paste</span>
          </p>
        </div>
        )}

        <button class="paste-help-toggle" aria-expanded={help} onClick={() => setHelp(!help)}>
          <span class="paste-help-icon" aria-hidden="true">?</span>
          <span class="paste-help-text">How do I copy from motvin.com?</span>
        </button>
        {help ? (
          <ol class="paste-steps">
            <li>
              <span>On motvin.com, open a screen or flow.</span>
            </li>
            <li>
              <span>
                Choose <strong>Copy to Figma</strong> (button, ··· menu or right-click).
              </span>
            </li>
            <li>
              <span>Come back here and press ⌘V.</span>
            </li>
          </ol>
        ) : null}
      </div>
    </div>
  );
}
