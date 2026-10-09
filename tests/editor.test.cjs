"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../core.js");

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
  assert.match(result, /<body><h1>Fragment<\/h1><\/body>/);
  assert.match(result, /color: teal/);
});

test("installs runtime diagnostics before user JavaScript", () => {
  const result = Core.buildDocument("<html><head></head><body></body></html>", "", "console.log('hello');", "channel-123");
  assert.ok(result.indexOf("window.addEventListener('error'") < result.indexOf("console.log('hello');"));
  assert.match(result, /__codeForge:channel/);
  assert.match(result, /sandbox/ === null ? /x/ : /<script>/);
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
