// Portfolio backend — Manthan Patil
// Run: node server.js   (zero dependencies; email needs `npm install` + SMTP settings in .env)
const http = require('http');
const fs = require('fs');
const path = require('path');

// ---- tiny .env loader ----
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (_) {}

const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'manthanpatil1718p@gmail.com';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
fs.mkdirSync(DATA, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

// ---- email (optional) ----
let mailer = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  try {
    mailer = require('nodemailer').createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: +process.env.SMTP_PORT || 465,
      secure: (process.env.SMTP_PORT || '465') === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  } catch (_) { console.warn('SMTP set but nodemailer missing — run: npm install'); }
}

// ---- helpers ----
const hits = new Map(); // ip -> [timestamps]
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  arr.push(now); hits.set(ip, arr); return arr.length > 5; // 5 enquiries / hour / IP
}
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleContact(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (limited(ip)) return json(res, 429, { ok: false, error: 'Too many messages. Try again later.' });
  let b;
  try { b = JSON.parse(await readBody(req)); } catch { return json(res, 400, { ok: false, error: 'Bad request' }); }
  if (b.website) return json(res, 200, { ok: true }); // honeypot: pretend success to bots
  const entry = {
    id: Date.now().toString(36), at: new Date().toISOString(),
    name: clean(b.name, 100), email: clean(b.email, 150),
    projectType: clean(b.projectType, 60), budget: clean(b.budget, 60), message: clean(b.message, 2000)
  };
  if (!entry.name || !entry.message) return json(res, 422, { ok: false, error: 'Name and message are required' });
  if (entry.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)) return json(res, 422, { ok: false, error: 'Invalid email' });

  fs.appendFile(path.join(DATA, 'messages.jsonl'), JSON.stringify(entry) + '\n', err => err && console.error('save failed', err));
  console.log(`New enquiry from ${entry.name} (${entry.projectType}, ${entry.budget})`);

  if (mailer) {
    mailer.sendMail({
      from: `"Portfolio" <${process.env.SMTP_USER}>`, to: OWNER_EMAIL,
      replyTo: entry.email || undefined,
      subject: `New enquiry: ${entry.projectType} — ${entry.name}`,
      text: `Name: ${entry.name}\nEmail: ${entry.email || '-'}\nProject: ${entry.projectType}\nBudget: ${entry.budget}\n\n${entry.message}`,
      html: `<h3>New portfolio enquiry</h3><p><b>Name:</b> ${esc(entry.name)}<br><b>Email:</b> ${esc(entry.email || '-')}<br><b>Project:</b> ${esc(entry.projectType)}<br><b>Budget:</b> ${esc(entry.budget)}</p><p>${esc(entry.message).replace(/\n/g, '<br>')}</p>`
    }).catch(e => console.error('email failed:', e.message));
  }
  json(res, 200, { ok: true });
}

function handleMessages(req, res) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!ADMIN_TOKEN || t !== ADMIN_TOKEN) return json(res, 401, { ok: false, error: 'Unauthorized' });
  let rows = [];
  try { rows = fs.readFileSync(path.join(DATA, 'messages.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).reverse(); } catch (_) {}
  json(res, 200, { ok: true, count: rows.length, messages: rows });
}

function serveStatic(req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const base = {
      'Content-Type': type, 'Accept-Ranges': 'bytes',
      'Cache-Control': /\.(mp4|jpg|png|webp|woff2)$/.test(file) ? 'public, max-age=86400' : 'no-cache'
    };
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range); // needed for video seeking
    if (range) {
      let start = range[1] ? +range[1] : st.size - +range[2], end = range[1] && range[2] ? +range[2] : st.size - 1;
      if (!(start >= 0) || end >= st.size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...base, 'Content-Length': st.size });
    req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  const url = req.url.split('?')[0];
  if (url === '/api/contact' && req.method === 'POST') return handleContact(req, res).catch(() => json(res, 500, { ok: false }));
  if (url === '/api/messages' && req.method === 'GET') return handleMessages(req, res);
  if (url === '/api/health') return json(res, 200, { ok: true, email: !!mailer });
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  res.writeHead(405); res.end();
}).listen(PORT, () => console.log(`Portfolio running → http://localhost:${PORT}  (email ${mailer ? 'ON' : 'OFF'})`));
