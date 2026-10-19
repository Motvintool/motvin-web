/**
 * Focuses a dialog's control (its Close) as the dialog opens, so the keyboard
 * and screen readers start inside it — with its focus ring only when the
 * visitor is on the keyboard (whatever had focus before was showing one, as
 * a card opened with Enter), not after a click, a tap or a fresh page load,
 * where browsers otherwise ring a control the visitor never went to.
 */
export function focusOnOpen(el: HTMLElement | null | undefined) {
  if (!el) return;
  const before = document.activeElement;
  const keyboard = before instanceof HTMLElement && before !== el && before.matches(':focus-visible');
  // On its second call (the loaded dialog's own Close replacing the placeholder's) it keeps what the first showed.
  const again = before === el || (before instanceof HTMLElement && before.closest('[role="dialog"]') !== null);
  const visible = again ? before instanceof HTMLElement && before.matches(':focus-visible') : keyboard;
  // `focusVisible` (Chrome, Firefox) isn't in TypeScript's DOM types yet.
  el.focus({ preventScroll: true, focusVisible: visible } as FocusOptions);
}
