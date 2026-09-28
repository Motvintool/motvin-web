/**
 * What the assistant can do to the library, as data.
 *
 * The assistant never changes anything on its own. It turns a request into
 * one of these operations, describes it in a sentence, and the dock shows
 * that sentence with a Confirm button. Only the press (or a typed yes) runs
 * it — through the same admin API the admin tabs use, as the signed-in
 * admin. Shared by the server, which resolves requests into operations, and
 * the client, which performs them.
 */

export type AppFields = Partial<{ name: string; tagline: string; industry: string; website: string }>;

export type AdminOp =
  | { kind: 'remove-app'; appId: string; name: string }
  | { kind: 'rebuild' }
  | { kind: 'update-app'; appId: string; name: string; fields: AppFields }
  /** Needs an image: the one already dropped on the dock, or one picked on confirm. */
  | { kind: 'set-logo'; appId: string; name: string }
  | { kind: 'rename-screen'; platform: string; appId: string; file: string; from: string; to: string }
  | { kind: 'delete-screen'; platform: string; appId: string; file: string; name: string }
  | { kind: 'rename-flow'; flowId: string; from: string; to: string }
  | { kind: 'delete-flow'; flowId: string; name: string };

export type AssistantAction =
  | { type: 'upload' }
  | { type: 'open'; href: string; label: string }
  | { type: 'confirm'; op: AdminOp; label: string; destructive: boolean };

export type ConfirmAction = Extract<AssistantAction, { type: 'confirm' }>;

/** Which operations remove something for good. */
export function isDestructive(op: AdminOp): boolean {
  return op.kind === 'remove-app' || op.kind === 'delete-screen' || op.kind === 'delete-flow';
}

/** The button text for an operation. */
export function labelFor(op: AdminOp): string {
  switch (op.kind) {
    case 'remove-app':
      return `Remove ${op.name}`;
    case 'rebuild':
      return 'Rebuild index';
    case 'update-app': {
      const keys = Object.keys(op.fields);
      return keys.length === 1 ? `Change ${op.name}’s ${keys[0]}` : `Update ${op.name}`;
    }
    case 'set-logo':
      return `Set ${op.name}’s logo`;
    case 'rename-screen':
      return `Rename screen to “${op.to}”`;
    case 'delete-screen':
      return `Delete screen “${op.name}”`;
    case 'rename-flow':
      return `Rename flow to “${op.to}”`;
    case 'delete-flow':
      return `Delete flow “${op.name}”`;
  }
}

/** The question the assistant asks before doing it. */
export function describeOp(op: AdminOp, extra: { screens?: number; flows?: number } = {}): string {
  switch (op.kind) {
    case 'remove-app':
      return `Remove ${op.name} from the library? That deletes its ${extra.screens ?? 0} screen${extra.screens === 1 ? '' : 's'} and ${extra.flows ?? 0} flow${extra.flows === 1 ? '' : 's'} and cannot be undone.`;
    case 'rebuild':
      return 'Rebuild the library index now? It takes a few seconds and republishes what is in the store.';
    case 'update-app': {
      const parts = Object.entries(op.fields).map(([key, value]) => `${key} to “${value}”`);
      return `Change ${op.name}’s ${parts.join(' and ')}?`;
    }
    case 'set-logo':
      return `Set the image as ${op.name}’s logo? It replaces the current one everywhere the app is shown.`;
    case 'rename-screen':
      return `Rename the screen “${op.from}” to “${op.to}”?`;
    case 'delete-screen':
      return `Delete the screen “${op.name}” from ${op.appId}? The image and its data are removed for good.`;
    case 'rename-flow':
      return `Rename the flow “${op.from}” to “${op.to}”?`;
    case 'delete-flow':
      return `Delete the flow “${op.name}”? Its screens stay in the library; only the grouping goes.`;
  }
}

/** What the assistant says once it is done. */
export function doneText(op: AdminOp, result: { screens?: number; flows?: number } = {}): string {
  switch (op.kind) {
    case 'remove-app':
      return `Removed ${op.name}: ${result.screens ?? 0} screen${result.screens === 1 ? '' : 's'} and ${result.flows ?? 0} flow${result.flows === 1 ? '' : 's'} deleted, and the index rebuilt.`;
    case 'rebuild':
      return 'Index rebuilt.';
    case 'update-app':
      return `Updated ${op.name}: ${Object.entries(op.fields)
        .map(([key, value]) => `${key} is now “${value}”`)
        .join(', ')}.`;
    case 'set-logo':
      return `${op.name}’s logo is updated.`;
    case 'rename-screen':
      return `The screen is now called “${op.to}”.`;
    case 'delete-screen':
      return `Deleted the screen “${op.name}”.`;
    case 'rename-flow':
      return `The flow is now called “${op.to}”.`;
    case 'delete-flow':
      return `Deleted the flow “${op.name}”.`;
  }
}
