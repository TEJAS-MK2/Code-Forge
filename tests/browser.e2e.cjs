"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const dist = path.resolve(__dirname, "..", "dist");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function startStaticServer() {
  const server = http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }

    let file = path.resolve(dist, `.${pathname}`);
    if (file !== dist && !file.startsWith(dist + path.sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      const body = fs.readFileSync(file);
      response.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  return server;
}

async function main() {
  assert.ok(fs.existsSync(path.join(dist, "index.html")), "Build the app before running browser tests.");

  const server = startStaticServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  let browser;
  const errors = [];
  try {
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push("pageerror: " + error.message));
    page.on("console", message => {
      if (message.type() === "error") errors.push("console: " + message.text());
    });
    page.on("requestfailed", request => {
      errors.push("requestfailed: " + request.url() + " — " + (request.failure()?.errorText || "unknown error"));
    });

    const response = await page.goto(origin, { waitUntil: "load", timeout: 20000 });
    assert.equal(response.status(), 200, "The built application should load over HTTP.");
    assert.equal(await page.title(), "Code Forge — Browser Editor");
    try {
      await page.locator("#editorHost .cm-editor").waitFor({ state: "visible", timeout: 15000 });
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        readyState: document.readyState,
        scriptState: [...document.scripts].map(script => ({
          src: script.getAttribute("src"),
          loaded: [...performance.getEntriesByType("resource")].some(entry => entry.name === script.src && entry.responseEnd > 0)
        })),
        coreAvailable: typeof window.CodeForgeCore,
        editorEngineAvailable: typeof window.CodeForgeEditorEngine,
        editorViewAvailable: typeof window.CodeForgeEditorEngine?.EditorView,
        editorHost: document.querySelector("#editorHost")?.innerHTML.slice(0, 500),
        appShellText: document.body.innerText.slice(0, 500)
      }));
      throw new Error("CodeMirror did not initialize. Browser diagnostics: " +
        JSON.stringify({ diagnostics, errors }) + ". Original wait error: " + error.message);
    }
    await page.locator("#editorHost .cm-content[contenteditable=\"true\"]").waitFor({ state: "visible" });
    const theme = await page.evaluate(() => ({
      accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
      canvas: getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim(),
      editorVisible: !!document.querySelector("#editorHost .cm-editor")?.getBoundingClientRect().height,
      previewVisible: !!document.querySelector("#preview")?.getBoundingClientRect().height,
      consoleVisible: !!document.querySelector("#consoleOutput")?.getBoundingClientRect().height
    }));
    assert.equal(theme.accent, "#b8e986", "The interface should retain its muted-lime accent.");
    assert.equal(theme.canvas, "#111311", "The interface should retain its graphite canvas.");
    assert.equal(theme.editorVisible, true);
    assert.equal(theme.previewVisible, true);
    assert.equal(theme.consoleVisible, true);
    console.log("PASS: graphite-and-muted-lime theme tokens and core workspace regions render");
    console.log("PASS: built app and CodeMirror editor initialize");

    // Simulate the browser's install prompt contract to verify the UI wiring
    // without depending on browser-specific install eligibility heuristics.
    await page.evaluate(() => {
      window.__installPromptCalled = false;
      const event = new Event("beforeinstallprompt", { cancelable: true });
      event.prompt = async () => { window.__installPromptCalled = true; };
      event.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
      window.dispatchEvent(event);
    });
    const installButton = page.getByRole("button", { name: "Install app" });
    await installButton.waitFor({ state: "visible", timeout: 3000 });
    await installButton.click();
    assert.equal(await page.evaluate(() => window.__installPromptCalled), true);
    await page.waitForFunction(() => document.querySelector("#installApp")?.hidden === true);
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent === "Code Forge installed.");
    assert.equal(await page.locator("#toast").textContent(), "Code Forge installed.");
    console.log("PASS: browser install prompt reveals and invokes the install action");

    // Each file must keep an independent undo/redo history after switching tabs.
    const historyMarker = "<!-- per-file-history-regression -->";
    const historyEditor = page.locator('#editorHost .cm-content[contenteditable="true"]');
    await historyEditor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText(historyMarker);
    await page.getByRole("tab", { name: "styles.css" }).click();
    await page.getByRole("tab", { name: "index.html" }).click();
    await historyEditor.click();
    await page.keyboard.press("Control+Z");
    assert.equal((await historyEditor.innerText()).includes(historyMarker), false, "Undo should affect the active file history");
    await page.keyboard.press("Control+Shift+Z");
    assert.equal((await historyEditor.innerText()).includes(historyMarker), true, "Redo should restore the active file change");
    await page.keyboard.press("Control+Z");
    console.log("PASS: per-file undo/redo history survives tab switching");


    // A separate context verifies offline caching without contaminating the main
    // interaction suite's network diagnostics or local workspace.
    const offlineContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    try {
      const offlinePage = await offlineContext.newPage();
      await offlinePage.goto(origin, { waitUntil: "load", timeout: 20000 });
      const registration = await offlinePage.evaluate(async () => {
        const ready = await navigator.serviceWorker.ready;
        return { active: !!ready.active, scope: ready.scope };
      });
      assert.equal(registration.active, true, "The offline service worker should activate.");
      await offlinePage.reload({ waitUntil: "load", timeout: 20000 });
      await offlinePage.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
      await offlineContext.setOffline(true);
      await offlinePage.reload({ waitUntil: "load", timeout: 20000 });
      await offlinePage.waitForFunction(() => document.querySelector("#networkState")?.dataset.network === "offline", null, { timeout: 5000 });
      assert.equal(await offlinePage.locator("#networkState").textContent(), "Browser offline");
      assert.equal(await offlinePage.title(), "Code Forge — Browser Editor");
      await offlinePage.locator("#editorHost .cm-editor").waitFor({ state: "visible", timeout: 10000 });
      assert.equal(await offlinePage.locator('#editorHost .cm-content[contenteditable="true"]').isVisible(), true);
      console.log("PASS: cached app shell reloads with the network disabled");
    } finally {
      await offlineContext.close();
    }

    const preview = page.frameLocator("#preview");
    await preview.locator("#hello").waitFor({ state: "visible", timeout: 10000 });
    await preview.getByRole("button", { name: "Try the button" }).click();
    await preview.locator("#message").waitFor({ state: "visible" });
    assert.equal(await preview.locator("#message").textContent(), "Your JavaScript is running.");
    await page.locator("#consoleOutput").getByText("Button clicked").waitFor({ timeout: 5000 });
    console.log("PASS: preview JavaScript executes and runtime console receives output");

    const editor = page.locator("#editorHost .cm-content[contenteditable=\"true\"]");
    const source = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Browser regression</title></head><body><main><h1 id="e2e">Saved live</h1></main></body></html>';
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText(source);
    await page.waitForFunction(expected => {
      try {
        const saved = JSON.parse(localStorage.getItem("code-forge-workspace-v2") || "null");
        return !!saved && saved.files && saved.files["index.html"] === expected;
      } catch {
        return false;
      }
    }, source, { timeout: 7000 });
    await page.getByRole("button", { name: /Run/ }).click();
    await preview.locator("#e2e").waitFor({ state: "visible", timeout: 10000 });
    assert.equal(await preview.locator("#e2e").textContent(), "Saved live");
    console.log("PASS: editing updates the preview and autosaves the workspace");

    await page.reload({ waitUntil: "load" });
    await page.locator("#editorHost .cm-editor").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(expected => {
      try {
        const saved = JSON.parse(localStorage.getItem("code-forge-workspace-v2") || "null");
        return !!saved && saved.files && saved.files["index.html"] === expected;
      } catch {
        return false;
      }
    }, source, { timeout: 5000 });
    const editorText = await page.locator("#editorHost .cm-content[contenteditable=\"true\"]").textContent();
    assert.ok(editorText.includes("Saved live"), "Reload should restore the saved document.");
    console.log("PASS: project content survives a browser reload in the same profile");

    const importedSource = '<!doctype html><html lang="en"><head><title>Imported workspace</title></head><body><h1 id="imported">Imported backup</h1></body></html>';
    const importedWorkspace = {
      format: "code-forge-workspace",
      version: 2,
      files: {
        "index.html": importedSource,
        "styles.css": "#imported { color: rgb(12, 34, 56); }",
        "app.js": "console.log('imported workspace');",
        "notes.md": "Imported virtual file."
      }
    };
    const importDialog = page.waitForEvent("dialog").then(dialog => dialog.accept());
    await page.locator("#importFile").setInputFiles({
      name: "e2e-workspace.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(importedWorkspace))
    });
    await importDialog;
    await page.waitForFunction(expected => {
      try {
        const saved = JSON.parse(localStorage.getItem("code-forge-workspace-v2") || "null");
        return !!saved && saved.files && saved.files["index.html"] === expected.html &&
          saved.files["notes.md"] === expected.note;
      } catch {
        return false;
      }
    }, { html: importedSource, note: "Imported virtual file." }, { timeout: 7000 });
    await preview.locator("#imported").waitFor({ state: "visible", timeout: 10000 });
    assert.equal(await preview.locator("#imported").textContent(), "Imported backup");
    assert.equal(await preview.locator("#imported").evaluate(element => getComputedStyle(element).color), "rgb(12, 34, 56)");
    console.log("PASS: validated workspace import replaces the project and rebuilds HTML/CSS preview");

    const createFileDialog = page.waitForEvent("dialog").then(dialog => {
      assert.equal(dialog.type(), "prompt");
      return dialog.accept("e2e-notes.md");
    });
    await page.locator("#newFile").click();
    await createFileDialog;
    await page.waitForFunction(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("code-forge-workspace-v2") || "null");
        return !!saved && saved.files && saved.files["e2e-notes.md"] === "";
      } catch {
        return false;
      }
    }, null, { timeout: 7000 });
    await page.locator("#fileTabs").getByRole("tab").filter({ hasText: "e2e-notes.md" }).waitFor({ state: "visible" });
    console.log("PASS: creating and opening a virtual workspace file persists locally");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Backup JSON" }).click()
    ]);
    const downloadPath = await download.path();
    const backup = JSON.parse(fs.readFileSync(downloadPath, "utf8"));
    assert.equal(backup.format, "code-forge-workspace");
    assert.equal(backup.version, 2);
    assert.equal(backup.files["index.html"], importedSource);
    assert.equal(backup.files["notes.md"], "Imported virtual file.");
    assert.equal(backup.files["e2e-notes.md"], "");
    console.log("PASS: workspace export downloads every file in the local workspace");

    // Regression: duplicate and rename must preserve text still in the live editor buffer.
    const dialogResponses = ["duplicate", "e2e-notes-copy.md"];
    const dialogErrors = [];
    const answerDialogs = dialog => {
      const answer = dialogResponses.shift();
      if (dialog.type() !== "prompt" || answer === undefined) {
        dialogErrors.push("Unexpected dialog: " + dialog.type() + " " + dialog.message());
        return dialog.dismiss();
      }
      return dialog.accept(answer);
    };
    page.on("dialog", answerDialogs);
    const liveEditor = page.locator('#editorHost .cm-content[contenteditable="true"]');
    await liveEditor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText("unsaved before duplicate");
    await page.getByRole("button", { name: "Actions for e2e-notes.md" }).click();
    await page.waitForFunction(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("code-forge-workspace-v2") || "null");
        return saved?.files?.["e2e-notes-copy.md"] === "unsaved before duplicate";
      } catch { return false; }
    }, null, { timeout: 7000 });
    assert.deepEqual(dialogResponses, []);
    assert.deepEqual(dialogErrors, []);
    page.off("dialog", answerDialogs);
    console.log("PASS: duplicating a file captures unsaved CodeMirror edits");

    const renameResponses = ["rename", "e2e-renamed.md"];
    const renameErrors = [];
    const answerRenameDialogs = dialog => {
      const answer = renameResponses.shift();
      if (dialog.type() !== "prompt" || answer === undefined) {
        renameErrors.push("Unexpected dialog: " + dialog.type() + " " + dialog.message());
        return dialog.dismiss();
      }
      return dialog.accept(answer);
    };
    page.on("dialog", answerRenameDialogs);
    await liveEditor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText("unsaved before rename");
    await page.getByRole("button", { name: "Actions for e2e-notes-copy.md" }).click();
    await page.waitForFunction(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("code-forge-workspace-v2") || "null");
        return saved?.files?.["e2e-renamed.md"] === "unsaved before rename" &&
          !Object.prototype.hasOwnProperty.call(saved.files, "e2e-notes-copy.md");
      } catch { return false; }
    }, null, { timeout: 7000 });
    assert.deepEqual(renameResponses, []);
    assert.deepEqual(renameErrors, []);
    page.off("dialog", answerRenameDialogs);
    console.log("PASS: renaming a file preserves unsaved CodeMirror edits");

    const workspaceBeforeOversizeImport = await page.evaluate(() => localStorage.getItem("code-forge-workspace-v2"));
    await page.locator("#importFile").setInputFiles({
      name: "oversized-workspace.json",
      mimeType: "application/json",
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 32)
    });
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("10 MiB") === true, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => localStorage.getItem("code-forge-workspace-v2")), workspaceBeforeOversizeImport);
    console.log("PASS: oversized workspace imports are rejected without changing local data");

    // A syntactically invalid import must not replace or mutate the current workspace.
    const workspaceBeforeInvalidImport = await page.evaluate(() => localStorage.getItem("code-forge-workspace-v2"));
    const invalidImportDialog = page.waitForEvent("dialog").then(dialog => dialog.accept());
    await page.locator("#importFile").setInputFiles({
      name: "invalid-workspace.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"format":"code-forge-workspace","version":2,"files":{"index.html":')
    });
    await invalidImportDialog;
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.length > 0, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => localStorage.getItem("code-forge-workspace-v2")), workspaceBeforeInvalidImport);
    console.log("PASS: malformed workspace imports leave the current local workspace untouched");

    // Simulate a quota failure in real browser storage, not just the isolated unit-test adapter.
    await page.evaluate(() => {
      window.__codeForgeNativeSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "code-forge-workspace-v2") {
          throw new DOMException("Simulated quota exceeded", "QuotaExceededError");
        }
        return window.__codeForgeNativeSetItem.call(this, key, value);
      };
    });
    const storageFailureEditor = page.locator('#editorHost .cm-content[contenteditable="true"]');
    await storageFailureEditor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText("storage failure unsaved content");
    await page.waitForFunction(() => document.querySelector("#saveState")?.textContent === "Storage unavailable", null, { timeout: 7000 });
    await page.locator("#fileTabs .file-tab-dirty").first().waitFor({ state: "visible", timeout: 3000 });
    const unloadGuard = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.equal(unloadGuard, true, "Unsaved edits must block navigation when local storage is unavailable");
    const [unsavedDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Backup JSON" }).click()
    ]);
    const unsavedBackupPath = await unsavedDownload.path();
    const unsavedBackup = JSON.parse(fs.readFileSync(unsavedBackupPath, "utf8"));
    assert.equal(unsavedBackup.files["e2e-renamed.md"], "storage failure unsaved content");
    await page.evaluate(() => {
      if (window.__codeForgeNativeSetItem) Storage.prototype.setItem = window.__codeForgeNativeSetItem;
      delete window.__codeForgeNativeSetItem;
    });
    console.log("PASS: storage quota failures keep edits marked unsaved and allow a complete backup export");

    await page.getByRole("button", { name: "Stack" }).click();
    assert.equal(await page.getByRole("button", { name: "Stack" }).getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: "Split" }).click();
    assert.equal(await page.getByRole("button", { name: "Split" }).getAttribute("aria-pressed"), "true");
    console.log("PASS: workspace layout controls respond and update state");

    await page.locator("#previewDevice").selectOption("phone");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(100);
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth
      }));
      assert.ok(dimensions.document <= dimensions.viewport + 1, `Document overflows at ${width}px: ${JSON.stringify(dimensions)}`);
      assert.ok(dimensions.body <= dimensions.viewport + 1, `Body overflows at ${width}px: ${JSON.stringify(dimensions)}`);
    }
    console.log("PASS: document and body stay within 390px and 320px viewports");

    await page.setViewportSize({ width: 1280, height: 900 });

    // Named projects are isolated and snapshots preserve the full virtual workspace.
    const projectActionDialogs = ["new", "E2E Workspace"];
    const projectDialogErrors = [];
    const answerProjectDialogs = dialog => {
      const answer = projectActionDialogs.shift();
      if (dialog.type() !== "prompt" || answer === undefined) {
        projectDialogErrors.push("Unexpected dialog: " + dialog.type() + " " + dialog.message());
        return dialog.dismiss();
      }
      return dialog.accept(answer);
    };
    page.on("dialog", answerProjectDialogs);
    await page.getByRole("button", { name: "Projects" }).click();
    assert.deepEqual(projectActionDialogs, []);
    assert.deepEqual(projectDialogErrors, []);
    page.off("dialog", answerProjectDialogs);
    assert.equal((await page.locator('#editorHost .cm-content[contenteditable="true"]').innerText()).includes("Make it"), true, "New project should start from its own starter files");
    await page.getByLabel("Active project").selectOption({ label: "My Project" });
    assert.equal(await page.locator("#projectSelect").inputValue(), "default");
    await page.getByRole("button", { name: "Snapshot" }).click();
    const localSnapshots = await page.evaluate(() => JSON.parse(localStorage.getItem("code-forge-snapshots-v1:default") || "[]"));
    assert.ok(localSnapshots.length >= 1, "A snapshot should be stored locally for the active project");
    assert.ok(localSnapshots[0].files["index.html"]);
    assert.ok(localSnapshots[0].files["e2e-renamed.md"] !== undefined, "Snapshot should include virtual files");
    console.log("PASS: named local projects switch independently and workspace snapshots persist locally");

    const invalidStoredWorkspace = JSON.stringify({ format: "code-forge-workspace", version: 99, files: {} });
    await page.addInitScript(() => {
      if (window.top === window) {
        localStorage.setItem("code-forge-workspace-v2", '{"format":"code-forge-workspace","version":99,"files":{}}');
      }
    });
    await page.reload({ waitUntil: "load" });
    await page.locator("#editorHost .cm-editor").waitFor({ state: "visible", timeout: 15000 });
    assert.equal(await page.evaluate(() => localStorage.getItem("code-forge-recovery-backup-v1")), invalidStoredWorkspace);
    await page.locator('#editorHost .cm-content[contenteditable="true"]').click();
    await page.keyboard.press("Control+Shift+P");
    await page.getByRole("button", { name: "Export preserved recovery copy" }).waitFor({ state: "visible", timeout: 5000 });
    console.log("PASS: malformed stored workspace is preserved and recovery export remains available");

    assert.deepEqual(errors, [], `Unexpected uncaught browser errors: ${errors.join("; ")}`);
    console.log("PASS: no uncaught browser page errors");
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
