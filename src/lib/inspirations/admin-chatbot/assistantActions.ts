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

import { INDUSTRY_LABEL } from '../taxonomy';
import type { Industry } from '../types';

const industryLabel = (industry: string) => INDUSTRY_LABEL[industry as Industry] ?? industry;

export type AppFields = Partial<{ name: string; tagline: string; industry: string; website: string }>;

export type AdminOp =
  | { kind: 'remove-app'; appId: string; name: string }
  | { kind: 'rebuild' }
  | { kind: 'update-app'; appId: string; name: string; fields: AppFields }
  /** Needs an image: the one already dropped on the dock, or one picked on confirm. */
  | { kind: 'set-logo'; appId: string; name: string }
  | { kind: 'rename-screen'; platform: string; appId: string; file: string; version?: string; flow?: string; from: string; to: string }
  | { kind: 'delete-screen'; platform: string; appId: string; file: string; version?: string; flow?: string; name: string }
  | { kind: 'delete-screens'; platform: string; appId: string; name: string; screens: { file: string; version?: string; flow?: string; name: string }[] }
  | { kind: 'rename-flow'; flowId: string; from: string; to: string }
  | { kind: 'delete-flow'; flowId: string; name: string }
  | { kind: 'set-screen-type'; platform: string; appId: string; file: string; version?: string; flow?: string; name: string; screenType: string }
  | { kind: 'set-flow-category'; flowId: string; name: string; category: string }
  | { kind: 'set-screen-tags'; platform: string; appId: string; file: string; version?: string; flow?: string; name: string; tags: string[]; mode: 'add' | 'replace' }
  | { kind: 'set-screen-description'; platform: string; appId: string; file: string; version?: string; flow?: string; name: string; description: string }
  | { kind: 'add-to-flow'; flowId: string; flowName: string; screenIds: string[]; screenNames: string[] }
  | { kind: 'remove-from-flow'; flowId: string; flowName: string; screenIds: string[]; screenNames: string[] }
  | { kind: 'create-flow'; appId: string; appName: string; name: string; category: string; platform: string; screenIds: string[]; screenNames: string[] }
  /** The steps of a flow in a new order — every id the flow had, rearranged. */
  | { kind: 'reorder-flow'; flowId: string; name: string; screenIds: string[]; screenNames: string[] }
  /** An app record with no screens yet — the Apps tab's "Add an app" form. */
  | { kind: 'create-app'; id: string; name: string; industry: string }
  /** The sidecar fields the Screens tab edits that have no op of their own: when it was captured, its components, its style. */
  | { kind: 'set-screen-details'; platform: string; appId: string; file: string; version?: string; flow?: string; name: string; capturedAt?: string; elements?: string[]; style?: string[] }
  /** A dropped recording, every question answered — the run starts on Confirm. The file itself is held by the dock. */
  | { kind: 'start-ingest'; fileName: string; platform: 'ios' | 'android' | 'web'; appId?: string; appName?: string; version?: string; versionLabel?: string; startedBy: string }
  /** Dropped screenshots, every question answered — uploaded on Confirm, creating the app first when it is new. */
  | { kind: 'upload-screens'; count: number; platform: 'ios' | 'android' | 'web'; appId: string; appName: string; version: string; versionLabel: string; newApp?: { id: string; name: string; industry?: string } }
  | { kind: 'set-flow-parent'; flowId: string; name: string; parentId: string | null; parentName: string | null }
  | { kind: 'set-source-status'; appId: string; name: string; status: 'pending' | 'review' | 'approved' | 'rejected' }
  | { kind: 'delete-app-version'; appId: string; name: string; versionId: string; versionLabel: string; screens: number }
  /** The same rename the Apps tab's "Edit date" does: the version folder, its analysis and flow ids all move. */
  | { kind: 'rename-app-version'; appId: string; name: string; versionId: string; versionLabel: string; newVersionId: string; newVersionLabel: string }
  | { kind: 'stop-run'; jobId: string; title: string }
  | { kind: 'research-app'; appId: string; name: string }
  | { kind: 'set-ai'; chatModel?: string | null; enabled?: boolean }
  /** Needs an image, like set-logo: it becomes a screen of the app, in the version named (else the newest). */
  | { kind: 'add-screen'; appId: string; name: string; platform: string; versionId?: string; versionLabel?: string };

