// Text your bots from your phone (roadmap: "Slack / Telegram bridges").
// Telegram uses Bot API long polling; Slack uses Socket Mode over a WebSocket.
// Neither needs a public URL, so OpenBot can stay on 127.0.0.1.
// Messages land in the bot's normal direct chat, so the whole conversation is
// also visible (and approvable) in the app.
import { get, getSetting, setSetting } from './db.js';
import { emit } from './events.js';
import { ensureDirectThread, handleUserMessage } from './agents/runtime.js';

const DEFAULTS = {
  telegram: { enabled: false, token: '', agentId: '', allowed: [] },
  slack: { enabled: false, appToken: '', botToken: '', agentId: '' },
};
const state = { telegram: { status: 'off', error: '' }, slack: { status: 'off', error: '' } };
let tgRun = 0;
let slackWs = null;
let slackRun = 0;

export const getBridges = () => {
  const b = getSetting('bridges', {});
  return { telegram: { ...DEFAULTS.telegram, ...(b.telegram || {}) }, slack: { ...DEFAULTS.slack, ...(b.slack || {}) } };
};

const mask = (v) => (v ? '••••' + String(v).slice(-4) : '');
export function publicBridges() {
  const b = getBridges();
  return {
    telegram: { ...b.telegram, token: mask(b.telegram.token), ...state.telegram },
    slack: { ...b.slack, appToken: mask(b.slack.appToken), botToken: mask(b.slack.botToken), ...state.slack },
  };
}

export function saveBridges(next) {
  const cur = getBridges();
  const keep = (v, old) => (v == null || String(v).startsWith('••••') ? old : String(v).trim());
  const t = { ...cur.telegram, ...(next.telegram || {}) };
  t.token = keep(next.telegram?.token, cur.telegram.token);
  t.allowed = (Array.isArray(t.allowed) ? t.allowed : String(t.allowed || '').split(/[\s,]+/)).map(String).filter(Boolean);
  const s = { ...cur.slack, ...(next.slack || {}) };
  s.appToken = keep(next.slack?.appToken, cur.slack.appToken);
  s.botToken = keep(next.slack?.botToken, cur.slack.botToken);
  delete t.status; delete t.error; delete s.status; delete s.error;
  setSetting('bridges', { telegram: t, slack: s });
  startBridges();
}

function setState(kind, status, error = '') {
  state[kind] = { status, error };
  emit('bridges', { kind, status, error });
}

function pickAgent(agentId) {
  return (agentId && get('SELECT * FROM agents WHERE id = ?', agentId)) || get('SELECT * FROM agents ORDER BY created_at LIMIT 1');
}

async function ask(agent, text, via) {
  const thread = ensureDirectThread(agent.id);
  const replies = await handleUserMessage(thread.id, text, { via });
  return replies.map((r) => r.text).join('\n\n') || 'Done.';
}

const chunks = (s, n) => { const out = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out.length ? out : ['']; };

// ---------------- Telegram ----------------
async function tg(token, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(40000),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || `Telegram ${method} failed`);
  return j.result;
}

