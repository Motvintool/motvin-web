import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The assistant's conversation, kept on the server so a refresh, a new tab
 * or a restart brings it back where it was. One conversation per library —
 * there is one admin — stored as a small JSON file beside the project, not in
 * the temp folder, so it outlives a reboot. The browser owns the wording;
 * this only keeps it.
 */

const DIR = join(process.cwd(), '.motvin');
const FILE = join(DIR, 'assistant-chat.json');
const KEEP = 200;

export type StoredChat = { messages: unknown[]; pending: unknown | null; expecting?: unknown | null; updatedAt: string };

export function readChat(): StoredChat {
  if (!existsSync(FILE)) return { messages: [], pending: null, updatedAt: '' };
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf-8')) as StoredChat;
    return { messages: Array.isArray(parsed.messages) ? parsed.messages : [], pending: parsed.pending ?? null, expecting: parsed.expecting ?? null, updatedAt: parsed.updatedAt ?? '' };
  } catch {
    return { messages: [], pending: null, updatedAt: '' };
  }
}

export function writeChat(input: { messages: unknown[]; pending: unknown | null; expecting?: unknown | null }): StoredChat {
  mkdirSync(DIR, { recursive: true });
  const stored: StoredChat = { messages: input.messages.slice(-KEEP), pending: input.pending ?? null, expecting: input.expecting ?? null, updatedAt: new Date().toISOString() };
  writeFileSync(FILE, JSON.stringify(stored));
  return stored;
}

export function clearChat() {
  writeChat({ messages: [], pending: null });
}
