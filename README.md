# YouAI Mirror — Transparent Proxy 🚀

Free access to YouAI (You.com) Max Plan features via transparent proxy.
Visitors verify with Cloudflare Turnstile — no login required.

---

## ✅ Features
- 🔓 No login required for visitors
- 🔄 DS cookie pool (multiple cookies via admin panel)
- 🔐 Cloudflare Turnstile verification gate
- 🎛️ Admin panel at `/adminzone`
- 🐳 Fully Docker-based — easy to move to any VPS

---

## 🖥️ New VPS Setup — Complete Step by Step

### Prerequisites
- Ubuntu 20.04 / 22.04 VPS (minimum 1GB RAM)
- A domain pointed to your VPS IP (A record)
- Root SSH access

---

### STEP 1 — Connect to your VPS
```bash
ssh root@YOUR_VPS_IP
```

---

### STEP 2 — Install required software
```bash
apt update && apt upgrade -y
apt install -y docker.io nginx git curl certbot python3-certbot-nginx
systemctl enable --now docker
systemctl enable --now nginx
```

Verify Docker is working:
```bash
docker --version
```

---

### STEP 3 — Clone this repository
```bash
cd /root
git clone https://github.com/hzad-pixel/youai-zone youclone2
cd youclone2
ls
```

You should see: `proxy.mjs  Dockerfile  package.json  README.md  .env.example`

---

### STEP 4 — Build Docker image
```bash
cd /root/youclone2
docker build -t you-mirror:latest .
```

Wait for it to finish (2-3 minutes first time).

---

### STEP 5 — Run the container

Replace the values with your own:

```bash
docker run -d --name youclone   --restart unless-stopped   -p 3100:3100   -e OUR_HOST=https://youai.yourdomain.com   -e PORT=3100   -e ADMIN_PASSWORD=YourStrongPassword123   -e TURNSTILE_SITE_KEY=your_turnstile_site_key   -e TURNSTILE_SECRET_KEY=your_turnstile_secret_key   -e DS_SEED=paste_ds_cookie_here   you-mirror:latest
```

Check it's running:
```bash
docker ps
docker logs youclone --tail=20
```

You should see: `✅ YouAI Proxy running on port 3100`

---

### STEP 6 — Nginx configuration

Create the config file:
```bash
nano /etc/nginx/sites-enabled/youai.yourdomain.com
```

Paste this (change `youai.yourdomain.com` to your actual domain):
```nginx
server {
    listen 80;
    server_name youai.yourdomain.com;

    # Allow large uploads
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;

        proxy_set_header Host ;
        proxy_set_header X-Real-IP ;
        proxy_set_header X-Forwarded-For ;
        proxy_set_header X-Forwarded-Proto ;

        # WebSocket support
        proxy_set_header Upgrade ;
        proxy_set_header Connection upgrade;

        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        proxy_buffering off;
    }
}
```

Save: **Ctrl+X → Y → Enter**

Test and reload nginx:
```bash
nginx -t
systemctl reload nginx
```

---

### STEP 7 — SSL Certificate (HTTPS)

```bash
certbot --nginx -d youai.yourdomain.com
```

Follow the prompts:
- Enter your email
- Agree to terms → A
- Redirect HTTP to HTTPS → 2

Done! Your site is now at `https://youai.yourdomain.com`

---

### STEP 8 — Add DS Cookie (Important!)

The DS cookie is what gives premium access. You need at least one.

**How to get DS cookie:**
1. Open browser → go to `https://you.com`
2. Login with a **YouAI Max/Pro** premium account
3. Press **F12** → go to **Application** tab
4. Left sidebar → **Cookies** → click `https://you.com`
5. Find the cookie named `DS` → click it → copy the long value

**Add it to the proxy:**
1. Go to `https://youai.yourdomain.com/adminzone`
2. Enter your `ADMIN_PASSWORD`
3. Paste the DS cookie value → click **Add Cookie**
4. You should see it appear in the pool ✅

---

### STEP 9 — Test it!

Visit `https://youai.yourdomain.com`

You should see the Turnstile verification page → complete it → YouAI opens with premium features!

---

## 🔄 Updating the code (when repo gets updates)

```bash
cd /root/youclone2
git pull origin main
docker build -t you-mirror:latest .
docker stop youclone && docker rm youclone

# Run again with same command as Step 5
docker run -d --name youclone   --restart unless-stopped   -p 3100:3100   -e OUR_HOST=https://youai.yourdomain.com   -e PORT=3100   -e ADMIN_PASSWORD=YourStrongPassword123   -e TURNSTILE_SITE_KEY=your_turnstile_site_key   -e TURNSTILE_SECRET_KEY=your_turnstile_secret_key   -e DS_SEED=paste_ds_cookie_here   you-mirror:latest
```

---

## 🎛️ Admin Panel Guide

URL: `https://yourdomain.com/adminzone`
Password: Your `ADMIN_PASSWORD`

**What you can do:**
- ➕ Add new DS cookies to the pool
- 👁️ View all cookies and their status
- ❌ Remove expired cookies
- 📊 See how many cookies are active

**DS cookie expires after ~30 days** → add a fresh one every month.

---

## 🐳 Useful Docker Commands

```bash
# See live logs
docker logs youclone -f

# Restart container
docker restart youclone

# Stop container
docker stop youclone

# Remove container
docker rm youclone

# See running containers
docker ps

# See all containers (including stopped)
docker ps -a
```

---

## 🔑 All Environment Variables

| Variable | Required | Example | Description |
|---|---|---|---|
| `OUR_HOST` | ✅ | `https://youai.tiktoolz.app` | Your public domain with https |
| `PORT` | ✅ | `3100` | Port the server runs on |
| `ADMIN_PASSWORD` | ✅ | `MyPass@123` | Admin panel password |
| `TURNSTILE_SITE_KEY` | ✅ | `0x4AAAA...` | From Cloudflare Turnstile dashboard |
| `TURNSTILE_SECRET_KEY` | ✅ | `0x4AAAA...` | From Cloudflare Turnstile dashboard |
| `DS_SEED` | ✅ | `eyJhbGci...` | Initial DS cookie (add more via admin) |
| `DS_EXPIRES` | ❌ | `Fri, 05 Aug 2027...` | Cookie expiry (optional) |

---

## 🌐 Cloudflare Turnstile Keys

Get your own free keys at: https://dash.cloudflare.com → Turnstile

1. Add your domain
2. Choose **Managed** challenge type
3. Copy **Site Key** and **Secret Key**

---

## ❓ Troubleshooting

**Container won't start:**
```bash
docker logs youclone
```

**Site shows 502 Bad Gateway:**
```bash
docker ps  # check if container is running
docker restart youclone
```

**Cookie not working:**
- Make sure the DS cookie is from a premium (Max/Pro) account
- Cookie might be expired → add a fresh one from admin panel

**SSL certificate error:**
```bash
certbot renew --dry-run
```

---

## 📞 Summary Checklist

- [ ] Docker installed
- [ ] Repo cloned
- [ ] Docker image built
- [ ] Container running
- [ ] Nginx configured
- [ ] SSL certificate added
- [ ] DS cookie added via /adminzone
- [ ] Site working ✅

