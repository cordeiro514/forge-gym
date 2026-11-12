// Local stand-ins so the Worker can be tested without Cloudflare or a paid API call:
// a fake KV store, a fake Messages API that answers like Claude would, and a Node
// server that hands requests to the Worker's fetch().
import http from 'node:http';

export class FakeKV {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.has(k) ? this.map.get(k) : null; }
  async put(k, v) { this.map.set(k, v); }
}

const SAMPLE_PLAN = {
  title: 'Haut/Bas 3 jours',
  summary: 'Trois séances par semaine, chaque muscle deux fois, environ 12 séries par muscle. Les études montrent que deux fréquences par semaine donnent plus de muscle à volume égal.',
  daysPerWeek: 3,
  days: [
    { name: 'Corps complet A', focus: 'Jambes, poitrine, dos', exercises: [
      { id: 'bb_squat', sets: 3, repsMin: 6, repsMax: 10, restSec: 150 },
      { id: 'bb_bench', sets: 3, repsMin: 6, repsMax: 10, restSec: 150 },
      { id: 'bb_row', sets: 3, repsMin: 8, repsMax: 12, restSec: 120 },
      { id: 'lat_raise', sets: 2, repsMin: 12, repsMax: 20, restSec: 60 },
    ] },
    { name: 'Corps complet B', focus: 'Ischios, épaules, tirage', exercises: [
      { id: 'rdl', sets: 3, repsMin: 6, repsMax: 10, restSec: 150 },
      { id: 'ohp', sets: 3, repsMin: 6, repsMax: 10, restSec: 150 },
      { id: 'lat_pulldown', sets: 3, repsMin: 8, repsMax: 12, restSec: 120 },
      { id: 'not_a_real_exercise', sets: 3, repsMin: 8, repsMax: 12, restSec: 90 },
    ] },
  ],
};

const reply = (content, stop_reason) => ({
  id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason,
  stop_details: null, usage: { input_tokens: 120, output_tokens: 80, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 },
});

// Answers a question first, proposes a plan once the athlete asks for one, then comments on it.
function fakeClaude(body) {
  const last = body.messages.at(-1);
  const blocks = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }];
  if (blocks.some((b) => b.type === 'tool_result')) {
    return reply([{ type: 'thinking', thinking: '', signature: 'sig-2' }, { type: 'text', text: 'Voilà ton programme dans la carte. Appuie sur **Installer** quand tu es prêt, et Forge choisira tes charges.' }], 'end_turn');
  }
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join(' ');
  if (/refuse-test/.test(text)) return reply([], 'refusal');
  if (/plan|programme|program/i.test(text) && body.messages.filter((m) => m.role === 'user').length >= 2) {
    return reply([
      { type: 'thinking', thinking: '', signature: 'sig-1' },
      { type: 'text', text: 'Parfait, j\'ai ce qu\'il me faut.' },
      { type: 'tool_use', id: 'toolu_test_1', name: 'propose_plan', input: SAMPLE_PLAN },
    ], 'tool_use');
  }
  return reply([{ type: 'thinking', thinking: '', signature: 'sig-0' }, { type: 'text', text: 'Salut ! Combien de jours par semaine peux-tu t\'entraîner, et as-tu des blessures ou des douleurs ?' }], 'end_turn');
}

// A short "voice": a tone that swells and fades like syllables, as a WAV the browser can decode.
export function fakeSpeech(seconds = 1.5) {
  const rate = 22050, n = Math.round(rate * seconds), data = Buffer.alloc(44 + n * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate, env = Math.abs(Math.sin(Math.PI * 4 * t));
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 180 * t) * env * 2500), 44 + i * 2);
  }
  return data;
}

// One server stands in for both APIs: /v1/messages (Claude) and /v1/text-to-speech (ElevenLabs).
export function startFakeAnthropic(port) {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw || '{}');
    seen.push({ path: req.url, headers: req.headers, body });
    if (req.url.startsWith('/v1/text-to-speech/')) {
      if (req.headers['xi-api-key'] !== 'el-test') { res.writeHead(401); res.end('{"detail":"invalid key"}'); return; }
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      res.end(fakeSpeech());
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'request-id': 'req_test' });
    res.end(JSON.stringify(fakeClaude(body)));
  });
  return new Promise((ok) => server.listen(port, () => ok({ server, seen })));
}

export function serveWorker(worker, env, port) {
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const request = new Request(`http://localhost:${port}${req.url}`, {
      method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : raw,
    });
    const response = await worker.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}
