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
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));

    const response = await page.goto(origin, { waitUntil: "load", timeout: 20000 });
    assert.equal(response.status(), 200, "The built application should load over HTTP.");
    assert.equal(await page.title(), "Code Forge — Browser Editor");
    await page.locator("#editorHost .cm-editor").waitFor({ state: "visible", timeout: 15000 });
    await page.locator("#editorHost .cm-content[contenteditable=\"true\"]").waitFor({ state: "visible" });
    console.log("PASS: built app and CodeMirror editor initialize");

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

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Backup JSON" }).click()
    ]);
    const downloadPath = await download.path();
    const backup = JSON.parse(fs.readFileSync(downloadPath, "utf8"));
    assert.equal(backup.format, "code-forge-workspace");
    assert.equal(backup.version, 2);
    assert.equal(backup.files["index.html"], source);
    console.log("PASS: workspace export downloads the complete JSON backup");

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
