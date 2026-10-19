/**
 * Motvin Moeis: a little companion that follows the cursor around
 * Inspirations. Its look (kind, colour, hat, face, name), how it behaves
 * (follow speed, follow or auto, name tag), whether it's out, and how many snacks it's had are kept in this browser's localStorage, as
 * collections are — a tiny external store so the companion and the studio
 * read the same snapshot (useSyncExternalStore).
 */

export const MOEI_KINDS = ['blob', 'cat', 'ghost', 'bird', 'frog', 'bear', 'penguin', 'axolotl', 'mushroom'] as const;
export type MoeiKind = (typeof MOEI_KINDS)[number];

export const MOEI_KIND_LABEL: Record<MoeiKind, string> = {
  blob: 'Blob',
  cat: 'Cat',
  ghost: 'Ghost',
  bird: 'Bird',
  frog: 'Frog',
  bear: 'Bear',
  penguin: 'Penguin',
  axolotl: 'Axolotl',
  mushroom: 'Mushroom',
};

/** In order round the colour wheel, so the picker reads as a spectrum; `pale` ones take a grey tick. */
export const MOEI_COLORS = [
  { id: 'pink', label: 'Pink', hex: '#FF9EBB' },
  { id: 'berry', label: 'Berry', hex: '#F06595' },
  { id: 'coral', label: 'Coral', hex: '#FF8787' },
  { id: 'peach', label: 'Peach', hex: '#FFC09F' },
  { id: 'orange', label: 'Orange', hex: '#FFA94D' },
  { id: 'yellow', label: 'Yellow', hex: '#FFD43B' },
  { id: 'lime', label: 'Lime', hex: '#A9E34B' },
  { id: 'green', label: 'Green', hex: '#69DB7C' },
  { id: 'mint', label: 'Mint', hex: '#63E6BE' },
  { id: 'aqua', label: 'Aqua', hex: '#66D9E8' },
  { id: 'blue', label: 'Blue', hex: '#74C0FC' },
  { id: 'purple', label: 'Purple', hex: '#B197FC' },
  { id: 'lilac', label: 'Lilac', hex: '#E5DBFF', pale: true },
  { id: 'cocoa', label: 'Cocoa', hex: '#C9A27E' },
  { id: 'cloud', label: 'Cloud', hex: '#DEE2E6', pale: true },
] as const;
export type MoeiColor = (typeof MOEI_COLORS)[number]['id'];

/** What it wears on its head. */
export const MOEI_ACCESSORIES = [
  'none',
  'cap',
  'bow',
  'crown',
  'headphones',
  'sprout',
  'party',
  'beanie',
  'flower',
  'halo',
  'wizard',
  'tophat',
  'bunny',
  'cherry',
  'chef',
] as const;
export type MoeiAccessory = (typeof MOEI_ACCESSORIES)[number];

export const MOEI_ACCESSORY_LABEL: Record<MoeiAccessory, string> = {
  none: 'None',
  cap: 'Cap',
  bow: 'Bow',
  crown: 'Crown',
  headphones: 'Headphones',
  sprout: 'Sprout',
  party: 'Party hat',
  beanie: 'Beanie',
  flower: 'Flower',
  halo: 'Halo',
  wizard: 'Wizard hat',
  tophat: 'Top hat',
  bunny: 'Bunny ears',
  cherry: 'Cherries',
  chef: 'Chef hat',
};

/** What it wears on its face. */
export const MOEI_FACES = [
  'none',
  'glasses',
  'shades',
  'monocle',
  'mask',
  'eyepatch',
  'moustache',
  'whiskers',
  'nose',
  'hearts',
  'freckles',
  'plaster',
  'stars',
  'sparkles',
  'blush',
  'sweat',
  'blep',
  'fangs',
] as const;
export type MoeiFace = (typeof MOEI_FACES)[number];

export const MOEI_FACE_LABEL: Record<MoeiFace, string> = {
  none: 'None',
  glasses: 'Glasses',
  shades: 'Sunglasses',
  monocle: 'Monocle',
  mask: 'Hero mask',
  eyepatch: 'Eye patch',
  moustache: 'Moustache',
  whiskers: 'Whiskers',
  nose: 'Clown nose',
  hearts: 'Heart eyes',
  freckles: 'Freckles',
  plaster: 'Plaster',
  stars: 'Star eyes',
  sparkles: 'Sparkles',
  blush: 'Blush',
  sweat: 'Sweat drop',
  blep: 'Tongue out',
  fangs: 'Fangs',
};

/** How quickly it follows the cursor about. */
export const MOEI_SPEEDS = ['chill', 'normal', 'zoomy'] as const;
export type MoeiSpeed = (typeof MOEI_SPEEDS)[number];

export const MOEI_SPEED_LABEL: Record<MoeiSpeed, string> = {
  chill: 'Chill',
  normal: 'Normal',
  zoomy: 'Zoomy',
};

/**
 * How it gets about on a computer: following the cursor, or on its own —
 * sitting on things on the page, wandering to another now and then, riding
 * along as the page scrolls, as it always does on a phone (no cursor there,
 * so a phone is always Auto).
 */
