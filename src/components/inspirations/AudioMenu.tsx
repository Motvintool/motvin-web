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

const HeadphonesIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4z"></path><path d="M3 19a2 2 0 0 0 2 2h1v-6H3v4z"></path></svg>
);
const TreeIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 22v-8"/><path d="M12 14c-4 0-5-3-5-3s1-2 3-2-2-4-2-4 2.5-1 4-1 4 1 4 1-2 2 0 4 3 2 3 2-1 3-5 3z"/></svg>
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

const STATIONS = [
  { name: 'Rain Forest', listeners: '8334', Icon: TreeIcon, src: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_514802c002.mp3?filename=rain-forest-birds-10145.mp3' },
  { name: 'Monsoon Days', listeners: '7360', Icon: CloudRainIcon, src: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3?filename=heavy-rain-nature-sounds-8186.mp3' },
  { name: 'Office Hours', listeners: '4218', Icon: BriefcaseIcon, src: 'https://cdn.pixabay.com/download/audio/2022/11/26/audio_27ab08fca8.mp3?filename=office-ambience-6322.mp3' },
  { name: 'Lo-Fi Focus', listeners: '6977', Icon: MusicIcon, src: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf7f6.mp3?filename=lofi-study-112191.mp3' },
];

export function AudioMenu() {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
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
        className={`ins-header-audio ${open || playing ? 'is-active' : ''}`}
        aria-label="Tune In"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        {playing ? (
           <AudioBarsIcon size={18} stroke="#111" />
        ) : (
           <img src="/ASSET/Icons/Motvin/music.svg" alt="" className="ins-header-audio-icon" width={18} height={18} />
        )}
      </button>

      {open && (
        <div 
          className="ins-popover ins-popover--right" 
          role="menu" 
          aria-label="Tune In" 
          style={{ width: '360px', padding: '16px 12px', minWidth: '360px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '0 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HeadphonesIcon size={20} stroke="#666" />
              <h3 style={{ margin: 0, fontSize: '18px', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>Tune In</h3>
            </div>
            <button 
              type="button" 
              onClick={() => setOpen(false)}
              style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '4px', color: '#666', display: 'flex' }}
            >
              <CloseIcon size={18} />
            </button>
          </div>

          <div className="ins-popover-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 'none' }}>
            {STATIONS.map((station) => {
              const isPlaying = playing === station.name;
              
              return (
                <button
                  key={station.name}
                  type="button"
                  className="ins-popover-item"
                  role="menuitem"
                  style={{ 
                    padding: '12px', 
                    gap: '16px', 
                    borderRadius: '16px',
                    background: isPlaying ? 'rgba(0,0,0,0.04)' : 'transparent'
                  }}
                  onClick={(e) => toggleStation(station.name, station.src, e)}
                >
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: isPlaying ? '#EBEBEB' : '#F8F7F5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6E675F', flexShrink: 0 }}>
                    <station.Icon size={20} />
                  </div>
                  <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <div style={{ fontSize: '16px', fontWeight: 500, color: '#111', marginBottom: '4px', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{station.name}</div>
                    <div style={{ fontSize: '12px', color: isPlaying ? '#444' : '#777', fontFamily: 'Inter, sans-serif' }}>
                      {isPlaying ? 'Playing now...' : `${station.listeners} active listeners`}
                    </div>
                  </div>
                  <div style={{ 
                    width: '36px', 
                    height: '36px', 
                    borderRadius: '12px', 
                    background: isPlaying ? '#EBEBEB' : '#F5F5F5', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    color: '#666', 
                    flexShrink: 0 
                  }}>
                    {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
