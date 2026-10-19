'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery, useSheet } from '../useSheet';
import { SWIPE_QUERY } from '../useSiblingCycle';
import { playMoeiSound } from '@/lib/inspirations/moeiSound';
import {
  DEFAULT_MOEI,
  MOEI_ACCESSORIES,
  MOEI_ACCESSORY_LABEL,
  MOEI_COLORS,
  MOEI_FACES,
  MOEI_FACE_LABEL,
  MOEI_KINDS,
  MOEI_KIND_LABEL,
  MOEI_MODES,
  MOEI_MODE_LABEL,
  MOEI_SPEEDS,
  MOEI_SPEED_LABEL,
  MOEI_STUDIO_EVENT,
  moeiHex,
  moeiStore,
  randomLook,
  type Moei,
  type MoeiKind,
} from '@/lib/inspirations/moei';
import { CloseIcon } from '../Icons';
import { useToast } from '../Toast';
import { MoeiAccessoryIcon, MoeiFaceIcon, MoeiSprite } from './MoeiSprite';

type Look = Pick<Moei, 'kind' | 'color' | 'accessory' | 'face' | 'name' | 'speed' | 'mode' | 'showName' | 'sound'>;

/** The customising tabs under the stage: one set of choices shown at a time. */
const TABS = [
  { id: 'colour', label: 'Colour' },
  { id: 'hat', label: 'Hat' },
  { id: 'face', label: 'Face' },
  { id: 'behaviour', label: 'Behaviour' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** Where kind `i` sits on the looping carousel when `at` is in the middle: -2…2. */
function slot(i: number, at: number): number {
  const n = MOEI_KINDS.length;
  return ((i - at + n + Math.floor(n / 2)) % n) - Math.floor(n / 2);
}

/**
 * The moei studio: make your moei (kind, colour, hat, face, name, and how it
 * behaves), with a live preview, then adopt it — or, once it's yours, change it or send it home.
 * Opened by openMoeiStudio() (the profile menu's "My moei"); mounted once in
 * InspirationsShell, renders nothing until then.
 */
export function MoeiStudioHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(MOEI_STUDIO_EVENT, onOpen);
    return () => window.removeEventListener(MOEI_STUDIO_EVENT, onOpen);
  }, []);
  return open ? <MoeiStudio onClose={() => setOpen(false)} /> : null;
}

