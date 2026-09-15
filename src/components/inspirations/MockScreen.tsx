import { memo, type CSSProperties, type ReactNode } from 'react';
import { createRng, type Rng } from '@/lib/inspirations/seed';
import type { Screen } from '@/lib/inspirations/types';
import { aspectRatioValue } from './Skeletons';

/**
 * Procedural screenshot renderer.
 *
 * Until real captures are ingested, each Screen record is drawn as a
 * miniature UI: a layout template per screen type, the app's palette, and
 * seeded jitter so no two cards look alike. Everything is sized in `em`
 * against a container-query font-size, so the same markup scales from a
 * 180px grid cell to a 1200px detail view.
 *
 * Nothing here is an image of a real product — it is generated from the
 * catalogue's structured data.
 */

type Props = { screen: Screen; className?: string };

// ─── Primitives ─────────────────────────────────────────────────────────────

type Tone = 't' | 'm' | 'a' | 's' | 'b';

const Bar = ({ w, h, tone = 'm', style }: { w: number | string; h?: number; tone?: Tone; style?: CSSProperties }) => (
  <i
    className={`m-bar m-bar--${tone}`}
    style={{ width: typeof w === 'number' ? `${w}%` : w, height: h ? `${h}em` : undefined, ...style }}
  />
);

const Box = ({ children, className = '', style, tone }: { children?: ReactNode; className?: string; style?: CSSProperties; tone?: Tone }) => (
  <div className={`m-box ${tone ? `m-box--${tone}` : ''} ${className}`} style={style}>
    {children}
  </div>
);

const Circle = ({ size, tone = 'm' }: { size: number; tone?: Tone }) => (
  <i className={`m-circle m-bar--${tone}`} style={{ width: `${size}em`, height: `${size}em` }} />
);

const Btn = ({ w = 28, tone = 'a', h = 1.6 }: { w?: number | string; tone?: Tone; h?: number }) => (
  <i className={`m-btn m-btn--${tone}`} style={{ width: typeof w === 'number' ? `${w}%` : w, height: `${h}em` }} />
);

const Input = ({ w = 100, h = 1.7 }: { w?: number | string; h?: number }) => (
  <i className="m-input" style={{ width: typeof w === 'number' ? `${w}%` : w, height: `${h}em` }} />
);

const Lines = ({ rng, count, min = 40, max = 95, tone = 'm', h = 0.42 }: { rng: Rng; count: number; min?: number; max?: number; tone?: Tone; h?: number }) => (
  <div className="m-col" style={{ gap: '0.45em' }}>
    {Array.from({ length: count }, (_, i) => (
      <Bar key={i} w={rng.int(min, max)} h={h} tone={tone} />
    ))}
  </div>
);

const Chart = ({ rng, bars = 12, h = 5 }: { rng: Rng; bars?: number; h?: number }) => (
  <div className="m-chart" style={{ height: `${h}em` }}>
    {Array.from({ length: bars }, (_, i) => (
      <i
        key={i}
        className={`m-chart-bar ${i === bars - 2 ? 'm-bar--a' : 'm-bar--s'}`}
        style={{ height: `${rng.int(25, 100)}%` }}
      />
    ))}
  </div>
);

const LineChart = ({ rng, h = 5 }: { rng: Rng; h?: number }) => {
  const pts = Array.from({ length: 9 }, (_, i) => `${(i / 8) * 100},${rng.int(15, 85)}`).join(' ');
  return (
    <svg className="m-linechart" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height: `${h}em` }}>
      <polyline points={pts} fill="none" stroke="var(--m-accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const Ring = ({ pct, size = 4 }: { pct: number; size?: number }) => (
  <svg className="m-ring" viewBox="0 0 36 36" style={{ width: `${size}em`, height: `${size}em` }}>
    <circle cx="18" cy="18" r="15" fill="none" stroke="var(--m-border)" strokeWidth="3.5" />
    <circle cx="18" cy="18" r="15" fill="none" stroke="var(--m-accent)" strokeWidth="3.5" strokeDasharray={`${pct * 0.94} 100`} strokeLinecap="round" transform="rotate(-90 18 18)" />
  </svg>
);

const Avatar = ({ size = 1.4, tone = 'a' }: { size?: number; tone?: Tone }) => <Circle size={size} tone={tone} />;

const Toggle = ({ on }: { on: boolean }) => <i className={`m-toggle ${on ? 'is-on' : ''}`} />;

const Icon = ({ tone = 'm' }: { tone?: Tone }) => <i className={`m-icon m-bar--${tone}`} />;

const Img = ({ h, rng, className = '' }: { h: number; rng: Rng; className?: string }) => {
  const shape = rng.int(0, 3);
  return (
    <div className={`m-img m-img--${shape} ${className}`} style={{ height: `${h}em` }}>
      <i className="m-img-blob" style={{ left: `${rng.int(10, 55)}%`, top: `${rng.int(10, 50)}%`, width: `${rng.int(35, 60)}%` }} />
    </div>
  );
};

