import { useState, useRef, useEffect } from 'react';
import { CloseIcon, PlayIcon } from './Icons';

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
const AudioBarsIcon = (p: IconProps) => (
  <svg {...base(p)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 18v-6" />
    <path d="M14 18v-12" />
    <path d="M18 18v-8" />
    <path d="M6 18v-3" />
  </svg>
);

const VolumeLowIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 9.5a4 4 0 0 1 0 5"/></svg>
);
const VolumeHighIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 9.5a4 4 0 0 1 0 5"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/></svg>
);

const STATIONS = [
  { name: 'Rain Forest', listeners: '8334', Icon: TreeIcon, tint: '#3f9d73', src: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_514802c002.mp3?filename=rain-forest-birds-10145.mp3' },
  { name: 'Monsoon Days', listeners: '7360', Icon: CloudRainIcon, tint: '#4b86c8', src: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3?filename=heavy-rain-nature-sounds-8186.mp3' },
  { name: 'Office Hours', listeners: '4218', Icon: BriefcaseIcon, tint: '#c98f3a', src: 'https://cdn.pixabay.com/download/audio/2022/11/26/audio_27ab08fca8.mp3?filename=office-ambience-6322.mp3' },
  { name: 'Lo-Fi Focus', listeners: '6977', Icon: MusicIcon, tint: '#8a63c9', src: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf7f6.mp3?filename=lofi-study-112191.mp3' },
];

export function AudioMenu() {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.7);
  const ref = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
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
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Closing the panel (X, Escape, outside click, header toggle) stops playback.
  useEffect(() => {
    if (open) return;
    setPlaying(null);
    audioRef.current?.pause();
  }, [open]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  const toggleStation = (stationName: string, src: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent closing the menu or triggering parent actions if any
    
    if (playing === stationName) {
      // Pause current
      setPlaying(null);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    } else {
      // Play new
      setPlaying(stationName);
      if (audioRef.current) {
        audioRef.current.src = src;
        audioRef.current.play().catch((err) => console.log('Audio playback failed', err));
      }
    }
  };

  return (
    <div className="ins-popwrap" ref={ref}>
      {/* Hidden audio element for playback */}
      <audio ref={audioRef} loop />
      
      <button
        type="button"
        className={`ins-header-action-link ${open || playing ? 'is-active' : ''}`}
        aria-label="Tune In"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        {playing ? (
           <AudioBarsIcon size={18} stroke="#111" />
        ) : (
           <img src="/ASSET/Icons/Motvin/music.svg" alt="" width={18} height={18} />
        )}
      </button>

      {open && (
        <div className="ins-popover ins-popover--right ins-tune" role="dialog" aria-label="Tune In">
          <div className="ins-tune-head">
            <div className="ins-tune-titles">
              <h3 className="ins-tune-title">Tune In</h3>
              <p className="ins-tune-sub">{playing ? `Playing ${playing}` : 'Ambient sound while you browse'}</p>
            </div>
            <button type="button" className="ins-tune-close" aria-label="Close" onClick={() => setOpen(false)}>
              <CloseIcon size={14} />
            </button>
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
                    onClick={(e) => toggleStation(station.name, station.src, e)}
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
        </div>
      )}
    </div>
  );
}
