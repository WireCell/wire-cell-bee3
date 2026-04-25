# Bee Display for Wire-Cell — Overview

## Purpose

`wire-cell-bee3` is a Django 4.1 web application that visualizes particle physics events from liquid-argon time projection chamber (LArTPC) detectors (MicroBooNE, ProtoDUNE, ICARUS, SBND). Users browse catalogued or uploaded event sets, view 3D event displays rendered client-side by Three.js r145, view 2D pre-rendered plots, inspect wire geometry for different detectors, and browse the PDG particle table. Originally written in Python 2.7 / Django 1.7, now updated to Python 3.8 / Django 4.1 / Three.js r145 / Bootstrap 5.2.

## Project Layout

```
wire-cell-bee3/
├── manage.py              # Django CLI entry point
├── requirements.txt       # Pinned dependencies (see Python version note in local-setup.md)
├── bee/                   # Django project config
│   ├── settings.py        # Site configuration (hostname-switched — see Configuration section)
│   ├── urls.py            # Top-level URL routing
│   ├── wsgi.py / asgi.py  # Standard Django WSGI/ASGI app objects
│   └── bee.conf           # GITIGNORED — must be created manually (see local-setup.md)
├── events/                # Main app: event sets, 3D/2D displays, uploads, wire geometry
│   ├── models.py          # EventSet model
│   ├── views.py           # All view functions
│   ├── urls.py            # events URL patterns
│   ├── templates/events/  # HTML templates
│   └── static/            # CSS (Bootstrap 5.2), JS (Three.js r145, app code)
├── particles/             # Secondary app: PDG particle table browser
│   ├── models.py          # PDGParticles — reads particles/data/pdg_table.json; no DB table
│   ├── views.py
│   ├── urls.py
│   └── data/              # pdg_table.json, pdg_table.txt (shipped with repo)
├── convention/            # Empty module stub (imported by events/models.py for SORTED_RECON_FILES)
└── docs/                  # This documentation
```

## URL Routes

| URL pattern | View | Description |
|---|---|---|
| `/` | `events.views.eventsets` | List all catalogued `EventSet` rows |
| `/set/<set_id>/event/<event_id>/` | `events.views.event` | 3D event display (Three.js) |
| `/set/<set_id>/event/<event_id>/evd-2d/` | `events.views.evd_2D` | 2D plot viewer |
| `/set/<set_id>/event/<event_id>/deadarea/` | `events.views.deadarea_info` | Dead-area info |
| `/set/<set_id>/event/<event_id>/<name>/` | `events.views.data` | AJAX JSON endpoint for `mc`, `op`, `truth`, recon layers |
| `/set/<set_id>/event/list/` | `events.views.event_list` | Event listing from `summary.json` |
| `/collection/<collection_id>/` | `events.views.collection` | Directory browser under `MEDIA_ROOT` |
| `/upload/` | `events.views.upload` | Upload `.zip` event bundle or `.bz2` wire-geometry file |
| `/wires/` | `events.views.wires` | Default wire geometry (uboone) — needs `MEDIA_ROOT/WireGeometry/uboone.json` |
| `/wires/<exp>/` | `events.views.wires` | Wire geometry for a named detector |
| `/wires/archive/` | `events.views.wires` | Browse uploaded `.json.bz2` geometry files |
| `/wires/<exp>/<file>/` | `events.views.wires` | Serve a specific archived geometry file |
| `/particles/` | `particles.views.particle_list` | PDG particle table |
| `/particles/<pdg>/` | `particles.views.details` | Particle detail page |
| `/particles/<pdg>/decays/` | `particles.views.decay_list` | Decay modes |
| `/admin/` | Django admin | Admin interface |

## Database

SQLite at `BASE_DIR/db.sqlite3` (gitignored). The only DB-backed model is `EventSet` (`events/models.py:10`):

