# Local Setup (macOS)

This guide gets the Django dev server running on a Mac. Budget ~15 minutes for the setup; getting actual event data to display requires more work (see [Loading Event Data](#loading-event-data) below).

## Prerequisites and Gotchas

Before touching any commands, read these — each one will silently break the setup if missed.

**1. Only Django and its direct dependencies are needed.**
`requirements.txt` pins many packages (`fabric`, `paramiko`, `backports.zoneinfo`, etc.) that are unused in the committed code. On Python 3.9+ the `backports.zoneinfo` line fails to install. Just install Django directly into the venv — that's all the app requires to run.

**2. `bee/bee.conf` must exist before the server starts.**
`bee/settings.py` reads `SECRET_KEY` from this file at import time (`settings.py:40–41`). The file is gitignored, so it will never appear after a `git clone`. Without it, every `manage.py` command crashes with `configparser.NoSectionError`. See step 3 below.

**3. `db.sqlite3` does not exist yet.**
The database file is gitignored. You must run `migrate` before the first server start.

**4. The index page will be empty — that is normal.**
When running locally, `DATA_DIR = '../wire-cell'` (a directory sibling to the repo). If that directory does not exist, the index page at `/` lists zero event sets. This is not a bug.

**5. `/wires/` will 500 without a geometry file.**
The wires view tries to open `MEDIA_ROOT/WireGeometry/uboone.json` when you visit `/wires/` (`views.py:341`). This file is not shipped. Only `/wires/archive/` is safe to visit on a fresh setup (it just lists an empty directory).

**6. `unzip` must be on your PATH.**
The upload view shells out to `unzip` (`views.py:233–255`). macOS ships `unzip` by default, so this is usually not a problem.

**7. The JS bundle must be built before the event display works.**
The 3D viewer (`events/static/js/bee/dist/bee.js`) is a compiled artifact — `dist/` is gitignored so it is never present after a fresh clone. Without it the event page loads but shows only "Working ..." forever. See step 8 below.

---

## Setup Steps

```bash
# 1. Clone (if not already done) and enter the repo
git clone <repo-url> wire-cell-bee3
cd wire-cell-bee3

# 2. Create the virtual environment (venv/ is already gitignored)
python3 -m venv venv

# 3. Activate it — or let direnv do it automatically (see direnv section below)
source venv/bin/activate

# 4. Install only what the app needs (skip the bloated requirements.txt)
pip install "Django==4.1.2"

# 5. Create bee/bee.conf  (the app will not start without this)
SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")
cat > bee/bee.conf << EOF
[common]
SECRET_KEY = $SECRET
EOF
```

> On a production host you would also add `MEDIA_ROOT = /path/to/media` here, but locally `settings.py` ignores that key.

```bash
# 6. Initialize the database
python manage.py migrate

# 7. Create the upload staging directories
#    (prevents 500 on /wires/archive/ and upload endpoint)
mkdir -p tmp/WireGeometry/archive

# 8. Build the front-end JS bundle (required for the 3D event display)
cd events/static/js/bee
npm install
npx parcel build --no-source-maps --public-url ./ bee.js wires-vue.js
cd -

# 9. (Optional) Create a superuser for /admin/
python manage.py createsuperuser
```

## Starting and Stopping the Server

```bash
# Start (foreground — Ctrl-C to stop)
python manage.py runserver

# Start on a different port
python manage.py runserver 8080
```

The server listens on http://127.0.0.1:8000/

## Auto-activation with direnv

[direnv](https://direnv.net/) activates the venv automatically whenever you `cd` into the project directory and deactivates it when you leave.

```bash
# Install once (if not already installed)
brew install direnv

# Add to your shell — add this line to ~/.zshrc (or ~/.bashrc)
eval "$(direnv hook zsh)"   # for zsh
# eval "$(direnv hook bash)"  # for bash

# Inside the project directory, create .envrc
echo 'source venv/bin/activate' > .envrc

# Trust it (one-time per directory)
direnv allow
```

After that, entering the directory activates the venv and `python` points to the project's Python automatically. `.envrc` is gitignored.

---

## Verification Checklist

Open these URLs and confirm they work:

| URL | Expected result |
|---|---|
| `http://127.0.0.1:8000/` | Page loads showing zero event sets |
| `http://127.0.0.1:8000/admin/` | Django admin login page |
| `http://127.0.0.1:8000/particles/` | PDG particle table (full list) — best smoke test |
| `http://127.0.0.1:8000/wires/archive/` | Empty archive page (no 500 error) |

`/admin/` login with the superuser you created confirms the database and sessions work. `/particles/` confirms templates and the shipped `pdg_table.json` load correctly. `/wires/` itself will 500 until you place a `uboone.json` geometry file under `tmp/WireGeometry/`.

---

## Loading Event Data

The dev server starts but displays nothing interesting without data. You have two options:

### Option A — Place a `DATA_DIR` tree (persistent, shows in the event-set list)

1. Obtain event data from a BNL maintainer (or export from the production `../../public_html/examples/` directory).
2. Place it at `../wire-cell/<alias>/data/` (one directory up from the repo root), where `<alias>` matches the `alias` field of an `EventSet` DB row.
3. Create an `EventSet` row via `/admin/` pointing at that alias.
4. Visit `/` — the event set appears; click into an event to see the 3D display.

Expected on-disk layout (see `overview.md` for full details):
```
../wire-cell/
└── <alias>/
    └── data/
        ├── summary.json       # auto-generated on first visit if absent
        └── <event_id>/
            ├── <event_id>-mc.json
            ├── <event_id>-rec_charge_blob.json
            └── ...
```

### Option B — Upload a `.zip` bundle (temporary, no DB entry needed)

1. Prepare a `.zip` file whose contents start with `data/` (the upload view validates this with `unzip -l`).
2. POST it to `/upload/` via the UI.
3. The server extracts it to `tmp/<uuid>/data/` and returns the UUID.
4. Browse to `/collection/<uuid>/` to see the extracted files.

---

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `configparser.NoSectionError: No section: 'common'` | `bee/bee.conf` missing or empty | Create the file as shown in step 5 |
| `FileNotFoundError: .../uboone.json` | Visiting `/wires/` without geometry files | Use `/wires/archive/` instead, or place the JSON file at `tmp/WireGeometry/uboone.json` |
| Index page lists zero events | `../wire-cell/` directory doesn't exist | Expected — see Loading Event Data above |
| `500` on `/wires/archive/` | `tmp/WireGeometry/archive/` directory missing | Run `mkdir -p tmp/WireGeometry/archive` |
| direnv not activating | Hook not in shell config | Add `eval "$(direnv hook zsh)"` to `~/.zshrc` and restart the shell |
| Event page stuck on "Working ..." | `events/static/js/bee/dist/bee.js` was never built | Run step 8: `cd events/static/js/bee && npm install && npx parcel build --no-source-maps --public-url ./ bee.js wires-vue.js` |
| U/V projections look swapped or mirrored (SBND / multi-TPC) | One TPC drifts in the opposite direction | Enable **Helper → Reverse Drift Axis** in the dat.GUI panel — see `docs/overview.md` for details |
