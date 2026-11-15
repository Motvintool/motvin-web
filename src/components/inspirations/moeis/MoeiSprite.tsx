import type { MoeiAccessory, MoeiFace, MoeiKind } from '@/lib/inspirations/moei';

export type MoeiMood = 'idle' | 'happy' | 'sleep';

const INK = '#18181b';

/** A five-point star's path, centred on (cx, cy), `r` to its points. */
function starPath(cx: number, cy: number, r: number): string {
  return (
    Array.from({ length: 10 }, (_, i) => {
      const a = ((i * 36 - 90) * Math.PI) / 180;
      const d = i % 2 ? r * 0.45 : r;
      return `${i ? 'L' : 'M'}${(cx + Math.cos(a) * d).toFixed(2)} ${(cy + Math.sin(a) * d).toFixed(2)}`;
    }).join(' ') + ' Z'
  );
}

/** A four-point sparkle's path, centred on (cx, cy), `r` to its points. */
function sparklePath(cx: number, cy: number, r: number): string {
  const k = r * 0.28;
  return `M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r} Z`;
}

/** The colour a shade darker, for feet and inner shapes. */
function shade(hex: string, amount = 0.22): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/**
 * Where each kind's face and head are on the 64×64 canvas: eye height and
 * spacing, the point an accessory sits on, and whether it has rosy cheeks
 * (a frog's eyes sit up on bumps, where cheeks would land on the outline).
 */
const LAYOUT: Record<
  MoeiKind,
  {
    eyeY: number;
    eyeL: number;
    eyeR: number;
    top: number;
    feet: boolean;
    cheeks: boolean;
    /** A hat raised this much further on this kind (one deep enough to cover its eyes otherwise). */
    lift?: Partial<Record<MoeiAccessory, number>>;
  }
> = {
  blob: { eyeY: 35, eyeL: 25, eyeR: 39, top: 17, feet: true, cheeks: true },
  cat: { eyeY: 36, eyeL: 25, eyeR: 39, top: 18, feet: true, cheeks: true },
  ghost: { eyeY: 32, eyeL: 25, eyeR: 39, top: 14, feet: false, cheeks: true },
  // Its halo floats higher, clear of the tuft on its head.
  bird: { eyeY: 34, eyeL: 28, eyeR: 39, top: 20, feet: true, cheeks: true, lift: { halo: 6 } },
  // A frog's hat sits up on its eye bumps (their tops at 19.5), not between them, where it covered its eyes.
  frog: { eyeY: 27, eyeL: 21, eyeR: 43, top: 17, feet: true, cheeks: false, lift: { beanie: 5 } },
  bear: { eyeY: 32, eyeL: 25, eyeR: 39, top: 17, feet: true, cheeks: true },
  penguin: { eyeY: 28, eyeL: 26, eyeR: 38, top: 15, feet: true, cheeks: true },
  axolotl: { eyeY: 36, eyeL: 23, eyeR: 41, top: 22, feet: true, cheeks: true },
  // Its face on the stem, under the cap; a hat sits on the cap.
  mushroom: { eyeY: 41, eyeL: 27, eyeR: 37, top: 16, feet: true, cheeks: true },
};

