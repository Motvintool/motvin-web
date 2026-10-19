/** How long the clipboard may take to answer before the copy counts as failed. */
const CLIPBOARD_WAIT_MS = 1500;

/**
 * Copies text from a tap or click, and says whether it worked.
 *
 * It copies inside the tap itself first (a hidden field's text, the
 * browser's own copy), which works where the async clipboard is refused or
 * left waiting on a permission that never comes (an in-app or embedded
 * browser, a phone's web view). Failing that, the async clipboard, given a
 * moment and no longer: a copy that never answers would leave the tap with
 * no feedback at all.
 */
export async function copyText(text: string): Promise<boolean> {
  if (copyInTap(text)) return true;
  if (!navigator.clipboard?.writeText) return false;
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Clipboard timed out')), CLIPBOARD_WAIT_MS)),
    ]);
    return true;
  } catch {
    return false;
  }
}

function copyInTap(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  // Read-only and out of sight: no keyboard on a phone, no scroll to it.
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.appendChild(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  field.remove();
  // Focus goes back to what was pressed (a sheet keeps its place for the keyboard).
  back?.focus({ preventScroll: true });
  return copied;
}
