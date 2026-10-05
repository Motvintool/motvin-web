/**
 * The line above the guide's heading: a greeting for the time of day, followed
 * by the visitor's name when they are signed in — the same name the account
 * menu shows — and just the greeting when they are not.
 */
export function greetingFor(hour: number, displayName?: string | null): string {
  const period = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = (displayName ?? '').replace(/\s+/g, ' ').trim();
  return name ? `${period}, ${name}` : period;
}
