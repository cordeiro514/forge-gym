// GIM, the talking coach. Chats with Claude through Forge's Cloudflare Worker (gim-worker/),
// listens with the phone's speech recognition, answers out loud, turns the plans it designs
// into Forge plans, and pulls Apple Health steps sent by an iPhone Shortcut.
import { EXERCISES } from './exercises.js';
import { dayKey, addDays, weekStart, fmt, bestScore, weightTrend } from './coach.js';
import { stepStats, cardioBetween, setDay, dayValue } from './activity.js';

export const GIM_URL = ''; // the Worker's address, filled in once it is deployed

const T = {
  fr: {
    subtitle: 'Ton coach personnel', idle: 'Prêt à t’écouter', listening: 'Je t’écoute…', thinking: 'Je réfléchis…', speaking: 'Je parle…',
    placeholder: 'Écris ou appuie sur le micro', send: 'Envoyer', mic: 'Parler à GIM', stop: 'Arrêter',
    greeting: (n) => `Salut ${n} ! Je suis GIM, ton coach. Dis-moi ce que tu veux accomplir et on va bâtir ensemble un programme fait pour toi, basé sur la science. Appuie sur le micro pour me parler.`,
    chips: ['Bâtis-moi un programme', 'Je veux perdre du gras', 'Combien de protéines par jour ?', 'J’ai mal au genou au squat'],
    proposed: 'Programme proposé', perWeek: (n) => `${n} séances par semaine`, install: 'Installer ce plan', installed: 'Plan installé',
    installedToast: 'Nouveau plan installé. Forge choisira tes charges.', finishFirst: 'Termine ta séance avant de changer de plan.',
    settings: 'Réglages de GIM', language: 'Langue', voice: 'Lire les réponses à voix haute', newChat: 'Nouvelle conversation',
    newChatQ: 'Recommencer la conversation ?', newChatText: 'GIM oublie cette discussion. Ton plan et tes séances ne changent pas.',
    setupTitle: 'Connecter GIM', setupText: 'Entre le code d’accès choisi pour GIM. Tu ne le fais qu’une fois.', code: 'Code d’accès', server: 'Adresse du serveur', connect: 'Connecter',
    notReady: 'GIM n’est pas encore branché à son serveur.', saved: 'GIM est connecté',
    errCode: 'Code d’accès refusé. Vérifie-le dans les réglages de GIM.', errBusy: 'GIM est très occupé. Réessaie dans une minute.',
    errNet: 'Pas de connexion. GIM a besoin d’internet pour répondre.', errOther: 'Oups, GIM n’a pas pu répondre.', retry: 'Réessayer',
    refusal: 'Je ne peux pas t’aider avec ça. Essaie de reformuler ta question.', cut: '(réponse coupée)',
    noMic: 'La dictée n’est pas disponible ici. Utilise le micro du clavier.', micDenied: 'Autorise le micro pour parler à GIM.',
    long: 'Longue discussion : commence une nouvelle conversation pour garder GIM rapide.',
    autoSteps: 'Pas automatiques (Apple Health)', autoStepsSub: 'Un raccourci iPhone envoie tes pas chaque soir.',
  },
  en: {
    subtitle: 'Your personal coach', idle: 'Ready to listen', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…',
    placeholder: 'Type or tap the mic', send: 'Send', mic: 'Talk to GIM', stop: 'Stop',
    greeting: (n) => `Hi ${n}! I'm GIM, your coach. Tell me what you want to achieve and we'll build a program made for you, based on the science. Tap the mic to talk to me.`,
    chips: ['Build me a program', 'I want to lose fat', 'How much protein a day?', 'My knee hurts when I squat'],
    proposed: 'Proposed program', perWeek: (n) => `${n} sessions a week`, install: 'Install this plan', installed: 'Plan installed',
    installedToast: 'New plan installed. Forge will pick your weights.', finishFirst: 'Finish your workout before changing plans.',
    settings: 'GIM settings', language: 'Language', voice: 'Read answers out loud', newChat: 'New conversation',
    newChatQ: 'Start over?', newChatText: 'GIM forgets this chat. Your plan and workouts stay the same.',
    setupTitle: 'Connect GIM', setupText: 'Enter the access code chosen for GIM. You only do this once.', code: 'Access code', server: 'Server address', connect: 'Connect',
    notReady: 'GIM isn’t connected to its server yet.', saved: 'GIM is connected',
    errCode: 'Access code refused. Check it in GIM settings.', errBusy: 'GIM is very busy. Try again in a minute.',
    errNet: 'No connection. GIM needs the internet to answer.', errOther: 'Oops, GIM couldn’t answer.', retry: 'Try again',
    refusal: 'I can’t help with that one. Try asking another way.', cut: '(answer cut short)',
    noMic: 'Dictation isn’t available here. Use the keyboard’s mic.', micDenied: 'Allow the microphone to talk to GIM.',
    long: 'Long chat: start a new conversation to keep GIM quick.',
    autoSteps: 'Automatic steps (Apple Health)', autoStepsSub: 'An iPhone Shortcut sends your steps every evening.',
  },
};

