/**
 * How a screen's stored path encodes its version and its flow folder —
 * shared by every place that has to go from a manifest/admin `file` string
 * to the bare name + version + flow the backend's per-file routes take, or
 * back. No imports, so both client components and server-only modules (the
 * assistant) can use it freely.
 */

export const VERSIONS_DIR_NAME = 'versions';

/** The path a screen travels under in `AdminScreenFile.file` / the manifest's
 * `screen.file` when it sits in a dated version folder: `versions/<id>/<rest>`.
 * A legacy (unversioned) screen's `file` has no such prefix. */
export function qualifyScreenFile(rest: string, version?: string | null): string {
  return version ? `${VERSIONS_DIR_NAME}/${version}/${rest}` : rest;
}

/**
 * Strips a stored `file`'s version prefix, leaving whatever sits under it —
 * a bare name, or `<flow>/<name>` when the screen is inside a flow folder.
 * The inverse of `qualifyScreenFile`. Only strips the prefix when `file`
 * actually starts with it, so a legacy screen (whose `version` is a
 * synthetic id, not a real folder) is left untouched.
 */
function stripVersion(file: string, version: string): string {
  const prefix = qualifyScreenFile('', version);
  return version && file.startsWith(prefix) ? file.slice(prefix.length) : file;
}

/** `<flow>/<name>` → `{ flow, name }`; a bare name has no flow. Never more
 * than one level deep — the store's own shape (manifest.builder.ts /
 * publish.js) guarantees that, so a plain index-of-first-slash is enough. */
function splitFlow(rest: string): { flow?: string; name: string } {
  const slash = rest.indexOf('/');
  return slash === -1 ? { name: rest } : { flow: rest.slice(0, slash), name: rest.slice(slash + 1) };
}

/** The inverse of `splitFlow`. */
export function qualifyFlowFile(name: string, flow?: string | null): string {
  return flow ? `${flow}/${name}` : name;
}

/**
 * Splits a stored `file` all the way down to what the backend's per-file
 * routes actually take: a bare file name, plus the version and flow to send
 * alongside as separate query parameters. Neither a version folder nor a
 * flow folder is ever allowed to travel as a literal `/` inside the route's
 * `:file` segment — a browser encodes that as `%2F`, which Fastify decodes
 * back into a real slash before the backend ever sees it, and the backend
 * refuses any file name containing one (rightly — that same rule is what
 * stops a path-traversal attempt). Splitting here, once, is what makes every
 * caller (the admin screens list, the per-version manager, the assistant)
 * address a flow-folder screen the same, working way.
 */
export function splitScreenFile(file: string, version: string): { name: string; version?: string; flow?: string } {
  const rest = stripVersion(file, version);
  const versionOut = version && rest !== file ? version : undefined;
  const { flow, name } = splitFlow(rest);
  return { name, version: versionOut, flow };
}
