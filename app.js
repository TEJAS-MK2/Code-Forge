(function () {
  "use strict";
  var Core = window.CodeForgeCore;
  if (!Core) throw new Error("Code Forge core failed to load.");
  var START = {
    html: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>My first page</title>\n</head>\n<body>\n  <main class="card">\n    <p class="eyebrow">A SMALL START</p>\n    <h1>Make it <span>yours.</span></h1>\n    <p>Edit the files, run your code, and see the result here.</p>\n    <button id="hello">Try the button</button>\n    <p id="message" aria-live="polite"></p>\n  </main>\n</body>\n</html>',
    css: '* { box-sizing: border-box; }\nbody {\n  margin: 0;\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  padding: 24px;\n  background: #f2f0e9;\n  color: #20241e;\n  font-family: system-ui, sans-serif;\n}\n.card { max-width: 560px; }\n.eyebrow { color: #526b3e; letter-spacing: .14em; font-size: 12px; font-weight: 700; }\nh1 { font-size: clamp(2.5rem, 8vw, 4.5rem); line-height: 1.02; letter-spacing: -.06em; }\nh1 span { color: #55763b; }\np { color: #62685d; line-height: 1.7; }\nbutton { padding: 11px 16px; border: 0; border-radius: 6px; background: #b8e986; color: #182012; font-weight: 700; cursor: pointer; }',
    js: "document.querySelector('#hello')?.addEventListener('click', () => {\n  document.querySelector('#message').textContent = 'Your JavaScript is running.';\n  console.log('Button clicked');\n});"
  };
  var KEYS = ["html", "css", "js"];
  var active = "html";
  var project = loadProject();
  var saveTimer = null;
  var previewTimer = null;
  var toastTimer = null;
  var runId = 0;
  var editor = document.getElementById("editor");
  var gutter = document.getElementById("gutter");
  var frame = document.getElementById("preview");
  var consoleOutput = document.getElementById("consoleOutput");
  var consoleCount = document.getElementById("consoleCount");
  var consoleLines = 0;
  var currentChannel = "";
  var workspace = document.getElementById("workspace");

  function loadProject() {
    try {
      var saved = JSON.parse(localStorage.getItem("code-forge-project-v1"));
      if (Core.validProject(saved)) return { html: saved.html, css: saved.css, js: saved.js };
    } catch (error) {}
    return { html: START.html, css: START.css, js: START.js };
  }
  function say(message) {
    var toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove("show"); }, 2200);
  }
  function setSaveState(message, good) {
    var el = document.getElementById("saveState");
    el.textContent = message;
    el.classList.toggle("status-saved", !!good);
  }
  function rememberEditor() { project[active] = editor.value; }
  function persist(showError) {
    rememberEditor();
    try {
      localStorage.setItem("code-forge-project-v1", JSON.stringify(project));
      setSaveState("Saved on this device", true);
      return true;
    } catch (error) {
      setSaveState("Storage unavailable", false);
      if (showError) say("Browser storage is unavailable. Export your project to keep a copy.");
      return false;
    }
  }
  function updateCursor() {
    var before = editor.value.slice(0, editor.selectionStart);
    var row = before.split("\n");
    document.getElementById("cursor").textContent = "Ln " + row.length + ", Col " + (row[row.length - 1].length + 1);
    var count = editor.value.split("\n").length;
    gutter.textContent = Array.from({ length: count }, function (_, index) { return index + 1; }).join("\n");
    gutter.scrollTop = editor.scrollTop;
    document.getElementById("charCount").textContent = editor.value.length.toLocaleString() + " chars";
  }
  function clearConsole() {
    consoleOutput.replaceChildren();
    consoleLines = 0;
    consoleCount.textContent = "0 entries";
    var empty = document.createElement("div");
    empty.className = "console-empty";
    empty.id = "consoleEmpty";
    empty.textContent = "Console output and runtime errors will appear here.";
    consoleOutput.appendChild(empty);
  }
  function addConsoleLine(level, message) {
    var empty = document.getElementById("consoleEmpty");
    if (empty) empty.remove();
    var line = document.createElement("div");
    line.className = "console-line";
    line.dataset.level = ["log", "info", "warn", "error", "debug", "system"].indexOf(level) >= 0 ? level : "log";
    var label = document.createElement("span");
    label.className = "console-level";
    label.textContent = level;
    var text = document.createElement("span");
    text.className = "console-message";
    text.textContent = String(message);
    line.append(label, text);
    consoleOutput.appendChild(line);
    consoleLines++;
    consoleCount.textContent = consoleLines + (consoleLines === 1 ? " entry" : " entries");
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }
  function buildChannel() {
    runId++;
    return "cf-" + Date.now().toString(36) + "-" + runId.toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }
  function renderPreview(announce) {
    rememberEditor();
    persist(false);
    currentChannel = buildChannel();
    clearConsole();
    frame.srcdoc = Core.buildDocument(project.html, project.css, project.js, currentChannel);
    document.getElementById("previewState").textContent = "Running";
    document.getElementById("previewState").setAttribute("aria-label", "Preview running");
    document.getElementById("previewVersion").textContent = "Run " + runId;
    if (announce) say("Preview refreshed");
  }
  function setTab(language) {
    rememberEditor();
    active = language;
    editor.value = project[active];
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.setAttribute("aria-selected", String(tab.dataset.lang === active));
    });
    document.getElementById("languageLabel").textContent = ({ html: "HTML document", css: "CSS stylesheet", js: "JavaScript source" })[active];
    editor.setAttribute("aria-label", ({ html: "HTML editor", css: "CSS editor", js: "JavaScript editor" })[active]);
    updateCursor();
    editor.focus();
  }
  function download(name, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }
  function importProject(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        project = Core.readProject(String(reader.result));
        editor.value = project[active];
        updateCursor();
        persist(true);
        renderPreview(false);
        say("Project imported");
      } catch (error) {
        say(error && error.message ? error.message : "Could not read that project file.");
      }
    };
    reader.onerror = function () { say("Could not read that file."); };
    reader.readAsText(file);
  }

  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () { setTab(tab.dataset.lang); });
  });
  editor.value = project[active];
  updateCursor();
  clearConsole();
  renderPreview(false);

  editor.addEventListener("input", function () {
    rememberEditor();
    updateCursor();
    setSaveState("Unsaved changes", false);
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () { persist(false); }, 160);
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(function () { renderPreview(false); }, 500);
  });
  editor.addEventListener("scroll", function () { gutter.scrollTop = editor.scrollTop; });
  editor.addEventListener("click", updateCursor);
  editor.addEventListener("keyup", updateCursor);
  editor.addEventListener("select", updateCursor);
  editor.addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      window.clearTimeout(previewTimer);
      renderPreview(true);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      persist(true);
      say("Saved in this browser");
    } else if (event.key === "Tab") {
      event.preventDefault();
      editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
      editor.dispatchEvent(new Event("input"));
    }
  });
  document.getElementById("run").addEventListener("click", function () {
    window.clearTimeout(previewTimer);
    renderPreview(true);
  });
  document.getElementById("refresh").addEventListener("click", function () {
    window.clearTimeout(previewTimer);
    renderPreview(true);
  });
  document.getElementById("clear").addEventListener("click", function () {
    editor.value = "";
    rememberEditor();
    updateCursor();
    persist(false);
    renderPreview(false);
    editor.focus();
    say("Current file cleared");
  });
  document.getElementById("trim").addEventListener("click", function () {
    editor.value = editor.value.split("\n").map(function (line) { return line.replace(/[ \t]+$/, ""); }).join("\n");
    rememberEditor();
    updateCursor();
    persist(false);
    renderPreview(false);
    say("Trailing whitespace removed");
  });
  document.getElementById("reset").addEventListener("click", function () {
    if (!window.confirm("Restore the starter files? Your saved project will be replaced.")) return;
    project = { html: START.html, css: START.css, js: START.js };
    editor.value = project[active];
    updateCursor();
    persist(false);
    renderPreview(false);
    say("Starter project restored");
  });
  document.getElementById("exportHtml").addEventListener("click", function () {
    rememberEditor();
    persist(false);
    download("code-forge-project.html", Core.buildDocument(project.html, project.css, project.js, ""), "text/html;charset=utf-8");
    say("Standalone HTML downloaded");
  });
  document.getElementById("exportProject").addEventListener("click", function () {
    rememberEditor();
    persist(false);
    download("code-forge-project.json", Core.projectJSON(project), "application/json;charset=utf-8");
    say("Project backup downloaded");
  });
  document.getElementById("importButton").addEventListener("click", function () { document.getElementById("importFile").click(); });
  document.getElementById("importFile").addEventListener("change", function (event) {
    importProject(event.target.files && event.target.files[0]);
    event.target.value = "";
  });
  document.getElementById("openPreview").addEventListener("click", function () {
    rememberEditor();
    persist(false);
    var blob = new Blob([Core.buildDocument(project.html, project.css, project.js, "")], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      URL.revokeObjectURL(url);
      say("Pop-up blocked. Download the HTML file instead.");
    } else {
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }
  });
  document.getElementById("clearConsole").addEventListener("click", clearConsole);
  window.addEventListener("message", function (event) {
    if (event.source !== frame.contentWindow || !event.data || event.data.__codeForge !== currentChannel) return;
    var level = String(event.data.level || "log");
    addConsoleLine(level, String(event.data.message || ""));
    if (level === "error") document.getElementById("previewState").textContent = "Runtime error";
    else if (level === "system") document.getElementById("previewState").textContent = "Ready";
  });
  window.addEventListener("beforeunload", function () {
    window.clearTimeout(saveTimer);
    rememberEditor();
    try { localStorage.setItem("code-forge-project-v1", JSON.stringify(project)); } catch (error) {}
  });

  var resizing = false;
  var resizeRatio = 0.5;
  function resizeAt(clientX) {
    var rect = workspace.getBoundingClientRect();
    var ratio = (clientX - rect.left) / rect.width;
    ratio = Math.max(0.25, Math.min(0.75, ratio));
    resizeRatio = ratio;
    workspace.style.gridTemplateColumns = "minmax(0, " + (ratio * 100) + "fr) 8px minmax(0, " + ((1 - ratio) * 100) + "fr)";
  }
  var handle = document.getElementById("resizeHandle");
  handle.addEventListener("pointerdown", function (event) {
    if (window.matchMedia("(max-width: 760px)").matches) return;
    resizing = true;
    var rect = workspace.getBoundingClientRect();
    resizeRatio = (event.clientX - rect.left) / rect.width;
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener("pointermove", function (event) { if (resizing) resizeAt(event.clientX); });
  function stopResize() { resizing = false; }
  handle.addEventListener("pointerup", stopResize);
  handle.addEventListener("pointercancel", stopResize);
  handle.addEventListener("keydown", function (event) {
    if (window.matchMedia("(max-width: 760px)").matches) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      var rect = workspace.getBoundingClientRect();
      resizeAt(rect.left + rect.width * Math.max(.25, Math.min(.75, resizeRatio + (event.key === "ArrowLeft" ? -.03 : .03))));
    }
  });
})();