// ─── Shared chrome ─────────────────────────────────────────────────────────

const StatusBar = () => (
  <div className="m-status">
    <Bar w="18%" h={0.45} tone="t" />
    <span className="m-status-right">
      <Bar w="0.9em" h={0.45} tone="t" />
      <Bar w="0.9em" h={0.45} tone="t" />
      <i className="m-battery" />
    </span>
  </div>
);

const BottomNav = ({ active = 0 }: { active?: number }) => (
  <div className="m-bottomnav">
    {Array.from({ length: 5 }, (_, i) => (
      <span key={i} className="m-bottomnav-item">
        <Icon tone={i === active ? 'a' : 'm'} />
        <Bar w="1.6em" h={0.28} tone={i === active ? 'a' : 'm'} />
      </span>
    ))}
  </div>
);

const MobileTopBar = ({ title = true, rng }: { title?: boolean; rng: Rng }) => (
  <div className="m-row m-mobiletop">
    <Icon tone="t" />
    {title && <Bar w={rng.int(28, 46)} h={0.6} tone="t" />}
    <span className="m-spacer" />
    <Icon tone="t" />
  </div>
);

const WebNav = ({ rng, cta = true }: { rng: Rng; cta?: boolean }) => (
  <div className="m-webnav">
    <span className="m-row" style={{ gap: '0.4em' }}>
      <i className="m-logo" />
      <Bar w="3em" h={0.5} tone="t" />
    </span>
    <span className="m-row m-webnav-links">
      {Array.from({ length: rng.int(3, 5) }, (_, i) => (
        <Bar key={i} w={`${rng.range(1.8, 3.2)}em`} h={0.42} tone="m" />
      ))}
    </span>
    <span className="m-spacer" />
    <span className="m-row" style={{ gap: '0.6em' }}>
      <Bar w="2.4em" h={0.42} tone="m" />
      {cta && <Btn w="4.2em" h={1.3} />}
    </span>
  </div>
);

const Sidebar = ({ rng, items = 7 }: { rng: Rng; items?: number }) => (
  <aside className="m-sidebar">
    <span className="m-row" style={{ gap: '0.4em', marginBottom: '1.1em' }}>
      <i className="m-logo" />
      <Bar w="55%" h={0.5} tone="t" />
    </span>
    {Array.from({ length: items }, (_, i) => (
      <span key={i} className={`m-side-item ${i === 1 ? 'is-active' : ''}`}>
        <Icon tone={i === 1 ? 'a' : 'm'} />
        <Bar w={rng.int(40, 75)} h={0.4} tone={i === 1 ? 't' : 'm'} />
      </span>
    ))}
    <span className="m-spacer" />
    <span className="m-row" style={{ gap: '0.4em' }}>
      <Avatar size={1.2} tone="s" />
      <Bar w="50%" h={0.4} />
    </span>
  </aside>
);

const KpiCards = ({ rng, count }: { rng: Rng; count: number }) => (
  <div className="m-kpis" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
    {Array.from({ length: count }, (_, i) => (
      <Box key={i} className="m-kpi">
        <Bar w={rng.int(40, 65)} h={0.35} tone="m" />
        <Bar w={rng.int(45, 70)} h={0.8} tone="t" />
        <span className="m-row" style={{ gap: '0.3em' }}>
          <Bar w="1.4em" h={0.3} tone={i % 3 === 2 ? 'b' : 'a'} />
          <Bar w="2em" h={0.3} tone="m" />
        </span>
      </Box>
    ))}
  </div>
);

const TableRows = ({ rng, rows, cols = 4 }: { rng: Rng; rows: number; cols?: number }) => (
  <div className="m-table">
    <div className="m-table-row m-table-row--head">
      {Array.from({ length: cols }, (_, i) => <Bar key={i} w={rng.int(30, 60)} h={0.32} tone="m" />)}
    </div>
    {Array.from({ length: rows }, (_, r) => (
      <div className="m-table-row" key={r}>
        <span className="m-row" style={{ gap: '0.4em' }}>
          <Avatar size={0.9} tone={r % 2 ? 's' : 'a'} />
          <Bar w={rng.int(35, 60)} h={0.36} tone="t" />
        </span>
        {Array.from({ length: cols - 1 }, (_, i) => (
          <Bar key={i} w={rng.int(30, 70)} h={0.36} tone={i === cols - 2 && r % 3 === 0 ? 'a' : 'm'} />
        ))}
      </div>
    ))}
  </div>
);