function Body({ kind, fill }: { kind: MoeiKind; fill: string }) {
  const s = { fill, stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (kind) {
    case 'cat':
      return (
        <>
          <path d="M51 47 C59 46 60 37 56 33" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
          <path d="M14 30 L17 12 L28 22 Z" {...s} />
          <path d="M50 30 L47 12 L36 22 Z" {...s} />
          <rect x="12" y="19" width="40" height="37" rx="16" {...s} />
        </>
      );
    case 'ghost':
      return <path d="M12 54 V34 C12 22 21 14 32 14 C43 14 52 22 52 34 V54 L46.5 50 L41 54 L35.5 50 L30 54 L24.5 50 L19 54 L15.5 51 Z" {...s} />;
    case 'bird':
      return (
        <>
          <path d="M31 20 C30 15 33 12 36 13" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
          {/* The beak, behind the body: its base tucked in, so only the point shows, outlined into the body's own line. */}
          <path d="M44 33 L59 38.5 L44 44 Z" fill="#FFB84D" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
          <circle cx="32" cy="38" r="18" {...s} />
          <path d="M18 40 C22 46 28 47 31 44" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </>
      );
    case 'frog':
      return (
        <>
          <ellipse cx="32" cy="43" rx="23" ry="14" {...s} />
          <circle cx="21" cy="27" r="7.5" {...s} />
          <circle cx="43" cy="27" r="7.5" {...s} />
        </>
      );
    case 'bear':
      // Round ears (their insides a shade darker), and a pale muzzle with a little nose.
      return (
        <>
          {[18, 46].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy="21" r="6.5" {...s} />
              <circle cx={cx} cy="21" r="3" fill={shade(fill, 0.14)} />
            </g>
          ))}
          <path d="M32 16 C46 16 54 26 54 38 C54 50 46 56 32 56 C18 56 10 50 10 38 C10 26 18 16 32 16 Z" {...s} />
          <ellipse cx="32" cy="39" rx="8" ry="5.8" fill="#fff" opacity={0.55} />
          <ellipse cx="32" cy="36.4" rx="2" ry="1.4" fill={INK} />
        </>
      );
    case 'penguin':
      // A white belly, little flippers in a shade darker, and an orange beak over its smile.
      return (
        <>
          <path d="M14 33 C8 37 8 44 13 46" {...s} fill={shade(fill)} strokeWidth={2.2} />
          <path d="M50 33 C56 37 56 44 51 46" {...s} fill={shade(fill)} strokeWidth={2.2} />
          <rect x="13" y="14" width="38" height="42" rx="18" {...s} />
          <ellipse cx="32" cy="41" rx="12.5" ry="13" fill="#fff" />
          <path d="M29.4 30.6 L34.6 30.6 L32 33.4 Z" fill="#FFA94D" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
        </>
      );
    case 'axolotl':
      // Three frilly gills each side, pink, behind a wide head.
      return (
        <>
          {[-1, 1].map((side) => (
            <g key={side} fill="#FF9EBB" stroke={INK} strokeWidth={1.8} strokeLinejoin="round">
              {[
                [27, -32],
                [36, 0],
                [45, 32],
              ].map(([cy, tilt]) => {
                const cx = 32 + side * 20;
                return <ellipse key={cy} cx={cx} cy={cy} rx="5.2" ry="2.6" transform={`rotate(${side * tilt} ${cx} ${cy})`} />;
              })}
            </g>
          ))}
          <ellipse cx="32" cy="38" rx="20" ry="16" {...s} />
        </>
      );
    case 'mushroom':
      // A cream stem with its face, under a cap in its colour, dotted white.
      return (
        <>
          <rect x="18.5" y="28" width="27" height="28" rx="11" fill="#FFF4E6" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
          <path d="M9 31 C9 13 55 13 55 31 C55 34.5 51 35.5 47 35.5 H17 C13 35.5 9 34.5 9 31 Z" {...s} />
          <g fill="#fff">
            <circle cx="22" cy="24" r="3" />
            <circle cx="34" cy="20" r="2.4" />
            <circle cx="44" cy="27" r="3.4" />
            <circle cx="31" cy="30" r="1.6" />
          </g>
        </>
      );
    default:
      return <path d="M32 16 C46 16 54 26 54 38 C54 50 46 56 32 56 C18 56 10 50 10 38 C10 26 18 16 32 16 Z" {...s} />;
  }
}

function Eyes({ x1, x2, y, mood }: { x1: number; x2: number; y: number; mood: MoeiMood }) {
  if (mood === 'sleep') {
    return (
      <g stroke={INK} strokeWidth={2.2} strokeLinecap="round">
        <path d={`M${x1 - 3} ${y} H${x1 + 3}`} />
        <path d={`M${x2 - 3} ${y} H${x2 + 3}`} />
      </g>
    );
  }
  if (mood === 'happy') {
    return (
      <g fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d={`M${x1 - 3} ${y + 1} L${x1} ${y - 2} L${x1 + 3} ${y + 1}`} />
        <path d={`M${x2 - 3} ${y + 1} L${x2} ${y - 2} L${x2 + 3} ${y + 1}`} />
      </g>
    );
  }
  // Open eyes, with the blink done in CSS (.ins-moei-eyes).
  return (
    <g className="ins-moei-eyes" style={{ transformOrigin: `32px ${y}px` }}>
      <circle cx={x1} cy={y} r={2.9} fill={INK} />
      <circle cx={x2} cy={y} r={2.9} fill={INK} />
      <circle cx={x1 + 0.9} cy={y - 1} r={0.9} fill="#fff" />
      <circle cx={x2 + 0.9} cy={y - 1} r={0.9} fill="#fff" />
    </g>
  );
}

