/**
 * Whether this page runs on the admin's own computer, where the library's
 * working tools live: the crawler and Claude (Agent Upload, Protect screens,
 * reviews) and the backend's data folder on disk. On motvin.com none of them
 * exist, and edits to apps, screens and flows would be erased by the next
 * deploy (it rebuilds the data folder from git), so those tools stay local.
 *
 * Client-side only: on the server it answers for the development build alone.
 */
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost)$/;

export function hasLocalTools(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  return typeof window !== 'undefined' && LOCAL_HOSTS.test(window.location.hostname);
}