const Chips = ({ rng, count, active = 0 }: { rng: Rng; count: number; active?: number }) => (
  <div className="m-chips">
    {Array.from({ length: count }, (_, i) => (
      <i key={i} className={`m-chip ${i === active ? 'is-active' : ''}`} style={{ width: `${rng.range(2.2, 4)}em` }} />
    ))}
  </div>
);

const ListRows = ({ rng, rows, thumb = 'circle' }: { rng: Rng; rows: number; thumb?: 'circle' | 'square' | 'none' }) => (
  <div className="m-col" style={{ gap: '0.7em' }}>
    {Array.from({ length: rows }, (_, i) => (
      <span key={i} className="m-row" style={{ gap: '0.6em' }}>
        {thumb === 'circle' && <Avatar size={1.5} tone={i % 3 === 0 ? 'a' : 's'} />}
        {thumb === 'square' && <i className="m-thumb" />}
        <span className="m-col" style={{ flex: 1, gap: '0.3em' }}>
          <Bar w={rng.int(35, 70)} h={0.42} tone="t" />
          <Bar w={rng.int(25, 50)} h={0.32} tone="m" />
        </span>
        <Bar w="2em" h={0.42} tone={i % 4 === 1 ? 'b' : 't'} />
      </span>
    ))}
  </div>
);

// ─── Templates ──────────────────────────────────────────────────────────────

type T = (rng: Rng, mobile: boolean, screen: Screen) => ReactNode;

