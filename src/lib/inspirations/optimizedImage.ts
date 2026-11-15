import { getImageProps } from 'next/image';

/**
 * A library picture resized by Next's image optimizer to the width it is shown
 * at, with a 2x version for sharp screens. Use the result on a plain <img>:
 * `<img src={o.src} srcSet={o.srcSet} />`. The picture's own aspect ratio is
 * kept; `width` is the CSS width it is displayed at.
 */
/**
 * The two sizes the landing page asks for. Using just these (rather than
 * each spot's exact width) means a picture shown in several places is
 * downloaded once per size, not once per spot.
 */
export const IMAGE_SIZE = {
  /** Small previews: thumbnails, mini phones, board shots. */
  small: 128,
  /** Cards: gallery screens, feature-card phones. */
  card: 288,
} as const;

export function optimizedImage(src: string, width: number): { src: string; srcSet?: string } {
  const { props } = getImageProps({ src, alt: '', width, height: width, quality: 75 });
  return { src: props.src, srcSet: props.srcSet };
}
