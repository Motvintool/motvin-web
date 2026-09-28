/**
 * A free AI backend: any server that speaks the OpenAI chat-completions
 * protocol.
 *
 * That one protocol covers every no-cost option worth having:
 *
 *   Ollama          on this Mac, no key, no network.   http://localhost:11434/v1
 *   LM Studio       on this Mac, no key.               http://localhost:1234/v1
 *   Google Gemini   free tier, key from AI Studio.     https://generativelanguage.googleapis.com/v1beta/openai
 *   Groq            free tier.                         https://api.groq.com/openai/v1
 *   OpenRouter      free models (":free" suffix).      https://openrouter.ai/api/v1
 *
 * Configured with three environment variables, all optional:
 *
 *   MOTVIN_AI_URL    the server's /v1 base. Defaults to Ollama on this machine.
 *   MOTVIN_AI_MODEL  the model to use. Defaults to the best vision-capable
 *                    model the server lists, else its first model.
 *   MOTVIN_AI_KEY    an API key, for the hosted free tiers.
 *
 * Images travel as data URLs, the way the protocol expects. Whether the model
 * can see them is judged from its name; a text-only model still gets every
 * screen's recognised text, so the researcher pass works either way.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Ollama's OpenAI-compatible endpoint, the zero-setup default. */
export const AI_DEFAULT_URL = 'http://localhost:11434/v1';

/**
 * The admin page's choice of AI, saved next to the crawler so the terminal
 * and the web page use the same one. Environment variables still win, so a
 * deployment can pin a model without anyone being able to change it from
 * the browser.
 */
export const AI_SETTINGS_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.ai-settings.json');

