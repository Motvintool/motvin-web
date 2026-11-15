/** Console output. One place so a run reads as a single narrative. */

import { appendFileSync } from 'node:fs';

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (COLOR ? `[${code}m${text}[0m` : text);

const dim = (t) => paint(2, t);
const bold = (t) => paint(1, t);
const red = (t) => paint(31, t);
const green = (t) => paint(32, t);
const yellow = (t) => paint(33, t);
const blue = (t) => paint(34, t);

let logFile = null;
let verbose = false;

export function configureLog(options = {}) {
  if (options.file) logFile = options.file;
  if (typeof options.verbose === 'boolean') verbose = options.verbose;
}

function write(line) {
  process.stdout.write(`${line}\n`);
  if (logFile) {
    try {
      appendFileSync(logFile, `${new Date().toISOString()} ${stripAnsi(line)}\n`);
    } catch {
      // A missing run directory must never take the crawl down with it.
    }
  }
}

function stripAnsi(text) {
  return text.replace(/\[[0-9;]*m/g, '');
}

export const log = {
  step: (message) => write(`${blue('›')} ${message}`),
  info: (message) => write(`  ${message}`),
  detail: (message) => write(dim(`  ${message}`)),
  ok: (message) => write(`${green('✓')} ${message}`),
  warn: (message) => write(`${yellow('!')} ${message}`),
  error: (message) => write(`${red('✗')} ${message}`),
  blocked: (message) => write(`${yellow('⊘')} ${message}`),
  heading: (message) => write(`\n${bold(message)}`),
  debug: (message) => {
    if (verbose) write(dim(`    ${message}`));
  },
  raw: write,
};

export { bold, dim, green, red, yellow };
