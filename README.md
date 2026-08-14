# YouAI Mirror — Transparent Proxy

Free access to YouAI Max Plan features via transparent proxy.
Visitors verify with Cloudflare Turnstile — no login required.

## Features
- 🔓 No login required for visitors
- 🔄 DS cookie pool (add multiple cookies via admin panel)
- 🔐 Cloudflare Turnstile gate
- 🎛️ Admin panel at `/adminzone`
- 🐳 Docker-based deployment

---

## New VPS Setup — Full Steps

### Step 1 — Install Docker & Nginx
```bash
apt update && apt install -y docker.io nginx git curl
systemctl enable --now docker
```

### Step 2 — Clone this repo
```bash
cd /root
git clone https://github.com/hzad-pixel/youai-zone youclone2
cd youclone2
```

### Step 3 — Build Docker image
```bash
docker build -t you-mirror:latest .
```

### Step 4 — Run the container
```bash
docker run -d --name youclone \
  --restart unless-stopped \
  -p 3100:3100 \
  -e OUR_HOST=https://youai.yourdomain.com \
  -e PORT=3100 \
  -e ADMIN_PASSWORD=YourStrongPassword \
  -e TURNSTILE_SITE_KEY=your_turnstile_site_key \
  -e TURNSTILE_SECRET_KEY=your_turnstile_secret_key \
  -e DS_SEED=paste_initial_ds_cookie_here \
  you-mirror:latest
```

### Step 5 — Nginx config
Create `/etc/nginx/sites-enabled/youai.yourdomain.com`:
```nginx
server {
    listen 80;
    server_name youai.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
        proxy_buffering off;
    }
}
```

```bash
nginx -t && systemctl reload nginx
```

### Step 6 — SSL (Certbot)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d youai.yourdomain.com
```

### Step 7 — Add DS cookie
1. Open `https://you.com` in browser and login with premium account
2. Press **F12** → Application → Cookies → `you.com`
3. Find the `DS` cookie → copy the long value
4. Visit `https://youai.yourdomain.com/adminzone`
5. Login with your `ADMIN_PASSWORD`
6. Paste DS cookie → Save
7. Done! ✅

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OUR_HOST` | ✅ | Your public domain e.g. `https://youai.tiktoolz.app` |
| `PORT` | ✅ | Container port (default: 3100) |
| `ADMIN_PASSWORD` | ✅ | Admin panel password |
| `TURNSTILE_SITE_KEY` | ✅ | Cloudflare Turnstile site key |
| `TURNSTILE_SECRET_KEY` | ✅ | Cloudflare Turnstile secret key |
| `DS_SEED` | ✅ | Initial DS cookie for the pool |
| `DS_EXPIRES` | ❌ | DS cookie expiry (optional) |

---

## Useful Docker Commands

```bash
# View live logs
docker logs youclone -f

# Restart container
docker restart youclone

# Stop and remove
docker stop youclone && docker rm youclone

# Rebuild after code change
docker build -t you-mirror:latest . && docker restart youclone
```

---

## How to Get DS Cookie (Monthly Refresh)

1. Login to `you.com` with premium account in browser
2. **F12** → Application → Cookies → `you.com`
3. Find `DS` cookie → Copy value
4. Go to `/adminzone` → Add cookie to pool

> DS cookie lasts ~30 days. Add fresh one when old one expires.

