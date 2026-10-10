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
  const core = fs.readFileSync(path.join(root, "core.js"), "utf8");
  assert.ok(app.includes("Core.readWorkspace(String(reader.result))"));
  assert.ok(core.includes("var legacy = readProject(parsed)"));
  assert.ok(core.includes('"index.html": legacy.html'));
  assert.ok(core.includes('"styles.css": legacy.css'));
  assert.ok(core.includes('"app.js": legacy.js'));
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
  assert.match(app, /switchingFile=true;\s*if\(!editorStates\[name\]\)editorStates\[name\]=makeEditorState\(name\);\s*editorView\.setState\(editorStates\[name\]\)/);
});

test("indentation setting updates CodeMirror's actual indent unit", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const source = fs.readFileSync(path.join(root, "src/editor.js"), "utf8");
  assert.match(source, /import \{ indentUnit, syntaxHighlighting, HighlightStyle \} from "@codemirror\/language"/);
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
  assert.match(app, /function replaceAllFiles\(query,replacement,options\)/);
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


test("workspace search supports case-sensitive and whole-word match navigation", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(app, /id="searchCaseSensitive"/);
  assert.match(app, /id="searchWholeWord"/);
  assert.match(app, /function searchPattern\(query,options\)/);
  assert.match(app, /function navigateSearchMatch\(direction\)/);
  assert.match(app, /data-match-index/);
  assert.match(app, /function replaceAllFiles\(query,replacement,options\)/);
  assert.match(css, /\.search-hit\.is-current/);
});

test("mobile workspace constrains horizontal overflow without changing desktop identity", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(css, /\.app-shell\{width:100%;min-width:0;max-width:100%;overflow-x:clip\}/);
  assert.match(css, /@media\(max-width:760px\)\{html,body\{width:100%;max-width:100%;overflow-x:clip\}/);
  assert.match(css, /\.workspace\{min-width:0;width:100%;max-width:100%;flex:1 1 auto\}/);
  assert.match(css, /main \{ min-width: 0; width: 100%; max-width: 100%; \}/);
  assert.match(css, /\.ide-layout\{[^}]*min-width:0;width:100%;max-width:100%/);
  assert.match(css, /\.editor-host \.cm-editor \{ height: 100%; width: 100%; min-width: 0; max-width: 100%;/);
  assert.match(css, /\.editor-host \.cm-scroller \{ min-width: 0; max-width: 100%; overflow: auto; \}/);
});


test("Go to Line is available through Ctrl+G and the accessible command palette", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(app, /function goToLine\(\)/);
  assert.match(app, /event\.key\.toLowerCase\(\)==="g"\)\{event\.preventDefault\(\);goToLine\(\)/);
  assert.match(app, /name:"Go to line",hint:"Ctrl \+ G",run:goToLine/);
  assert.match(app, /setAttribute\("aria-label","Go to line"\)/);
  assert.match(app, /setAttribute\("aria-label","Line number"\)/);
  assert.match(css, /\.command-dialog/);
});

test("CodeMirror editor setup uses the built-in keyboard and bracket editing toolkit", () => {
  const source = fs.readFileSync(path.join(root, "src/editor.js"), "utf8");
  assert.match(source, /basicSetup/);
  assert.match(source, /EditorView/);
  assert.match(source, /@codemirror\/lang-html/);
});


test("template loading preserves unsaved markers when local storage cannot save", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /if\(!saved\)Object\.keys\(files\)\.forEach\(function\(fileName\)\{dirty\[fileName\]=true;\}\)/);
  assert.match(app, /Unsaved markers are retained; export a backup/);
});

test("search panel remains mounted after navigating or replacing workspace matches", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /if\(sideView!=="search"\)renderExplorer\(\);updateCursor\(\)/);
  assert.match(app, /function jumpToSearchMatch\(index\)/);
});


test("workspace save reports quota failures without mutating in-memory files", () => {
  const files = { "index.html": "<h1>Unsaved work</h1>", "styles.css": "", "app.js": "", "notes.md": "keep me" };
  const before = JSON.stringify(files);
  const storage = { setItem() { const error = new Error("QuotaExceededError"); error.name = "QuotaExceededError"; throw error; } };
  const result = Core.writeWorkspace(storage, files);
  assert.equal(result.saved, false);
  assert.equal(result.legacySaved, false);
  assert.equal(result.error.name, "QuotaExceededError");
  assert.equal(JSON.stringify(files), before);
});

