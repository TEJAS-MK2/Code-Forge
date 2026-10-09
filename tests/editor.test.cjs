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
  assert.ok(app.includes('localStorage.setItem("code-forge-layout-v1",layout)'));
  assert.ok(app.includes('b.setAttribute("aria-pressed"'));
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


test("CodeMirror 6 is wired as the editor with all three web languages", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const editorSource = fs.readFileSync(path.join(root, "src/editor.js"), "utf8");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(html, /id="editorHost"/);
  assert.match(html, /src="\.\/editor\.bundle\.js"/);
  assert.match(app, /Engine\.EditorView/);
  assert.match(editorSource, /@codemirror\/lang-html/);
  assert.match(editorSource, /@codemirror\/lang-css/);
  assert.match(editorSource, /@codemirror\/lang-javascript/);
  assert.ok(pkg.scripts.build);
  assert.ok(pkg.dependencies.codemirror);
});

test("CodeMirror editor theme includes line numbers, completion and keyboard-friendly setup", () => {
  const source = fs.readFileSync(path.join(root, "src/editor.js"), "utf8");
  assert.match(source, /basicSetup/);
  assert.match(source, /EditorView\.theme/);
  assert.match(source, /caretColor/);
  assert.match(source, /cm-tooltip-autocomplete/);
});

test("production build copies static app assets and bundles editor locally", () => {
  const build = fs.readFileSync(path.join(root, "scripts/build.cjs"), "utf8");
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");
  assert.match(build, /outfile: path\.join\(dist, "editor\.bundle\.js"\)/);
  assert.match(build, /"index\.html", "styles\.css", "core\.js", "app\.js"/);
  assert.match(workflow, /npm install/);
  assert.match(workflow, /path: dist/);
});


test("IDE workspace includes local explorer, file search, tabs and truthful panels", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  for (const token of ['id="ideLayout"', 'id="sidePanel"', 'id="fileTabs"', 'data-view="explorer"', 'data-view="search"']) assert.ok(html.includes(token), token);
  for (const token of ["code-forge-workspace-v2", "function newFile()", "function renameFile(", "function deleteFile(", "function searchFiles(", "function commandPalette()", 'if(panelMode==="problems")']) assert.ok(app.includes(token), token);
  assert.ok(css.includes(".activity-rail"));
  assert.ok(css.includes(".tree-file"));
});

test("workspace backup keeps legacy three-file project import compatible", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.ok(app.includes("Core.readProject(parsed)"));
  assert.ok(app.includes('"index.html":legacy.html'));
  assert.ok(app.includes('"styles.css":legacy.css'));
  assert.ok(app.includes('"app.js":legacy.js'));
});

test("workspace retains required preview entry files and prevents deleting them", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.ok(app.includes('["index.html","styles.css","app.js"].includes(name)'));
  assert.ok(app.includes("The three preview entry files are required."));
  assert.ok(app.includes('Core.buildDocument(files["index.html"],files["styles.css"],files["app.js"]'));
});


test("word-wrap setting uses a CodeMirror compartment rather than a nonexistent editor facet", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const editorSource = fs.readFileSync(path.join(root, "src/editor.js"), "utf8");
  assert.match(editorSource, /EditorView\.theme/);
  assert.match(app, /wrappingCompartment\.reconfigure\(wrapSetting\.checked\?Engine\.EditorView\.lineWrapping:\[\]\)/);
  assert.match(app, /localStorage\.setItem\("code-forge-word-wrap",String\(enabled\)\)/);
});

test("command palette is an accessible filterable dialog, not a browser prompt", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /className="command-overlay"/);
  assert.match(app, /setAttribute\("aria-modal","true"\)/);
  assert.match(app, /ArrowDown/);
  assert.doesNotMatch(app, /prompt\("COMMAND PALETTE/);
});


test("programmatic file switches do not mark files as edited", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /var switchingFile = false/);
  assert.match(app, /if\(update\.docChanged&&!switchingFile\)emit\("input"\)/);
  assert.match(app, /switchingFile=true;editorView\.dispatch/);
});

test("indentation setting updates CodeMirror's actual indent unit", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const source = fs.readFileSync(path.join(root, "src/editor.js"), "utf8");
  assert.match(source, /import \{ indentUnit \} from "@codemirror\/language"/);
  assert.match(app, /indentCompartment\.reconfigure\(Engine\.indentUnit\.of/);
});


test("workspace tabs expose unsaved markers and extra-file actions are accessible", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(app, /className="file-tab-dirty"/);
  assert.match(app, /className="tree-file-action"/);
  assert.match(app, /setAttribute\("aria-label","Actions for "\+name\)/);
  assert.match(css, /\.file-tab-dirty/);
  assert.match(css, /\.tree-file-action/);
});

test("debounced saves persist the file snapshot without replacing another active editor", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /var changedFile=activeFile;saveTimer=setTimeout\(function\(\)\{/);
  assert.match(app, /if\(activeFile===changedFile\)rememberEditor\(\)/);
  assert.match(app, /var saved=persistSnapshot\(false\)/);
  assert.match(app, /if\(saved\)\{dirty\[changedFile\]=false/);
});


test("editor settings expose a persistent font-size preference", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const editor = fs.readFileSync(path.join(root, "src/editor.js"), "utf8");
  assert.match(app, /id="fontSizeSetting"/);
  assert.match(app, /localStorage\.getItem\("code-forge-font-size"\)/);
  assert.match(app, /localStorage\.setItem\("code-forge-font-size",String\(size\)\)/);
  assert.match(editor, /var\(--cf-editor-font-size, 12px\)/);
});

