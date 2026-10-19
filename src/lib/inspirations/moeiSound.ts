/**
 * The moei's little sounds, one per trick, played when it's clicked or
 * tapped — made on the spot with the Web Audio API (no sound files).
 *
 * Toy sounds, not alerts: water-drop bloops, rubber squeaks, a springy
 * boing, music-box plinks. Every one is short and soft and always moving in
 * pitch — a held, steady tone is what makes a sound read as a notification.
 * The audio context is made on the first play, which is always a click or
 * tap, so the browser lets it start.
 */

export type MoeiSound = 'hop' | 'spin' | 'wiggle' | 'hearts' | 'boop' | 'hello' | 'startle' | 'dizzy';

type Tone = {
  /** Start (s after the sound begins) and length (s). */
  t: number;
  d: number;
  /** The pitch's path: [share of the length (0–1), Hz] points, the first at 0. */
  path: [number, number][];
  type?: OscillatorType;
  /** A quick trill: how fast (per s) and how deep (a share of the pitch). */
  trill?: [number, number];
  /** Loudness, 0–1. */
  g?: number;
  /** A faint bell overtone above it (a music box's ring). */
  bell?: boolean;
};

/** A water drop: a fast swoop up into the note, then gone. */
const bloop = (t: number, f: number, g = 1): Tone => ({ t, d: 0.11, path: [[0, f * 0.55], [0.22, f], [1, f * 1.08]], g });
/** A rubber-toy squeak: up and back, a little trembly. */
const squeak = (t: number, f: number, d = 0.09, g = 0.8): Tone => ({
  t,
  d,
  path: [[0, f], [0.45, f * 1.35], [1, f * 1.08]],
  type: 'triangle',
  trill: [28, 0.03],
  g,
});
/** A music-box plink: struck, ringing out. */
const plink = (t: number, f: number, g = 0.7): Tone => ({ t, d: 0.42, path: [[0, f], [1, f]], g, bell: true });

const SOUNDS: Record<MoeiSound, Tone[]> = {
  // A springy boing: shooting up, then wobbling as it settles.
  hop: [{ t: 0, d: 0.32, path: [[0, 260], [0.3, 880], [1, 760]], type: 'triangle', trill: [16, 0.06] }],
  // A run of bloops climbing (C6 D6 E6 G6 A6 C7): bubbles going up.
  spin: [1047, 1175, 1319, 1568, 1760, 2093].map((f, i) => bloop(i * 0.055, f, 0.85)),
  // Giggly squeaks, back and forth.
  wiggle: [squeak(0, 1250), squeak(0.1, 1450), squeak(0.2, 1300), squeak(0.3, 1550, 0.11)],
  // A twinkle on the music box (E6 G#6 B6 E7).
  hearts: [plink(0, 1319), plink(0.09, 1661), plink(0.18, 1976), plink(0.27, 2637, 0.55)],
  // One round boop, dropping.
  boop: [{ t: 0, d: 0.16, path: [[0, 820], [0.15, 900], [1, 380]], g: 1 }],
  // "Pi-pi!": two little squeaks, the second higher.
  hello: [squeak(0, 1100, 0.08), squeak(0.12, 1480, 0.12, 0.9)],
  // A startled squeak, shooting up.
  startle: [{ t: 0, d: 0.13, path: [[0, 900], [0.5, 2100], [1, 1900]], type: 'triangle', trill: [30, 0.03], g: 0.85 }],
  // A wobbly slide down, then a tiny bloop as it steadies.
  dizzy: [
    { t: 0, d: 0.62, path: [[0, 980], [1, 330]], type: 'triangle', trill: [9, 0.09], g: 0.75 },
    bloop(0.66, 620, 0.7),
  ],
};

/** How loud the moei is overall: a small voice. */
const VOLUME = 0.3;

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function sound(a: BaseAudioContext, out: AudioNode, tone: Tone, at: number) {
  const start = at + tone.t;
  const end = start + tone.d;
  // Each one a hair different, so it never sounds like a recording.
  const jitter = 1 + (Math.random() - 0.5) * 0.04;
  const oscs: OscillatorNode[] = [];
  const env = a.createGain();

  const voice = (ratio: number, level: number, type: OscillatorType) => {
    const osc = a.createOscillator();
    osc.type = type;
    tone.path.forEach(([share, hz], i) => {
      const f = hz * jitter * ratio;
      if (i === 0) osc.frequency.setValueAtTime(f, start);
      else osc.frequency.exponentialRampToValueAtTime(f, start + tone.d * share);
    });
    const gain = a.createGain();
    gain.gain.value = level;
    osc.connect(gain).connect(env);
    oscs.push(osc);
    return osc;
  };
  const main = voice(1, 1, tone.type ?? 'sine');
  // A music box rings with a quiet overtone well above the note.
  if (tone.bell) voice(4, 0.12, 'sine');

  if (tone.trill) {
    const [rate, depth] = tone.trill;
    const lfo = a.createOscillator();
    const amount = a.createGain();
    lfo.frequency.value = rate;
    amount.gain.value = tone.path[0][1] * depth;
    lfo.connect(amount).connect(main.frequency);
    lfo.start(start);
    lfo.stop(end);
  }

  // Struck, then dying away — never held.
  const peak = tone.g ?? 1;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  env.connect(out);
  for (const osc of oscs) {
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

/** Plays `kind` into `a` (a live context, or an offline one to render it). */
export function sayMoeiWord(a: BaseAudioContext, kind: MoeiSound) {
  const at = a.currentTime + 0.01;
  const master = a.createGain();
  master.gain.value = VOLUME;
  // Rounded off at the top: soft, never shrill.
  const soften = a.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 4500;
  soften.connect(master).connect(a.destination);
  for (const tone of SOUNDS[kind]) sound(a, soften, tone, at);
}

export function playMoeiSound(kind: MoeiSound) {
  const a = audio();
  if (a) sayMoeiWord(a, kind);
}