function Accessory({ accessory, top, kind }: { accessory: MoeiAccessory; top: number; kind?: MoeiKind }) {
  const t = top;
  const line = { stroke: INK, strokeWidth: 2.2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (accessory) {
    case 'cap':
      return (
        <g>
          <path d={`M21 ${t + 4} C21 ${t - 6} 43 ${t - 6} 43 ${t + 4} Z`} fill="#4C6EF5" {...line} />
          <path d={`M41 ${t + 3} H51`} {...line} fill="none" strokeWidth={3} />
          <circle cx="32" cy={t - 3.5} r="1.6" fill={INK} />
        </g>
      );
    case 'bow':
      return (
        <g>
          <path d={`M32 ${t + 1} L22 ${t - 5} L22 ${t + 7} Z`} fill="#FF6B8B" {...line} />
          <path d={`M32 ${t + 1} L42 ${t - 5} L42 ${t + 7} Z`} fill="#FF6B8B" {...line} />
          <circle cx="32" cy={t + 1} r="3" fill="#FF6B8B" {...line} />
        </g>
      );
    case 'crown':
      return <path d={`M22 ${t + 3} L23 ${t - 8} L28 ${t - 2} L32 ${t - 10} L36 ${t - 2} L41 ${t - 8} L42 ${t + 3} Z`} fill="#FFD43B" {...line} />;
    case 'headphones':
      // A frog's head is its two eye bumps: the band arches clear over both, the cups against their outer sides.
      if (kind === 'frog') {
        return (
          <g>
            <path d="M10 30 C10 4 54 4 54 30" fill="none" {...line} strokeWidth={3} />
            <rect x="5" y="22" width="8" height="12" rx="4" fill="#343A40" {...line} />
            <rect x="51" y="22" width="8" height="12" rx="4" fill="#343A40" {...line} />
          </g>
        );
      }
      return (
        <g>
          <path d={`M13 ${t + 18} C13 ${t - 6} 51 ${t - 6} 51 ${t + 18}`} fill="none" {...line} strokeWidth={3} />
          <rect x="8" y={t + 13} width="8" height="12" rx="4" fill="#343A40" {...line} />
          <rect x="48" y={t + 13} width="8" height="12" rx="4" fill="#343A40" {...line} />
        </g>
      );
    case 'sprout':
      return (
        <g>
          <path d={`M32 ${t + 2} V${t - 6}`} {...line} fill="none" />
          <path d={`M32 ${t - 5} C28 ${t - 12} 21 ${t - 9} 22 ${t - 5} C25 ${t - 3} 30 ${t - 3} 32 ${t - 5} Z`} fill="#51CF66" {...line} />
          <path d={`M32 ${t - 6} C35 ${t - 13} 42 ${t - 11} 41 ${t - 7} C38 ${t - 5} 34 ${t - 5} 32 ${t - 6} Z`} fill="#51CF66" {...line} />
        </g>
      );
    case 'party':
      return (
        <g>
          <path d={`M24 ${t + 3} L32 ${t - 14} L40 ${t + 3} Z`} fill="#74C0FC" {...line} />
          <circle cx="30" cy={t - 3} r="1.3" fill="#FF6B8B" />
          <circle cx="34.5" cy={t - 7} r="1.2" fill="#FFD43B" />
          <circle cx="34" cy={t + 0.5} r="1.2" fill="#FFD43B" />
          <circle cx="32" cy={t - 14} r="2.8" fill="#FF6B8B" {...line} strokeWidth={1.8} />
        </g>
      );
    case 'beanie':
      return (
        <g>
          <path d={`M19 ${t + 6} C19 ${t - 9} 45 ${t - 9} 45 ${t + 6} Z`} fill="#FA5252" {...line} />
          <rect x="18" y={t + 2} width="28" height="6.5" rx="3.25" fill="#E03131" {...line} />
          <circle cx="32" cy={t - 7.5} r="3" fill="#fff" {...line} strokeWidth={1.8} />
        </g>
      );
    case 'flower':
      return (
        <g>
          {[0, 1, 2, 3, 4].map((k) => {
            const a = ((k * 72 - 90) * Math.PI) / 180;
            return <circle key={k} cx={41 + Math.cos(a) * 3.6} cy={t + 1 + Math.sin(a) * 3.6} r="2.7" fill="#FF8FAB" stroke={INK} strokeWidth={1.6} />;
          })}
          <circle cx="41" cy={t + 1} r="2" fill="#FFD43B" stroke={INK} strokeWidth={1.4} />
        </g>
      );
    case 'halo':
      return (
        <g fill="none">
          <ellipse cx="32" cy={t - 8} rx="11" ry="3.2" stroke={INK} strokeWidth={4.4} />
          <ellipse cx="32" cy={t - 8} rx="11" ry="3.2" stroke="#FFD43B" strokeWidth={2.2} />
        </g>
      );
    case 'wizard':
      return (
        <g>
          <path d={`M22 ${t + 3} L35 ${t - 17} L42 ${t + 3} Z`} fill="#7950F2" {...line} />
          <ellipse cx="32" cy={t + 3} rx="13" ry="3" fill="#7950F2" {...line} />
          <path d={starPath(33, t - 4, 3)} fill="#FFD43B" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
        </g>
      );
    case 'tophat':
      return (
        <g>
          <rect x="23" y={t - 12} width="18" height="14" rx="2" fill="#343A40" {...line} />
          <rect x="23" y={t - 3.5} width="18" height="3" fill="#FA5252" />
          <rect x="18" y={t + 0.5} width="28" height="4" rx="2" fill="#343A40" {...line} />
        </g>
      );
    case 'bunny':
      return (
        <g>
          {[
            [25, -12],
            [39, 12],
          ].map(([cx, tilt]) => (
            <g key={cx} transform={`rotate(${tilt} ${cx} ${t + 1})`}>
              <ellipse cx={cx} cy={t - 7} rx="4" ry="9" fill="#fff" {...line} />
              <ellipse cx={cx} cy={t - 6.5} rx="1.8" ry="5.8" fill="#FFB3C6" />
            </g>
          ))}
        </g>
      );
    case 'cherry':
      return (
        <g>
          <path d={`M31 ${t - 11} Q29 ${t - 4} 27 ${t + 0.5} M31 ${t - 11} Q34 ${t - 5} 35.5 ${t + 0.5}`} fill="none" stroke="#2B8A3E" strokeWidth={1.6} strokeLinecap="round" />
          <path d={`M31 ${t - 11} C34 ${t - 14} 38 ${t - 13} 39 ${t - 11} C36 ${t - 9} 33 ${t - 9} 31 ${t - 11} Z`} fill="#51CF66" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
          {[27, 35.5].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy={t + 2} r="3.3" fill="#FA5252" stroke={INK} strokeWidth={1.6} />
              <circle cx={cx - 1.1} cy={t + 0.9} r="0.9" fill="#fff" opacity={0.85} />
            </g>
          ))}
        </g>
      );
    case 'chef':
      return (
        <g>
          <circle cx="25.5" cy={t - 6} r="5" fill="#fff" {...line} />
          <circle cx="38.5" cy={t - 6} r="5" fill="#fff" {...line} />
          <circle cx="32" cy={t - 9} r="6.2" fill="#fff" {...line} />
          <rect x="22.5" y={t - 4} width="19" height="7.5" rx="2.2" fill="#fff" {...line} />
        </g>
      );
    default:
      return null;
  }
}

