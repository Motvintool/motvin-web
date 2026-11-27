/**
 * The colour filter: an app's brand colour, read off its logo, and which of
 * nine colours it falls in.
 *
 * The same rules as motvin.com's colour filter — PALETTE_HUES and hueOf from
 * motvin-web src/lib/inspirations/hues.ts, colourOf from
 * src/components/inspirations/useLogoTint.ts — so an app is "blue" in the
 * plugin exactly when it is blue on the website. Change them together.
 */

export const PALETTE_HUES = [
  { id: 'red', label: 'Red', swatch: '#e5484d' },
  { id: 'orange', label: 'Orange', swatch: '#f76b15' },
  { id: 'yellow', label: 'Yellow', swatch: '#f5c518' },
  { id: 'green', label: 'Green', swatch: '#30a46c' },
  { id: 'teal', label: 'Teal', swatch: '#12a594' },
  { id: 'blue', label: 'Blue', swatch: '#0090ff' },
  { id: 'purple', label: 'Purple', swatch: '#8e4ec6' },
  { id: 'pink', label: 'Pink', swatch: '#e93d82' },
  { id: 'mono', label: 'Black & white', swatch: '#1c1c1e' },
] as const;

export type PaletteHue = (typeof PALETTE_HUES)[number]['id'];

export const RAINBOW = 'conic-gradient(#e5484d, #f76b15, #f5c518, #30a46c, #12a594, #0090ff, #8e4ec6, #e93d82, #e5484d)';

export function hueOf(rgb: string | null | undefined): PaletteHue {
  const m = rgb?.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return 'mono';
  const [r, g, b] = [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.18 || l < 0.12 || l > 0.94) return 'mono';
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 345) return 'red';
  if (h < 40) return 'orange';
  if (h < 65) return 'yellow';
  if (h < 160) return 'green';
  if (h < 195) return 'teal';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

/** A typed hex colour ("#0090FF", "0090ff") as the "rgb(r, g, b)" hueOf reads; null if it is not one. */
export function hexToRgb(value: string): string | null {
  const hex = value.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
}

/** The logo's strongly coloured pixels, averaged; null for a black, white or grey mark. */
function colourOf(image: HTMLImageElement): string | null {
  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    // Coloured enough, and neither near-white nor near-black.
    if (max - min < 60 || max < 60 || min > 235) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  }
  // A mark with only a sliver of colour (a small dot on black) is treated as colourless.
  if (n < size * size * 0.06) return null;
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}

const read = new Map<string, Promise<PaletteHue>>();

/** Which colour a logo is, read once per logo while the panel is open. A logo that fails to load counts as black & white. */
export function logoHue(src: string): Promise<PaletteHue> {
  let hue = read.get(src);
  if (!hue) {
    hue = new Promise<PaletteHue>((resolve) => {
      const image = new Image();
      // The API sends the logo with CORS headers, so the canvas can read its pixels.
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        try {
          resolve(hueOf(colourOf(image)));
        } catch {
          resolve('mono');
        }
      };
      image.onerror = () => resolve('mono');
      image.src = src;
    });
    read.set(src, hue);
  }
  return hue;
}
