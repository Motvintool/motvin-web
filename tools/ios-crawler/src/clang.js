/**
 * Compiles one of the small Objective-C helpers (frames.m, ocr.m) with clang.
 *
 * The default SDK is tried first. A software update can leave the Command Line
 * Tools with a default SDK newer than their own linker understands; the link
 * then fails with "tapi error: malformed file … unknown architecture". When
 * that happens the build is retried against each other installed macOS SDK,
 * newest first, until one links.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { run } from './exec.js';

const SDK_DIRS = [
  '/Library/Developer/CommandLineTools/SDKs',
  '/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs',
];

/** A link failure caused by an SDK the toolchain can't read, rather than by the code. */
function isSdkMismatch(stderr) {
  return /tapi error|malformed file|unknown architecture/i.test(stderr);
}

function versionOf(name) {
  const m = /^MacOSX(\d+)(?:\.(\d+))?\.sdk$/.exec(name);
  return m ? Number(m[1]) + Number(m[2] || 0) / 100 : null;
}

/** Versioned macOS SDKs on this Mac, newest first. */
function installedSdks() {
  const sdks = [];
  for (const dir of SDK_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const version = versionOf(name);
      if (version != null) sdks.push({ path: join(dir, name), version });
    }
  }
  return sdks.sort((a, b) => b.version - a.version);
}

/**
 * @param {{source: string, binary: string, frameworks: string[], timeout?: number}} opts
 * @returns {Promise<{failed: boolean, stderr: string, sdk: string | null}>}
 */
export async function compileHelper({ source, binary, frameworks, timeout = 120_000 }) {
  const base = [
    '-fobjc-arc',
    '-O2',
    // kUTTypePNG is formally deprecated in favour of UniformTypeIdentifiers,
    // but still the portable spelling across the SDK versions this has to
    // build against. The warning is noise, not a signal.
    '-Wno-deprecated-declarations',
    ...frameworks.flatMap((framework) => ['-framework', framework]),
    '-o',
    binary,
    source,
  ];
  const first = await run('clang', base, { timeout });
  if (!first.failed || !isSdkMismatch(first.stderr)) return { ...first, sdk: null };

  for (const sdk of installedSdks()) {
    const retry = await run('clang', ['-isysroot', sdk.path, ...base], { timeout });
    if (!retry.failed) return { ...retry, sdk: sdk.path };
  }
  return { ...first, sdk: null };
}
