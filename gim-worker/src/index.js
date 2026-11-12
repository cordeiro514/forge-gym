// Forge's small server, two jobs:
//   POST /chat   GIM: the app sends the conversation, this Worker adds the coach instructions
//                and the API key (which never reaches the phone) and asks Claude.
//   /steps       Step sync: an iPhone Shortcut POSTs the day's steps from Apple Health,
//                the app GETs them so nobody types them in.
//
// Secrets (set with `npx wrangler secret put NAME`): ANTHROPIC_API_KEY, ACCESS_CODE.
// Vars (wrangler.toml): MODEL, EFFORT, ALLOWED_ORIGINS. KV binding: STEPS.
// ANTHROPIC_BASE_URL is only for local tests.
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, TOOLS } from './prompt.js';

const MAX_MESSAGES = 80;
const MAX_BODY_CHARS = 300_000;
const KEEP_DAYS = 60;

const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

// Haiku has no server-side fallback; the other current models take fallbacks: "default".
const fallbackFor = (model) => (model.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });

const PERSON = /^[a-z0-9-]{4,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Gim-Code',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!env.ACCESS_CODE || request.headers.get('X-Gim-Code') !== env.ACCESS_CODE) return json({ error: 'bad_code' }, 401, cors);

    // The Shortcut sends no Origin header, so the steps upload is checked by access code only.
    if (url.pathname === '/steps' && request.method === 'POST') return saveSteps(request, env, cors);
    if (!allowed.includes(origin)) return json({ error: 'origin' }, 403, cors);
    if (url.pathname === '/steps' && request.method === 'GET') return readSteps(url, env, cors);
    if (url.pathname === '/chat' && request.method === 'POST') return chat(request, env, cors);
    return json({ error: 'not_found' }, 404, cors);
  },
};

async function chat(request, env, cors) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'no_key' }, 500, cors);
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return json({ error: 'too_long' }, 413, cors);
  let messages;
  try { ({ messages } = JSON.parse(raw)); } catch { return json({ error: 'bad_json' }, 400, cors); }
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return json({ error: 'bad_messages' }, 400, cors);

  const model = env.MODEL || 'claude-opus-5-5';
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      output_config: { effort: env.EFFORT || 'medium' },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
      ...fallbackFor(model),
    });
    // The full content goes back, thinking blocks included: the app replays it unchanged next turn.
    return json({ content: response.content, stop_reason: response.stop_reason, usage: response.usage }, 200, cors);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json({ error: 'upstream_auth' }, 502, cors);
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 429, cors);
    if (err instanceof Anthropic.BadRequestError) return json({ error: 'bad_request', detail: err.message }, 400, cors);
    if (err instanceof Anthropic.APIError) return json({ error: 'upstream', status: err.status }, 502, cors);
    return json({ error: 'network' }, 502, cors);
  }
}

async function saveSteps(request, env, cors) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400, cors); }
  const person = String(body.person || '').trim().toLowerCase();
  const date = String(body.date || '').trim();
  // Shortcuts may send "8432", 8432.0 or a localized "8 432"
  const steps = Math.round(Number(String(body.steps ?? '').replace(/[^\d.]/g, '')));
  if (!PERSON.test(person) || !DATE.test(date) || !Number.isFinite(steps) || steps < 0 || steps > 200000) return json({ error: 'bad_steps' }, 400, cors);
  const key = `steps:${person}`;
  const days = JSON.parse((await env.STEPS.get(key)) || '{}');
  days[date] = steps;
  const kept = Object.fromEntries(Object.entries(days).sort(([a], [b]) => b.localeCompare(a)).slice(0, KEEP_DAYS));
  await env.STEPS.put(key, JSON.stringify(kept));
  return json({ ok: true, date, steps }, 200, cors);
}

async function readSteps(url, env, cors) {
  const person = (url.searchParams.get('person') || '').toLowerCase();
  if (!PERSON.test(person)) return json({ error: 'bad_person' }, 400, cors);
  return json({ days: JSON.parse((await env.STEPS.get(`steps:${person}`)) || '{}') }, 200, cors);
}
