# Linux Deployment

This guide covers deploying `wire-cell-bee3` on a fresh Linux box using **gunicorn + nginx + systemd**. Targets Ubuntu 22.04; RHEL/Rocky users can translate package names (use `dnf` instead of `apt`, `python3.8` from SCL or compile from source, etc.).

> Docker is not shipped with this repo. Using Docker is a valid alternative: containerize the Django app with gunicorn, use a separate nginx container or a reverse proxy, and mount the event data as a volume. This guide covers the non-Docker approach.

---

## Architecture

```
Internet → nginx (80/443, TLS, static files) → gunicorn (127.0.0.1:8001) → Django
                                                              ↓
                                                     db.sqlite3
                                                     MEDIA_ROOT/   (uploads, wire geometry)
                                                     DATA_DIR/      (event data)
```

---

## Required Code Changes

The `settings.py` hostname-detection block (`settings.py:18–36`) only recognizes `lycastus` and `twister`. On any other host it falls through to `SITE_LOCAL` with `DEBUG=True` and no `ALLOWED_HOSTS` — **do not run this in production**. You must make the following changes before deploying.

### 1. Add your host to `bee/settings.py`

Replace the hostname block with an additional `elif` for your server, or — better — move all site-specific values into `bee.conf` and read them from there. A minimal approach:

```python
# In bee/settings.py, add a new elif before the else:
elif HOST_NAME.startswith('your-hostname-prefix'):
    SITE_YOUR = True
    DEBUG = False
    DATA_DIR = '/opt/bee3/data'         # absolute path to event data
    ALLOWED_HOSTS = ['your.domain.com']
```

### 2. Extend `CSRF_TRUSTED_ORIGINS`

```python
# settings.py:69 — append your domain
CSRF_TRUSTED_ORIGINS = ['https://www.phy.bnl.gov', 'https://your.domain.com']
```

### 3. Set `STATIC_URL` for your site

```python
# settings.py:139-145 — add an elif for your site
elif SITE_YOUR:
    STATIC_URL = '/static/'
```

### 4. Set `STATIC_ROOT` to an absolute path

The current value (`BASE_DIR/'../bee3-static'`) works, but an explicit absolute path is clearer:

```python
STATIC_ROOT = Path('/opt/bee3/static')
```

### 5. Add `MEDIA_ROOT` to `bee.conf` for your site

On non-local sites, `MEDIA_ROOT` is read from `bee.conf` (`settings.py:151`). You must set it there.

---

## Directory Layout

```
/opt/bee3/
├── wire-cell-bee3/     ← git clone of this repo
├── venv/               ← Python virtualenv
├── data/               ← event data (DATA_DIR), owner: bee3 user
├── media/              ← MEDIA_ROOT: uploads, WireGeometry/
│   └── WireGeometry/
│       └── archive/
└── static/             ← STATIC_ROOT: collected static files, readable by nginx
```

---

## Step-by-Step Setup

### 1. System packages

```bash
sudo apt update
sudo apt install -y nginx unzip

# Python 3.8 (deadsnakes PPA for Ubuntu 22.04)
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt install -y python3.8 python3.8-venv python3.8-dev
```

> If you want to use Python 3.10+, remove `backports.zoneinfo==0.2.1` from `requirements.txt` before the next step and use `python3.10` / `python3.11` instead.

### 2. Create application user and directories

```bash
sudo useradd --system --home /opt/bee3 --shell /bin/bash bee3
sudo mkdir -p /opt/bee3/{data,media/WireGeometry/archive,static}
sudo chown -R bee3:bee3 /opt/bee3
```

### 3. Clone and install

```bash
sudo -u bee3 bash -c '
  cd /opt/bee3
  git clone <repo-url> wire-cell-bee3
  cd wire-cell-bee3
  python3.8 -m venv ../venv
  source ../venv/bin/activate
  pip install --upgrade pip
  pip install -r requirements.txt gunicorn
'
```

### 4. Apply the code changes from above

Edit `/opt/bee3/wire-cell-bee3/bee/settings.py` to add your host branch, `CSRF_TRUSTED_ORIGINS`, `STATIC_URL`, and optionally `STATIC_ROOT`.

### 5. Create `bee/bee.conf`