/** What it wears on its face, placed by its eyes (`l`, `r`, at height `y`). */
function Face({ face, l, r, y }: { face: MoeiFace; l: number; r: number; y: number }) {
  const mx = (l + r) / 2;
  // Lenses as big as the eyes' spacing allows (a bird's eyes sit close).
  const lens = Math.min(5.4, (r - l) / 2 - 0.6);
  switch (face) {
    case 'glasses':
    case 'shades': {
      const dark = face === 'shades';
      return (
        <g stroke={INK} strokeWidth={1.8} strokeLinecap="round">
          {/* Clear lenses (the eyes show through as they are); dark ones for shades. */}
          <circle cx={l} cy={y} r={lens} fill={dark ? '#212529' : 'none'} />
          <circle cx={r} cy={y} r={lens} fill={dark ? '#212529' : 'none'} />
          <path d={`M${l + lens} ${y} Q${mx} ${y - 2.2} ${r - lens} ${y}`} fill="none" strokeWidth={1.6} />
          {dark && (
            <g stroke="#fff" strokeWidth={1.1} opacity={0.8}>
              <path d={`M${l - lens * 0.5} ${y - lens * 0.1} l${lens * 0.45} ${-lens * 0.42}`} />
              <path d={`M${r - lens * 0.5} ${y - lens * 0.1} l${lens * 0.45} ${-lens * 0.42}`} />
            </g>
          )}
        </g>
      );
    }
    case 'monocle':
      return (
        <g fill="none" strokeLinecap="round">
          <circle cx={r} cy={y} r={lens + 0.4} fill="none" stroke={INK} strokeWidth={1.8} />
          {/* Its little gold chain. */}
          <path d={`M${r} ${y + lens + 0.4} q2 6 -3 10`} stroke="#F59F00" strokeWidth={1.2} />
        </g>
      );
    case 'mask': {
      const hole = (cx: number) => `M${cx + 3.4} ${y} a3.4 3.4 0 1 0 -6.8 0 a3.4 3.4 0 1 0 6.8 0 Z`;
      return (
        <path
          d={`M${l - 7.5} ${y - 1} Q${l - 7.5} ${y - 4.5} ${l - 3} ${y - 4.5} L${r + 3} ${y - 4.5} Q${r + 7.5} ${y - 4.5} ${r + 7.5} ${y - 1} L${r + 7.5} ${y + 1} Q${r + 7.5} ${y + 4.5} ${r + 3} ${y + 4.5} Q${mx} ${y + 2} ${l - 3} ${y + 4.5} Q${l - 7.5} ${y + 4.5} ${l - 7.5} ${y + 1} Z ${hole(l)} ${hole(r)}`}
          fill="#4C6EF5"
          fillRule="evenodd"
          stroke={INK}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      );
    }
    case 'eyepatch':
      return (
        <g>
          <path d={`M${l - 8} ${y - 3} L${r + 8} ${y - 7}`} stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
          <ellipse cx={l} cy={y} rx="4.6" ry="4" fill={INK} />
        </g>
      );
    case 'whiskers':
      return (
        <g stroke={INK} strokeWidth={1.1} strokeLinecap="round">
          {[-1, 1].map((side) => {
            const x = (side < 0 ? l : r) + side * 3;
            return (
              <g key={side}>
                <path d={`M${x} ${y + 5} L${x + side * 8} ${y + 3}`} />
                <path d={`M${x} ${y + 6.5} L${x + side * 8.5} ${y + 6.5}`} />
                <path d={`M${x} ${y + 8} L${x + side * 8} ${y + 10}`} />
              </g>
            );
          })}
        </g>
      );
    case 'nose':
      return (
        <g>
          <circle cx={mx} cy={y + 3.2} r="2.4" fill="#FA5252" stroke={INK} strokeWidth={1.4} />
          <circle cx={mx - 0.8} cy={y + 2.4} r="0.7" fill="#fff" />
        </g>
      );
    case 'hearts':
      return (
        <g fill="#FA5252" stroke={INK} strokeWidth={1.1} strokeLinejoin="round">
          {[l, r].map((cx) => (
            <path key={cx} d={`M${cx} ${y + 3} C${cx - 5} ${y - 0.5} ${cx - 3} ${y - 4.5} ${cx} ${y - 2} C${cx + 3} ${y - 4.5} ${cx + 5} ${y - 0.5} ${cx} ${y + 3} Z`} />
          ))}
        </g>
      );
    case 'moustache': {
      const m = y + 5.2;
      return (
        <path
          d={`M${mx} ${m} C${mx - 2} ${m - 2.5} ${mx - 7} ${m - 2.5} ${mx - 8} ${m + 1} C${mx - 5} ${m + 0.5} ${mx - 2} ${m + 1.5} ${mx} ${m} C${mx + 2} ${m + 1.5} ${mx + 5} ${m + 0.5} ${mx + 8} ${m + 1} C${mx + 7} ${m - 2.5} ${mx + 2} ${m - 2.5} ${mx} ${m} Z`}
          fill={INK}
        />
      );
    }
    case 'freckles':
      return (
        <g fill="#B5651D" opacity={0.7}>
          {[-1, 1].map((side) => {
            const cx = side < 0 ? l : r;
            return (
              <g key={side}>
                <circle cx={cx + side * 5.5} cy={y + 4.5} r="1" />
                <circle cx={cx + side * 3.3} cy={y + 6.4} r="1" />
                <circle cx={cx + side * 6.2} cy={y + 7.4} r="1" />
              </g>
            );
          })}
        </g>
      );
    case 'stars':
      // Starry-eyed: a gold star over each eye.
      return (
        <g fill="#FFD43B" stroke={INK} strokeWidth={1.2} strokeLinejoin="round">
          <path d={starPath(l, y, lens)} />
          <path d={starPath(r, y, lens)} />
        </g>
      );
    case 'sparkles':
      return (
        <g fill="#FCC419" stroke={INK} strokeWidth={0.9} strokeLinejoin="round">
          <path d={sparklePath(l - 6, y - 6, 3)} />
          <path d={sparklePath(r + 6.5, y - 7, 3.6)} />
          <path d={sparklePath(r + 9, y - 1.5, 1.8)} />
        </g>
      );
    case 'blush':
      // Shy: little pink lines over each cheek.
      return (
        <g stroke="#E64980" strokeWidth={1.2} strokeLinecap="round">
          {[l - 4, r + 4].map((cx) => (
            <g key={cx}>
              {[-2, 0, 2].map((dx) => (
                <path key={dx} d={`M${cx + dx - 0.8} ${y + 7.4} l1.6 -3`} />
              ))}
            </g>
          ))}
        </g>
      );
    case 'sweat':
      return (
        <g>
          <path d={`M${r + 7} ${y - 9} C${r + 9.8} ${y - 5.2} ${r + 9.8} ${y - 2.4} ${r + 7} ${y - 2.4} C${r + 4.2} ${y - 2.4} ${r + 4.2} ${y - 5.2} ${r + 7} ${y - 9} Z`} fill="#A5D8FF" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
          <circle cx={r + 6.1} cy={y - 4.3} r="0.7" fill="#fff" />
        </g>
      );
    case 'blep':
      // A tongue poking out under its smile.
      return <path d={`M${mx - 2.2} ${y + 7.6} V${y + 9.6} A2.2 2.2 0 0 0 ${mx + 2.2} ${y + 9.6} V${y + 7.6} Z`} fill="#FF8FAB" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />;
    case 'fangs':
      return (
        <g fill="#fff" stroke={INK} strokeWidth={1} strokeLinejoin="round">
          <path d={`M${mx - 3} ${y + 7.1} L${mx - 2} ${y + 9.8} L${mx - 1} ${y + 7.6} Z`} />
          <path d={`M${mx + 1} ${y + 7.6} L${mx + 2} ${y + 9.8} L${mx + 3} ${y + 7.1} Z`} />
        </g>
      );
    case 'plaster':
      return (
        <g transform={`rotate(-28 ${r + 4} ${y + 6})`}>
          <rect x={r - 0.5} y={y + 4.1} width="9" height="3.8" rx="1.9" fill="#FFD8A8" stroke={INK} strokeWidth={1.2} />
          <rect x={r + 2.4} y={y + 4.1} width="3.2" height="3.8" fill="#F8C291" />
        </g>
      );
    default:
      return null;
  }
}

