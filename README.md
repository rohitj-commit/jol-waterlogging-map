# Jol — community waterlogging reports

A responsive desktop and mobile web prototype for viewing city-specific flood reports, sharing observations, and saving places.

## Run locally

Requires Python 3.6 or later. No Python packages need installing. A current supported Python release is recommended.

```powershell
py -3 server.py
```

Open http://127.0.0.1:8000/ and enter your name, `demo@jol.app`, and the demo password `jol-demo`.

## Included

- Python HTTP backend with session cookies and JSON report persistence
- Responsive login and personalized dashboard
- Leaflet/OpenStreetMap map and city selection
- City-filtered community reports
- Photo preview and simulated depth-analysis flow
- My reports and saved places (browser-local tracking)
- Browser-playable tutorial in `jol-tutorial.html`

Map libraries and map tiles require an internet connection. The backend creates `data/reports.json` with sample reports on first run; local report data is intentionally excluded from version control.

## Important limitations

This is a local demonstration, not a production safety system. Photo analysis is simulated and currently returns a preset estimate. Sample flood depths, status, confidence, and times are demonstration data, not verified live conditions. Reports without GPS use approximate locations. Never use this app as proof that a flooded street is safe to cross.

Authentication is demo-only: arbitrary non-empty email/password combinations are accepted apart from the demo account's password check. There is no production user database or password hashing. Do not deploy this server publicly or enter real passwords. Uploaded photo previews are not stored by the backend; report metadata is persisted.

Uploading this repository to GitHub does not deploy the Python server. GitHub Pages alone cannot run this backend.

See `RUN.md` for additional startup instructions.
