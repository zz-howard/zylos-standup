---
name: standup
version: 0.1.0
description: >
  AI-assisted async daily standup tool for collecting team member updates,
  tracking daily report tasks, and preparing summaries. Use when managing
  standups, async check-ins, daily reports, blockers, or team status updates.
type: capability

lifecycle:
  npm: true
  service:
    type: pm2
    name: zylos-standup
    entry: src/index.js
  data_dir: ~/zylos/components/standup
  hooks:
    configure: hooks/configure.js
    post-install: hooks/post-install.js
    pre-upgrade: hooks/pre-upgrade.js
    post-upgrade: hooks/post-upgrade.js
  preserve:
    - config.json
    - standup.db
    - standup.db-wal
    - standup.db-shm
    - logs/
    - backups/

upgrade:
  repo: zz-howard/zylos-standup
  branch: main

config:
  required: []
  optional:
    - name: STANDUP_PORT
      description: HTTP port for the standup service
      default: "3475"

http_routes:
  - path: /standup/*
    type: reverse_proxy
    target: 127.0.0.1:3475
    strip_prefix: /standup

dependencies: []
---

# Standup

AI-assisted async daily standup service with cookie-based team member login,
daily report tasks, and summary data storage.

```bash
npm start
```

Default URL: `http://127.0.0.1:3475/`