```bash
sudo -u bee3 tee /opt/bee3/wire-cell-bee3/bee/bee.conf << 'EOF'
[common]
SECRET_KEY = <generate-a-50-character-random-string>
MEDIA_ROOT = /opt/bee3/media
EOF
chmod 600 /opt/bee3/wire-cell-bee3/bee/bee.conf
```

Generate a secret key with:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(50))"
```

### 6. Initialize database and collect static files

```bash
sudo -u bee3 bash -c '
  source /opt/bee3/venv/bin/activate
  cd /opt/bee3/wire-cell-bee3
  python manage.py migrate
  python manage.py collectstatic --noinput
  python manage.py createsuperuser   # optional
'
```

Static files will be written to `STATIC_ROOT` (e.g., `/opt/bee3/static/`).

### 7. Create the systemd service

```bash
sudo tee /etc/systemd/system/bee3.service << 'EOF'
[Unit]
Description=Bee3 Wire-Cell Display (gunicorn)
After=network.target

[Service]
User=bee3
Group=bee3
WorkingDirectory=/opt/bee3/wire-cell-bee3
ExecStart=/opt/bee3/venv/bin/gunicorn \
    bee.wsgi:application \
    --bind 127.0.0.1:8001 \
    --workers 3 \
    --timeout 120 \
    --access-logfile /opt/bee3/access.log \
    --error-logfile /opt/bee3/error.log
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now bee3
sudo systemctl status bee3
```

### 8. Configure nginx

```bash
sudo tee /etc/nginx/sites-available/bee3 << 'EOF'
server {
    listen 80;
    server_name your.domain.com;

    # Static files (collected by manage.py collectstatic)
    location /static/ {
        alias /opt/bee3/static/;
        expires 7d;
    }

    # All other requests → gunicorn
    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Large uploads (event zip files)
        client_max_body_size 500M;
        proxy_read_timeout 300s;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/bee3 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl enable --now nginx
```

### 9. TLS with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain.com
```

Certbot edits the nginx config to redirect HTTP→HTTPS automatically.

---

## Event Data

Put your event data under `DATA_DIR` (e.g., `/opt/bee3/data/<alias>/data/<event_id>/...`). Register each event set via `/admin/` (Django admin). See `overview.md` for the full on-disk layout.

Wire geometry files can be uploaded through `/upload/` or placed directly at `MEDIA_ROOT/WireGeometry/<exp>.json`.

---

## Hardening Checklist

- [ ] `DEBUG = False` in the settings branch for your host
- [ ] `ALLOWED_HOSTS` contains your public domain
- [ ] `CSRF_TRUSTED_ORIGINS` contains `https://your.domain.com`
- [ ] `bee/bee.conf` has `chmod 600` and is owned by the `bee3` user
- [ ] `SECRET_KEY` is unique and not reused from another site
- [ ] nginx enforces HTTPS (certbot does this automatically)
- [ ] `client_max_body_size` is set appropriately for your expected event-zip sizes
- [ ] SQLite is at `/opt/bee3/wire-cell-bee3/db.sqlite3` with owner `bee3` — this is fine for low-traffic use; migrate to PostgreSQL if you see write-lock contention (the app has a single `EventSet` model with infrequent writes)
- [ ] The `/upload/` endpoint shells out to `unzip` (`views.py:233–255`). Uploaded filenames are replaced with server-generated UUIDs before being passed to the shell, which bounds the injection risk. Restrict `/upload/` with authentication if public-facing access is a concern

---

## Verification

```bash
# gunicorn is running
systemctl status bee3
journalctl -u bee3 -f

# nginx responds
curl -I http://your.domain.com/

# After TLS
curl -I https://your.domain.com/

# Static files served directly by nginx (not proxied)
curl -I https://your.domain.com/static/css/   # should return 301 or directory listing

# Admin login
open https://your.domain.com/admin/

# PDG table (no event data needed)
open https://your.domain.com/particles/

# Upload a sample zip
curl -X POST -F "file=@/path/to/sample.zip" https://your.domain.com/upload/
# Should return a UUID string; check /opt/bee3/media/<uuid>/data/ exists
```

---

## Updating the App

```bash
sudo -u bee3 bash -c '
  cd /opt/bee3/wire-cell-bee3
  git pull
  source ../venv/bin/activate
  pip install -r requirements.txt
  python manage.py migrate
  python manage.py collectstatic --noinput
'
sudo systemctl restart bee3
```