test("workspace remains saved if only the legacy compatibility mirror fails", () => {
  const stored = new Map();
  const storage = { setItem(key, value) { if (key === "code-forge-project-v1") throw new Error("quota"); stored.set(key, value); } };
  const files = { "index.html": "<h1>Primary workspace</h1>", "styles.css": "", "app.js": "" };
  const result = Core.writeWorkspace(storage, files);
  assert.equal(result.saved, true);
  assert.equal(result.legacySaved, false);
  assert.equal(Core.readWorkspace(stored.get("code-forge-workspace-v2"))["index.html"], files["index.html"]);
});

test("failed quota save leaves the previous workspace recoverable", () => {
  const original = { "index.html": "<h1>Previous</h1>", "styles.css": "", "app.js": "" };
  const previousBackup = JSON.stringify({ format: "code-forge-workspace", version: 2, files: original });
  const storage = { getItem() { return previousBackup; }, setItem() { const error = new Error("quota"); error.name = "QuotaExceededError"; throw error; } };
  const changed = { "index.html": "<h1>New unsaved work</h1>", "styles.css": "", "app.js": "" };
  const result = Core.writeWorkspace(storage, changed);
  assert.equal(result.saved, false);
  assert.deepEqual({ ...Core.readWorkspace(storage.getItem("code-forge-workspace-v2")) }, original);
  assert.equal(changed["index.html"], "<h1>New unsaved work</h1>");
});


test("main workspace has a heading, toolbar landmark and accessible resize range", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(html, /<h1 class="sr-only">Code Forge workspace<\/h1>/);
  assert.match(html, /role="toolbar" aria-label="Workspace layout controls"/);
  assert.match(html, /aria-valuemin="25" aria-valuemax="75" aria-valuenow="50"/);
  assert.match(app, /handle\.setAttribute\("aria-valuenow",String\(Math\.round\(ratio\*100\)\)\)/);
  assert.match(css, /\.sr-only\{/);
});

test("editor content has an accessible name and output tabs implement ARIA tab semantics", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const editor = fs.readFileSync(path.join(root, "src/editor.js"), "utf8");
  assert.match(html, /role="tabpanel" tabindex="0" aria-labelledby="panel-tab-console"/);
  assert.match(app, /editor\.setAttribute\("aria-label","Code editor content"\)/);
  assert.match(app, /role="tab" aria-selected="true" aria-controls="consoleOutput"/);
  assert.match(app, /x\.setAttribute\("aria-selected",String\(active\)\)/);
  assert.match(app, /ArrowLeft.*ArrowRight/);
  assert.match(editor, /HighlightStyle\.define/);
});

test("normal-text interface colors and editor syntax tokens use higher-contrast palette values", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const editor = fs.readFileSync(path.join(root, "src/editor.js"), "utf8");
  assert.match(css, /--subtle: #9aa394/);
  assert.match(css, /background: #e9ebe4; color: #454b41/);
  assert.match(editor, /color: "#9aa593"/);
  assert.match(editor, /color: "#c5f39f"/);
  assert.match(editor, /color: "#a6d4ff"/);
});


test("malformed stored workspaces are copied to a recovery key before normal saves can replace them", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /localStorage\.setItem\("code-forge-recovery-backup-v1",v2\)/);
  assert.match(app, /recoveryBackupRaw&&!recoveryBackupPreserved/);
  assert.match(app, /function exportRecoveryBackup\(\)/);
  assert.match(app, /Export preserved recovery copy/);
  assert.match(app, /The invalid workspace backup could not be preserved locally/);
});

test("saved word-wrap preference configures its own compartment without replacing the language mode", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /languageCompartment\.of\(languageExtension\(activeFile\)\),wrappingCompartment\.of\(Engine\.lineWrapping\),indentCompartment\.of/);
  assert.match(app, /engineExtensions\[4\]=wrappingCompartment\.of\(savedWrap\?Engine\.EditorView\.lineWrapping:\[\]\)/);
  assert.doesNotMatch(app, /engineExtensions\[3\]=wrappingCompartment\.of/);
});

