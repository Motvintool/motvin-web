import { barPixels, PART_HEIGHT, type Screen } from '../shared';
import { asset } from './api';
import mark from '../watermark.svg';

/**
 * Prints motvin.com's watermark bar into a screen's image, as the website does on downloads
 * (lib/inspirations/watermark.ts): a dark strip under the screenshot with the app's logo and name on the left and
 * the Motvin mark on the right. It is part of the picture, not separate layers that can be deleted.
 *
 * The bar joins the last image part when it fits under Figma's 4096px image limit; otherwise it becomes one extra
 * part. code.ts works out the same split from the part count (see screenFrame).
 */
export async function withWatermark(screen: Screen, parts: Uint8Array[]): Promise<Uint8Array[]> {
  const { width, height } = screen.image;
  const bar = barPixels(width, height);
  let strip = await drawBar(width, bar, screen.app.name, screen.app.logo);
  // A logo served without CORS taints the canvas and it could not be exported: draw the bar without the logo.
  if (strip && tainted(strip)) strip = await drawBar(width, bar, screen.app.name, null);
  if (!strip) return parts;

  const lastIndex = parts.length - 1;
  const lastHeight = height - lastIndex * PART_HEIGHT;
  if (lastHeight + bar > PART_HEIGHT) return [...parts, await toPng(strip)];

  const last = await loadImage(URL.createObjectURL(new Blob([parts[lastIndex] as BlobPart])));
  if (!last) return [...parts, await toPng(strip)];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = lastHeight + bar;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(last, 0, 0, width, lastHeight);
  ctx.drawImage(strip, 0, lastHeight);
  return [...parts.slice(0, lastIndex), await toPng(canvas)];
}

/** The bar on its own, at the screenshot's pixel width. Null if the canvas cannot be used. */
async function drawBar(width: number, barHeight: number, appName: string, logo: string | null): Promise<HTMLCanvasElement | null> {
  const S = barHeight / 28;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = barHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#2f2f2f';
  ctx.fillRect(0, 0, width, barHeight);

  const [brand, appImage] = await Promise.all([
    loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(mark)}`),
    logo ? loadImage(asset(logo)) : Promise.resolve(null),
  ]);

  let left = 8 * S;
  if (appImage) {
    const size = 14 * S;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, left, 7 * S, size, size, 4 * S);
    ctx.clip();
    ctx.drawImage(appImage, left, 7 * S, size, size);
    ctx.restore();
    left += size + 4 * S;
  }
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${8 * S}px Inter, -apple-system, system-ui, sans-serif`;
  ctx.fillText(appName, left, barHeight / 2 + 0.5 * S);

  if (brand) {
    const brandWidth = 64 * S;
    const brandHeight = (brandWidth * brand.height) / brand.width;
    ctx.drawImage(brand, width - 8 * S - brandWidth, (barHeight - brandHeight) / 2, brandWidth, brandHeight);
  }
  return canvas;
}

function tainted(canvas: HTMLCanvasElement): boolean {
  try {
    canvas.getContext('2d')!.getImageData(0, 0, 1, 1);
    return false;
  } catch {
    return true;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function toPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Could not prepare the screen image.'));
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, 'image/png');
  });
}