/** Where each accessory sits on the canvas (head top at 20): its centre and a square around it. */
const ICON_FRAME: Record<Exclude<MoeiAccessory, 'none'>, [cx: number, cy: number, size: number]> = {
  cap: [36, 20, 36],
  bow: [32, 21, 28],
  crown: [32, 16.5, 28],
  headphones: [32, 30.5, 52],
  sprout: [31.5, 14.5, 26],
  party: [32, 13.5, 26],
  beanie: [32, 19, 34],
  flower: [41, 21, 18],
  halo: [32, 12, 28],
  wizard: [32, 13.5, 30],
  tophat: [32, 16, 30],
  bunny: [32, 12.5, 28],
  cherry: [31, 15.5, 22],
  chef: [32, 15, 26],
};

/** "None", for either picker: a crossed-out circle. */
function NoneIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M6.5 17.5 17.5 6.5" />
    </svg>
  );
}

/** An accessory on its own, as a picker icon. */
export function MoeiAccessoryIcon({ accessory, size = 28 }: { accessory: MoeiAccessory; size?: number }) {
  if (accessory === 'none') return <NoneIcon size={size} />;
  const [cx, cy, s] = ICON_FRAME[accessory];
  return (
    <svg width={size} height={size} viewBox={`${cx - s / 2} ${cy - s / 2} ${s} ${s}`} overflow="visible" aria-hidden>
      <Accessory accessory={accessory} top={20} />
    </svg>
  );
}

