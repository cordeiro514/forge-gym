// Run with: npm test (from gim-worker/)
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { TOOLS, SYSTEM_PROMPT } from '../src/prompt.js';
import { EXERCISES } from '../../exercises.js';
import { FakeKV, startFakeAnthropic, serveWorker } from './harness.mjs';

const fake = await startFakeAnthropic(8790);
const env = { ACCESS_CODE: 'test-code', ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'http://localhost:8790', ALLOWED_ORIGINS: 'https://cordeiro514.github.io', STEPS: new FakeKV() };
const server = await serveWorker(worker, env, 8791);
const base = 'http://localhost:8791';
const APP = { Origin: 'https://cordeiro514.github.io', 'X-Gim-Code': 'test-code', 'Content-Type': 'application/json' };

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok  ', name); };

try {
  await t('preflight answers with CORS for the app', async () => {
    const r = await fetch(`${base}/chat`, { method: 'OPTIONS', headers: { Origin: 'https://cordeiro514.github.io' } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://cordeiro514.github.io');
    assert.match(r.headers.get('access-control-allow-headers'), /X-Gim-Code/);
  });

  await t('wrong access code and other websites are refused', async () => {
    assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers: { ...APP, 'X-Gim-Code': 'nope' }, body: '{}' })).status, 401);
    assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers: { ...APP, Origin: 'https://evil.example' }, body: '{}' })).status, 403);
    assert.equal(fake.seen.length, 0, 'nothing reached the API');
  });

  await t('chat sends model, effort, caching, fallback, strict tool and the conversation', async () => {
    const messages = [{ role: 'user', content: 'Salut GIM' }];
    const r = await fetch(`${base}/chat`, { method: 'POST', headers: APP, body: JSON.stringify({ messages }) });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.stop_reason, 'end_turn');
    assert.equal(data.content[0].type, 'thinking'); // passed back for replay
    const sent = fake.seen.at(-1);
    assert.equal(sent.headers.authorization, 'Bearer sk-test'); // SDK 1.x sends the key this way
    assert.match(sent.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
    assert.equal(sent.body.model, 'claude-opus-5-5');
    assert.equal(sent.body.fallbacks, 'default');
    assert.deepEqual(sent.body.output_config, { effort: 'medium' });
    assert.deepEqual(sent.body.cache_control, { type: 'ephemeral' });
    assert.equal(sent.body.system, SYSTEM_PROMPT);
    assert.equal(sent.body.tools[0].strict, true);
    assert.deepEqual(sent.body.messages, messages);
    assert.equal(sent.body.betas, undefined, 'betas travel as a header, not in the body');
  });

  await t('haiku requests carry no fallback', async () => {
    await fetch(`${base}/chat`, { method: 'POST', headers: APP, body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }) }).then(() => {});
    const before = fake.seen.length;
    env.MODEL = 'claude-haiku-5-5';
    await fetch(`${base}/chat`, { method: 'POST', headers: APP, body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }) });
    delete env.MODEL;
    const sent = fake.seen[before];
    assert.equal(sent.body.model, 'claude-haiku-5-5');
    assert.equal(sent.body.fallbacks, undefined);
    assert.equal(sent.headers['anthropic-beta'], undefined);
  });

  await t('bad conversations are rejected before calling the API', async () => {
    const before = fake.seen.length;
    assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers: APP, body: 'not json' })).status, 400);
    assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers: APP, body: JSON.stringify({ messages: [] }) })).status, 400);
    assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers: APP, body: JSON.stringify({ messages: Array(81).fill({ role: 'user', content: 'x' }) }) })).status, 400);
    assert.equal(fake.seen.length, before);
  });

  await t('steps: the Shortcut uploads without an Origin, the app reads them back', async () => {
    const up = (body) => fetch(`${base}/steps`, { method: 'POST', headers: { 'X-Gim-Code': 'test-code', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await up({ person: 'alex-7k2p', date: '2026-11-11', steps: 9400 })).status, 200);
    assert.equal((await up({ person: 'alex-7k2p', date: '2026-11-12', steps: '8 432' })).status, 200); // localized number
    assert.equal((await up({ person: 'alex-7k2p', date: '2026-11-12', steps: 8432.0 })).status, 200);
    assert.equal((await up({ person: 'Bad Person!', date: '2026-11-12', steps: 10 })).status, 400);
    assert.equal((await up({ person: 'alex-7k2p', date: '12/11/2026', steps: 10 })).status, 400);
    assert.equal((await fetch(`${base}/steps`, { method: 'POST', headers: { 'X-Gim-Code': 'wrong' }, body: '{}' })).status, 401);
    const r = await fetch(`${base}/steps?person=alex-7k2p`, { headers: APP });
    assert.deepEqual((await r.json()).days, { '2026-11-12': 8432, '2026-11-11': 9400 });
    assert.equal((await fetch(`${base}/steps?person=alex-7k2p`, { headers: { ...APP, Origin: 'https://evil.example' } })).status, 403);
  });

  await t('steps keep only the last 60 days', async () => {
    for (let d = 1; d <= 70; d++) {
      const date = new Date(Date.UTC(2026, 0, d)).toISOString().slice(0, 10);
      await fetch(`${base}/steps`, { method: 'POST', headers: { 'X-Gim-Code': 'test-code' }, body: JSON.stringify({ person: 'sam-0001', date, steps: d }) });
    }
    const days = (await (await fetch(`${base}/steps?person=sam-0001`, { headers: APP })).json()).days;
    assert.equal(Object.keys(days).length, 60);
    assert.ok(days['2026-03-11'] && !days['2026-01-01']);
  });

  await t('tool schema: strict, closed objects, ids limited to the library', async () => {
    const s = TOOLS[0].input_schema;
    assert.equal(s.additionalProperties, false);
    const ex = s.properties.days.items.properties.exercises.items;
    assert.equal(ex.additionalProperties, false);
    assert.deepEqual(ex.properties.id.enum, Object.keys(EXERCISES));
    assert.ok(!JSON.stringify(TOOLS).includes('minimum'), 'strict tools reject numeric limits');
    assert.ok(SYSTEM_PROMPT.includes('bb_squat | Barbell Back Squat'));
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(SYSTEM_PROMPT), 'no dates in the cached prefix');
  });
} finally {
  server.close(); fake.server.close();
}
console.log(`\n${n} worker tests passed`);