| Field | Type | Notes |
|---|---|---|
| `event_type` | CharField | e.g. `nue`, `numu`, `cosmic` |
| `num_events` | IntegerField | Expected event count |
| `energy` | CharField | e.g. `1 GeV` |
| `geometry` | CharField | Detector name |
| `desc` | CharField | Optional description |
| `alias` | CharField | Directory name under `DATA_DIR` |
| `created_at` | DateTimeField | |

The `particles` app has **no DB model** — it reads `particles/data/pdg_table.json` at import time.

## On-Disk Event Data Layout

The app reads event data from JSON files on disk. Two kinds of event sets:

### Catalogued sets (registered in the DB)

Path: `BASE_DIR/<DATA_DIR>/<alias>/data/`

- `DATA_DIR` is site-dependent (see Configuration section): `../wire-cell` locally, `../../public_html/examples` on BNL.
- Per-set `summary.json` at `<alias>/data/summary.json` — generated automatically on first access if absent.
- Per-event directory `<alias>/data/<event_id>/` containing:
  - `<event_id>-mc.json` — Monte Carlo truth
  - `<event_id>-op.json` — optical data
  - `<event_id>-rec_charge_blob.json` — blob reconstruction
  - `<event_id>-rec_simple.json` — simple reconstruction
  - `<event_id>-rec_charge_cell.json` — cell reconstruction
  - `<event_id>-truth.json` — truth info
  - Additional files for dead-area: `<event_id>-channel-deadarea*.json`

### Uploaded (temporary) sets

Uploaded `.zip` files are extracted to `MEDIA_ROOT/<uuid>/data/` (locally `BASE_DIR/tmp/<uuid>/data/`). These are not persisted to the DB; a temporary `EventSet` object with `pk=None` is created in memory.

### Wire geometry

- Active geometry: `MEDIA_ROOT/WireGeometry/<exp>.json`
- Archived geometries: `MEDIA_ROOT/WireGeometry/archive/<exp>-<tag>.json.bz2`

Supported detector names (`exp`): `protodune`, `protodunehd`, `protodunevd`, `uboone` / `microboone`, `icarus`, `sbnd`.

## Configuration

`bee/settings.py` branches on `socket.gethostname()` at startup (`settings.py:18–36`):

| Condition | Site flag | `DEBUG` | `ALLOWED_HOSTS` | `DATA_DIR` |
|---|---|---|---|---|
| hostname starts with `lycastus` | `SITE_BNL` | `False` | `phy.bnl.gov`, `lycastus.phy.bnl.gov` | `../../public_html/examples` |
| hostname starts with `twister` | `SITE_TWISTER` | `False` | `phy.bnl.gov`, `twister.phy.bnl.gov` | `../../public_html/examples` |
| anything else | `SITE_LOCAL` | `True` | `[]` (empty — dev only) | `../wire-cell` |

**`bee/bee.conf`** is required at startup — the app crashes on import if this file is absent. It is an INI file at `BASE_DIR/bee/bee.conf` (gitignored):

```ini
[common]
SECRET_KEY = <secret>
MEDIA_ROOT = /path/to/media   # only needed on non-local (production) hosts
```

**Static files**: `STATIC_ROOT = BASE_DIR/'../bee3-static'` (sibling directory of the repo). `STATIC_URL` is `static/` locally and site-specific paths on BNL hosts. `collectstatic` is required for production.

**`CSRF_TRUSTED_ORIGINS`** is hardcoded to `['https://www.phy.bnl.gov']` — must be extended for any other production domain.

## What Is Not in the Repo

The following deployment artifacts are gitignored and live only on the BNL production machines:

- `bee/bee.conf` — `*.conf` is gitignored
- `fabfile.py` — explicitly gitignored; `fabric`/`paramiko`/`invoke` in `requirements.txt` are unused in committed code
- `db.sqlite3` — gitignored
- `tmp/` — upload staging directory
- nginx / Apache / gunicorn / systemd configs
- Event data under `DATA_DIR`
