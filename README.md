# Evernote Readable Export

Codex skill for exporting readable Markdown and JSON logs from a logged-in Evernote/Yinxiang notebook page when local exports contain encrypted note bodies.

## Contents

- `SKILL.md` - skill instructions and workflow
- `scripts/evernote-readable-exporter.mjs` - browser automation exporter
- `references/chrome-notes.md` - Chrome and Yinxiang web UI notes
- `agents/openai.yaml` - Codex skill UI metadata

## Safety

The skill assumes the user logs in personally. It does not request, inspect, store, or transmit passwords, OTPs, cookies, browser profiles, local storage, or saved credentials.
