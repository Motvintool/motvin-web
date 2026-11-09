/**
 * The colours the Palette filter offers, and which one an app's brand colour (read off its logo, "rgb(r, g, b)"
 * — useLogoTint) falls in. A colourless mark (black, white, grey, or no colour read) is "mono".
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
