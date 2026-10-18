# Run the Jol demo

From this folder, start the dependency-free Python server:

```powershell
py -3 server.py
```

Open <http://127.0.0.1:8000/>. The server serves the frontend and JSON APIs from the same origin. Demo credentials are `demo@jol.app` and `jol-demo`; any non-empty email and password also work for local demo accounts.

Reports are persisted in `data/reports.json` and created automatically on first run. Health is available at `/api/health`.