async function startTelegram(cfg) {
  const my = ++tgRun;
  if (!cfg.enabled || !cfg.token) return setState('telegram', 'off');
  let me;
  try { me = await tg(cfg.token, 'getMe'); } catch (e) { return setState('telegram', 'error', e.message); }
  setState('telegram', 'connected', `@${me.username}`);
  let offset = 0;
  while (my === tgRun) {
    let updates = [];
    try { updates = await tg(cfg.token, 'getUpdates', { offset, timeout: 30, allowed_updates: ['message'] }); }
    catch (e) { if (my !== tgRun) return; setState('telegram', 'error', e.message); await new Promise((r) => setTimeout(r, 5000)); continue; }
    if (my !== tgRun) return;
    if (state.telegram.status !== 'connected') setState('telegram', 'connected', `@${me.username}`);
    for (const u of updates) {
      offset = u.update_id + 1;
      const m = u.message;
      if (!m?.text) continue;
      const chatId = String(m.chat.id);
      const live = getBridges().telegram;
      if (!live.allowed.includes(chatId)) {
        tg(cfg.token, 'sendMessage', { chat_id: m.chat.id, text: `This chat isn't paired with OpenBot yet.\nAdd chat ID ${chatId} in OpenBot → Settings → Bridges → Telegram.` }).catch(() => {});
        continue;
      }
      if (m.text === '/start') { tg(cfg.token, 'sendMessage', { chat_id: m.chat.id, text: 'Connected to OpenBot. Send a message to talk to your bot.' }).catch(() => {}); continue; }
      const agent = pickAgent(live.agentId);
      if (!agent) continue;
      (async () => {
        const typing = setInterval(() => tg(cfg.token, 'sendChatAction', { chat_id: m.chat.id, action: 'typing' }).catch(() => {}), 4500);
        tg(cfg.token, 'sendChatAction', { chat_id: m.chat.id, action: 'typing' }).catch(() => {});
        try {
          const text = await ask(agent, m.text, 'telegram');
          for (const part of chunks(`${agent.name}: ${text}`, 4000)) await tg(cfg.token, 'sendMessage', { chat_id: m.chat.id, text: part, reply_to_message_id: m.message_id });
        } catch (e) {
          tg(cfg.token, 'sendMessage', { chat_id: m.chat.id, text: `⚠️ ${e.message}` }).catch(() => {});
        } finally { clearInterval(typing); }
      })();
    }
  }
}

// ---------------- Slack (Socket Mode) ----------------
async function slack(token, method, body) {
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` }, body: JSON.stringify(body || {}),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Slack ${method}: ${j.error}`);
  return j;
}

async function startSlack(cfg) {
  const my = ++slackRun;
  try { slackWs?.close(); } catch {}
  slackWs = null;
  if (!cfg.enabled || !cfg.appToken || !cfg.botToken) return setState('slack', 'off');
  if (typeof WebSocket === 'undefined') return setState('slack', 'error', 'This Node version has no WebSocket; use Node 22+');
  let url, auth;
  try {
    auth = await slack(cfg.botToken, 'auth.test');
    ({ url } = await slack(cfg.appToken, 'apps.connections.open'));
  } catch (e) { return setState('slack', 'error', e.message); }
  if (my !== slackRun) return;
  const ws = new WebSocket(url);
  slackWs = ws;
  const reconnect = () => { if (my === slackRun) setTimeout(() => my === slackRun && startSlack(getBridges().slack), 3000); };
  ws.addEventListener('open', () => setState('slack', 'connected', auth.team || ''));
  ws.addEventListener('close', reconnect);
  ws.addEventListener('error', (e) => setState('slack', 'error', e.message || 'WebSocket error'));
  ws.addEventListener('message', async (ev) => {
    let msg;
    try { msg = JSON.parse(String(ev.data)); } catch { return; }
    if (msg.envelope_id) ws.send(JSON.stringify({ envelope_id: msg.envelope_id }));
    if (msg.type === 'disconnect') { try { ws.close(); } catch {} return; }
    if (msg.type !== 'events_api') return;
    const e = msg.payload?.event;
    if (!e || e.bot_id || e.subtype || !e.text) return;
    const isDm = e.type === 'message' && e.channel_type === 'im';
    const isMention = e.type === 'app_mention';
    if (!isDm && !isMention) return;
    const agent = pickAgent(getBridges().slack.agentId);
    if (!agent) return;
    const text = e.text.replace(/<@[A-Z0-9]+>/g, '').trim();
    try {
      const reply = await ask(agent, text, 'slack');
      for (const part of chunks(reply, 3500)) await slack(cfg.botToken, 'chat.postMessage', { channel: e.channel, text: part, thread_ts: isMention ? (e.thread_ts || e.ts) : undefined });
    } catch (err) {
      slack(cfg.botToken, 'chat.postMessage', { channel: e.channel, text: `⚠️ ${err.message}` }).catch(() => {});
    }
  });
}

export function startBridges() {
  const b = getBridges();
  startTelegram(b.telegram).catch((e) => setState('telegram', 'error', e.message));
  startSlack(b.slack).catch((e) => setState('slack', 'error', e.message));
}
