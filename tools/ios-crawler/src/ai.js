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

/** Ollama's OpenAI-compatible endpoint, the zero-setup default. */
export const AI_DEFAULT_URL = 'http://localhost:11434/v1';

/** Names that mean a model reads images. */
const VISION = /(vision|vl\b|-vl|llava|gemma3|gemma-3|minicpm-v|moondream|pixtral|qwen2\.5vl|qwen.*vl|gpt-4o|gpt-4\.1|gemini|claude|llama-4|mistral-small-3|phi-4-multimodal|granite3\.2-vision)/i;

/** Names that are plainly the wrong tool: code and embedding models. */
const NOT_FOR_THIS = /(coder|embed|embedding|rerank|whisper|tts|guard)/i;

export function aiConfig() {
  const url = (process.env.MOTVIN_AI_URL || AI_DEFAULT_URL).replace(/\/+$/, '');
  const key = process.env.MOTVIN_AI_KEY || '';
  const model = process.env.MOTVIN_AI_MODEL || '';
  let provider = 'openai-compatible';
  if (/11434/.test(url)) provider = 'ollama';
  else if (/1234/.test(url)) provider = 'lm-studio';
  else if (/googleapis/.test(url)) provider = 'gemini';
  else if (/groq/.test(url)) provider = 'groq';
  else if (/openrouter/.test(url)) provider = 'openrouter';
  return { url, key, model, provider, configured: Boolean(process.env.MOTVIN_AI_URL || process.env.MOTVIN_AI_KEY || process.env.MOTVIN_AI_MODEL) };
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
export function pickModel(models, configured = '') {
  if (configured) return configured;
  const usable = models.filter((name) => !NOT_FOR_THIS.test(name));
  const vision = usable.find((name) => supportsVision(name));
  return vision ?? usable[0] ?? models[0] ?? null;
}

/**
 * Whether the free AI can be used right now: a server answers and has a model.
 * @returns {Promise<{usable: boolean, model: string|null, vision: boolean, provider: string, url: string, reason: string|null}>}
 */
export async function aiStatus() {
  const config = aiConfig();
  const models = await aiModels(config);
  if (!models.length && !config.model) {
    return {
      usable: false,
      model: null,
      vision: false,
      provider: config.provider,
      url: config.url,
      reason:
        config.provider === 'ollama'
          ? 'Ollama is not running or has no models — start it and run: ollama pull gemma3:4b'
          : `no models at ${config.url}`,
    };
  }
  const model = pickModel(models, config.model);
  if (!model) {
    return { usable: false, model: null, vision: false, provider: config.provider, url: config.url, reason: 'the server lists no model' };
  }
  return { usable: true, model, vision: supportsVision(model), provider: config.provider, url: config.url, reason: null };
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
  const reply = payload.message?.content ?? '';
  if (!String(reply).trim()) throw new Error('ollama returned an empty reply');
  return reply;
}
