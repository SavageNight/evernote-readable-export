---
name: evernote-readable-export
description: Export readable Markdown and JSON logs from a logged-in Evernote or Yinxiang web notebook page when local .enex/.notes exports contain encrypted content, when the user has already opened a target notebook in Chrome, or when Codex needs to collect note titles and rich-text bodies from the web UI without handling passwords, cookies, or credentials.
---

# Evernote Readable Export

## Purpose

Use this skill to turn a logged-in Evernote/Yinxiang notebook page into local readable files when offline exports show encrypted note bodies such as `content encoding="base64:aes"`.

The workflow assumes the user logs in personally. Never request, receive, inspect, or store passwords, OTPs, cookies, local storage, browser profiles, or saved credentials.

## Workflow

1. Confirm the user has already logged in and opened the target notebook page in Chrome.
2. Use the Chrome browser-control skill and its Node REPL setup. Claim the currently open Evernote/Yinxiang tab.
3. Inspect the page snapshot. Verify the notebook name and note count are visible.
4. Test one note extraction:
   - click a visible note in the left list;
   - read the title from `#gwt-debug-NoteTitleView-textBox` or the selected list item;
   - read the body from the TinyMCE iframe, usually `iframe.RichTextArea-entinymce`;
   - verify the body is complete enough to save.
5. Load `scripts/evernote-readable-exporter.mjs` in the Node REPL and install the exporter.
6. Run the exporter in batches. Save progress after every note.
7. Copy temporary output files into the user's workspace if the browser runtime cannot write there directly.
8. Verify:
   - exported count equals the notebook count;
   - Markdown heading count equals exported count;
   - no exported body has zero characters;
   - if a prior catalog exists, exported titles match it exactly.
9. Finalize Chrome tabs. Keep the user's live Evernote tab only if they need it for handoff.

## Browser Export Quick Start

After Chrome setup has created `browser` and claimed the target tab as `tab`, run:

```js
const { installEvernoteReadableExporter } = await import("C:/Users/Administrator/.codex/skills/evernote-readable-export/scripts/evernote-readable-exporter.mjs");
const exporter = await installEvernoteReadableExporter({ tab, nodeRepl });
await exporter.resetToTop();
await exporter.runBatches({ targetCount: 102, batchSize: 12 });
await exporter.save();
```

The default output goes to `nodeRepl.tmpDir`:

- `evernote-readable-export.md`
- `evernote-readable-export-log.json`

If direct workspace writes are allowed, pass explicit paths:

```js
const exporter = await installEvernoteReadableExporter({
  tab,
  nodeRepl,
  outPath: "C:/path/to/workspace/09_readable.md",
  logPath: "C:/path/to/workspace/09_log.json"
});
```

## Notes About Yinxiang Web UI

The classic Yinxiang/Evernote web UI uses a virtual scrolling note list. Do not build a static list once and click through it by index; list nodes reflow after clicks and scrolls. Always:

- re-read visible notes before each click;
- process one visible note at a time;
- save progress immediately after each successful note;
- use the actual selected title after the click as the canonical key.

Expected selectors from the observed UI:

- note cards: `.focus-NotesView-Note`
- note title in list: `.focus-NotesView-Note-noteTitle.qa-title`
- scroll container: `.NotesView-ScrollWindow`
- selected title input: `#gwt-debug-NoteTitleView-textBox`
- rich text iframe: `iframe.RichTextArea-entinymce`

If any selector fails, inspect a fresh DOM snapshot and update the selector from what is actually visible.

## Verification Commands

Use PowerShell after copying files to the workspace:

```powershell
$log = Get-Content -LiteralPath "path\to\evernote-readable-export-log.json" -Encoding UTF8 -Raw | ConvertFrom-Json
[PSCustomObject]@{
  Count = $log.count
  EmptyBodies = ($log.poems | Where-Object { $_.chars -eq 0 }).Count
  MinChars = ($log.poems | Measure-Object chars -Minimum).Minimum
  MaxChars = ($log.poems | Measure-Object chars -Maximum).Maximum
}
```

Count Markdown note headings:

```powershell
(Select-String -LiteralPath "path\to\evernote-readable-export.md" -Encoding UTF8 -Pattern '^## \d+\. ' | Measure-Object).Count
```

Compare against an existing catalog CSV with an `OriginalTitle` column:

```powershell
$expected = Import-Csv -LiteralPath "path\to\catalog.csv" | Select-Object -ExpandProperty OriginalTitle
$actual = (Get-Content -LiteralPath "path\to\evernote-readable-export-log.json" -Encoding UTF8 -Raw | ConvertFrom-Json).poems | Select-Object -ExpandProperty title
$missing = $expected | Where-Object { $_ -notin $actual }
$extra = $actual | Where-Object { $_ -notin $expected }
[PSCustomObject]@{ MissingCount=$missing.Count; ExtraCount=$extra.Count; Missing=($missing -join ' | '); Extra=($extra -join ' | ') }
```

## Failure Handling

- If the page asks for login, OTP, captcha, or account authorization, stop and ask the user to complete it.
- If the body iframe cannot be read, test copying one note manually through the UI before attempting automation.
- If batch export times out, reduce `batchSize`; progress is retained in memory and saved after each note.
- If the browser runtime cannot write to the workspace, write to `nodeRepl.tmpDir`, then copy the files with a local shell command.
