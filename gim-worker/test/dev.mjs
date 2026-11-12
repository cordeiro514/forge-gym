// Runs the Worker locally against the stand-in API, for trying GIM in the browser for free.
// App setting: server http://localhost:8787, access code test-code.
import worker from '../src/index.js';
import { FakeKV, startFakeAnthropic, serveWorker } from './harness.mjs';

await startFakeAnthropic(8790);
await serveWorker(worker, { ACCESS_CODE: 'test-code', ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'http://localhost:8790', ALLOWED_ORIGINS: 'http://localhost:5173', STEPS: new FakeKV() }, 8787);
console.log('GIM dev server on http://localhost:8787 (stand-in Claude on 8790)');