export const gimDefaults = () => ({
  messages: [], installed: {}, code: '', url: GIM_URL, voice: true,
  lang: typeof navigator !== 'undefined' && /^en/i.test(navigator.language || '') ? 'en' : 'fr',
  person: '', lastSync: 0,
});

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, Math.round(Number(v) || 0)));

// ---------- pure helpers (tested from Node) ----------
export function athleteContext(S, now = new Date()) {
  const p = S.profile, u = p.unit;
  const goal = { muscle: 'build muscle', strength: 'get stronger', fatloss: 'lose fat', general: 'general fitness' }[p.goal];
  const equip = { gym: 'full gym', dumbbells: 'dumbbells only (plus bodyweight)', bodyweight: 'no equipment (bodyweight only)' }[p.equipment];
  const trend = weightTrend(S.weights, now);
  const st = stepStats(S.steps, now);
  const wk = weekStart(now);
  const best = {};
  for (const s of S.sessions.slice(-40)) for (const e of s.exercises) best[e.exId] = Math.max(best[e.exId] || 0, bestScore(e.sets));
  const lifts = Object.entries(best).slice(0, 15).map(([id, v]) => `- ${EXERCISES[id].name}: ${EXERCISES[id].factor === null ? `best set ${v} reps` : `estimated 1-rep max ${fmt(v)} ${u}`}`);
  const plan = S.plan.templates.map((t) => `- ${t.name}: ${t.exercises.map((e) => `${EXERCISES[e.exId].name} ${e.sets}x${e.lo}-${e.hi}`).join(', ')}`);
  return [
    '<athlete_context>',
    `Date: ${dayKey(now)}`,
    `Name: ${p.name}`,
    `Preferred language: ${S.gim.lang === 'en' ? 'English' : 'French'}`,
    `Goal: ${goal}; experience: ${p.experience}; equipment: ${equip}; wants ${p.days} sessions a week`,
    `Bodyweight: ${p.bodyweight} ${u}${trend ? `, trend ${trend.perWeek >= 0 ? '+' : ''}${fmt(trend.perWeek)} ${u} per week` : ''}`,
    `Workouts logged: ${S.sessions.length} in total, ${S.sessions.filter((s) => new Date(s.date) >= addDays(now, -28)).length} in the last 4 weeks`,
    `Activity: step goal ${p.stepGoal} a day${st.avg !== null ? `, averaging ${st.avg}` : ''}; cardio ${cardioBetween(S.cardio, wk, addDays(wk, 7))} of ${p.cardioGoal} minutes this week`,
    `Current plan${S.plan.source === 'gim' ? ` ("${S.plan.title}", designed with GIM)` : ' (generated by Forge)'}:`,
    ...plan,
    ...(lifts.length ? ['Best recent lifts:', ...lifts] : ['No lifts logged yet.']),
    '</athlete_context>',
  ].join('\n');
}

