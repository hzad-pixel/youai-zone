import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.urlencoded({ extended: true }));

const TARGET   = 'https://you.com';
const OUR_HOST = process.env.OUR_HOST;
const PORT     = parseInt(process.env.PORT || '3100');

const TS_SITE_KEY  = process.env.TURNSTILE_SITE_KEY;
const TS_SECRET    = process.env.TURNSTILE_SECRET_KEY;
const ADMIN_PASS   = process.env.ADMIN_PASSWORD;

const GATE_COOKIE  = '__gate';
const SLOT_COOKIE  = '__gslot';
const ADMIN_COOKIE = '__admin';

// ─── Cookie Pool ──────────────────────────────────────────────────────────────
// Each entry: { value: string, addedAt: Date, expired: bool }
const DS_SEED = process.env.DS_SEED || '';
const DS_EXPIRES = process.env.DS_EXPIRES || '';

function genId(){return String(Math.floor(10000000+Math.random()*90000000));}
let cookiePool = [{ value: DS_SEED, addedAt: new Date(), expired: false, id: genId() }];
let poolIndex  = 0; // round-robin pointer

function activePool()  { return cookiePool.filter(c => !c.expired); }
function pickSlot()    {
  const active = activePool();
  if (!active.length) return -1;
  const slot = poolIndex % cookiePool.length;
  // advance to next non-expired
  let tries = 0;
  while (cookiePool[poolIndex % cookiePool.length]?.expired && tries < cookiePool.length) {
    poolIndex++; tries++;
  }
  const chosen = poolIndex % cookiePool.length;
  poolIndex++;
  return chosen;
}
function getSlotValue(slot) {
  const entry = cookiePool[slot];
  if (!entry || entry.expired) {
    // fall back to any active
    const active = activePool();
    return active.length ? active[0].value : null;
  }
  return entry.value;
}
function markExpired(slot) {
  if (cookiePool[slot]) {
    cookiePool[slot].expired = true;
    console.log(`[pool] slot ${slot} marked expired. Active: ${activePool().length}/${cookiePool.length}`);
  }
}

// ─── Cookie parser ────────────────────────────────────────────────────────────
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers['cookie'] || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k.trim()] = v.join('=').trim();
  }
  return out;
}

