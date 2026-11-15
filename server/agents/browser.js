// Real browser control for bots (roadmap: "Playwright with a live screen view").
// Each bot gets its own persistent Chrome/Edge/Chromium profile inside its workspace.
// After every action we save a JPEG of the page and emit a `screen` event so the
// Computer panel can show what the bot is looking at, live.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WORKSPACE_DIR } from '../db.js';
import { emit, logActivity } from '../events.js';

const workspaceOf = (id) => { const d = path.join(WORKSPACE_DIR, id); fs.mkdirSync(d, { recursive: true }); return d; };
const sessions = new Map(); // agentId -> { context, page, timer }
const IDLE_MS = 10 * 60 * 1000;

const CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ],
  win32: [
    path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData\\Local'), 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/snap/bin/chromium'],
};

export function findBrowser() {
  if (process.env.OPENBOT_BROWSER && fs.existsSync(process.env.OPENBOT_BROWSER)) return process.env.OPENBOT_BROWSER;
  return (CANDIDATES[process.platform] || CANDIDATES.linux).find((p) => fs.existsSync(p)) || null;
}

export const screenFile = (agentId) => path.join(workspaceOf(agentId), '.screen', 'latest.jpg');
export const browserLive = (agentId) => sessions.has(agentId);

async function session(agentId) {
  let s = sessions.get(agentId);
  if (s && !s.page.isClosed()) { touch(agentId, s); return s; }
  const exe = findBrowser();
  if (!exe) throw new Error('No Chrome, Edge or Chromium found. Install Google Chrome (free) or set OPENBOT_BROWSER to a Chromium-based browser.');
  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch { throw new Error('playwright-core is not installed. Run `npm install` in the OpenBot folder.'); }
  const profile = path.join(workspaceOf(agentId), '.browser');
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: exe,
    headless: process.env.OPENBOT_BROWSER_HEADFUL !== '1',
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
    downloadsPath: workspaceOf(agentId),
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const page = context.pages()[0] || (await context.newPage());
  s = { context, page, timer: null };
  sessions.set(agentId, s);
  context.on('close', () => sessions.delete(agentId));
  touch(agentId, s);
  return s;
}

function touch(agentId, s) {
  clearTimeout(s.timer);
  s.timer = setTimeout(() => closeBrowser(agentId), IDLE_MS);
}

export async function closeBrowser(agentId) {
  const s = sessions.get(agentId);
  sessions.delete(agentId);
  if (s) { clearTimeout(s.timer); await s.context.close().catch(() => {}); }
  emit('screen', { agent_id: agentId, live: false });
}

async function snap(agentId, page) {
  const f = screenFile(agentId);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  await page.screenshot({ path: f, type: 'jpeg', quality: 70 }).catch(() => {});
  emit('screen', { agent_id: agentId, live: true, url: page.url(), title: await page.title().catch(() => ''), t: Date.now() });
}

const clip = (s, n = 6000) => (s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s);

// A compact, numbered list of clickable things so small models can act reliably.
async function describe(page) {
  const title = await page.title().catch(() => '');
  const items = await page.evaluate(() => {
    const out = [];
    const els = document.querySelectorAll('a[href], button, input, textarea, select, [role=button], [role=link]');
    let n = 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight * 3) continue;
      const label = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || el.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!label && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) continue;
      el.setAttribute('data-ob', String(++n));
      out.push(`[${n}] ${el.tagName.toLowerCase()}${el.type ? `(${el.type})` : ''} ${label}`);
      if (n >= 80) break;
    }
    return out;
  }).catch(() => []);
  const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  return `# ${title}\nURL: ${page.url()}\n\n## Page text\n${clip(text.replace(/\n{3,}/g, '\n\n'), 5000)}\n\n## Interactive elements (use the number as target)\n${items.join('\n') || '(none)'}`;
}