export function planFromTool(input) {
  const issues = [];
  const days = Array.isArray(input && input.days) ? input.days : [];
  if (days.length > 6) issues.push('only the first 6 days were kept');
  const templates = days.slice(0, 6).map((d, i) => {
    const list = Array.isArray(d.exercises) ? d.exercises : [];
    const known = list.filter((e) => { if (EXERCISES[e.id]) return true; issues.push(`unknown exercise "${e.id}" removed`); return false; });
    if (known.length > 8) issues.push(`${d.name}: only the first 8 exercises were kept`);
    const exercises = known.slice(0, 8).map((e) => {
      const lo = clamp(Math.min(e.repsMin, e.repsMax), 1, 29);
      return { exId: e.id, sets: clamp(e.sets, 1, 6), lo, hi: Math.max(lo + 1, clamp(Math.max(e.repsMin, e.repsMax), 2, 30)), rest: clamp(e.restSec, 30, 300) };
    });
    return { id: `gim${i + 1}`, name: String(d.name || `Day ${i + 1}`).slice(0, 40), focus: String(d.focus || '').slice(0, 80), exercises };
  }).filter((t) => t.exercises.length);
  if (!templates.length) issues.push('no day had a usable exercise');
  return {
    ok: templates.length > 0, templates, issues,
    title: String((input && input.title) || 'GIM').slice(0, 60),
    summary: String((input && input.summary) || ''),
    daysPerWeek: clamp((input && input.daysPerWeek) || templates.length, 2, 6),
  };
}

export function toolResult(block) {
  if (block.name !== 'propose_plan') return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: `Unknown tool ${block.name}.` };
  const plan = planFromTool(block.input);
  if (!plan.ok) return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: `The plan could not be used: ${plan.issues.join('; ')}. Call propose_plan again with a corrected plan.` };
  return { type: 'tool_result', tool_use_id: block.id, content: `Shown to the athlete as a plan card with an Install button.${plan.issues.length ? ` Adjusted automatically: ${plan.issues.join('; ')}.` : ''}` };
}

// What the chat shows: the athlete's words, GIM's words and plan cards (thinking and tool plumbing stay hidden).
export function chatItems(messages) {
  const out = [];
  for (const m of messages) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    for (const b of blocks) {
      if (b.type === 'text' && !b.text.startsWith('<athlete_context>')) out.push({ who: m.role === 'user' ? 'me' : 'gim', text: b.text });
      else if (b.type === 'tool_use' && b.name === 'propose_plan') out.push({ who: 'plan', id: b.id, input: b.input });
    }
  }
  return out;
}