export type AssistantAction =
  | { type: 'upload' }
  | { type: 'open'; href: string; label: string }
  | { type: 'confirm'; op: AdminOp; label: string; destructive: boolean }
  /** A suggested next message, shown as a chip; pressing it sends it. */
  | { type: 'reply'; text: string }
  /** The admin backed out: whatever was waiting for Confirm is dropped. */
  | { type: 'cancel' }
  /** Screens shown as thumbnails to pick from — to delete, or just to see. */
  | { type: 'screens'; appId: string; appName: string; platform: string; versionId?: string; versionLabel?: string; screens: ShownScreen[] };

export type ShownScreen = { id: string; name: string; path: string; file: string; version?: string; flow?: string };
export type ScreensAction = Extract<AssistantAction, { type: 'screens' }>;

export type ConfirmAction = Extract<AssistantAction, { type: 'confirm' }>;

/** Which operations remove something for good. */
export function isDestructive(op: AdminOp): boolean {
  return op.kind === 'remove-app' || op.kind === 'delete-screen' || op.kind === 'delete-screens' || op.kind === 'delete-flow' || op.kind === 'stop-run' || op.kind === 'delete-app-version';
}

const list = (names: string[]) => (names.length <= 3 ? names.map((name) => `“${name}”`).join(', ') : `${names.length} screens`);