const landing: T = (rng, mobile, screen) => {
  const tall = !mobile && screen.aspect === '4:5';
  const heroImage = tall || rng.chance(0.5);
  return (
  <>
    {mobile ? <MobileTopBar title={false} rng={rng} /> : <WebNav rng={rng} />}
    <div className="m-hero">
      {rng.chance(0.6) && <i className="m-chip is-active" style={{ width: '5em', marginBottom: '0.6em' }} />}
      <Bar w={mobile ? 88 : rng.int(46, 62)} h={1.5} tone="t" />
      <Bar w={mobile ? 70 : rng.int(30, 50)} h={1.5} tone="t" />
      <span style={{ height: '0.4em' }} />
      <Bar w={mobile ? 80 : 40} h={0.42} tone="m" />
      <Bar w={mobile ? 62 : 32} h={0.42} tone="m" />
      <span className="m-row" style={{ gap: '0.6em', marginTop: '0.8em' }}>
        <Btn w={mobile ? 40 : '6em'} />
        <Btn w={mobile ? 34 : '5em'} tone="s" />
      </span>
    </div>
    {heroImage && <Img h={mobile ? 9 : 12} rng={rng} className="m-hero-img" />}
    {!mobile && (
      <div className="m-logos">
        {Array.from({ length: 5 }, (_, i) => <Bar key={i} w={`${rng.range(2.5, 4)}em`} h={0.6} tone="m" />)}
      </div>
    )}
    {(!heroImage || tall) && (
      <div className="m-features" style={{ gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3, 1fr)', marginTop: tall ? '1.6em' : undefined }}>
        {Array.from({ length: mobile ? 2 : 3 }, (_, i) => (
          <Box key={i} className="m-feature">
            <Icon tone="a" />
            <Bar w={60} h={0.5} tone="t" />
            <Bar w={90} h={0.32} />
            <Bar w={70} h={0.32} />
          </Box>
        ))}
      </div>
    )}
    {tall && (
      <div className="m-two m-landing-split">
        <Img h={9} rng={rng} />
        <div className="m-col" style={{ justifyContent: 'center', gap: '0.5em' }}>
          <Bar w={70} h={1} tone="t" />
          <Bar w={50} h={1} tone="t" />
          <Bar w={85} h={0.38} style={{ marginTop: '0.3em' }} />
          <Bar w={65} h={0.38} />
          <Btn w="5.5em" h={1.5} tone="s" />
        </div>
      </div>
    )}
  </>
  );
};

const auth = (signup: boolean): T =>
  function authTemplate(rng, mobile) {
    return (
    <div className={`m-auth ${mobile ? 'm-auth--mobile' : ''}`}>
      {!mobile && rng.chance(0.4) && (
        <div className="m-auth-side">
          <Img h={100} rng={rng} className="m-auth-side-img" />
        </div>
      )}
      <Box className="m-auth-card" tone={mobile ? undefined : 's'}>
        <i className="m-logo" style={{ marginBottom: '0.9em' }} />
        <Bar w={signup ? 64 : 52} h={0.9} tone="t" />
        <Bar w={78} h={0.38} tone="m" style={{ marginBottom: '1em' }} />
        {signup && <Input />}
        <Input />
        <Input />
        {signup && (
          <span className="m-row" style={{ gap: '0.4em' }}>
            <i className="m-check" />
            <Bar w={60} h={0.32} />
          </span>
        )}
        <Btn w={100} />
        <span className="m-row" style={{ gap: '0.5em', margin: '0.3em 0' }}>
          <Bar w={40} h={0.1} /> <Bar w="1.2em" h={0.3} /> <Bar w={40} h={0.1} />
        </span>
        <Btn w={100} tone="s" />
        <Bar w={48} h={0.32} tone="a" style={{ alignSelf: 'center', marginTop: '0.4em' }} />
      </Box>
    </div>
    );
  };

const dashboard: T = (rng, mobile) => {
  if (mobile) {
    return (
      <>
        <MobileTopBar rng={rng} />
        <div className="m-page">
          <Bar w={38} h={0.42} tone="m" />
          <Bar w={62} h={1.3} tone="t" />
          <span className="m-row" style={{ gap: '0.5em', marginTop: '0.6em' }}>
            <Btn w={30} h={1.4} /> <Btn w={30} h={1.4} tone="s" /> <Btn w={30} h={1.4} tone="s" />
          </span>
          <Box className="m-panel" style={{ marginTop: '0.9em' }}>
            <span className="m-row" style={{ justifyContent: 'space-between' }}>
              <Bar w={35} h={0.4} tone="m" /> <Bar w={18} h={0.4} tone="a" />
            </span>
            {rng.chance(0.5) ? <Chart rng={rng} bars={8} h={4.5} /> : <LineChart rng={rng} h={4.5} />}
          </Box>
          <KpiCards rng={rng} count={2} />
          <Bar w={40} h={0.5} tone="t" style={{ marginTop: '0.6em' }} />
          <ListRows rng={rng} rows={3} />
        </div>
      </>
    );
  }
  return (
    <div className="m-shell">
      <Sidebar rng={rng} />
      <div className="m-main">
        <div className="m-topbar">
          <Bar w={22} h={0.7} tone="t" />
          <span className="m-spacer" />
          <Input w="10em" h={1.4} />
          <Icon tone="m" />
          <Avatar size={1.3} tone="a" />
        </div>
        <div className="m-page">
          <span className="m-row" style={{ justifyContent: 'space-between' }}>
            <Chips rng={rng} count={3} />
            <Btn w="6em" h={1.4} />
          </span>
          <KpiCards rng={rng} count={4} />
          <div className="m-two" style={{ gridTemplateColumns: rng.chance(0.5) ? '2fr 1fr' : '1fr 1fr' }}>
            <Box className="m-panel">
              <span className="m-row" style={{ justifyContent: 'space-between' }}>
                <Bar w={30} h={0.42} tone="t" /> <Bar w={14} h={0.36} />
              </span>
              {rng.chance(0.5) ? <Chart rng={rng} bars={14} h={5.5} /> : <LineChart rng={rng} h={5.5} />}
            </Box>
            <Box className="m-panel">
              <Bar w={45} h={0.42} tone="t" />
              {rng.chance(0.5) ? (
                <div className="m-row" style={{ gap: '1em', alignItems: 'center' }}>
                  <Ring pct={rng.int(45, 85)} size={4.5} />
                  <Lines rng={rng} count={3} min={50} max={90} />
                </div>
              ) : (
                <ListRows rng={rng} rows={3} thumb="circle" />
              )}
            </Box>
          </div>
          <Box className="m-panel">
            <TableRows rng={rng} rows={rng.int(3, 5)} cols={5} />
          </Box>
        </div>
      </div>
    </div>
  );
};

const search: T = (rng, mobile, screen) => {
  const grid = screen.industry === 'ecommerce' || screen.industry === 'travel' || screen.industry === 'ai';
  return (
    <>
      {mobile ? <StatusOnlyTop rng={rng} /> : <WebNav rng={rng} cta={false} />}
      <div className="m-page">
        <div className="m-searchbar">
          <Icon tone="m" />
          <Bar w={rng.int(35, 60)} h={0.45} tone="t" />
          <span className="m-spacer" />
          {!mobile && <i className="m-kbd" />}
        </div>
        <Chips rng={rng} count={mobile ? 4 : 6} />
        <span className="m-row" style={{ justifyContent: 'space-between' }}>
          <Bar w={mobile ? 40 : 18} h={0.36} tone="m" />
          {!mobile && <Bar w={12} h={0.36} tone="m" />}
        </span>
        {grid ? (
          <div className="m-results" style={{ gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)' }}>
            {Array.from({ length: mobile ? 4 : 8 }, (_, i) => (
              <div key={i} className="m-col" style={{ gap: '0.4em' }}>
                <Img h={mobile ? 6 : 5} rng={rng} />
                <Bar w={rng.int(55, 85)} h={0.42} tone="t" />
                <Bar w={rng.int(30, 50)} h={0.34} />
              </div>
            ))}
          </div>
        ) : (
          <ListRows rng={rng} rows={mobile ? 6 : 7} thumb="square" />
        )}
      </div>
    </>
  );
};

const StatusOnlyTop = ({ rng }: { rng: Rng }) => (
  <div className="m-row m-mobiletop">
    <Bar w={rng.int(30, 45)} h={0.85} tone="t" />
    <span className="m-spacer" />
    <Avatar size={1.4} tone="a" />
  </div>
);

const pricing: T = (rng, mobile, screen) => {
  const tall = !mobile && screen.aspect === '4:5';
  return (
    <>
      {!mobile && <WebNav rng={rng} />}
      <div className="m-page" style={{ alignItems: 'center' }}>
        <Bar w={mobile ? 60 : 30} h={1.2} tone="t" />
        <Bar w={mobile ? 80 : 40} h={0.4} />
        <span className="m-row" style={{ gap: '0.4em', margin: '0.6em 0' }}>
          <Bar w="2.6em" h={0.36} /> <Toggle on /> <Bar w="2.4em" h={0.36} tone="t" />
        </span>
        <div className="m-tiers" style={{ gridTemplateColumns: mobile ? '1fr' : 'repeat(3, 1fr)' }}>
          {Array.from({ length: mobile ? 2 : 3 }, (_, i) => {
            const hi = i === 1;
            return (
              <Box key={i} className={`m-tier ${hi ? 'is-highlight' : ''}`}>
                <Bar w={40} h={0.45} tone={hi ? 'a' : 'm'} />
                <Bar w={55} h={1.1} tone="t" />
                <Bar w={70} h={0.32} />
                <Lines rng={rng} count={mobile ? 3 : 4} min={55} max={90} h={0.32} />
                <Btn w={100} tone={hi ? 'a' : 's'} />
              </Box>
            );
          })}
        </div>
        {tall && (
          <>
            <Bar w={26} h={0.8} tone="t" style={{ marginTop: '1.4em' }} />
            <div className="m-table" style={{ width: '100%' }}>
              {Array.from({ length: 5 }, (_, r) => (
                <div className="m-table-row m-table-row--compare" key={r}>
                  <Bar w={rng.int(35, 65)} h={0.38} tone={r === 0 ? 'm' : 't'} />
                  {[0, 1, 2].map((c) => (
                    <span key={c} className="m-row" style={{ justifyContent: 'center' }}>
                      {r === 0 ? <Bar w={40} h={0.34} /> : rng.chance(c === 0 ? 0.5 : 0.85) ? <i className="m-tick" /> : <Bar w="0.7em" h={0.14} />}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
};

const checkout: T = (rng, mobile) => (
  <>
    {mobile ? <MobileTopBar rng={rng} /> : <WebNav rng={rng} cta={false} />}
    <div className="m-page">
      <div className="m-stepper">
        {[0, 1, 2].map((i) => (
          <span key={i} className="m-row" style={{ gap: '0.4em', flex: 1 }}>
            <i className={`m-step ${i <= 1 ? 'is-done' : ''}`} />
            <Bar w="60%" h={0.14} tone={i < 1 ? 'a' : 'm'} />
          </span>
        ))}
      </div>
      <div className="m-two" style={{ gridTemplateColumns: mobile ? '1fr' : '1.4fr 1fr' }}>
        <div className="m-col" style={{ gap: '0.7em' }}>
          <Bar w={35} h={0.6} tone="t" />
          <Input />
          <span className="m-row" style={{ gap: '0.6em' }}>
            <Input w={50} /> <Input w={50} />
          </span>
          <Input />
          <Bar w={30} h={0.6} tone="t" style={{ marginTop: '0.4em' }} />
          <Box className="m-cardfield">
            <Icon tone="a" />
            <Bar w={50} h={0.42} tone="t" />
            <span className="m-spacer" />
            <Bar w={12} h={0.42} />
          </Box>
          <Btn w={100} />
        </div>
        <Box className="m-summary" tone="s">
          <Bar w={45} h={0.5} tone="t" />
          {Array.from({ length: mobile ? 2 : 3 }, (_, i) => (
            <span key={i} className="m-row" style={{ gap: '0.5em' }}>
              <i className="m-thumb" />
              <span className="m-col" style={{ flex: 1, gap: '0.3em' }}>
                <Bar w={70} h={0.4} tone="t" /> <Bar w={40} h={0.3} />
              </span>
              <Bar w="2em" h={0.4} tone="t" />
            </span>
          ))}
          <i className="m-divider" />
          <span className="m-row" style={{ justifyContent: 'space-between' }}>
            <Bar w={30} h={0.4} /> <Bar w={22} h={0.4} tone="t" />
          </span>
          <span className="m-row" style={{ justifyContent: 'space-between' }}>
            <Bar w={22} h={0.6} tone="t" /> <Bar w={28} h={0.6} tone="t" />
          </span>
        </Box>
      </div>
    </div>
  </>
);

const settings: T = (rng, mobile) => (
  <>
    {mobile ? <MobileTopBar rng={rng} /> : <WebNav rng={rng} cta={false} />}
    <div className={mobile ? 'm-page' : 'm-settings'}>
      {!mobile && (
        <div className="m-col m-settings-nav">
          {Array.from({ length: 6 }, (_, i) => (
            <Bar key={i} w={rng.int(45, 80)} h={0.42} tone={i === 0 ? 't' : 'm'} />
          ))}
        </div>
      )}
      <div className="m-col" style={{ gap: '0.8em', flex: 1 }}>
        {mobile && (
          <span className="m-row" style={{ gap: '0.7em', marginBottom: '0.4em' }}>
            <Avatar size={2.6} tone="a" />
            <span className="m-col" style={{ gap: '0.3em' }}>
              <Bar w="6em" h={0.55} tone="t" /> <Bar w="8em" h={0.36} />
            </span>
          </span>
        )}
        <Bar w={30} h={0.7} tone="t" />
        <Box className="m-group">
          {Array.from({ length: rng.int(3, 4) }, (_, i) => (
            <span key={i} className="m-setting-row">
              <Icon tone="m" />
              <span className="m-col" style={{ flex: 1, gap: '0.25em' }}>
                <Bar w={rng.int(30, 55)} h={0.42} tone="t" /> <Bar w={rng.int(50, 80)} h={0.3} />
              </span>
              <Toggle on={rng.chance(0.6)} />
            </span>
          ))}
        </Box>
        <Bar w={26} h={0.7} tone="t" />
        <Box className="m-group">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="m-setting-row">
              <span className="m-col" style={{ flex: 1, gap: '0.25em' }}>
                <Bar w={rng.int(30, 55)} h={0.42} tone="t" />
              </span>
              <Bar w="1.6em" h={0.36} tone="m" />
              <Icon tone="m" />
            </span>
          ))}
        </Box>
      </div>
    </div>
  </>
);

const profile: T = (rng, mobile) => (
  <>
    {mobile ? <MobileTopBar rng={rng} /> : <WebNav rng={rng} cta={false} />}
    <div className="m-cover" />
    <div className="m-page" style={{ paddingTop: 0 }}>
      <span className="m-row m-profile-head">
        <span className="m-avatar-lg" />
        <span className="m-spacer" />
        <Btn w="4.5em" h={1.4} tone="s" />
        {!mobile && <Btn w="4.5em" h={1.4} />}
      </span>
      <Bar w={mobile ? 50 : 22} h={0.9} tone="t" />
      <Bar w={mobile ? 30 : 14} h={0.36} />
      <span className="m-row" style={{ gap: '1.2em', margin: '0.5em 0' }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="m-col" style={{ gap: '0.2em' }}>
            <Bar w="2em" h={0.6} tone="t" /> <Bar w="2.4em" h={0.3} />
          </span>
        ))}
      </span>
      <div className="m-tabs">
        {[0, 1, 2].map((i) => <Bar key={i} w="3em" h={0.4} tone={i === 0 ? 't' : 'm'} />)}
      </div>
      <div className="m-results" style={{ gridTemplateColumns: mobile ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)' }}>
        {Array.from({ length: mobile ? 6 : 5 }, (_, i) => <Img key={i} h={mobile ? 4.5 : 5.5} rng={rng} />)}
      </div>
    </div>
  </>
);

const onboarding: T = (rng, mobile, screen) => (
  <div className="m-onboarding">
    {mobile && <span className="m-row" style={{ justifyContent: 'flex-end', padding: '0 1em' }}><Bar w="2em" h={0.36} /></span>}
    <div className="m-onboarding-art">
      <i className="m-blob m-blob--1" style={{ left: `${rng.int(10, 30)}%`, top: `${rng.int(10, 30)}%` }} />
      <i className="m-blob m-blob--2" style={{ right: `${rng.int(10, 30)}%`, bottom: `${rng.int(10, 30)}%` }} />
      {screen.industry === 'healthcare' && <Ring pct={72} size={6} />}
      {screen.industry !== 'healthcare' && (
        <Box className="m-float-card" tone="s">
          <span className="m-row" style={{ gap: '0.4em' }}>
            <Avatar size={1.2} tone="a" /> <Bar w={50} h={0.4} tone="t" />
          </span>
          <Bar w={80} h={0.32} /> <Bar w={60} h={0.32} />
        </Box>
      )}
    </div>
    <div className="m-onboarding-copy">
      <Bar w={mobile ? 72 : 40} h={1.3} tone="t" />
      <Bar w={mobile ? 50 : 26} h={1.3} tone="t" />
      <Bar w={mobile ? 80 : 44} h={0.4} style={{ marginTop: '0.4em' }} />
      <Bar w={mobile ? 60 : 30} h={0.4} />
      <span className="m-dots">
        {[0, 1, 2].map((i) => <i key={i} className={`m-dot ${i === 1 ? 'is-active' : ''}`} />)}
      </span>
      <Btn w={mobile ? 100 : '10em'} h={1.9} />
      <Bar w={mobile ? 34 : 18} h={0.34} tone="m" style={{ alignSelf: 'center', marginTop: '0.3em' }} />
    </div>
  </div>
);

const feed: T = (rng, mobile, screen) => {
  const stories = screen.industry === 'social' || screen.industry === 'travel';
  return (
    <>
      {mobile ? <StatusOnlyTop rng={rng} /> : <WebNav rng={rng} cta={false} />}
      <div className={mobile ? 'm-page' : 'm-feed-web'}>
        {!mobile && (
          <div className="m-col m-feed-side">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="m-row" style={{ gap: '0.5em' }}>
                <Icon tone={i === 0 ? 'a' : 'm'} /> <Bar w={rng.int(40, 70)} h={0.4} tone={i === 0 ? 't' : 'm'} />
              </span>
            ))}
          </div>
        )}
        <div className="m-col" style={{ gap: '0.9em', flex: 1, minWidth: 0 }}>
          {stories && (
            <div className="m-stories">
              {Array.from({ length: mobile ? 5 : 7 }, (_, i) => (
                <i key={i} className={`m-story ${i === 0 ? 'is-add' : ''}`} />
              ))}
            </div>
          )}
          {Array.from({ length: 2 }, (_, i) => (
            <Box key={i} className="m-post">
              <span className="m-row" style={{ gap: '0.5em' }}>
                <Avatar size={1.4} tone={i ? 's' : 'a'} />
                <span className="m-col" style={{ gap: '0.25em', flex: 1 }}>
                  <Bar w={rng.int(30, 50)} h={0.42} tone="t" /> <Bar w={rng.int(20, 35)} h={0.3} />
                </span>
                <Icon tone="m" />
              </span>
              {i === 0 || rng.chance(0.5) ? <Img h={mobile ? 8.5 : 9} rng={rng} /> : <Lines rng={rng} count={3} min={60} max={100} />}
              <span className="m-row" style={{ gap: '1em' }}>
                <Icon tone="m" /> <Icon tone="m" /> <Icon tone="m" /> <span className="m-spacer" /> <Icon tone="m" />
              </span>
              <Bar w={rng.int(50, 85)} h={0.34} />
            </Box>
          ))}
        </div>
        {!mobile && (
          <div className="m-col m-feed-side">
            <Bar w={60} h={0.5} tone="t" />
            <ListRows rng={rng} rows={4} />
          </div>
        )}
      </div>
    </>
  );
};

const product: T = (rng, mobile, screen) => (
  <>
    {mobile ? <MobileTopBar title={false} rng={rng} /> : <WebNav rng={rng} cta={false} />}
    <div className={mobile ? 'm-col' : 'm-product-web'}>
      <div className="m-col" style={{ gap: '0.5em' }}>
        <Img h={mobile ? 13 : 14} rng={rng} className={mobile ? 'm-img--flush' : ''} />
        {!mobile && (
          <span className="m-row" style={{ gap: '0.4em' }}>
            {[0, 1, 2, 3].map((i) => <i key={i} className={`m-thumb ${i === 0 ? 'is-active' : ''}`} />)}
          </span>
        )}
      </div>
      <div className="m-page" style={{ gap: '0.6em' }}>
        <span className="m-row" style={{ justifyContent: 'space-between' }}>
          <Bar w={30} h={0.36} tone="a" />
          <span className="m-row" style={{ gap: '0.15em' }}>{[0, 1, 2, 3, 4].map((i) => <i key={i} className="m-star" />)}</span>
        </span>
        <Bar w={mobile ? 75 : 60} h={0.95} tone="t" />
        <Bar w={30} h={0.8} tone="t" />
        <Lines rng={rng} count={2} min={70} max={100} />
        {(screen.industry === 'ecommerce' || screen.industry === 'travel') && (
          <>
            <Bar w={20} h={0.36} />
            <Chips rng={rng} count={4} active={1} />
          </>
        )}
        <span className="m-row" style={{ gap: '0.6em', marginTop: '0.4em' }}>
          <Btn w={mobile ? 72 : '8em'} h={1.9} />
          <i className="m-iconbtn" />
        </span>
        {!mobile && (
          <Box className="m-group" style={{ marginTop: '0.5em' }}>
            {[0, 1].map((i) => (
              <span key={i} className="m-setting-row">
                <Icon tone="m" /> <Bar w={rng.int(40, 70)} h={0.38} /> <span className="m-spacer" /> <Icon tone="m" />
              </span>
            ))}
          </Box>
        )}
      </div>
    </div>
  </>
);

const other: T = (rng, mobile, screen) => {
  const success = /confirm|sent|success|reached|booked|complete/i.test(screen.name);
  const notifications = /notification/i.test(screen.name);
  if (notifications) {
    return (
      <>
        {mobile ? <MobileTopBar rng={rng} /> : <WebNav rng={rng} cta={false} />}
        <div className="m-page">
          <span className="m-row" style={{ justifyContent: 'space-between' }}>
            <Bar w={40} h={0.9} tone="t" /> <Bar w={18} h={0.36} tone="a" />
          </span>
          <div className="m-tabs">{[0, 1, 2].map((i) => <Bar key={i} w="3em" h={0.4} tone={i === 0 ? 't' : 'm'} />)}</div>
          {Array.from({ length: mobile ? 5 : 6 }, (_, i) => (
            <span key={i} className={`m-notif ${i < 2 ? 'is-unread' : ''}`}>
              <Avatar size={1.6} tone={i % 2 ? 's' : 'a'} />
              <span className="m-col" style={{ flex: 1, gap: '0.3em' }}>
                <Bar w={rng.int(60, 90)} h={0.42} tone="t" /> <Bar w={rng.int(30, 50)} h={0.3} />
              </span>
              {i < 2 && <i className="m-unread-dot" />}
            </span>
          ))}
        </div>
      </>
    );
  }
  return (
    <>
      {mobile ? <MobileTopBar title={false} rng={rng} /> : <WebNav rng={rng} cta={false} />}
      <div className="m-center">
        <span className={`m-state-icon ${success ? 'is-success' : ''}`}>
          {success ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
          ) : (
            <i className="m-empty-glyph" />
          )}
        </span>
        <Bar w={mobile ? 62 : 28} h={1} tone="t" />
        <Bar w={mobile ? 78 : 36} h={0.4} />
        <Bar w={mobile ? 56 : 26} h={0.4} />
        {success && (
          <Box className="m-receipt" tone="s">
            {[0, 1, 2].map((i) => (
              <span key={i} className="m-row" style={{ justifyContent: 'space-between' }}>
                <Bar w={30} h={0.36} /> <Bar w={26} h={0.36} tone="t" />
              </span>
            ))}
          </Box>
        )}
        <Btn w={mobile ? 70 : '9em'} h={1.8} />
        {!success && <Bar w={mobile ? 30 : 12} h={0.34} tone="a" />}
      </div>
    </>
  );
};

const TEMPLATES: Record<Screen['screenType'], T> = {
  landing,
  login: auth(false),
  signup: auth(true),
  dashboard,
  search,
  pricing,
  checkout,
  settings,
  profile,
  onboarding,
  feed,
  product,
  other,
};

// ─── Component ──────────────────────────────────────────────────────────────

function MockScreenImpl({ screen, className = '' }: Props) {
  const rng = createRng(screen.seed);
  const mobile = screen.platform !== 'web';
  const showBottomNav = mobile && screen.elements.includes('bottom-nav');
  const { colors } = screen;

  const style = {
    aspectRatio: aspectRatioValue(screen.aspect),
    '--m-bg': colors.bg,
    '--m-text': colors.text,
    '--m-muted': colors.muted,
    '--m-accent': colors.accent,
    '--m-surface': colors.dark ? 'rgba(255,255,255,0.055)' : '#ffffff',
    '--m-surface-2': colors.dark ? 'rgba(255,255,255,0.09)' : 'rgba(17,19,24,0.045)',
    '--m-border': colors.dark ? 'rgba(255,255,255,0.09)' : 'rgba(17,19,24,0.09)',
    '--m-on-accent': '#ffffff',
  } as CSSProperties;

  return (
    <div
      className={`ins-mock ${mobile ? 'ins-mock--mobile' : 'ins-mock--web'} ${colors.dark ? 'ins-mock--dark' : ''} ${className}`}
      style={style}
      role="img"
      aria-label={`${screen.name} screen`}
    >
      <div className="ins-mock-inner">
        {mobile && <StatusBar />}
        <div className="ins-mock-body">{TEMPLATES[screen.screenType](rng, mobile, screen)}</div>
        {showBottomNav && <BottomNav active={screen.screenType === 'search' ? 1 : screen.screenType === 'profile' ? 4 : 0} />}
      </div>
    </div>
  );
}

export const MockScreen = memo(MockScreenImpl);

/** Real capture when available, otherwise the procedural mock. */
export function Screenshot({ screen, className = '', sizes }: Props & { sizes?: string }) {
  if (screen.image) {
    return (
      <img
        src={screen.image}
        alt={`${screen.name} screen`}
        className={`ins-shot-img ${className}`}
        style={{ aspectRatio: aspectRatioValue(screen.aspect) }}
        loading="lazy"
        decoding="async"
        sizes={sizes}
      />
    );
  }
  return <MockScreen screen={screen} className={className} />;
}
