import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { build } from 'esbuild';

// The panel's hand-written SHA-256 must agree with Node's, or pairing would never match the backend.
test('sha256Hex matches node:crypto', async () => {
  const out = await build({ entryPoints: ['src/ui/sha256.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
  const { sha256Hex } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
  for (const input of ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'é漢字', randomBytes(32).toString('hex')]) {
    assert.equal(sha256Hex(input), createHash('sha256').update(input).digest('hex'), JSON.stringify(input));
  }
});
