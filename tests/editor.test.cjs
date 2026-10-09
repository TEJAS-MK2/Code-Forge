"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../core.js");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");

test("injects CSS into a complete HTML document head", () => {
  const result = Core.buildDocument("<!doctype html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>", "h1 { color: red; }", "", "test-channel");
  assert.match(result, /<head><title>Test<\/title><style id="code-forge-user-styles">/);
  assert.match(result, /h1 \{ color: red; \}/);
  assert.match(result, /<\/style>\s*<\/head>/);
});

test("creates a head when an HTML document has none", () => {
  const result = Core.buildDocument("<html><body><h1>Headless</h1></body></html>", "body { color: navy; }", "", "test-channel");
  assert.match(result, /<html>\s*<head>/);
  assert.match(result, /<style id="code-forge-user-styles">[\s\S]*body \{ color: navy; \}[\s\S]*<\/style>/);
  assert.match(result, /<body><h1>Headless<\/h1>/);
});

test("wraps HTML fragments in a valid document", () => {
  const result = Core.buildDocument("<h1>Fragment</h1>", "h1 { color: teal; }", "", "test-channel");
  assert.match(result, /<!doctype html>/i);
  assert.match(result, /<body><h1>Fragment<\/h1><script>/);
  assert.match(result, /color: teal/);
  assert.equal((result.match(/id="code-forge-user-styles"/g) || []).length, 1);
});

test("installs runtime diagnostics before user JavaScript", () => {
  const result = Core.buildDocument("<html><head></head><body></body></html>", "", "console.log('hello');", "channel-123");
  assert.ok(result.indexOf("window.addEventListener('error'") < result.indexOf("console.log('hello');"));
  assert.match(result, /__codeForge:channel/);
  assert.match(result, /<script>\s*\(function\(\)/);
});

test("escapes closing script sequences in user JavaScript", () => {
  const result = Core.buildDocument("<html><head></head><body></body></html>", "", "const example = '</script>'; console.log(example);", "test");
  assert.match(result, /const example = '<\\\/script>';/);
  assert.equal((result.match(/<\/script>/gi) || []).length, 2);
});

test("exports and imports a project without changing its source", () => {
  const project = { html: "<h1>Saved</h1>", css: "h1 { color: green; }", js: "console.log('saved')" };
  const backup = Core.projectJSON(project);
  assert.deepEqual(Core.readProject(backup), project);
  assert.equal(JSON.parse(backup).format, "code-forge-project");
});

test("rejects malformed project files", () => {
  assert.throws(() => Core.readProject('{"html":"only one file"}'), /not a valid Code Forge project/);
  assert.equal(Core.validProject({ html: "", css: "", js: "" }), true);
  assert.equal(Core.validProject({ html: "", css: 7, js: "" }), false);
});

test("normalizes documents that omit the html root but include head or body", () => {
  const result = Core.buildDocument("<head><title>Short form</title></head><body><p>Content</p></body>", "p { color: purple; }", "", "test-channel");
  assert.match(result, /<!doctype html>\s*<html lang="en">/);
  assert.match(result, /<head><title>Short form<\/title><style id="code-forge-user-styles">/);
  assert.match(result, /<body><p>Content<\/p>/);
});

test("exposes all workspace layouts and persists the user's choice", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  for (const mode of ["split", "stack", "editor", "preview"]) {
    assert.match(html, new RegExp('data-layout="' + mode + '"'));
    assert.ok(css.includes(".workspace.layout-" + mode));
  }
  assert.match(html, /role="group" aria-label="Workspace layout"/);
  assert.ok(app.includes("function setLayout(nextLayout)"));
  assert.ok(app.includes('localStorage.setItem("code-forge-layout-v1", layout)'));
  assert.ok(app.includes('button.setAttribute("aria-pressed"'));
});

test("every static application element reference exists in the HTML", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const referencedIds = [...app.matchAll(/getElementById\("([^"]+)"\)/g)].map(match => match[1]);
  const missing = [...new Set(referencedIds.filter(id => !ids.has(id)))];
  assert.deepEqual(missing, [], "Application references missing DOM elements");
});

test("changing layouts clears stale inline resize columns", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.ok(app.includes('workspace.style.removeProperty("grid-template-columns")'));
});

test("mobile toolbar keeps project actions available", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.ok(css.includes(".topbar { flex-wrap: wrap; align-items: flex-start;"));
  assert.ok(css.includes(".top-actions { width: 100%; justify-content: flex-start;"));
  assert.doesNotMatch(css, /\.top-actions \.optional\s*\{\s*display:\s*none/);
});
