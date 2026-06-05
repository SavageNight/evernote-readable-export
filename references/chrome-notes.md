# Chrome Notes

Use Chrome only after the user has logged in and opened the target notebook. Do not inspect credentials, cookies, local storage, or browser profiles.

Preferred sequence:

1. Load the Chrome control skill.
2. Connect to Chrome through the required Node REPL browser-client setup.
3. Call `browser.user.openTabs()` and claim the visible Evernote/Yinxiang tab.
4. Read a fresh `domSnapshot()` before choosing selectors.
5. Use the exporter script in `scripts/evernote-readable-exporter.mjs`.
6. Run small batches if the browser tool has a short timeout.
7. Use `browser.tabs.finalize({})` when finished, unless the user needs the tab left as a handoff.

Observed Yinxiang page facts:

- Classic Yinxiang pages may render many anonymous `textbox` and `generic` nodes.
- The note body is often available inside a TinyMCE iframe even when local `.notes` exports are encrypted.
- The list uses virtual scrolling. A visible note's index is only valid until the list reflows.
