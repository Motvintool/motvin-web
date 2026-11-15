import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, PlayIcon } from './Icons';
import { useToast } from './Toast';
import { SHEET_QUERY, useMediaQuery, useSheet } from './useSheet';

/** Opens Tune In from elsewhere: the profile menu, where the header's button is hidden. */
export const TUNE_IN_EVENT = 'motvin:tune-in';
export function openTuneIn() {
  window.dispatchEvent(new Event(TUNE_IN_EVENT));
}
/** Below this the header hides its Tune In button (the compact header), and the profile menu offers it. */
const COMPACT_QUERY = '(max-width: 1139px)';

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  };
}

const TreeIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3 7 10h3l-4 6h12l-4-6h3z"/><path d="M12 16v5"/></svg>
);
const CloudRainIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>
);
const BriefcaseIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
);
const MusicIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
);
const PauseIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
);
const AudioWaveIcon = ({ size = 18 }: { size?: number }) => (
  <span className="ins-wave" style={{ width: size, height: Math.round(size * 0.8) }} aria-hidden>
    <i /><i /><i /><i />
  </span>
);

const VolumeLowIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 9.5a4 4 0 0 1 0 5"/></svg>
);
const VolumeHighIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 9.5a4 4 0 0 1 0 5"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/></svg>
);

/**
 * Each station is a long ambient or lofi YouTube video (all allow embedding),
 * played sound-only by a hidden player: 11 hours of rainforest birds, 8 of
 * rain on a window with thunder, 4 of office typing and pencils, and Lofi
 * Girl's 3-hour "best of lofi hip hop".
 */
const STATIONS = [
  { name: 'Jungle Dawn', listeners: '5612', Icon: TreeIcon, tint: '#3f9d73', videoId: 'qQgNWg96Rls' },
  { name: 'Rainy Window', listeners: '9147', Icon: CloudRainIcon, tint: '#4b86c8', videoId: 'mPZkdNFkNps' },
  { name: 'Busy Desk', listeners: '3286', Icon: BriefcaseIcon, tint: '#c98f3a', videoId: 'eH-_GMhH-kk' },
  { name: 'Midnight Beats', listeners: '11408', Icon: MusicIcon, tint: '#8a63c9', videoId: 'i43tkaTXtwI' },
];

/** The bits of YouTube's IFrame Player API used here. */
type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(id: string): void;
  unMute(): void;
  setVolume(volume: number): void;
  destroy(): void;
};
type YTEvent = { target: YTPlayer; data: number };
type YTNamespace = {
  Player: new (el: HTMLElement, options: object) => YTPlayer;
  PlayerState: { ENDED: number };
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** YouTube's player script, fetched the first time a station plays (or failing after 10s). */
function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('YouTube player did not load')), 10_000);
    const before = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      before?.();
      window.clearTimeout(timer);
      if (window.YT) resolve(window.YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('YouTube player did not load'));
      };
      document.body.appendChild(script);
    }
  });
}