// ─── Gate HTML ────────────────────────────────────────────────────────────────
function gateHTML(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>YouAI — Security Verification</title>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;background:#0a0a0f;display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;}
  body::before{content:'';position:fixed;inset:0;z-index:0;
    background:radial-gradient(ellipse 70% 45% at 50% -5%,rgba(26,107,255,0.13),transparent);pointer-events:none;}
  .card{position:relative;z-index:1;background:rgba(14,14,20,0.97);border:1px solid rgba(255,255,255,0.07);
    border-radius:28px;padding:48px 36px 40px;text-align:center;width:100%;max-width:400px;
    box-shadow:0 0 0 1px rgba(26,107,255,0.07),0 32px 80px rgba(0,0,0,0.9);
    animation:rise .5s cubic-bezier(.34,1.46,.64,1) both;}
  @keyframes rise{from{opacity:0;transform:translateY(30px) scale(.93)}to{opacity:1;transform:none}}
  .logo-ring{width:100px;height:100px;border-radius:50%;margin:0 auto 24px;
    background:linear-gradient(145deg,#1a6bff,#0038c0);display:flex;align-items:center;
    justify-content:center;overflow:hidden;
    box-shadow:0 0 0 14px rgba(26,107,255,0.09),0 16px 52px rgba(26,107,255,0.5);
    animation:glow 3s ease-in-out infinite;}
  @keyframes glow{
    0%,100%{box-shadow:0 0 0 14px rgba(26,107,255,0.09),0 16px 52px rgba(26,107,255,0.4)}
    50%{box-shadow:0 0 0 22px rgba(26,107,255,0.05),0 16px 64px rgba(26,107,255,0.65)}}
  h1{font-size:clamp(16px,4.5vw,21px);font-weight:800;color:#fff;margin-bottom:14px;
    letter-spacing:-.3px;line-height:1.3;white-space:nowrap;}
  .desc{font-size:13px;color:rgba(255,255,255,0.36);line-height:1.85;margin-bottom:28px;
    max-width:320px;margin-left:auto;margin-right:auto;}
  .line{height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent);margin-bottom:26px}
  .cf-wrap{display:flex;justify-content:center}
  .error-box{background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.18);
    color:#f87171;font-size:12px;padding:10px 16px;border-radius:12px;margin-bottom:20px;}
  @media(max-width:380px){.card{padding:36px 16px 28px;border-radius:20px}
    .logo-ring{width:84px;height:84px}h1{font-size:15px}}
</style>
</head>
<body>
<div class="card">
  <div class="logo-ring">
    <img src="https://www.google.com/s2/favicons?domain=you.com&sz=256"
         alt="you.com" width="96" height="96"
         style="border-radius:50%;object-fit:cover"
         onerror="this.style.display='none'" />
  </div>
  <h1>Performing Security Verification</h1>
  <div class="desc">
    This website uses a security service to protect
    against malicious bots. This page is displayed
    while the website verifies you are not a bot.
  </div>
  <div class="line"></div>
  ${error ? '<div class="error-box">&#9888;&#65039; Verification failed — please try again.</div>' : ''}
  <form method="POST" action="/--verify">
    <div class="cf-wrap">
      <div class="cf-turnstile" data-sitekey="${TS_SITE_KEY}" data-theme="dark" data-callback="__tsOk"></div>
    </div>
  </form>
  <script>function __tsOk(){document.querySelector('form').submit();}<\/script>
</div>
</body>
</html>`;
}

// ─── Maintenance HTML ─────────────────────────────────────────────────────────
function maintenanceHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>YouAI — Temporarily Unavailable</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;background:#0a0a0f;display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;}
  .card{background:rgba(14,14,20,0.97);border:1px solid rgba(255,255,255,0.07);border-radius:28px;
    padding:48px 36px 40px;text-align:center;width:100%;max-width:400px;
    box-shadow:0 32px 80px rgba(0,0,0,0.9);}
  .icon{width:80px;height:80px;border-radius:50%;margin:0 auto 24px;
    background:linear-gradient(135deg,#f59e0b,#d97706);
    display:flex;align-items:center;justify-content:center;font-size:36px;}
  h1{font-size:20px;font-weight:800;color:#fff;margin-bottom:10px;}
  p{font-size:13px;color:rgba(255,255,255,0.4);line-height:1.8;}
</style>
</head>
<body>
<div class="card">
  <div class="icon">🔧</div>
  <h1>Service Temporarily Unavailable</h1>
  <p>We are performing maintenance.<br>Please try again in a few minutes.</p>
</div>
</body>
</html>`;
}