const locate = (page, target) => {
  const t = String(target).trim();
  if (/^\d+$/.test(t)) return page.locator(`[data-ob="${t}"]`).first();
  if (/^[#.\[]|^(input|button|a|textarea|select)\b/.test(t)) return page.locator(t).first();
  return page.getByText(t, { exact: false }).first();
};

export const BROWSER_TOOLS = [
  {
    name: 'browser_open', risk: 'read', label: 'Use a real browser',
    description: 'Open a URL in your own real web browser (JavaScript, dynamic pages, multi-step sites). Returns page text and a numbered list of clickable elements. The user sees your screen live.',
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    run: async ({ url }, ctx) => {
      const { page } = await session(ctx.agent.id);
      await page.goto(/^https?:\/\//.test(url) ? url : `https://${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      logActivity(ctx.agent.id, 'browse', await page.title().catch(() => url), { url: page.url(), live: true });
      await snap(ctx.agent.id, page);
      return describe(page);
    },
  },
  {
    name: 'browser_read', risk: 'read', label: 'Read the browser page',
    description: 'Re-read the current page in your browser. Optionally scroll first: "down", "up", "top", "bottom".',
    parameters: { type: 'object', properties: { scroll: { type: 'string' } } },
    run: async ({ scroll }, ctx) => {
      const { page } = await session(ctx.agent.id);
      if (scroll) await page.evaluate((d) => { const h = innerHeight * 0.85; ({ down: () => scrollBy(0, h), up: () => scrollBy(0, -h), top: () => scrollTo(0, 0), bottom: () => scrollTo(0, document.body.scrollHeight) })[d]?.(); }, scroll);
      await snap(ctx.agent.id, page);
      return describe(page);
    },
  },
  {
    name: 'browser_click', risk: 'dangerous', label: 'Click in the browser',
    description: 'Click an element in your browser. target = element number from the list, visible text, or a CSS selector.',
    parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
    run: async ({ target }, ctx) => {
      const { page } = await session(ctx.agent.id);
      await locate(page, target).click({ timeout: 10000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(600);
      logActivity(ctx.agent.id, 'browse', `Clicked ${target}`, { url: page.url(), live: true });
      await snap(ctx.agent.id, page);
      return describe(page);
    },
  },
  {
    name: 'browser_type', risk: 'dangerous', label: 'Type in the browser',
    description: 'Type text into a field in your browser. target = element number, label text or CSS selector. Set submit=true to press Enter. Never type passwords or payment details.',
    parameters: { type: 'object', properties: { target: { type: 'string' }, text: { type: 'string' }, submit: { type: 'boolean' } }, required: ['target', 'text'] },
    run: async ({ target, text, submit }, ctx) => {
      const { page } = await session(ctx.agent.id);
      const el = locate(page, target);
      const type = await el.getAttribute('type', { timeout: 10000 }).catch(() => '');
      if (/password/i.test(type || '')) return 'Refused: this is a password field. Ask the user to sign in themselves.';
      await el.fill(String(text), { timeout: 10000 });
      if (submit) { await el.press('Enter'); await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(600); }
      logActivity(ctx.agent.id, 'browse', `Typed into ${target}`, { url: page.url(), live: true });
      await snap(ctx.agent.id, page);
      return describe(page);
    },
  },
  {
    name: 'browser_screenshot', risk: 'read', label: 'Save browser screenshots',
    description: 'Save a full-page PNG screenshot of the current browser page into your workspace.',
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'e.g. shots/home.png' } } },
    run: async ({ path: p = `screenshots/${Date.now()}.png` }, ctx) => {
      const { page } = await session(ctx.agent.id);
      const root = workspaceOf(ctx.agent.id);
      const f = path.resolve(root, String(p).replace(/^\/+/, ''));
      if (!f.startsWith(root + path.sep)) return 'Path is outside your workspace';
      fs.mkdirSync(path.dirname(f), { recursive: true });
      await page.screenshot({ path: f, fullPage: true });
      emit('files', { agent_id: ctx.agent.id });
      return `Saved ${p}`;
    },
  },
  {
    name: 'browser_close', risk: 'read', label: 'Close the browser',
    description: 'Close your browser when you are done with it.',
    parameters: { type: 'object', properties: {} },
    run: async (_a, ctx) => { await closeBrowser(ctx.agent.id); return 'Browser closed.'; },
  },
];