export const MOEI_MODES = ['follow', 'auto'] as const;
export type MoeiMode = (typeof MOEI_MODES)[number];

export const MOEI_MODE_LABEL: Record<MoeiMode, string> = {
  follow: 'Follow cursor',
  auto: 'Auto',
};

export type Moei = {
  /** Out following the cursor, or resting at home. */
  out: boolean;
  /** Ever made one (so the studio says "Adopt" the first time). */
  adopted: boolean;
  kind: MoeiKind;
  color: MoeiColor;
  accessory: MoeiAccessory;
  face: MoeiFace;
  name: string;
  speed: MoeiSpeed;
  mode: MoeiMode;
  /** Its name shown above it while it sits. */
  showName: boolean;
  /** Little chirps when it's clicked or tapped. */
  sound: boolean;
  /** Snacks so far: one each time something is saved to a collection. */
  fed: number;
};

const NAMES = ['Mochi', 'Pixel', 'Bean', 'Noodle', 'Pebble', 'Kiwi', 'Biscuit', 'Tofu', 'Sprinkle', 'Pip'];

const KEY = 'motvin-moei';
/** Where it was kept before moeis were renamed from "pals": moved over once. */
const OLD_KEY = 'motvin-pal';
/** The moei the studio starts from the first time: a mint blob with a flower, called Moei. */
export const DEFAULT_MOEI: Moei = {
  out: false,
  adopted: false,
  kind: 'blob',
  color: 'mint',
  accessory: 'flower',
  face: 'none',
  name: 'Moei',
  speed: 'normal',
  mode: 'follow',
  showName: true,
  sound: true,
  fed: 0,
};

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** A random look and name, for "Surprise me" (how it behaves stays as chosen). */
export function randomLook(): Pick<Moei, 'kind' | 'color' | 'accessory' | 'face' | 'name'> {
  return {
    kind: pick(MOEI_KINDS),
    color: pick(MOEI_COLORS).id,
    accessory: pick(MOEI_ACCESSORIES),
    face: pick(MOEI_FACES),
    name: pick(NAMES),
  };
}

export function moeiHex(color: MoeiColor): string {
  return MOEI_COLORS.find((c) => c.id === color)?.hex ?? MOEI_COLORS[0].hex;
}

function sanitize(raw: unknown): Moei {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<Moei>;
  return {
    out: Boolean(value.out),
    adopted: Boolean(value.adopted),
    kind: MOEI_KINDS.includes(value.kind as MoeiKind) ? (value.kind as MoeiKind) : DEFAULT_MOEI.kind,
    color: MOEI_COLORS.some((c) => c.id === value.color) ? (value.color as MoeiColor) : DEFAULT_MOEI.color,
    accessory: MOEI_ACCESSORIES.includes(value.accessory as MoeiAccessory) ? (value.accessory as MoeiAccessory) : DEFAULT_MOEI.accessory,
    face: MOEI_FACES.includes(value.face as MoeiFace) ? (value.face as MoeiFace) : DEFAULT_MOEI.face,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 16) : DEFAULT_MOEI.name,
    speed: MOEI_SPEEDS.includes(value.speed as MoeiSpeed) ? (value.speed as MoeiSpeed) : DEFAULT_MOEI.speed,
    // Saved before there was a choice: following the cursor, as it always did.
    mode: MOEI_MODES.includes(value.mode as MoeiMode) ? (value.mode as MoeiMode) : DEFAULT_MOEI.mode,
    // Saved before there was a choice: shown, as it always was.
    showName: typeof value.showName === 'boolean' ? value.showName : DEFAULT_MOEI.showName,
    sound: typeof value.sound === 'boolean' ? value.sound : DEFAULT_MOEI.sound,
    fed: Number.isFinite(value.fed) ? Math.max(0, Math.floor(value.fed as number)) : 0,
  };
}

let state: Moei = DEFAULT_MOEI;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const old = window.localStorage.getItem(OLD_KEY);
    if (old !== null) {
      if (window.localStorage.getItem(KEY) === null) window.localStorage.setItem(KEY, old);
      window.localStorage.removeItem(OLD_KEY);
    }
    state = sanitize(JSON.parse(window.localStorage.getItem(KEY) ?? 'null'));
  } catch {
    state = DEFAULT_MOEI;
  }
}

export const moeiStore = {
  subscribe(listener: () => void) {
    hydrate();
    listeners.add(listener);
    // Another tab changed the moei: follow it here too.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      hydrated = false;
      hydrate();
      listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  },
  getSnapshot(): Moei {
    hydrate();
    return state;
  },
  getServerSnapshot(): Moei {
    return DEFAULT_MOEI;
  },
  update(patch: Partial<Moei>) {
    hydrate();
    state = sanitize({ ...state, ...patch });
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable: the moei still works for this visit.
    }
    listeners.forEach((l) => l());
  },
};

/** Opens the moei studio from anywhere (the profile menu's "My moei"). */
export const MOEI_STUDIO_EVENT = 'motvin:moei-studio';
export function openMoeiStudio() {
  window.dispatchEvent(new Event(MOEI_STUDIO_EVENT));
}