// ─── Admin HTML ───────────────────────────────────────────────────────────────
function adminLoginHTML(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>YouAI Admin</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;background:#0a0a0f;display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;}
  .card{background:#0e0e16;border:1px solid rgba(255,255,255,0.08);border-radius:24px;
    padding:40px 32px;text-align:center;width:100%;max-width:360px;
    box-shadow:0 24px 60px rgba(0,0,0,0.8);}
  h1{font-size:20px;font-weight:800;color:#fff;margin-bottom:6px;}
  .sub{font-size:12px;color:rgba(255,255,255,0.3);margin-bottom:28px;}
  input{width:100%;background:#1a1a26;border:1px solid rgba(255,255,255,0.1);border-radius:12px;
    padding:12px 16px;color:#fff;font-size:14px;outline:none;margin-bottom:12px;}
  input:focus{border-color:rgba(99,102,241,0.5);}
  button{width:100%;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;border-radius:12px;
    padding:12px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;}
  .err{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;
    font-size:12px;padding:8px 14px;border-radius:10px;margin-bottom:14px;}
</style>
</head>
<body>
<div class="card">
  <h1>🔐 Admin Zone</h1>
  <div class="sub">YouAI Cookie Management</div>
  ${error ? '<div class="err">Wrong password. Try again.</div>' : ''}
  <form method="POST" action="/adminzone/login">
    <input type="password" name="password" placeholder="Enter admin password" autofocus/>
    <button type="submit">Login</button>
  </form>
</div>
</body>
</html>`;
}

function adminPanelHTML(msg) {
  const active = activePool().length;
  const total  = cookiePool.length;
  const rows = cookiePool.map((c, i) => {
    const preview = c.id;
    const added   = c.addedAt.toISOString().slice(0,19).replace('T',' ');
    const status  = c.expired
      ? `<span style="color:#f87171">❌ Expired</span>`
      : `<span style="color:#34d399">✅ Active</span>`;
    const resetBtn = c.expired
      ? `<form method="POST" action="/adminzone/reset/${i}" style="display:inline">
           <button class="btn-sm btn-blue" title="Mark active again">↺</button>
         </form>` : '';
    return `<tr>
      <td style="color:rgba(255,255,255,0.4);padding:10px 8px">#${i}</td>
      <td style="font-family:monospace;font-size:15px;font-weight:700;color:#60a5fa;letter-spacing:1px;padding:10px 8px">${preview}</td>
      <td style="padding:10px 8px">${status}</td>
      <td style="color:rgba(255,255,255,0.3);font-size:11px;padding:10px 8px">${added}</td>
      <td style="padding:10px 8px">
        ${resetBtn}
        <button class="btn-sm btn-red" title="Remove"
          onclick="showDeleteModal(${i}, '${preview}')">🗑</button>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>YouAI Admin Panel</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;background:#0a0a0f;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    padding:24px 16px;color:#fff;}
  .wrap{max-width:800px;margin:0 auto;}
  h1{font-size:22px;font-weight:800;margin-bottom:4px;}
  .sub{font-size:13px;color:rgba(255,255,255,0.35);margin-bottom:24px;}
  .stats{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;}
  .stat{background:#111;border:1px solid rgba(255,255,255,0.07);border-radius:14px;
    padding:14px 20px;flex:1;min-width:120px;}
  .stat-n{font-size:28px;font-weight:900;}
  .stat-l{font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px;}
  .green{color:#34d399}.red{color:#f87171}.blue{color:#60a5fa}
  .card{background:#0e0e16;border:1px solid rgba(255,255,255,0.07);border-radius:18px;
    padding:24px;margin-bottom:20px;}
  table{width:100%;border-collapse:collapse;}
  th{font-size:11px;font-weight:600;color:rgba(255,255,255,0.3);
    text-transform:uppercase;letter-spacing:.8px;
    text-align:left;padding:0 8px 10px;}
  tr+tr td{border-top:1px solid rgba(255,255,255,0.05);}
  .btn-sm{border:none;border-radius:8px;padding:5px 10px;cursor:pointer;
    font-size:13px;font-weight:600;}
  .btn-red{background:rgba(239,68,68,0.12);color:#f87171;}
  .btn-red:hover{background:rgba(239,68,68,0.2);}
  .btn-blue{background:rgba(99,102,241,0.12);color:#818cf8;margin-right:4px;}
  .btn-blue:hover{background:rgba(99,102,241,0.2);}
  textarea{width:100%;background:#1a1a26;border:1px solid rgba(255,255,255,0.1);
    border-radius:12px;padding:12px 14px;color:#fff;font-family:monospace;
    font-size:12px;resize:vertical;min-height:80px;outline:none;margin-bottom:12px;}
  textarea:focus{border-color:rgba(99,102,241,0.4);}
  .btn-primary{background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;
    border-radius:12px;padding:11px 24px;color:#fff;font-size:13px;
    font-weight:700;cursor:pointer;}
  .msg{background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.2);
    color:#34d399;font-size:12px;padding:10px 16px;border-radius:10px;margin-bottom:16px;}
  .logout{float:right;font-size:12px;color:rgba(255,255,255,0.3);
    text-decoration:none;padding:4px 10px;border:1px solid rgba(255,255,255,0.1);
    border-radius:8px;}
  .logout:hover{color:#fff;}
  @media(max-width:600px){.stats{flex-direction:column}}
</style>
</head>
<body>
<div class="wrap">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
    <h1>🛡️ YouAI Admin Panel</h1>
    <a href="/adminzone/logout" class="logout">Logout</a>
  </div>
  <div class="sub">Cookie Pool Management — youai.tiktoolz.app</div>

  <div class="stats">
    <div class="stat"><div class="stat-n green">${active}</div><div class="stat-l">Active Cookies</div></div>
    <div class="stat"><div class="stat-n red">${total - active}</div><div class="stat-l">Expired Cookies</div></div>
    <div class="stat"><div class="stat-n blue">${total}</div><div class="stat-l">Total in Pool</div></div>
  </div>

  ${msg ? `<div class="msg">✅ ${msg}</div>` : ''}

  <div class="card">
    <table>
      <thead><tr>
        <th>#</th><th>Cookie ID</th><th>Status</th><th>Added</th><th>Action</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div class="card">
    <div style="font-size:14px;font-weight:700;margin-bottom:14px">➕ Add New Cookie</div>
    <form method="POST" action="/adminzone/add">
      <textarea name="cookie" placeholder="Paste full DS cookie value here (the long JWT string after DS=)…"></textarea>
      <button class="btn-primary" type="submit">Add to Pool</button>
    </form>
  </div>
<!-- Delete Confirmation Modal -->
<div id="del-modal" style="display:none;position:fixed;inset:0;z-index:9999;
  background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);
  align-items:center;justify-content:center;padding:20px">
  <div style="background:#0e0e16;border:1px solid rgba(255,255,255,0.1);border-radius:20px;
    padding:32px 28px;max-width:360px;width:100%;text-align:center;
    box-shadow:0 24px 60px rgba(0,0,0,0.8);animation:rise .3s cubic-bezier(.34,1.46,.64,1) both">
    <div style="width:56px;height:56px;border-radius:50%;background:rgba(239,68,68,0.12);
      border:1px solid rgba(239,68,68,0.2);display:flex;align-items:center;
      justify-content:center;margin:0 auto 18px;font-size:24px">🗑</div>
    <div style="font-size:17px;font-weight:800;color:#fff;margin-bottom:8px">Delete Cookie?</div>
    <div id="del-preview" style="font-family:monospace;font-size:11px;
      color:rgba(255,255,255,0.35);margin-bottom:6px;word-break:break-all"></div>
    <div style="font-size:13px;color:rgba(255,255,255,0.35);margin-bottom:24px">
      This cookie will be permanently removed from the pool.
    </div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button onclick="closeModal()"
        style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
          border-radius:12px;padding:11px;color:rgba(255,255,255,0.7);
          font-size:14px;font-weight:600;cursor:pointer">
        No, Keep It
      </button>
      <form id="del-form" method="POST" style="flex:1">
        <button type="submit"
          style="width:100%;background:linear-gradient(135deg,#ef4444,#b91c1c);border:none;
            border-radius:12px;padding:11px;color:#fff;
            font-size:14px;font-weight:700;cursor:pointer">
          Yes, Delete
        </button>
      </form>
    </div>
  </div>
</div>
<script>
function showDeleteModal(idx, preview) {
  document.getElementById('del-preview').textContent = preview;
  document.getElementById('del-form').action = '/adminzone/remove/' + idx;
  var m = document.getElementById('del-modal');
  m.style.display = 'flex';
}
function closeModal() {
  document.getElementById('del-modal').style.display = 'none';
}
document.getElementById('del-modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
</script>
</div>
</body>
</html>`;
}

// ─── OPEN paths (no gate check) ───────────────────────────────────────────────
const OPEN_PATHS = new Set(['/verify', '/--verify', '/favicon.ico',
  '/adminzone', '/adminzone/login', '/adminzone/logout',
  '/adminzone/add', '/adminzone/remove', '/adminzone/reset']);

// ─── Gate middleware ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/adminzone')) return next();
  if (OPEN_PATHS.has(req.path)) return next();
  if (parseCookies(req)[GATE_COOKIE] === '1') return next();
  res.redirect(302, '/verify');
});

// ─── Gate page ────────────────────────────────────────────────────────────────
app.get('/verify', (_req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.send(gateHTML(false));
});

// ─── Turnstile verify ─────────────────────────────────────────────────────────
app.post('/--verify', async (req, res) => {
  const token = req.body['cf-turnstile-response'] || '';
  if (!token) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(400).send(gateHTML(true));
  }
  try {
    const form = new URLSearchParams();
    form.append('secret', TS_SECRET);
    form.append('response', token);
    form.append('remoteip', req.headers['x-real-ip'] || req.ip || '');
    const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: form });
    const data = await cfRes.json();
    if (data.success) {
      const slot = pickSlot();
      if (slot === -1) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.status(503).send(maintenanceHTML());
      }
      const cookies = [
        `${GATE_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax`,
        `${SLOT_COOKIE}=${slot}; Path=/; HttpOnly; SameSite=Lax`,
      ];
      res.setHeader('set-cookie', cookies);
      return res.redirect(302, '/chat');
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(403).send(gateHTML(true));
  } catch (err) {
    console.error('[turnstile]', err.message);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(500).send(gateHTML(true));
  }
});

// ─── Admin routes ─────────────────────────────────────────────────────────────
function isAdminAuthed(req) {
  return parseCookies(req)[ADMIN_COOKIE] === '1';
}

app.get('/adminzone', (req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (!isAdminAuthed(req)) return res.send(adminLoginHTML(false));
  res.send(adminPanelHTML(''));
});

app.post('/adminzone/login', (req, res) => {
  const pwd = (req.body.password || '').trim();
  if (pwd !== ADMIN_PASS) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.send(adminLoginHTML(true));
  }
  res.setHeader('set-cookie', `${ADMIN_COOKIE}=1; Path=/; HttpOnly; SameSite=Strict`);
  res.redirect(302, '/adminzone');
});

app.get('/adminzone/logout', (req, res) => {
  res.setHeader('set-cookie', `${ADMIN_COOKIE}=; Path=/; Max-Age=0`);
  res.redirect(302, '/adminzone');
});

app.post('/adminzone/add', async (req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (!isAdminAuthed(req)) return res.send(adminLoginHTML(false));
  let val = (req.body.cookie || '').trim();
  if (val.startsWith('DS=')) val = val.slice(3);
  if (!val) return res.send(adminPanelHTML('❌ Empty cookie — nothing added.'));
  if (cookiePool.some(c => c.value === val)) return res.send(adminPanelHTML('⚠️ Cookie already in pool.'));

  // Validate cookie against you.com before adding
  try {
    const testRes = await fetch('https://you.com/api/user', {
      method: 'GET',
      headers: {
        'cookie': `DS=${val}`,
        'host': 'you.com',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'manual',
    });
    const loc = testRes.headers.get('location') || '';
    const isExpired = testRes.status === 401
      || loc.includes('/login')
      || loc.includes('/signin')
      || testRes.status === 403;
    if (isExpired) {
      console.log(`[admin] rejected expired/invalid cookie (status ${testRes.status})`);
      return res.send(adminPanelHTML('❌ Cookie is expired or invalid — not added. Please paste a fresh DS cookie.'));
    }
  } catch (err) {
    console.error('[admin] validation fetch error:', err.message);
    return res.send(adminPanelHTML('⚠️ Could not validate cookie (network error). Not added.'));
  }

  cookiePool.push({ value: val, addedAt: new Date(), expired: false, id: genId() });
  console.log(`[admin] cookie added. Pool size: ${cookiePool.length}`);
  res.send(adminPanelHTML(`✅ Cookie #${cookiePool.length - 1} added and verified successfully!`));
});

app.post('/adminzone/remove/:index', (req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (!isAdminAuthed(req)) return res.send(adminLoginHTML(false));
  const idx = parseInt(req.params.index);
  if (isNaN(idx) || idx < 0 || idx >= cookiePool.length) return res.send(adminPanelHTML('Invalid index.'));
  cookiePool.splice(idx, 1);
  poolIndex = 0;
  console.log(`[admin] cookie #${idx} removed. Pool size: ${cookiePool.length}`);
  res.send(adminPanelHTML(`Cookie #${idx} removed.`));
});

app.post('/adminzone/reset/:index', (req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (!isAdminAuthed(req)) return res.send(adminLoginHTML(false));
  const idx = parseInt(req.params.index);
  if (isNaN(idx) || idx < 0 || idx >= cookiePool.length) return res.send(adminPanelHTML('Invalid index.'));
  cookiePool[idx].expired = false;
  console.log(`[admin] cookie #${idx} reset to active.`);
  res.send(adminPanelHTML(`Cookie #${idx} marked active again.`));
});

// ─── Proxy constants ──────────────────────────────────────────────────────────
const SKIP_HEADERS = new Set([
  'host','content-encoding','transfer-encoding',
  'content-security-policy','x-frame-options',
  'strict-transport-security','content-length',
  'x-content-type-options','cross-origin-opener-policy',
]);
const TEXT_TYPES = [
  'text/html','text/css','application/javascript','application/json',
  'text/javascript','application/x-javascript','text/plain',
];
function isText(ct) { return TEXT_TYPES.some(t => ct && ct.includes(t)); }

// ─── Inject CSS + JS ──────────────────────────────────────────────────────────
const INJECT_CSS = `
<style id="__mi">
  .hkwkv50,._18q1lzg1,._76gb1m1,
  li:nth-child(4) .b4wmxu2,
  li:nth-child(4) > .b4wmxu3{display:none!important}
  #_pw{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;
    background:#000;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    padding:16px;box-sizing:border-box}
  #_pw.on{display:flex!important}
  #_pc{background:#111;border:1px solid #2a2a2a;border-radius:24px;width:100%;max-width:380px;
    padding:40px 32px 32px;text-align:center;box-sizing:border-box;
    box-shadow:0 0 60px rgba(255,20,60,0.15),0 24px 60px rgba(0,0,0,0.8);
    animation:_pp .35s cubic-bezier(.34,1.46,.64,1) both}
  @keyframes _pp{0%{opacity:0;transform:scale(.82) translateY(30px)}100%{opacity:1;transform:none}}
  #_pi{width:72px;height:72px;border-radius:50%;margin:0 auto 22px;
    background:linear-gradient(135deg,#ff2347,#a80020);
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 0 0 10px rgba(255,35,71,0.12),0 8px 28px rgba(255,35,71,0.45);
    animation:_pg 2s ease-in-out infinite}
  @keyframes _pg{50%{box-shadow:0 0 0 18px rgba(255,35,71,0.06),0 8px 36px rgba(255,35,71,0.55)}}
  #_pi svg{width:32px;height:32px;display:block}
  #_pb{display:inline-flex;align-items:center;gap:6px;
    border:1px solid rgba(255,35,71,0.3);background:rgba(255,35,71,0.08);
    color:#ff5572;font-size:10px;font-weight:700;letter-spacing:1.5px;
    text-transform:uppercase;padding:4px 12px 4px 10px;border-radius:100px;margin-bottom:16px}
  #_pb::before{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;
    background:#ff2347;animation:_bl 1s ease-in-out infinite}
  @keyframes _bl{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.25;transform:scale(.7)}}
  #_pt{font-size:21px;font-weight:800;color:#fff;margin-bottom:8px;letter-spacing:-.2px}
  #_ps{font-size:13px;color:rgba(255,255,255,0.4);line-height:1.7;margin-bottom:24px}
  #_pd{height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent);margin-bottom:24px}
  #_pring{position:relative;width:72px;height:72px;margin:0 auto 14px}
  #_pring svg{position:absolute;top:0;left:0;width:72px;height:72px}
  #_psvg{transform:rotate(-90deg);overflow:visible}
  #_ptrk{fill:none;stroke:#222;stroke-width:4}
  #_pfil{fill:none;stroke:url(#_pgr);stroke-width:4;stroke-linecap:round;
    stroke-dasharray:197;stroke-dashoffset:197;transition:stroke-dashoffset 1s linear}
  #_pnum{position:absolute;inset:0;display:flex;align-items:center;
    justify-content:center;font-size:24px;font-weight:900;color:#fff;line-height:1}
  #_pft{font-size:11px;color:rgba(255,255,255,0.22);letter-spacing:.6px;margin-top:4px}
  @media(max-width:430px){
    #_pc{padding:32px 20px 26px;border-radius:20px}
    #_pt{font-size:18px}#_pi{width:60px;height:60px}}
</style>
<script>
(function(){
  var B=['/settings','/account','/profile','/upgrade','/subscription','/billing','/plans','/logout','/signout'];
  function bad(u){var s=String(u||'');return B.some(function(b){return s===b||s.startsWith(b+'/');});}
  ['pushState','replaceState'].forEach(function(m){
    var o=history[m].bind(history);
    history[m]=function(a,b,u){if(u&&bad(u)){window.__pwBlock=true;return;}return o(a,b,u);};
  });
})();
</script>`;

const INJECT_JS = `
<div id="_pw">
  <div id="_pc">
    <div id="_pi">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/>
      </svg>
    </div>
    <div id="_pb">Restricted Area</div>
    <div id="_pt">Access Not Allowed</div>
    <div id="_pd"></div>
    <div id="_ps">This section is restricted &amp;<br>cannot be accessed here.</div>
    <div id="_pring">
      <svg id="_psvg" viewBox="0 0 64 64">
        <defs><linearGradient id="_pgr" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ff2347"/><stop offset="100%" stop-color="#ff6b81"/>
        </linearGradient></defs>
        <circle id="_ptrk" cx="32" cy="32" r="28"/>
        <circle id="_pfil" cx="32" cy="32" r="28"/>
      </svg>
      <div id="_pnum">3</div>
    </div>
    <div id="_pft">Redirecting to Chat&hellip;</div>
  </div>
</div>
<script>
(function(){
  var B=['/settings','/account','/profile','/upgrade','/subscription','/billing','/plans','/logout','/signout'];
  var _t=null,_on=false,SEC=3,DASH=175.9;
  function bad(u){var s=String(u||'');return B.some(function(b){return s===b||s.startsWith(b+'/');});}
  function show(){
    if(_on)return;_on=true;
    var w=document.getElementById('_pw');if(!w)return;
    w.style.cssText='display:flex!important;position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:#000;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    var fil=document.getElementById('_pfil'),num=document.getElementById('_pnum');
    var s=SEC;if(num)num.textContent=s;if(fil)fil.style.strokeDashoffset=DASH+'';
    clearInterval(_t);
    _t=setInterval(function(){
      s--;
      if(num)num.textContent=Math.max(s,0);
      if(fil)fil.style.strokeDashoffset=String(Math.max(DASH-DASH*((SEC-s)/SEC),0));
      if(s<=0){clearInterval(_t);window.location.replace('/chat');}
    },1000);
  }
  function lock(){
    document.querySelectorAll('a[href]').forEach(function(a){
      if(a._bl)return;
      if(bad(a.getAttribute('href')||'')){
        a._bl=true;
        a.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();show();},true);
      }
    });
  }
  function check(){if(bad(location.pathname))show();}
  ['pushState','replaceState'].forEach(function(m){
    var o=history[m].bind(history);
    history[m]=function(a,b,u){if(u&&bad(String(u))){show();return;}return o(a,b,u);};
  });
  window.addEventListener('popstate',check);
  if(document.body){lock();check();}
  else document.addEventListener('DOMContentLoaded',function(){lock();check();});
  new MutationObserver(lock).observe(document.documentElement,{childList:true,subtree:true});
  if(window.__pwBlock){window.__pwBlock=false;show();}
})();
</script>`;

function rewriteBody(text) {
  let out = text
    .replace(/https:\/\/you\.com/g, OUR_HOST)
    .replace(/https:\\\/\\\/you\.com/g, OUR_HOST.replace(/\//g, '\\/'))
    .replace(/wss:\/\/you\.com/g, OUR_HOST.replace('http', 'ws'));
  if (out.includes('<head>'))       out = out.replace('<head>', '<head>' + INJECT_CSS);
  else if (out.includes('</head>')) out = out.replace('</head>', INJECT_CSS + '</head>');
  if (out.includes('</body>'))      out = out.replace('</body>', INJECT_JS + '</body>');
  return out;
}

// ─── Expiry detection ─────────────────────────────────────────────────────────
function isExpiredResponse(response) {
  if (response.status === 401) return true;
  const loc = response.headers.get('location') || '';
  if (loc.includes('/login') || loc.includes('/signin')) return true;
  return false;
}

// ─── Main proxy ───────────────────────────────────────────────────────────────
app.use(async (req, res) => {
  // Maintenance check
  if (activePool().length === 0) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(503).send(maintenanceHTML());
  }

  const cookies = parseCookies(req);
  const slot    = parseInt(cookies[SLOT_COOKIE] ?? '-1');
  const dsValue = getSlotValue(slot === -1 ? 0 : slot) || activePool()[0]?.value;
  if (!dsValue) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(503).send(maintenanceHTML());
  }

  const targetUrl = TARGET + req.url;
  const headers   = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!['host','origin','referer'].includes(k)) headers[k] = v;
  }
  headers['host']       = 'you.com';
  headers['origin']     = 'https://you.com';
  headers['referer']    = 'https://you.com' + req.url;
  headers['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  delete headers['accept-encoding'];

  const oldCookie = (headers['cookie'] || '')
    .replace(/\bDS=[^;]*(;\s*)?/g, '')
    .replace(/\b__gate=[^;]*(;\s*)?/g, '')
    .replace(/\b__gslot=[^;]*(;\s*)?/g, '')
    .trim().replace(/^;|;$/g, '');
  headers['cookie'] = oldCookie ? (`DS=${dsValue}; ` + oldCookie) : `DS=${dsValue}`;

  let body;
  if (!['GET','HEAD'].includes(req.method)) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks);
    headers['content-length'] = String(body.length);
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method, headers, body, redirect: 'manual',
    });

    // Expiry detection
    if (isExpiredResponse(response) && slot >= 0 && slot < cookiePool.length) {
      markExpired(slot);
      // if any active left, redirect user to re-verify with a new slot
      if (activePool().length > 0) {
        res.setHeader('set-cookie', [
          `${GATE_COOKIE}=; Path=/; Max-Age=0`,
          `${SLOT_COOKIE}=; Path=/; Max-Age=0`,
        ]);
        return res.redirect(302, '/verify');
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(503).send(maintenanceHTML());
    }

    res.status(response.status);

    const cookiesToSet = [
      `DS=${dsValue}; Path=/; Expires=${DS_EXPIRES}; SameSite=Lax`,
      `ds=${dsValue}; Path=/; Expires=${DS_EXPIRES}; SameSite=Lax`,
    ];
    const rawSetCookies = [];
    response.headers.forEach((val, key) => { if (key === 'set-cookie') rawSetCookies.push(val); });
    for (const c of rawSetCookies) {
      if (c.startsWith('DS=') || c.startsWith('ds=')) continue;
      cookiesToSet.push(
        c.replace(/;\s*domain=\.?you\.com/gi, '')
         .replace(/;\s*secure(?=;|$)/gi, '')
         .replace(/;\s*samesite=\w+/gi, '')
      );
    }
    res.setHeader('set-cookie', cookiesToSet);

    response.headers.forEach((val, key) => {
      if (SKIP_HEADERS.has(key) || key === 'set-cookie') return;
      if (key === 'location') {
        res.setHeader('location', val.replace('https://you.com', OUR_HOST)); return;
      }
      try { res.setHeader(key, val); } catch (_) {}
    });

    const ct = response.headers.get('content-type') || '';
    if (isText(ct)) {
      const text = await response.text();
      const rewritten = rewriteBody(text);
      res.setHeader('content-length', String(Buffer.byteLength(rewritten)));
      res.send(rewritten);
    } else {
      if (response.body) response.body.pipe(res); else res.end();
    }
  } catch (err) {
    console.error('[proxy error]', err.message, '->', targetUrl);
    res.status(502).json({ error: 'proxy_error', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log('✅ You.com Mirror  port=' + PORT + '  OUR_HOST=' + OUR_HOST);
  console.log(`   Cookie pool: ${cookiePool.length} cookie(s) loaded`);
  console.log('   Admin panel: /adminzone');
  console.log('   Turnstile gate: ENABLED  siteKey=' + TS_SITE_KEY.slice(0,12) + '...');
});