const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
export function toHTML(text) {
  return esc(text.trim()).split(/\n{2,}/).map((par) => {
    const lines = par.split('\n');
    if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-•*]\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

export function forSpeech(text, lang) {
  return text.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/^\s*[-•*]\s+/gm, '')
    .replace(/(\d)\s*[–-]\s*(\d)/g, lang === 'en' ? '$1 to $2' : '$1 à $2').replace(/\s*×\s*/g, lang === 'en' ? ' by ' : ' fois ')
    .replace(/\n+/g, '. ').replace(/\.\s*\./g, '.').trim();
}

// Chrome cuts long utterances, so speech is queued sentence by sentence.
export function speechChunks(text, max = 220) {
  const parts = text.match(/[^.!?…]+[.!?…]*\s*/g) || [text];
  const out = [];
  for (const p of parts) {
    if (out.length && (out.at(-1) + p).length <= max) out[out.length - 1] += p;
    else out.push(p);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

export function mergeSteps(steps, days) {
  let out = steps, changed = false;
  for (const [date, v] of Object.entries(days || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(v) && v > dayValue(out, date)) { out = setDay(out, date, Math.round(v)); changed = true; }
  }
  return { steps: out, changed };
}

// ---------- the avatar ----------
export const AVATAR = `<svg class="gim-svg" viewBox="0 0 120 120" aria-hidden="true">
  <defs><clipPath id="gimHead"><circle cx="60" cy="62" r="42"/></clipPath></defs>
  <circle class="g-ring" cx="60" cy="62" r="46"/><circle class="g-ring g-r2" cx="60" cy="62" r="46"/>
  <g class="g-bob">
    <circle class="g-head" cx="60" cy="62" r="42"/>
    <g clip-path="url(#gimHead)"><rect class="g-band" x="10" y="29" width="100" height="14"/><rect class="g-stripe" x="10" y="34" width="100" height="3.5"/></g>
    <g class="g-eyes"><ellipse class="g-eye" cx="45" cy="63" rx="5.5" ry="7.5"/><ellipse class="g-eye" cx="75" cy="63" rx="5.5" ry="7.5"/></g>
    <circle class="g-cheek" cx="35" cy="77" r="5"/><circle class="g-cheek" cx="85" cy="77" r="5"/>
    <path class="g-smile" d="M47 81 Q60 92 73 81"/>
    <ellipse class="g-talk" cx="60" cy="84" rx="9" ry="6.5"/>
  </g>
  <g class="g-dots"><circle cx="97" cy="27" r="4"/><circle cx="106" cy="18" r="3"/><circle cx="112" cy="10" r="2.2"/></g>
</svg>`;

// ---------- the live part: network, microphone, voice ----------
let ctx = null; // { S(), persist(), render(), toast(), openSheet() }
let state = 'idle', busy = false, error = null, rec = null, voices = [];
const g = () => ctx.S().gim;
export const t = (k, ...a) => { const v = (T[g().lang] || T.fr)[k]; return typeof v === 'function' ? v(...a) : v; };
export const gimBusy = () => busy;
export const gimError = () => error;
export const gimState = () => state;
export const configured = () => !!(g().url && g().code);

export function attachGim(c) {
  ctx = c;
  if ('speechSynthesis' in window) {
    voices = speechSynthesis.getVoices();
    speechSynthesis.addEventListener?.('voiceschanged', () => { voices = speechSynthesis.getVoices(); });
  }
}

function setState(s) {
  state = s;
  const av = document.querySelector('.gim-avatar');
  if (av) av.dataset.state = s;
  const st = document.getElementById('gim-status');
  if (st) st.textContent = t(s);
  const mic = document.querySelector('[data-act="gim-mic"]');
  if (mic) mic.classList.toggle('live', s === 'listening');
}

const speechLang = () => (g().lang === 'en' ? 'en-US' : (/^fr-CA/i.test(navigator.language) ? 'fr-CA' : 'fr-FR'));

function pickVoice() {
  const want = speechLang(), base = want.slice(0, 2);
  return voices.find((v) => v.lang === want) || voices.find((v) => v.lang.replace('_', '-').startsWith(base)) || null;
}

// iOS only lets a page talk after a tap; an empty utterance during the tap unlocks it.
let unlocked = false;
function unlockSpeech() {
  if (unlocked || !('speechSynthesis' in window)) return;
  unlocked = true;
  try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* no voice */ }
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (state === 'speaking') setState('idle');
}

function speak(text) {
  if (!g().voice || !('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const chunks = speechChunks(forSpeech(text, g().lang));
  const voice = pickVoice();
  chunks.forEach((c, i) => {
    const u = new SpeechSynthesisUtterance(c);
    u.lang = speechLang(); if (voice) u.voice = voice; u.rate = 1.03;
    if (i === 0) u.onstart = () => setState('speaking');
    if (i === chunks.length - 1) { u.onend = () => setState('idle'); }
    u.onerror = () => setState('idle');
    speechSynthesis.speak(u);
  });
}

export function gimMic() {
  if (rec) { rec.stop(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { ctx.toast(t('noMic')); document.getElementById('gim-input')?.focus(); return; }
  unlockSpeech(); stopSpeaking();
  const input = document.getElementById('gim-input');
  let finalText = '';
  rec = new SR();
  rec.lang = speechLang(); rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
    }
    if (input) input.value = `${finalText}${interim}`.trim();
  };
  rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') ctx.toast(t('micDenied')); };
  rec.onend = () => {
    rec = null;
    setState('idle');
    const text = (input && input.value.trim()) || finalText.trim();
    if (text) gimSend(text);
  };
  try { rec.start(); setState('listening'); } catch { rec = null; ctx.toast(t('noMic')); }
}

export function gimSend(text) {
  text = String(text || '').trim();
  if (!text || busy) return;
  if (!configured()) { ctx.toast(t('notReady')); return; }
  unlockSpeech(); stopSpeaking();
  const S = ctx.S(), msgs = g().messages;
  // the athlete context travels once, at the start of the conversation, so the history stays append-only
  msgs.push({ role: 'user', content: msgs.length ? [{ type: 'text', text }] : [{ type: 'text', text: athleteContext(S) }, { type: 'text', text }] });
  ctx.persist();
  runTurn();
}

export function gimRetry() {
  const last = g().messages.at(-1);
  if (last && last.role === 'user' && !busy) runTurn();
}

async function runTurn() {
  busy = true; error = null;
  setState('thinking');
  ctx.render(true);
  const spoken = [];
  try {
    for (let hop = 0; hop < 3; hop++) {
      let res;
      try {
        res = await fetch(`${g().url.replace(/\/$/, '')}/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gim-Code': g().code },
          body: JSON.stringify({ messages: g().messages }),
        });
      } catch { error = t('errNet'); break; }
      if (!res.ok) { error = res.status === 401 ? t('errCode') : res.status === 429 ? t('errBusy') : t('errOther'); break; }
      const data = await res.json();
      if (data.stop_reason === 'refusal') {
        // nothing was answered: drop the question so the next one starts clean
        if (g().messages.at(-1).role === 'user' && hop === 0) g().messages.pop();
        error = t('refusal'); break;
      }
      g().messages.push({ role: 'assistant', content: data.content });
      spoken.push(...data.content.filter((b) => b.type === 'text').map((b) => b.text));
      if (data.stop_reason === 'max_tokens') spoken.push(t('cut'));
      const calls = data.content.filter((b) => b.type === 'tool_use');
      if (data.stop_reason !== 'tool_use' || !calls.length) break;
      g().messages.push({ role: 'user', content: calls.map(toolResult) });
    }
  } finally {
    busy = false;
    ctx.persist();
    setState('idle');
    ctx.render(true);
    if (!error && spoken.length) speak(spoken.join('\n'));
  }
}

export function gimInstall(id) {
  const S = ctx.S();
  if (S.active) { ctx.toast(t('finishFirst')); return; }
  const block = g().messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((b) => b.type === 'tool_use' && b.id === id);
  if (!block) return;
  const plan = planFromTool(block.input);
  if (!plan.ok) return;
  S.prevPlan = S.plan;
  S.plan = { templates: plan.templates, rotation: 0, deload: null, lastDeloadEnd: S.plan.lastDeloadEnd || null, generatedAt: dayKey(new Date()), source: 'gim', title: plan.title };
  S.profile.days = plan.daysPerWeek;
  g().installed[id] = true;
  ctx.persist(); ctx.render(true); ctx.toast(t('installedToast'));
}

export function gimNew() {
  stopSpeaking();
  g().messages = []; g().installed = {}; error = null;
  ctx.persist(); ctx.render();
}

export function gimSetup(code, url) {
  g().code = String(code || '').trim();
  if (url !== undefined) g().url = String(url || '').trim();
  ctx.persist(); ctx.render(); if (configured()) ctx.toast(t('saved'));
}

// ---------- steps from Apple Health (sent by the iPhone Shortcut) ----------
export function personId(S) {
  if (!S.gim.person) {
    const slug = (S.profile ? S.profile.name : 'forge').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 12) || 'forge';
    S.gim.person = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return S.gim.person;
}

export async function syncSteps(force = false) {
  const S = ctx.S();
  if (!S.profile || !configured() || !S.gim.person) return;
  if (!force && Date.now() - (S.gim.lastSync || 0) < 10 * 60 * 1000) return;
  S.gim.lastSync = Date.now();
  try {
    const res = await fetch(`${S.gim.url.replace(/\/$/, '')}/steps?person=${encodeURIComponent(S.gim.person)}`, { headers: { 'X-Gim-Code': S.gim.code } });
    if (!res.ok) return;
    const { steps, changed } = mergeSteps(S.steps, (await res.json()).days);
    if (changed) { S.steps = steps; ctx.persist(); ctx.render(); }
    else ctx.persist();
  } catch { /* offline: try again later */ }
}

// ---------- screen ----------
function planCard(item, installed) {
  const p = planFromTool(item.input);
  if (!p.ok) return '';
  return `<div class="gim-plan"><p class="eyebrow">${t('proposed')}</p><h3>${esc(p.title)}</h3><p class="muted small">${t('perWeek', p.daysPerWeek)}</p>
    ${p.summary ? `<p class="small">${esc(p.summary)}</p>` : ''}
    ${p.templates.map((d) => `<div class="gp-day"><p><b>${esc(d.name)}</b>${d.focus ? ` <small class="muted">${esc(d.focus)}</small>` : ''}</p><ul>${d.exercises.map((e) => `<li><span>${esc(EXERCISES[e.exId].name)}</span><em>${e.sets} × ${e.lo}–${e.hi}</em></li>`).join('')}</ul></div>`).join('')}
    ${installed ? `<p class="gp-done">✓ ${t('installed')}</p>` : `<button class="btn primary block" data-act="gim-install" data-id="${esc(item.id)}">${t('install')}</button>`}</div>`;
}

export function gimHTML(S, icons) {
  const items = chatItems(S.gim.messages);
  const ready = configured();
  return `<main class="screen gim">
    <header class="gim-head"><div class="gim-avatar" data-state="${state}">${AVATAR}</div>
      <div class="grow"><h1>GIM</h1><p id="gim-status" class="muted">${busy ? t('thinking') : t(state)}</p></div>
      <button class="icon-btn" data-act="gim-settings" aria-label="${t('settings')}">${icons.more}</button></header>
    ${ready ? '' : `<section class="card"><h3>${t('setupTitle')}</h3><p class="muted small">${S.gim.url ? t('setupText') : t('notReady')}</p>
      <label class="field"><span>${t('code')}</span><input type="text" autocomplete="off" autocapitalize="off" data-field="gim-code" value="${esc(S.gim.code)}"></label>
      <label class="field"><span>${t('server')}</span><input type="url" autocomplete="off" autocapitalize="off" data-field="gim-url" value="${esc(S.gim.url)}" placeholder="https://forge-gim.….workers.dev"></label>
      <button class="btn primary block" data-act="gim-connect">${t('connect')}</button></section>`}
    <div class="gim-chat" id="gim-chat">
      <div class="bub gim">${toHTML(t('greeting', S.profile.name))}</div>
      ${items.length ? '' : `<div class="gim-chips">${t('chips').map((c) => `<button class="chip" data-act="gim-chip" data-text="${esc(c)}"><b>${esc(c)}</b></button>`).join('')}</div>`}
      ${items.map((it) => (it.who === 'plan' ? planCard(it, S.gim.installed[it.id]) : `<div class="bub ${it.who}">${it.who === 'me' ? esc(it.text) : toHTML(it.text)}</div>`)).join('')}
      ${busy ? '<div class="bub gim typing" aria-label="GIM is typing"><i></i><i></i><i></i></div>' : ''}
      ${error ? `<div class="gim-err"><p>${esc(error)}</p>${S.gim.messages.at(-1)?.role === 'user' ? `<button class="btn sm ghost" data-act="gim-retry">${t('retry')}</button>` : ''}</div>` : ''}
      ${S.gim.messages.length > 50 ? `<p class="muted small center">${t('long')}</p>` : ''}
    </div>
  </main>
  <div class="gim-composer">
    <button class="gim-mic ${state === 'listening' ? 'live' : ''}" data-act="gim-mic" aria-label="${t('mic')}">${icons.mic}</button>
    <input id="gim-input" type="text" enterkeyhint="send" autocomplete="off" placeholder="${t('placeholder')}" aria-label="${t('placeholder')}">
    <button class="gim-send" data-act="gim-send" aria-label="${t('send')}">${icons.send}</button>
  </div>`;
}

export function gimSettingsHTML(S, chips) {
  return `<h2>${t('settings')}</h2>
    <h3>${t('language')}</h3>${chips([['fr', 'Français'], ['en', 'English']], 'lang', S.gim.lang, 'gim-lang')}
    <label class="switch"><input type="checkbox" data-field="gim-voice" ${S.gim.voice ? 'checked' : ''}><span>${t('voice')}</span></label>
    <label class="field"><span>${t('code')}</span><input type="text" autocomplete="off" autocapitalize="off" data-field="gim-code" value="${esc(S.gim.code)}"></label>
    <label class="field"><span>${t('server')}</span><input type="url" autocomplete="off" autocapitalize="off" data-field="gim-url" value="${esc(S.gim.url)}"></label>
    <div class="stack"><button class="btn primary block" data-act="gim-connect">${t('connect')}</button>
    <button class="btn ghost block" data-act="steps-auto">${t('autoSteps')}</button>
    <button class="btn danger block" data-act="gim-new-confirm">${t('newChat')}</button></div>`;
}

export function stepsAutoHTML(S) {
  const fr = S.gim.lang !== 'en';
  const url = `${(S.gim.url || 'https://…').replace(/\/$/, '')}/steps`;
  const row = (label, value) => `<div class="kv"><span class="muted small">${label}</span><code>${esc(value)}</code></div>`;
  return `<h2>${fr ? 'Pas automatiques depuis Apple Health' : 'Automatic steps from Apple Health'}</h2>
    <p class="muted small">${fr ? 'Une application web ne peut pas lire l’app Santé. Un raccourci iPhone le fait pour toi chaque soir et envoie tes pas à Forge. À faire une seule fois, environ 5 minutes.' : 'Web apps can’t read the Health app. An iPhone Shortcut does it for you every evening and sends your steps to Forge. Set it up once, about 5 minutes.'}</p>
    ${row(fr ? 'Adresse' : 'Address', url)}${row(fr ? 'Code (en-tête X-Gim-Code)' : 'Code (X-Gim-Code header)', S.gim.code || '—')}${row(fr ? 'Ton identifiant (person)' : 'Your id (person)', personId(S))}
    <ol class="steps">${(fr ? [
      'Ouvre l’app <b>Raccourcis</b>, onglet <b>Automatisation</b>, puis <b>+</b> et <b>Heure de la journée</b> : 22 h, tous les jours, <b>Exécuter immédiatement</b>. Choisis <b>Nouveau raccourci vide</b>.',
      'Ajoute <b>Rechercher des échantillons de santé</b> : type <b>Nombre de pas</b>, date de début <b>Aujourd’hui</b>.',
      'Ajoute <b>Calculer des statistiques</b> : <b>Somme</b> des échantillons.',
      'Ajoute <b>Formater la date</b> : <b>Date actuelle</b>, format personnalisé <code>yyyy-MM-dd</code>.',
      'Ajoute <b>Obtenir le contenu de l’URL</b> avec l’adresse ci-dessus. Méthode <b>POST</b>. En-tête <code>X-Gim-Code</code> = le code. Corps <b>JSON</b> : <code>person</code> (texte) = ton identifiant, <code>date</code> = la date formatée, <code>steps</code> (nombre) = le résultat des statistiques.',
      'Touche ▶ pour tester : tes pas d’aujourd’hui apparaissent dans Forge en quelques secondes.',
    ] : [
      'Open the <b>Shortcuts</b> app, <b>Automation</b> tab, then <b>+</b> and <b>Time of Day</b>: 10 PM, daily, <b>Run Immediately</b>. Pick <b>New Blank Shortcut</b>.',
      'Add <b>Find Health Samples</b>: type <b>Steps</b>, start date <b>Today</b>.',
      'Add <b>Calculate Statistics</b>: <b>Sum</b> of the samples.',
      'Add <b>Format Date</b>: <b>Current Date</b>, custom format <code>yyyy-MM-dd</code>.',
      'Add <b>Get Contents of URL</b> with the address above. Method <b>POST</b>. Header <code>X-Gim-Code</code> = the code. Request body <b>JSON</b>: <code>person</code> (text) = your id, <code>date</code> = the formatted date, <code>steps</code> (number) = the statistics result.',
      'Tap ▶ to test: today’s steps show up in Forge within seconds.',
    ]).map((s) => `<li>${s}</li>`).join('')}</ol>
    <p class="muted small">${fr ? 'Avec une Apple Watch, compare le premier jour avec l’app Santé : si le nombre est doublé, dis-le et on ajustera le raccourci.' : 'With an Apple Watch, compare the first day with the Health app: if the number is doubled, say so and the Shortcut can be adjusted.'}</p>
    <button class="btn primary block" data-act="steps-sync">${fr ? 'Vérifier maintenant' : 'Check now'}</button>`;
}