const PLATFORM_NAME: Record<string, string> = { ios: 'iOS', android: 'Android', web: 'Web' };
const platformName = (id: string) => PLATFORM_NAME[id] ?? id;

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
    case 'delete-screens':
      return `Delete ${op.screens.length} screen${op.screens.length === 1 ? '' : 's'} from ${op.name}`;
    case 'rename-flow':
      return `Rename flow to “${op.to}”`;
    case 'delete-flow':
      return `Delete flow “${op.name}”`;
    case 'set-screen-type':
      return `Type “${op.name}” as ${op.screenType}`;
    case 'set-flow-category':
      return `File “${op.name}” under ${op.category}`;
    case 'set-screen-tags':
      return `${op.mode === 'add' ? 'Tag' : 'Retag'} “${op.name}”`;
    case 'set-screen-description':
      return `Describe “${op.name}”`;
    case 'add-to-flow':
      return `Add ${list(op.screenNames)} to “${op.flowName}”`;
    case 'remove-from-flow':
      return `Remove ${list(op.screenNames)} from “${op.flowName}”`;
    case 'create-flow':
      return `Create flow “${op.name}”`;
    case 'reorder-flow':
      return `Reorder “${op.name}”`;
    case 'create-app':
      return `Create ${op.name}${op.industry && op.industry !== 'unsorted' ? ` as ${industryLabel(op.industry)}` : ' (category still needed)'}`;
    case 'set-screen-details':
      return `Update “${op.name}”’s details`;
    case 'start-ingest':
      return `Start the run on “${op.fileName}”`;
    case 'upload-screens':
      return `Upload ${op.count} screenshot${op.count === 1 ? '' : 's'} to ${op.appName}`;
    case 'set-flow-parent':
      return op.parentName ? `Nest “${op.name}” under “${op.parentName}”` : `Make “${op.name}” top-level`;
    case 'set-source-status':
      return `Mark ${op.name} as ${op.status}`;
    case 'delete-app-version':
      return `Delete ${op.name}’s ${op.versionLabel} version`;
    case 'rename-app-version':
      return `Move ${op.name}’s ${op.versionLabel} version to ${op.newVersionLabel}`;
    case 'stop-run':
      return `Stop “${op.title}”`;
    case 'research-app':
      return `Rewrite ${op.name}’s names with AI`;
    case 'set-ai':
      return op.enabled === false ? 'Turn the AI off' : op.enabled === true && !op.chatModel ? 'Turn the AI on' : `Use ${op.chatModel} for chat`;
    case 'add-screen':
      return `Add the image as a ${op.name} screen${op.versionLabel ? ` (${op.versionLabel})` : ''}`;
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
    case 'delete-screens':
      return `Delete ${list(op.screens.map((screen) => screen.name))} from ${op.name}? The images and their data are removed for good.`;
    case 'rename-flow':
      return `Rename the flow “${op.from}” to “${op.to}”?`;
    case 'delete-flow':
      return `Delete the flow “${op.name}”? Its screens stay in the library; only the grouping goes.`;
    case 'set-screen-type':
      return `Mark the screen “${op.name}” as a ${op.screenType.replace(/_/g, ' ')} screen?`;
    case 'set-flow-category':
      return `File the flow “${op.name}” under ${op.category}?`;
    case 'set-screen-tags':
      return op.mode === 'add' ? `Add the tag${op.tags.length === 1 ? '' : 's'} ${op.tags.map((tag) => `“${tag}”`).join(', ')} to the screen “${op.name}”?` : `Replace the tags on “${op.name}” with ${op.tags.map((tag) => `“${tag}”`).join(', ')}?`;
    case 'set-screen-description':
      return `Set the description of “${op.name}” to “${op.description}”?`;
    case 'add-to-flow':
      return `Add ${list(op.screenNames)} to the flow “${op.flowName}”?`;
    case 'remove-from-flow':
      return `Take ${list(op.screenNames)} out of the flow “${op.flowName}”? The screens stay in the library.`;
    case 'create-flow':
      return `Create a new flow “${op.name}” in ${op.appName}${op.screenNames.length ? ` with ${list(op.screenNames)}` : ', empty for now'}, filed under ${op.category}?`;
    case 'reorder-flow':
      return `Reorder the flow “${op.name}” to: ${op.screenNames.map((name, index) => `${index + 1}. ${name}`).join(', ')}?`;
    case 'create-app':
      return `Create ${op.name} as a new app (id “${op.id}”, industry ${op.industry}) with no screens yet? You can add screens to it afterwards — drop screenshots or a recording here.`;
    case 'set-screen-details': {
      const parts = [
        op.capturedAt ? `captured date to ${op.capturedAt}` : null,
        op.elements ? `components to ${op.elements.map((entry) => `“${entry}”`).join(', ')}` : null,
        op.style ? `style to ${op.style.map((entry) => `“${entry}”`).join(', ')}` : null,
      ].filter(Boolean);
      return `Set “${op.name}”’s ${parts.join(' and ')}?`;
    }
    case 'start-ingest':
      return `Start a run on “${op.fileName}” (${platformName(op.platform)})${op.appName ? `, adding to ${op.appName}${op.versionLabel ? ` — ${op.versionLabel}` : ''}` : ', as a new app'}? The screens go live in a minute or two; the AI names them after that.`;
    case 'upload-screens':
      return `Upload ${op.count} screenshot${op.count === 1 ? '' : 's'} to ${op.appName} (${platformName(op.platform)}, ${op.versionLabel})${op.newApp ? ` — ${op.appName} is created first` : ''}? Each screen’s type is read from its file name; you can retype any afterwards.`;
    case 'set-flow-parent':
      return op.parentName ? `Nest the flow “${op.name}” under “${op.parentName}”?` : `Make the flow “${op.name}” a top-level section?`;
    case 'set-source-status':
      return `Mark ${op.name}’s source record as ${op.status}?${op.status === 'approved' ? ' Approved apps are published.' : op.status === 'rejected' ? ' Rejected apps are held back from the public library.' : ''}`;
    case 'delete-app-version':
      return `Delete ${op.name}’s ${op.versionLabel} version? Its ${op.screens} screen${op.screens === 1 ? '' : 's'} are removed for good.`;
    case 'rename-app-version':
      return `Change the date of ${op.name}’s ${op.versionLabel} version to ${op.newVersionLabel}? Its screens stay exactly as they are — only the version’s date moves, and whichever version is newest is the one shown as “Latest”.`;
    case 'stop-run':
      return `Stop the run “${op.title}”? Screens it has already published stay; the rest of the run is abandoned.`;
    case 'research-app':
      return `Have the AI rewrite ${op.name}’s flow and screen names from the stored screens? It takes a few minutes and runs as a job you can watch here.`;
    case 'set-ai':
      return op.enabled === false ? 'Turn the AI off? Names will come from the on-device rules until it is turned on again.' : op.enabled === true && !op.chatModel ? 'Turn the AI back on?' : `Use ${op.chatModel} for the chat and journey names?`;
    case 'add-screen':
      return `Add the dropped image to ${op.name} as a new ${op.platform} screen${op.versionLabel ? ` in its ${op.versionLabel} version` : ''}?`;
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
    case 'delete-screens':
      return `Deleted ${op.screens.length} screen${op.screens.length === 1 ? '' : 's'} from ${op.name}.`;
    case 'rename-flow':
      return `The flow is now called “${op.to}”.`;
    case 'delete-flow':
      return `Deleted the flow “${op.name}”.`;
    case 'set-screen-type':
      return `“${op.name}” is now typed as ${op.screenType.replace(/_/g, ' ')}.`;
    case 'set-flow-category':
      return `“${op.name}” is now filed under ${op.category}.`;
    case 'set-screen-tags':
      return `“${op.name}” is tagged ${op.tags.map((tag) => `“${tag}”`).join(', ')}.`;
    case 'set-screen-description':
      return `“${op.name}” has its new description.`;
    case 'add-to-flow':
      return `Added ${list(op.screenNames)} to “${op.flowName}”.`;
    case 'remove-from-flow':
      return `Took ${list(op.screenNames)} out of “${op.flowName}”.`;
    case 'create-flow':
      return `Created the flow “${op.name}”${op.screenNames.length ? ` with ${list(op.screenNames)}` : ''}.`;
    case 'reorder-flow':
      return `“${op.name}” is reordered: ${op.screenNames.join(' → ')}.`;
    case 'create-app':
      return `${op.name} is in the library, with no screens yet.`;
    case 'set-screen-details':
      return `“${op.name}”’s details are updated.`;
    case 'start-ingest':
      return `Started on “${op.fileName}” — watch it above.`;
    case 'upload-screens':
      return `Uploaded ${op.count} screenshot${op.count === 1 ? '' : 's'} to ${op.appName}.`;
    case 'set-flow-parent':
      return op.parentName ? `“${op.name}” now sits under “${op.parentName}”.` : `“${op.name}” is now a top-level section.`;
    case 'set-source-status':
      return `${op.name} is marked ${op.status}, and the index rebuilt.`;
    case 'delete-app-version':
      return `Deleted ${op.name}’s ${op.versionLabel} version.`;
    case 'rename-app-version':
      return `${op.name}’s ${op.versionLabel} version is now dated ${op.newVersionLabel}.`;
    case 'stop-run':
      return `Stopped “${op.title}”.`;
    case 'research-app':
      return `Started rewriting ${op.name}’s names — watch it above.`;
    case 'set-ai':
      return op.enabled === false ? 'The AI is off.' : op.chatModel ? `${op.chatModel} now handles the chat and journey names.` : 'The AI is on.';
    case 'add-screen':
      return `The screen is added to ${op.name}.`;
  }
}

/**
 * What the assistant has asked the admin to type next. While this is set,
 * the next message is taken as that value, word for word — the way a person
 * who was just asked "what should it say?" expects to be understood.
 */
export type Expect = { kind: 'update-app'; appId: string; app: string; field: 'tagline' | 'name' | 'website' };
