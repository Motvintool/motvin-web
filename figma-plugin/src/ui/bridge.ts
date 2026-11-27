import type { ToMain, ToUi } from '../shared';

/** Messages between the panel and the plugin's main code (src/code.ts). */

export function toMain(message: ToMain) {
  parent.postMessage({ pluginMessage: message }, '*');
}

type Listener = (message: ToUi) => void;
const listeners = new Set<Listener>();

window.addEventListener('message', (event) => {
  const message = (event.data as { pluginMessage?: ToUi } | null)?.pluginMessage;
  if (message) for (const listener of listeners) listener(message);
});

export function onMain(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Sends screens to the canvas and resolves when they are placed (with how many), or rejects with the reason. */
export function place(message: Extract<ToMain, { type: 'place-screens' | 'place-flow' }>): Promise<number> {
  return new Promise((resolve, reject) => {
    const stop = onMain((reply) => {
      if (reply.type === 'placed') {
        stop();
        resolve(reply.count);
      } else if (reply.type === 'place-failed') {
        stop();
        reject(new Error(reply.message));
      }
    });
    toMain(message);
  });
}
