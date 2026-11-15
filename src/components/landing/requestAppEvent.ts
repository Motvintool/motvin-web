/**
 * Asks the landing navbar to run "Request apps": the request form over the
 * page for a first-time visitor, or the Requests page for anyone who already
 * has requests (Navbar's requestApp). Lets other parts of the page, such as
 * the features grid's card, share that one behaviour.
 */
export const REQUEST_APP_EVENT = 'motvin:request-app';

export function requestApp(): void {
  window.dispatchEvent(new Event(REQUEST_APP_EVENT));
}
