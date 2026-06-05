import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_MD = "evernote-readable-export.md";
const DEFAULT_LOG = "evernote-readable-export-log.json";

export async function installEvernoteReadableExporter(options) {
  const { tab, nodeRepl, outPath, logPath } = options || {};
  if (!tab) throw new Error("installEvernoteReadableExporter requires a claimed browser tab.");

  const tmpDir = nodeRepl?.tmpDir || process.cwd();
  const state = {
    tab,
    outPath: outPath || path.join(tmpDir, DEFAULT_MD),
    logPath: logPath || path.join(tmpDir, DEFAULT_LOG),
    collected: new Map(),
  };

  async function getScrollState() {
    return await tab.playwright.evaluate(() => {
      const el = document.querySelector(".NotesView-ScrollWindow");
      return el
        ? { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
        : null;
    }, undefined, { timeoutMs: 5000 });
  }

  async function getVisibleNotes() {
    return await tab.playwright.evaluate(() => {
      return Array.from(document.querySelectorAll(".focus-NotesView-Note"))
        .map((el, idx) => {
          const title = el.querySelector(".focus-NotesView-Note-noteTitle.qa-title")?.textContent?.trim() || "";
          const bits = Array.from(el.querySelectorAll("div"))
            .map((div) => div.textContent?.trim())
            .filter(Boolean);
          const date = bits.find((text) => /^\d{2}\/\d{1,2}\/\d{1,2}$/.test(text)) || "";
          const rect = el.getBoundingClientRect();
          return {
            idx,
            title,
            date,
            y: rect.y,
            h: rect.height,
            visible: rect.y < window.innerHeight && rect.y + rect.height > 0,
          };
        })
        .filter((note) => note.title);
    }, undefined, { timeoutMs: 5000 });
  }

  async function currentTitle() {
    return await tab.playwright.evaluate(() => {
      const input = document.querySelector("#gwt-debug-NoteTitleView-textBox");
      const selected = document.querySelector(".focus-NotesView-Note-selected .focus-NotesView-Note-noteTitle.qa-title");
      return {
        inputValue: input && input.value,
        selectedTitle: selected && selected.textContent.trim(),
      };
    }, undefined, { timeoutMs: 5000 });
  }

  async function readBody() {
    return await tab.playwright
      .frameLocator("iframe.RichTextArea-entinymce")
      .locator("body", {})
      .innerText({ timeoutMs: 8000 });
  }

  async function scrollList(delta) {
    await tab.cua.scroll({ x: 390, y: 520, scrollY: delta, scrollX: 0 });
    await tab.playwright.waitForTimeout(500);
    return await getScrollState();
  }

  async function save() {
    const poems = Array.from(state.collected.values());
    let markdown = "# Evernote Readable Export\n\n";
    markdown += `> Exported at: ${new Date().toISOString()}\n\n`;
    poems.forEach((poem, index) => {
      markdown += `## ${index + 1}. ${poem.title}\n\n`;
      if (poem.listDate) markdown += `- List date: ${poem.listDate}\n`;
      markdown += `- Characters: ${poem.chars}\n\n`;
      markdown += `${(poem.body || "[empty body]").replace(/\u00a0/g, " ")}\n\n`;
    });

    const log = {
      count: poems.length,
      scroll: await getScrollState(),
      poems: poems.map((poem) => ({
        title: poem.title,
        listTitle: poem.listTitle,
        listDate: poem.listDate,
        chars: poem.chars,
        capturedAt: poem.capturedAt,
      })),
      generatedAt: new Date().toISOString(),
    };

    await fs.writeFile(state.outPath, markdown, "utf8");
    await fs.writeFile(state.logPath, JSON.stringify(log, null, 2), "utf8");
    return { count: poems.length, outPath: state.outPath, logPath: state.logPath };
  }

  async function resetToTop() {
    for (let i = 0; i < 12; i += 1) {
      const scroll = await getScrollState();
      if (!scroll || scroll.scrollTop <= 0) break;
      await scrollList(-1800);
    }
    await save();
    return await getScrollState();
  }

  async function processOneVisible() {
    const notes = (await getVisibleNotes())
      .filter((note) => note.visible && note.y >= 240 && note.y <= 850 && !state.collected.has(note.title))
      .sort((a, b) => a.y - b.y);

    if (!notes.length) return null;

    const note = notes[0];
    const locator = tab.playwright.locator(".focus-NotesView-Note");
    const count = await locator.count();
    if (note.idx >= count) return null;

    await locator.nth(note.idx).click({ timeoutMs: 8000 });
    await tab.playwright.waitForTimeout(800);

    let meta = await currentTitle();
    let body = await readBody();
    if ((meta.inputValue || meta.selectedTitle || "") !== note.title) {
      await tab.playwright.waitForTimeout(700);
      meta = await currentTitle();
      body = await readBody();
    }

    const finalTitle = meta.inputValue || meta.selectedTitle || note.title;
    if (!state.collected.has(finalTitle)) {
      state.collected.set(finalTitle, {
        title: finalTitle,
        listTitle: note.title,
        listDate: note.date,
        body,
        chars: body.length,
        capturedAt: new Date().toISOString(),
      });
      await save();
    }

    return { target: note.title, finalTitle, chars: body.length };
  }

  async function runBatch(batchSize = 12) {
    const processed = [];
    let idle = 0;

    for (let i = 0; i < batchSize; i += 1) {
      const item = await processOneVisible();
      if (item) {
        processed.push(item);
        idle = 0;
        continue;
      }

      idle += 1;
      const scroll = await getScrollState();
      if (!scroll || scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 20) break;
      await scrollList(500);
      if (idle > 2) break;
    }

    await save();
    return { count: state.collected.size, processed, scroll: await getScrollState() };
  }

  async function runBatches({ targetCount, batchSize = 12, maxBatches = 40 } = {}) {
    const batches = [];
    for (let i = 0; i < maxBatches; i += 1) {
      const result = await runBatch(batchSize);
      batches.push(result);
      const scroll = result.scroll;
      if (targetCount && state.collected.size >= targetCount) break;
      if (!scroll || scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 20) break;
      if (!result.processed.length) break;
    }
    const saved = await save();
    return { ...saved, batches, count: state.collected.size };
  }

  return {
    state,
    getScrollState,
    getVisibleNotes,
    resetToTop,
    processOneVisible,
    runBatch,
    runBatches,
    save,
  };
}