test("file rename and duplicate snapshot the active editor before mutating workspace entries and imports have a size guard", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const duplicate = app.slice(app.indexOf("function duplicateFile"), app.indexOf("function renameFile"));
  const rename = app.slice(app.indexOf("function renameFile"), app.indexOf("function deleteFile"));
  assert.ok(duplicate.indexOf("rememberEditor();") < duplicate.indexOf("files[name]=files[sourceName]"));
  assert.ok(rename.indexOf("rememberEditor();") < rename.indexOf("files[name]=files[oldName]"));
  assert.match(app, /var MAX_IMPORT_BYTES = 10 \* 1024 \* 1024/);
  assert.match(app, /if\(file\.size>MAX_IMPORT_BYTES\)/);
});

test("startup recovery state is initialized before loading a potentially malformed workspace", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.ok(app.indexOf("var recoveryBackupRaw=null") < app.indexOf("var files = loadFiles();"));
  assert.match(app, /var item=document\.createElement\("div"\);item\.className="tree-file"/);
  assert.match(app, /var openButton=document\.createElement\("button"\);openButton\.type="button";openButton\.className="tree-file-open"/);
});

 
test("production build includes offline install metadata and service worker", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const build = fs.readFileSync(path.join(root, "scripts/build.cjs"), "utf8");
  const worker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /rel="icon" href="\.\/icon\.svg"/);
  assert.match(app, /navigator\.serviceWorker\.register\("\.\/sw\.js"\)/);
  for (const asset of ["sw.js", "manifest.webmanifest", "icon.svg"]) assert.ok(build.includes('"'+asset+'"'), asset);
  for (const asset of ["index.html", "styles.css", "core.js", "app.js", "editor.bundle.js", "manifest.webmanifest", "icon.svg"]) assert.ok(worker.includes('"./'+asset+'"'), asset);
});

 
test("network status indicator reflects browser connectivity", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(html, /id="networkState" class="network-state" role="status" aria-live="polite"/);
  assert.match(app, /window\.addEventListener\("online", updateNetworkState\)/);
  assert.match(app, /window\.addEventListener\("offline", updateNetworkState\)/);
  assert.match(app, /navigator\.onLine/);
  assert.match(styles, /\.network-state\[data-network="offline"\]::before/);
});

 
test("install action is hidden until the browser offers installation", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(html, /id="installApp"[^>]*hidden/);
  assert.match(app, /window\.addEventListener\("beforeinstallprompt"/);
  assert.match(app, /promptEvent\.prompt\(\)/);
  assert.match(app, /window\.addEventListener\("appinstalled"/);
  assert.match(styles, /\.install-button\[hidden\]/);
});

 
test("editor states preserve per-file undo and redo history", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const editorSource = fs.readFileSync(path.join(root, "src/editor.js"), "utf8");
  assert.match(editorSource, /EditorState/);
  assert.match(app, /var editorStates = Object\.create\(null\)/);
  assert.match(app, /function makeEditorState\(name\)/);
  assert.match(app, /editorStates\[activeFile\]=editorView\.state/);
  assert.match(app, /editorView\.setState\(editorStates\[name\]\)/);
  assert.match(app, /delete editorStates\[oldName\]/);
});

test("navigation warns when local persistence fails and unsaved work remains", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /window\.addEventListener\("beforeunload",function\(event\)/);
  assert.match(app, /event\.preventDefault\(\);event\.returnValue=""/);
});

 
test("named projects and snapshots remain browser-local and are accessible from the workspace", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const core = fs.readFileSync(path.join(root, "core.js"), "utf8");
  assert.match(html, /id="projectSelect"/);
  assert.match(html, /id="manageProjects"/);
  assert.match(html, /id="createSnapshot"/);
  assert.match(app, /code-forge-projects-v1/);
  assert.match(app, /code-forge-project-data-v1:/);
  assert.match(app, /function switchProject\(nextId\)/);
  assert.match(app, /function createSnapshot\(announce\)/);
  assert.match(app, /function restoreSnapshot\(\)/);
  assert.match(core, /function readProjectIndex\(value\)/);
  assert.match(core, /function projectIndexJSON\(index\)/);
  assert.match(app, /code-forge-snapshots-v1:/);
});

 
test("ZIP export and storage quota warnings are wired to visible recovery actions", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const core = fs.readFileSync(path.join(root, "core.js"), "utf8");
  assert.match(html, /id="exportZip"/);
  assert.match(app, /function exportZip\(\)/);
  assert.match(app, /Core\.zipWorkspace\(files\)/);
  assert.match(app, /Browser storage quota reached/);
  assert.match(core, /function zipWorkspace\(files\)/);
});