test("workspace-wide replace, preview viewport presets and persisted wrap preferences are wired", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(app, /function replaceAllFiles\(query,replacement\)/);
  assert.match(app, /Replace all in workspace/);
  assert.match(app, /code-forge-word-wrap/);
  assert.match(app, /code-forge-preview-device/);
  for (const mode of ["desktop", "tablet", "phone"]) assert.match(html, new RegExp('<option value="' + mode + '"'));
  assert.match(css, /\.preview-frame-device/);
});
test("manual save never clears dirty state when local persistence fails", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /var saved=persist\(true\);if\(saved\)\{dirty\[activeFile\]=false/);
  assert.match(app, /function persistSnapshot\(showError\)/);
});
test("clear and trim operations refresh saved indicators consistently", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /function markCurrentFileSaved\(\)/);
  assert.match(app, /editor\.value="";markCurrentFileSaved\(\)/);
  assert.match(app, /editor\.value=after;markCurrentFileSaved\(\)/);
});

test("starter templates and duplicate-file workflows are discoverable from the command palette", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  for (const name of ["Landing page", "Portfolio", "Contact form", "Animated card", "Click counter game"]) assert.ok(app.includes('"'+name+'"'), name);
  assert.match(app, /function applyTemplate\(name\)/);
  assert.match(app, /function duplicateFile\(sourceName\)/);
  assert.match(app, /name:"Duplicate active file"/);
});
test("console entries include timestamps and aggregate runtime error counts", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(app, /className="console-time"/);
  assert.match(app, /consoleHistory\.filter\(function\(entry\)\{return entry\.level==="error";\}\)\.length/);
  assert.match(app, /consoleWarnings\+" warnings"/);
  assert.match(css, /\.console-time/);
});

test("CodeMirror keyboard events reach registered app shortcuts", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /editorHost\.addEventListener\("keydown",function\(event\)\{emit\("keydown",event\);\}\)/);
  assert.match(app, /Ctrl\+Shift\+P|event\.key\.toLowerCase\(\)==="p"/);
});

test("recent files persist locally and appear as workspace navigation", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(app, /code-forge-recent-files/);
  assert.match(app, /recentFiles=\[name\]\.concat/);
  assert.match(app, /className="tree-file recent-file"/);
  assert.match(css, /\.recent-file/);
});
test("console filters preserve history and can show errors only", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(app, /function renderConsoleHistory\(\)/);
  assert.match(app, /consoleFilter==="errors"\?consoleHistory\.filter/);
  assert.match(app, /data-console-filter="errors"/);
  assert.match(app, /else renderConsoleHistory\(\)/);
  assert.match(css, /\.console-filter/);
});


test("workspace backup parser validates every file before accepting the backup", () => {
  const valid = { format: "code-forge-workspace", version: 2, files: {
    "index.html": "<h1>Saved</h1>", "styles.css": "h1{color:green}", "app.js": "console.log('ok')", "notes.md": "local note"
  }};
  assert.deepEqual({ ...Core.readWorkspace(valid) }, valid.files);
  assert.deepEqual({ ...Core.readWorkspace(JSON.stringify(valid)) }, valid.files);
});

test("workspace backup parser rejects malformed containers, versions and missing required files", () => {
  assert.throws(() => Core.readWorkspace("{broken"), /JSON|position|property/i);
  assert.throws(() => Core.readWorkspace({ format: "code-forge-workspace", version: 99, files: {} }), /unsupported|invalid format/i);
  assert.throws(() => Core.readWorkspace({ format: "code-forge-workspace", version: 2, files: [] }), /unsupported|invalid format/i);
  assert.throws(() => Core.readWorkspace({ format: "code-forge-workspace", version: 2, files: { "index.html": "<p>only</p>" } }), /must include/i);
});

test("workspace backup parser rejects unsafe names and non-string file contents without partial recovery", () => {
  const unsafe = { format: "code-forge-workspace", version: 2, files: {
    "index.html": "<h1>Safe</h1>", "styles.css": "", "app.js": "", "../private.txt": "unsafe"
  }};
  assert.throws(() => Core.readWorkspace(unsafe), /Invalid file name/i);
  const invalidContent = { format: "code-forge-workspace", version: 2, files: {
    "index.html": "<h1>Safe</h1>", "styles.css": "", "app.js": "", "notes.md": 123
  }};
  assert.throws(() => Core.readWorkspace(invalidContent), /Invalid file contents/i);
});

test("legacy three-file backups remain compatible with strict workspace import", () => {
  const legacy = { format: "code-forge-project", version: 1, files: { html: "<h1>Legacy</h1>", css: "h1{}", js: "void 0" } };
  assert.deepEqual({ ...Core.readWorkspace(legacy) }, { "index.html": "<h1>Legacy</h1>", "styles.css": "h1{}", "app.js": "void 0" });
});

test("failed workspace-wide replacement keeps every file marked as unsaved", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /if\(saved\)dirty=Object\.create\(null\);\s*else Object\.keys\(files\)\.forEach\(function\(name\)\{dirty\[name\]=true;\}\)/);
  assert.match(app, /Unsaved markers are retained; export a backup/);
});

test("import validates the full backup before replacing state and preserves unsaved markers on storage failure", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /var next=Core\.readWorkspace\(String\(reader\.result\)\)/);
  assert.match(app, /if\(!saved\)Object\.keys\(files\)\.forEach\(function\(name\)\{dirty\[name\]=true;\}\)/);
  assert.match(app, /Workspace imported in memory, but browser storage failed/);
});