export function AudioMenu() {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.7);
  const ref = useRef<HTMLDivElement>(null);
  // The hidden YouTube player (made on the first play), where it lives, and
  // the station asked for last: a slow load for an earlier pick is ignored.
  const playerRef = useRef<YTPlayer | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const wantedRef = useRef<string | null>(null);
  // Whether the player has connected: before that it can't be told anything,
  // and the latest pick is played the moment it's ready.
  const readyRef = useRef(false);
  const volumeRef = useRef(volume);
  const { show } = useToast();
  // With the header's button hidden, Tune In opens from the profile menu: over
  // the page, under the header at the right, and on a phone as a sheet.
  const compact = useMediaQuery(COMPACT_QUERY);
  const phone = useMediaQuery(SHEET_QUERY);
  const close = useCallback(() => setOpen(false), []);
  const { ref: sheetRef, className: sheetClass, dragProps, handle } = useSheet(close);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(TUNE_IN_EVENT, onOpen);
    return () => window.removeEventListener(TUNE_IN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      // Out in <body> when opened from the profile menu, but still Tune In.
      const target = e.target as Element;
      if (!ref.current?.contains(target) && !target.closest?.('.ins-tune-floating')) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    volumeRef.current = volume;
    if (readyRef.current) playerRef.current?.setVolume(Math.round(volume * 100));
  }, [volume]);

  // The player goes with the header, and is forgotten with it: a destroyed
  // player has no methods left (as after a hot reload), so the next pick makes a new one.
  useEffect(
    () => () => {
      playerRef.current?.destroy();
      playerRef.current = null;
      readyRef.current = false;
    },
    [],
  );

  // A station that won't play (video gone, blocked, offline): back to idle, and say so.
  const failCurrent = () => {
    const name = wantedRef.current;
    if (!name) return;
    wantedRef.current = null;
    setPlaying((current) => (current === name ? null : current));
    show(`${name} isn't available right now`, { tone: 'error' });
  };

  const toggleStation = async (station: (typeof STATIONS)[number], e: React.MouseEvent) => {
    e.stopPropagation(); // prevent closing the menu or triggering parent actions if any

    if (playing === station.name) {
      setPlaying(null);
      wantedRef.current = null;
      if (readyRef.current) playerRef.current?.pauseVideo();
      return;
    }

    setPlaying(station.name);
    wantedRef.current = station.name;
    try {
      const YT = await loadYouTube();
      if (wantedRef.current !== station.name || !hostRef.current) return;
      const player = playerRef.current;
      if (player) {
        // Still connecting: it starts on whatever was picked last, once ready.
        if (!readyRef.current) return;
        player.loadVideoById(station.videoId);
        player.setVolume(Math.round(volumeRef.current * 100));
        player.unMute();
        return;
      }
      // Started muted, as browsers allow, then unmuted once it's playing (as appshots does).
      const mount = document.createElement('div');
      hostRef.current.appendChild(mount);
      playerRef.current = new YT.Player(mount, {
        width: '0',
        height: '0',
        videoId: station.videoId,
        playerVars: { autoplay: 1, mute: 1, controls: 0, playsinline: 1 },
        events: {
          onReady: (ev: YTEvent) => {
            readyRef.current = true;
            // Whatever was picked while it connected (or nothing, if stopped meanwhile).
            const latest = STATIONS.find((s) => s.name === wantedRef.current);
            if (!latest) return;
            ev.target.setVolume(Math.round(volumeRef.current * 100));
            if (latest.videoId === station.videoId) ev.target.playVideo();
            else ev.target.loadVideoById(latest.videoId);
            ev.target.unMute();
          },
          // A long video still ends: round again.
          onStateChange: (ev: YTEvent) => {
            if (ev.data === YT.PlayerState.ENDED && wantedRef.current) ev.target.playVideo();
          },
          onError: failCurrent,
        },
      });
      // Never connected (blocked, offline): say so, and start afresh on the next pick.
      const created = playerRef.current;
      window.setTimeout(() => {
        if (readyRef.current || playerRef.current !== created) return;
        created.destroy();
        playerRef.current = null;
        failCurrent();
      }, 15_000);
    } catch {
      failCurrent();
    }
  };

  // The playing station's colour, for the volume slider (and the rows' tints).
  const tintStyle = { ['--tint' as string]: STATIONS.find((s) => s.name === playing)?.tint ?? '#141414' };
  // The panel: the stations, and the volume while one plays.
  const panel = (
    <>
      <div className="ins-tune-head">
        <div className="ins-tune-titles">
          <h3 className="ins-tune-title">Tune In</h3>
          <p className="ins-tune-sub">{playing ? `Playing ${playing}` : 'Ambient sound while you browse'}</p>
        </div>
      </div>

      <ul className="ins-tune-list">
        {STATIONS.map((station) => {
          const isPlaying = playing === station.name;
          return (
            <li key={station.name}>
              <button
                type="button"
                className={`ins-tune-row ${isPlaying ? 'is-playing' : ''}`}
                style={{ ['--tint' as string]: station.tint }}
                aria-pressed={isPlaying}
                aria-label={`${isPlaying ? 'Pause' : 'Play'} ${station.name}`}
                onClick={(e) => void toggleStation(station, e)}
              >
                <span className="ins-tune-art"><station.Icon size={22} /></span>
                <span className="ins-tune-text">
                  <span className="ins-tune-name">{station.name}</span>
                  <span className="ins-tune-meta">
                    {isPlaying ? (
                      <><span className="ins-tune-eq" aria-hidden><i /><i /><i /><i /></span>Playing now</>
                    ) : (
                      `${Number(station.listeners).toLocaleString('en-US')} active listeners`
                    )}
                  </span>
                </span>
                <span className="ins-tune-ctl" aria-hidden>
                  {isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {playing && (
        <div className="ins-tune-vol-wrap">
          <VolumeLowIcon size={14} />
          <input
            type="range"
            className="ins-tune-vol"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label="Volume"
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ ['--fill' as string]: `${Math.round(volume * 100)}%` }}
          />
          <VolumeHighIcon size={14} />
        </div>
      )}
    </>
  );

  return (
    <div className="ins-popwrap" ref={ref}>
      {/* Where the hidden YouTube player goes: sound only, nothing to see or click. */}
      <div ref={hostRef} className="ins-tune-player" aria-hidden />
      
      <button
        type="button"
        className={`ins-header-action-link ${open || playing ? 'is-active' : ''}`}
        aria-label={playing ? `Tune In — playing ${playing}` : 'Tune In'}
        title={playing ? `Playing ${playing}` : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        {playing ? (
           <AudioWaveIcon size={18} />
        ) : (
           <img src="/ASSET/Icons/Motvin/music.svg" alt="" width={18} height={18} />
        )}
      </button>

      {open && !compact && (
        <div
          className="ins-popover ins-popover--right ins-tune"
          role="dialog"
          aria-label="Tune In"
          style={tintStyle}
        >
          {panel}
        </div>
      )}
      {open &&
        compact &&
        createPortal(
          phone ? (
            <div className="ins-portal ins-search-overlay ins-sheet-overlay">
              <div ref={sheetRef} className={`ins-tune ins-tune-floating ins-tune-sheet ${sheetClass}`} {...dragProps} role="dialog" aria-modal="true" aria-label="Tune In" style={tintStyle}>
                {handle}
                <button type="button" className="ins-request-close" aria-label="Close" onClick={close}>
                  <CloseIcon size={18} />
                </button>
                {panel}
              </div>
            </div>
          ) : (
            <div className="ins-popover ins-tune ins-tune-floating" role="dialog" aria-label="Tune In" style={tintStyle}>
              {panel}
            </div>
          ),
          document.body,
        )}
    </div>
  );
}