/** A face item as a picker icon: worn by a pair of eyes, so it reads as a face. */
export function MoeiFaceIcon({ face, size = 28 }: { face: MoeiFace; size?: number }) {
  if (face === 'none') return <NoneIcon size={size} />;
  // Whiskers, sparkles and a sweat drop reach out past the eyes: frame a little wider for them.
  const frame = face === 'whiskers' || face === 'sparkles' || face === 'sweat' ? '13 18 38 38' : '17 21 31 31';
  return (
    <svg width={size} height={size} viewBox={frame} aria-hidden>
      <circle cx="25" cy="32" r="2.9" fill={INK} />
      <circle cx="39" cy="32" r="2.9" fill={INK} />
      <Face face={face} l={25} r={39} y={32} />
    </svg>
  );
}

/**
 * A Motvin moei: one of five kinds in a chosen colour, hat and face item, drawn on
 * a 64×64 canvas with a sticker-style ink outline. `mood` picks the eyes
 * (open and blinking, happy arcs, or asleep); feet and bobbing are animated
 * in CSS by the parent's classes.
 */
export function MoeiSprite({
  kind,
  color,
  accessory,
  face = 'none',
  mood = 'idle',
  size = 48,
  title,
}: {
  kind: MoeiKind;
  color: string;
  accessory: MoeiAccessory;
  face?: MoeiFace;
  mood?: MoeiMood;
  size?: number;
  title?: string;
}) {
  const layout = LAYOUT[kind];
  const dark = shade(color);
  return (
    <svg
      className={`ins-moei-sprite ins-moei-sprite--${kind}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {layout.feet && (
        <g className="ins-moei-feet" fill={dark} stroke={INK} strokeWidth={2}>
          <ellipse className="ins-moei-foot ins-moei-foot--l" cx="24" cy="57" rx="5" ry="3.2" />
          <ellipse className="ins-moei-foot ins-moei-foot--r" cx="40" cy="57" rx="5" ry="3.2" />
        </g>
      )}
      <g className="ins-moei-body">
        <Body kind={kind} fill={color} />
        {layout.cheeks && (
          <g fill="#FF6B8B" opacity="0.45">
            <ellipse cx={layout.eyeL - 4} cy={layout.eyeY + 6} rx="3.2" ry="2" />
            <ellipse cx={layout.eyeR + 4} cy={layout.eyeY + 6} rx="3.2" ry="2" />
          </g>
        )}
        <Eyes x1={layout.eyeL} x2={layout.eyeR} y={layout.eyeY} mood={mood} />
        {/* Mouth: a small smile, open when happy. */}
        {mood === 'happy' ? (
          <path d={`M${(layout.eyeL + layout.eyeR) / 2 - 3.5} ${layout.eyeY + 5} Q${(layout.eyeL + layout.eyeR) / 2} ${layout.eyeY + 11} ${(layout.eyeL + layout.eyeR) / 2 + 3.5} ${layout.eyeY + 5} Z`} fill={INK} />
        ) : (
          <path d={`M${(layout.eyeL + layout.eyeR) / 2 - 3} ${layout.eyeY + 5.5} Q${(layout.eyeL + layout.eyeR) / 2} ${layout.eyeY + 8.5} ${(layout.eyeL + layout.eyeR) / 2 + 3} ${layout.eyeY + 5.5}`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        )}
        <Face face={face} l={layout.eyeL} r={layout.eyeR} y={layout.eyeY} />
        <Accessory accessory={accessory} top={layout.top - (layout.lift?.[accessory] ?? 0)} kind={kind} />
      </g>
    </svg>
  );
}