/** Ready-made servers, so choosing one is a click rather than a URL. */
export const AI_PROVIDERS = [
  { id: 'ollama', name: 'Ollama (this Mac)', url: AI_DEFAULT_URL, needsKey: false, hint: 'Free and offline. ollama pull qwen3-vl:2b' },
  { id: 'lm-studio', name: 'LM Studio (this Mac)', url: 'http://localhost:1234/v1', needsKey: false, hint: 'Free and offline. Load a vision model in LM Studio.' },
  { id: 'gemini', name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true, hint: 'Free tier. Key from aistudio.google.com', model: 'gemini-2.5-flash' },
  { id: 'groq', name: 'Groq', url: 'https://api.groq.com/openai/v1', needsKey: true, hint: 'Free tier. Key from console.groq.com', model: 'meta-llama/llama-4-scout-17b-16e-instruct' },
  { id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', needsKey: true, hint: 'Free models end in :free. Key from openrouter.ai', model: 'qwen/qwen2.5-vl-72b-instruct:free' },
  { id: 'custom', name: 'Other OpenAI-compatible server', url: '', needsKey: false, hint: 'Any server with a /v1/chat/completions endpoint.' },
];

/** @returns {{provider?: string, url?: string, model?: string, key?: string, enabled?: boolean}} */
export function readAiSettings() {
  if (!existsSync(AI_SETTINGS_FILE)) return {};
  try {
    const parsed = JSON.parse(readFileSync(AI_SETTINGS_FILE, 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeAiSettings(settings) {
  const clean = {};
  for (const key of ['provider', 'url', 'model', 'key', 'journeyModel']) if (typeof settings[key] === 'string' && settings[key].trim()) clean[key] = settings[key].trim();
  if (settings.enabled === false) clean.enabled = false;
  writeFileSync(AI_SETTINGS_FILE, `${JSON.stringify(clean, null, 2)}\n`);
  return clean;
}

/** Names that mean a model reads images. */
const VISION = /(vision|vl\b|-vl|llava|gemma3|gemma-3|minicpm-v|moondream|pixtral|qwen2\.5vl|qwen.*vl|gpt-4o|gpt-4\.1|gemini|claude|llama-4|mistral-small-3|phi-4-multimodal|granite3\.2-vision)/i;

/** Names that are plainly the wrong tool: code and embedding models. */
const NOT_FOR_THIS = /(coder|embed|embedding|rerank|whisper|tts|guard)/i;

export function aiConfig() {
  const saved = readAiSettings();
  const fromEnv = Boolean(process.env.MOTVIN_AI_URL || process.env.MOTVIN_AI_KEY || process.env.MOTVIN_AI_MODEL);
  const url = (process.env.MOTVIN_AI_URL || saved.url || AI_DEFAULT_URL).replace(/\/+$/, '');
  const key = process.env.MOTVIN_AI_KEY || saved.key || '';
  const model = process.env.MOTVIN_AI_MODEL || saved.model || '';
  let provider = 'openai-compatible';
  if (/11434/.test(url)) provider = 'ollama';
  else if (/1234/.test(url)) provider = 'lm-studio';
  else if (/googleapis/.test(url)) provider = 'gemini';
  else if (/groq/.test(url)) provider = 'groq';
  else if (/openrouter/.test(url)) provider = 'openrouter';
  return {
    url,
    key,
    model,
    provider,
    // Switched off from the admin page: the on-device rules do everything.
    enabled: fromEnv || saved.enabled !== false,
    source: fromEnv ? 'env' : saved.url || saved.model || saved.key || saved.enabled === false ? 'settings' : 'default',
    configured: fromEnv || Boolean(saved.url || saved.model || saved.key),
  };
}

function headers(config) {
  const out = { 'content-type': 'application/json' };
  if (config.key) out.authorization = `Bearer ${config.key}`;
  return out;
}

/** The models the server offers, as names. Empty when the server is not there. */
export async function aiModels(config = aiConfig()) {
  try {
    const response = await fetch(`${config.url}/models`, { headers: headers(config), signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    const payload = await response.json();
    const list = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
    return list.map((entry) => entry.id ?? entry.name).filter(Boolean);
  } catch {
    return [];
  }
}

/** Whether a model can read images, judged from its name. */
export function supportsVision(model) {
  return VISION.test(String(model || ''));
}

/**
 * The model to use: the configured one, else the best of what the server has
 * — vision-capable first, never a code or embedding model unless nothing else
 * exists.
 */
/** Vision models that read phone screens best, most preferred first. */
const PREFERRED = [/qwen3-vl/i, /qwen2\.5-?vl/i, /gemma3/i, /llava/i];

export function pickModel(models, configured = '') {
  if (configured) return configured;
  const usable = models.filter((name) => !NOT_FOR_THIS.test(name));
  for (const pattern of PREFERRED) {
    const hit = usable.find((name) => pattern.test(name));
    if (hit) return hit;
  }
  const vision = usable.find((name) => supportsVision(name));
  return vision ?? usable[0] ?? models[0] ?? null;
}

/** Billions of parameters, read off a model name ("gemma3:4b" → 4). */
export function modelSize(name) {
  const match = String(name).match(/(\d+(?:\.\d+)?)\s*b\b/i);
  return match ? Number(match[1]) : null;
}

/**
 * The model that names the journeys: one short text call over the whole
 * tree, where judgement matters more than speed. A 2B vision model reads
 * screens well but hands the section name back for every journey inside it,
 * so when a larger general model is installed (up to ~15B, never a coder or
 * embedding model) that one takes this call. The chosen model stays on the
 * screens, where its speed pays off.
 */
export function pickJourneyModel(models, chosen) {
  const own = modelSize(chosen) ?? 0;
  const candidates = models
    .filter((name) => !NOT_FOR_THIS.test(name) && name !== chosen)
    .map((name) => ({ name, size: modelSize(name) ?? 0 }))
    .filter((entry) => entry.size > own && entry.size >= 3 && entry.size <= 15)
    .sort((a, b) => b.size - a.size);
  return candidates[0]?.name ?? chosen;
}

/**
 * Whether the free AI can be used right now: a server answers and has a model.
 * @returns {Promise<{usable: boolean, model: string|null, vision: boolean, provider: string, url: string, reason: string|null}>}
 */
export async function aiStatus() {
  const config = aiConfig();
  const base = { provider: config.provider, url: config.url, source: config.source, enabled: config.enabled, hasKey: Boolean(config.key), models: [] };
  if (!config.enabled) {
    return { ...base, usable: false, connected: false, model: config.model || null, vision: false, reason: 'AI is switched off — names come from the on-device rules' };
  }
  const models = await aiModels(config);
  base.models = models;
  if (!models.length && !config.model) {
    return {
      ...base,
      usable: false,
      connected: false,
      model: null,
      vision: false,
      reason:
        config.provider === 'ollama'
          ? 'Ollama is not running or has no models — start it and run: ollama pull qwen3-vl:2b'
          : `no models at ${config.url}`,
    };
  }
  const model = pickModel(models, config.model);
  if (!model) {
    return { ...base, usable: false, connected: models.length > 0, model: null, vision: false, reason: 'the server lists no model' };
  }
  // A hosted server that refuses the key lists nothing; a chosen model the
  // server does not know is still tried, since some servers list nothing.
  const connected = models.length > 0;
  return {
    ...base,
    usable: true,
    connected,
    model,
    journeyModel: process.env.MOTVIN_AI_JOURNEY_MODEL || readAiSettings().journeyModel || pickJourneyModel(models, model),
    vision: supportsVision(model),
    reason: connected ? null : `could not list models at ${config.url}; the chosen model will be tried as is`,
  };
}

/**
 * One chat completion.
 *
 * @param {{system: string, blocks: ({type: 'text', text: string}|{type: 'image', base64: string, mediaType?: string})[],
 *          model?: string, maxTokens?: number, json?: boolean, temperature?: number}} request
 * @returns {Promise<string>} the assistant's text
 */
export async function aiChat(request) {
  const config = aiConfig();
  const model = request.model || config.model || pickModel(await aiModels(config));
  if (!model) throw new Error(`no model available at ${config.url}`);
  const vision = supportsVision(model);

  // Ollama's own API is used when Ollama is the server: it takes a context
  // size, which its OpenAI-compatible endpoint does not, and a local model's
  // default window is far too small for a tree of screens with their text.
  if (config.provider === 'ollama') return ollamaChat(config, model, vision, request);

  const content = [];
  for (const block of request.blocks) {
    if (block.type === 'text') content.push({ type: 'text', text: block.text });
    else if (block.type === 'image' && vision) {
      content.push({ type: 'image_url', image_url: { url: `data:${block.mediaType ?? 'image/png'};base64,${block.base64}` } });
    }
  }

  const body = {
    model,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content },
    ],
    temperature: request.temperature ?? 0.2,
    max_tokens: request.maxTokens ?? 2500,
  };
  // Every server here honours the JSON mode flag or ignores it harmlessly.
  if (request.json !== false) body.response_format = { type: 'json_object' };

  const response = await fetch(`${config.url}/chat/completions`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(request.timeoutMs ?? 300_000),
  });
  if (!response.ok) {
    throw new Error(`${config.provider} ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }
  const payload = await response.json();
  const message = payload.choices?.[0]?.message;
  const text = typeof message?.content === 'string' ? message.content : Array.isArray(message?.content) ? message.content.map((part) => part.text ?? '').join('') : '';
  if (!text.trim()) throw new Error(`${config.provider} returned an empty reply`);
  return text;
}

/** Ollama's native /api/chat, for the context window and the JSON format flag. */
async function ollamaChat(config, model, vision, request) {
  const base = config.url.replace(/\/v1\/?$/, '');
  const text = request.blocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n\n');
  const images = vision ? request.blocks.filter((block) => block.type === 'image').map((block) => block.base64) : [];
  const body = {
    model,
    stream: false,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: text, ...(images.length ? { images } : {}) },
    ],
    // A reasoning model (Qwen3) would otherwise spend the whole token budget
    // thinking out loud and hand back nothing; the answer is what is wanted.
    think: false,
    options: {
      temperature: request.temperature ?? 0.2,
      num_ctx: request.contextTokens ?? 16384,
      num_predict: request.maxTokens ?? 2500,
    },
  };
  if (request.json !== false) body.format = 'json';
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(request.timeoutMs ?? 600_000),
  });
  if (!response.ok) throw new Error(`ollama ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const payload = await response.json();
  const reply = ollamaReplyText(payload);
  if (!reply.trim()) throw new Error('ollama returned an empty reply');
  return reply;
}

/**
 * The text of an Ollama reply. Some builds file a reasoning model's answer
 * under `thinking` even with thinking switched off, so when `content` is
 * empty the thinking text is the answer — provided it is one (JSON, or any
 * text when JSON was not asked for) rather than a chain of thought.
 */
export function ollamaReplyText(payload) {
  const message = payload?.message ?? {};
  const content = String(message.content ?? '');
  if (content.trim()) return content;
  const thinking = String(message.thinking ?? '').trim();
  if (!thinking) return '';
  const first = thinking.indexOf('{');
  const last = thinking.lastIndexOf('}');
  if (first !== -1 && last > first) return thinking.slice(first, last + 1);
  return '';
}