function MoeiStudio({ onClose }: { onClose: () => void }) {
  const moei = useSyncExternalStore(moeiStore.subscribe, moeiStore.getSnapshot, moeiStore.getServerSnapshot);
  const { show } = useToast();
  const [look, setLook] = useState<Look>(() => {
    const { kind, color, accessory, face, name, speed, mode, showName, sound } = moei.adopted ? moei : DEFAULT_MOEI;
    return { kind, color, accessory, face, name, speed, mode, showName, sound };
  });
  // A phone has no cursor: there it's always Auto, so the choice isn't offered.
  const touch = useMediaQuery(SWIPE_QUERY);
  const [tab, setTab] = useState<Tab>('colour');
  const set = (patch: Partial<Look>) => setLook((current) => ({ ...current, ...patch }));
  const name = look.name.trim() || 'Moei';
  const index = MOEI_KINDS.indexOf(look.kind);
  // The kind shown before this one: a kind that wraps round to the other
  // side of the loop jumps there instead of sliding across the stage.
  const [fromIndex, setFromIndex] = useState(index);
  const pick = (kind: MoeiKind) => {
    setFromIndex(index);
    set({ kind });
  };
  /** Along the carousel by one kind; it loops, so there's always one either side. */
  const step = (by: number) => pick(MOEI_KINDS[(index + by + MOEI_KINDS.length) % MOEI_KINDS.length]);
  const swipeFrom = useRef<number | null>(null);
  const [rolls, setRolls] = useState(0);

  // On a phone, a sheet: its top drags up to fill the screen, down to settle or close.
  const { ref: sheetRef, className: sheetClass, dragProps, handle } = useSheet(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Opened to look, not to change: nothing to save (and no "updated" toast).
  const unchanged =
    moei.adopted && moei.out && (Object.keys(look) as (keyof Look)[]).every((k) => (k === 'name' ? name === moei.name : look[k] === moei[k]));
  const adopt = () => {
    if (!unchanged) {
      moeiStore.update({ ...look, name, out: true, adopted: true });
      show(moei.adopted ? `${name} is updated` : `Say hi to ${name}!`);
    }
    onClose();
  };
  const sendHome = () => {
    moeiStore.update({ out: false });
    show(`${moei.name} went home`, { label: 'Undo', onClick: () => moeiStore.update({ out: true }) });
    onClose();
  };

  return createPortal(
    <div className="ins-portal ins-search-overlay ins-moei-overlay ins-sheet-overlay" onClick={onClose}>
      <div
        ref={sheetRef}
        className={`ins-search-modal ins-moei-studio ${sheetClass}`}
        {...dragProps}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ins-moei-title"
        onClick={(e) => e.stopPropagation()}
      >
        {handle}
        <button type="button" className="ins-request-close" aria-label="Close" onClick={onClose}>
          <CloseIcon size={18} />
        </button>

        <div className="ins-moei-studio-head">
          <h2 id="ins-moei-title" className="ins-moei-studio-title">
            {moei.adopted ? 'Your moei' : 'Adopt a moei'}
          </h2>
          <p className="ins-moei-studio-sub">
            A little buddy that keeps you company while you browse. Save something and it gets a snack.
          </p>
        </div>

        <div className="ins-moei-stage" style={{ '--moei-tint': moeiHex(look.color) } as CSSProperties}>
          {moei.adopted && moei.fed > 0 && (
            <span className="ins-moei-fed">
              {moei.fed} {moei.fed === 1 ? 'snack' : 'snacks'}
            </span>
          )}
          <button
            type="button"
            className="ins-moei-shuffle"
            onClick={() => {
              setFromIndex(index);
              // A new look and name; how it behaves stays as chosen.
              set(randomLook());
              setRolls((n) => n + 1);
            }}
          >
            {/* Re-keyed on each click so the dice rolls again. */}
            <svg
              key={rolls}
              className={`ins-moei-dice ${rolls ? 'is-rolling' : ''}`}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="2" y="2" width="12" height="12" rx="3.5" />
              <circle cx="5.6" cy="5.6" r="0.6" fill="currentColor" />
              <circle cx="10.4" cy="10.4" r="0.6" fill="currentColor" />
              <circle cx="8" cy="8" r="0.6" fill="currentColor" />
            </svg>
            Surprise me
          </button>

          {/* The arrows: half over the stage's edges, in the middle of its height. */}
          <button type="button" className="ins-moei-arrow ins-moei-arrow--prev" aria-label="Previous kind" onClick={() => step(-1)}>
            <img src="/ASSET/Icons/Motvin/previous-arrow.svg" alt="" width={20} height={15} />
          </button>
          <button type="button" className="ins-moei-arrow ins-moei-arrow--next" aria-label="Next kind" onClick={() => step(1)}>
            <img src="/ASSET/Icons/Motvin/next-arrow.svg" alt="" width={20} height={15} />
          </button>

          {/* The kinds as a carousel: the chosen one big in the middle, its neighbours either side. */}
          <div
            className="ins-moei-carousel"
            role="group"
            aria-roledescription="carousel"
            aria-label={`Kind: ${MOEI_KIND_LABEL[look.kind]}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') step(-1);
              else if (e.key === 'ArrowRight') step(1);
              else return;
              e.preventDefault();
            }}
            onPointerDown={(e) => {
              swipeFrom.current = e.clientX;
            }}
            onPointerUp={(e) => {
              const dx = e.clientX - (swipeFrom.current ?? e.clientX);
              swipeFrom.current = null;
              if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
            }}
          >
            {MOEI_KINDS.map((kind, i) => {
              const offset = slot(i, index);
              // Wrapped round from one end of the loop to the other: jump, don't slide.
              const wrapped = Math.abs(offset - slot(i, fromIndex)) > 2;
              return (
                <button
                  key={kind}
                  type="button"
                  className="ins-moei-slide"
                  data-pos={Math.abs(offset)}
                  style={{ '--o': offset, ...(wrapped ? { transition: 'none' } : null) } as CSSProperties}
                  tabIndex={-1}
                  aria-hidden={offset !== 0}
                  onClick={() => pick(kind)}
                >
                  <span className="ins-moei-slide-figure">
                    <MoeiSprite
                      kind={kind}
                      color={moeiHex(look.color)}
                      accessory={look.accessory}
                      face={look.face}
                      size={160}
                      title={offset === 0 ? `${name}, your moei` : undefined}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          <label className="ins-moei-name-field">
            <input
              className="ins-moei-name-input"
              value={look.name}
              maxLength={16}
              placeholder="Name your moei"
              aria-label="Name"
              onChange={(e) => set({ name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') adopt();
              }}
            />
            {/* A pencil: the name can be typed over. */}
            <img className="ins-moei-name-pencil" src="/ASSET/Icons/Motvin/edit.svg" alt="" width={16} height={16} />
          </label>
          <div className="ins-moei-dots">
            {MOEI_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={`ins-moei-dot ${look.kind === kind ? 'is-active' : ''}`}
                aria-label={MOEI_KIND_LABEL[kind]}
                aria-current={look.kind === kind}
                onClick={() => pick(kind)}
              />
            ))}
          </div>
        </div>

        <div className="ins-moei-custom" style={{ '--moei-tint': moeiHex(look.color) } as CSSProperties}>
          <div
            className="ins-segmented ins-moei-pills ins-moei-tabs"
            role="tablist"
            aria-label="Customise"
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              e.preventDefault();
              const at = TABS.findIndex((t) => t.id === tab);
              const next = TABS[(at + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length].id;
              setTab(next);
              document.getElementById(`ins-moei-tab-${next}`)?.focus();
            }}
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`ins-moei-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="ins-moei-panel"
                tabIndex={tab === t.id ? 0 : -1}
                className={`ins-segmented-item ${tab === t.id ? 'is-active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {/* The colour chosen, at a glance. */}
                {t.id === 'colour' && <span className="ins-moei-tab-swatch" style={{ background: moeiHex(look.color) }} />}
                {t.label}
              </button>
            ))}
          </div>

          <div className="ins-moei-panel" role="tabpanel" id="ins-moei-panel" aria-labelledby={`ins-moei-tab-${tab}`}>
            {tab === 'colour' && (
              <div className="ins-moei-tiles" role="radiogroup" aria-label="Colour">
                {MOEI_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={look.color === c.id}
                    aria-label={c.label}
                    title={c.label}
                    className={`ins-moei-gumdrop ${look.color === c.id ? 'is-active' : ''}`}
                    style={{ '--c': c.hex } as CSSProperties}
                    data-pale={c.id === 'cloud' || undefined}
                    onClick={() => set({ color: c.id })}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {tab === 'hat' && (
              <div className="ins-moei-tiles" role="radiogroup" aria-label="Hat">
                {MOEI_ACCESSORIES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={look.accessory === a}
                    aria-label={MOEI_ACCESSORY_LABEL[a]}
                    title={MOEI_ACCESSORY_LABEL[a]}
                    className={`ins-moei-tile ${look.accessory === a ? 'is-active' : ''}`}
                    onClick={() => set({ accessory: a })}
                  >
                    <MoeiAccessoryIcon accessory={a} size={a === 'none' ? 22 : 30} />
                  </button>
                ))}
              </div>
            )}

            {tab === 'face' && (
              <div className="ins-moei-tiles" role="radiogroup" aria-label="Face">
                {MOEI_FACES.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={look.face === f}
                    aria-label={MOEI_FACE_LABEL[f]}
                    title={MOEI_FACE_LABEL[f]}
                    className={`ins-moei-tile ${look.face === f ? 'is-active' : ''}`}
                    onClick={() => set({ face: f })}
                  >
                    <MoeiFaceIcon face={f} size={f === 'none' ? 22 : 40} />
                  </button>
                ))}
              </div>
            )}

            {tab === 'behaviour' && (
              <div className="ins-moei-behaviour">
                {!touch && (
                  <div className="ins-moei-setting ins-moei-setting--mode">
                    <span className="ins-moei-setting-label" id="ins-moei-mode">
                      Moves
                      <span className="ins-moei-setting-hint">
                        {look.mode === 'auto' ? 'Wanders and sits on the page by itself' : 'Follows your cursor about'}
                      </span>
                    </span>
                    <div className="ins-segmented ins-moei-pills" role="radiogroup" aria-labelledby="ins-moei-mode">
                      {MOEI_MODES.map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={look.mode === m}
                          className={`ins-segmented-item ${look.mode === m ? 'is-active' : ''}`}
                          onClick={() => set({ mode: m })}
                        >
                          {MOEI_MODE_LABEL[m]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="ins-moei-setting ins-moei-setting--speed">
                  <span className="ins-moei-setting-label" id="ins-moei-speed">
                    Speed
                    <span className="ins-moei-setting-hint">How fast it gets about</span>
                  </span>
                  <div className="ins-segmented ins-moei-pills" role="radiogroup" aria-labelledby="ins-moei-speed">
                    {MOEI_SPEEDS.map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        role="radio"
                        aria-checked={look.speed === sp}
                        className={`ins-segmented-item ${look.speed === sp ? 'is-active' : ''}`}
                        onClick={() => set({ speed: sp })}
                      >
                        {MOEI_SPEED_LABEL[sp]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ins-moei-setting">
                  <span className="ins-moei-setting-label" id="ins-moei-tag">
                    Name tag
                    <span className="ins-moei-setting-hint">Show its name while it sits</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={look.showName}
                    aria-labelledby="ins-moei-tag"
                    className={`ins-moei-switch ${look.showName ? 'is-on' : ''}`}
                    onClick={() => set({ showName: !look.showName })}
                  />
                </div>
                {/* Only where it can be clicked (Auto, or a phone): following the cursor it never is, so it never makes a sound. */}
                {(touch || look.mode === 'auto') && (
                  <div className="ins-moei-setting ins-moei-setting--sound">
                    <span className="ins-moei-setting-label" id="ins-moei-sound">
                      Sounds
                      <span className="ins-moei-setting-hint">Little chirps when you click it</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={look.sound}
                      aria-labelledby="ins-moei-sound"
                      className={`ins-moei-switch ${look.sound ? 'is-on' : ''}`}
                      onClick={() => {
                        const next = !look.sound;
                        set({ sound: next });
                        // A taste of it as it's turned on.
                        if (next) playMoeiSound('hello');
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="ins-moei-studio-foot">
          {moei.adopted && moei.out ? (
            <button type="button" className="ins-moei-secondary" onClick={sendHome}>
              Send home
            </button>
          ) : (
            <button type="button" className="ins-moei-secondary" onClick={onClose}>
              Not now
            </button>
          )}
          <button type="button" className="ins-moei-primary" onClick={adopt}>
            {!moei.adopted ? `Adopt ${name}` : !moei.out ? `Bring ${name} back` : unchanged ? 'Done' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
