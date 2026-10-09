(function () {
  "use strict";
  var Core = window.CodeForgeCore;
  var Engine = window.CodeForgeEditorEngine;
  if (!Core || !Engine || !Engine.EditorView || !Engine.Compartment) throw new Error("Code Forge could not initialize.");
  var START = {
    "index.html": '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>My first page</title>\n</head>\n<body>\n  <main class="card">\n    <p class="eyebrow">A SMALL START</p>\n    <h1>Make it <span>yours.</span></h1>\n    <p>Edit the files, run your code, and see the result here.</p>\n    <button id="hello">Try the button</button>\n    <p id="message" aria-live="polite"></p>\n  </main>\n</body>\n</html>',
    "styles.css": '* { box-sizing: border-box; }\nbody {\n  margin: 0;\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  padding: 24px;\n  background: #f2f0e9;\n  color: #20241e;\n  font-family: system-ui, sans-serif;\n}\n.card { max-width: 560px; }\n.eyebrow { color: #526b3e; letter-spacing: .14em; font-size: 12px; font-weight: 700; }\nh1 { font-size: clamp(2.5rem, 8vw, 4.5rem); line-height: 1.02; letter-spacing: -.06em; }\nh1 span { color: #55763b; }\np { color: #62685d; line-height: 1.7; }\nbutton { padding: 11px 16px; border: 0; border-radius: 6px; background: #b8e986; color: #182012; font-weight: 700; cursor: pointer; }',
    "app.js": "document.querySelector('#hello')?.addEventListener('click', () => {\n  document.querySelector('#message').textContent = 'Your JavaScript is running.';\n  console.log('Button clicked');\n});"
  };
  var files = loadFiles();
  var activeFile = "index.html";
  var openFiles = ["index.html", "styles.css", "app.js"];
  var dirty = Object.create(null);
  var saveTimer, previewTimer, toastTimer;
  var runId = 0, currentChannel = "", consoleLines = 0, listeners = Object.create(null);
  var workspace = document.getElementById("workspace");
  var frame = document.getElementById("preview");
  var consoleOutput = document.getElementById("consoleOutput");
  var consoleCount = document.getElementById("consoleCount");
  var editorHost = document.getElementById("editorHost");
  var languageCompartment = new Engine.Compartment();
  var wrappingCompartment = new Engine.Compartment();
  var indentCompartment = new Engine.Compartment();
  var switchingFile = false;
  var editorView;
  var layout = "split";
  var sideView = "explorer";
  var outputEntries = [];
  var panelMode = "console";
  var fileTabs = document.getElementById("fileTabs");
  var sidePanel = document.getElementById("sidePanel");
  var sidePanelBody = document.getElementById("sidePanelBody");
  var sidePanelTitle = document.getElementById("sidePanelTitle");

  function ext(name) { return (name.split(".").pop() || "").toLowerCase(); }
  function lang(name) {
    var e = ext(name);
    if (e === "css") return "css";
    if (e === "js" || e === "mjs" || e === "cjs" || e === "jsx") return "js";
    if (e === "html" || e === "htm" || e === "svg" || e === "xml") return "html";
    if (e === "json") return "json";
    return "plain";
  }
  function languageExtension(name) {
    var type = lang(name);
    if (type === "css") return Engine.css();
    if (type === "js") return Engine.javascript();
    if (type === "html") return Engine.html();
    if (type === "json") return Engine.javascript({ typescript: false });
    return [];
  }
  function labelFor(name) {
    var type = lang(name);
    return ({html:"HTML document",css:"CSS stylesheet",js:"JavaScript source",json:"JSON document",plain:"Plain text"})[type];
  }
  function loadFiles() {
    try {
      var v2 = JSON.parse(localStorage.getItem("code-forge-workspace-v2"));
      if (v2 && v2.format === "code-forge-workspace" && v2.files && typeof v2.files === "object") {
        var valid = {};
        Object.keys(v2.files).forEach(function (name) {
          if (safeName(name) && typeof v2.files[name] === "string") valid[name] = v2.files[name];
        });
        if (valid["index.html"] && valid["styles.css"] != null && valid["app.js"] != null) return valid;
      }
      var old = JSON.parse(localStorage.getItem("code-forge-project-v1"));
      if (Core.validProject(old)) return {"index.html":old.html,"styles.css":old.css,"app.js":old.js};
    } catch (e) {}
    return Object.assign({}, START);
  }
  function safeName(name) {
    return typeof name === "string" && name.length > 0 && name.length <= 64 &&
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && name !== "." && name !== "..";
  }
  function emit(type, event) { (listeners[type] || []).slice().forEach(function (fn) { fn(event); }); }
  var editor = {
    get value() { return editorView.state.doc.toString(); },
    set value(value) {
      value = String(value == null ? "" : value);
      if (editorView.state.doc.toString() === value) return;
      editorView.dispatch({changes:{from:0,to:editorView.state.doc.length,insert:value}});
    },
    get selectionStart() { return editorView.state.selection.main.head; },
    get selectionEnd() { return editorView.state.selection.main.anchor; },
    addEventListener: function(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    setAttribute: function(name, value) { editorView.contentDOM.setAttribute(name, value); },
    focus: function() { editorView.focus(); }
  };
  function say(message) {
    var toast = document.getElementById("toast");
    toast.textContent = message; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function(){toast.classList.remove("show");},2200);
  }
  function saveState(message, good) {
    var el = document.getElementById("saveState"); el.textContent = message; el.classList.toggle("status-saved",!!good);
  }
  function rememberEditor() { if (activeFile && files[activeFile] != null) files[activeFile] = editor.value; }
  function persist(showError) {
    rememberEditor();
    try {
      localStorage.setItem("code-forge-workspace-v2", JSON.stringify({format:"code-forge-workspace",version:2,files:files}));
      localStorage.setItem("code-forge-project-v1", JSON.stringify({html:files["index.html"],css:files["styles.css"],js:files["app.js"]}));
      saveState("Saved on this device",true); return true;
    } catch (e) {
      saveState("Storage unavailable",false);
      if (showError) say("Browser storage is unavailable. Export a backup to keep your work.");
      return false;
    }
  }
  function persistSnapshot(showError) {
    try {
      localStorage.setItem("code-forge-workspace-v2", JSON.stringify({format:"code-forge-workspace",version:2,files:files}));
      localStorage.setItem("code-forge-project-v1", JSON.stringify({html:files["index.html"],css:files["styles.css"],js:files["app.js"]}));
      saveState("Saved on this device",true); return true;
    } catch (e) {
      saveState("Storage unavailable",false);
      if (showError) say("Browser storage is full or unavailable. Export a backup before continuing.");
      return false;
    }
  }
  function updateCursor() {
    var doc=editorView.state.doc, pos=editorView.state.selection.main.head, line=doc.lineAt(pos);
    document.getElementById("cursor").textContent="Ln "+line.number+", Col "+(pos-line.from+1);
    document.getElementById("charCount").textContent=doc.length.toLocaleString()+" chars";
    document.getElementById("languageLabel").textContent=labelFor(activeFile);
    document.getElementById("fileTypeLabel").textContent=lang(activeFile).toUpperCase();
    document.getElementById("encodingLabel").textContent="UTF-8 · "+(files[activeFile].indexOf("\r\n")>=0?"CRLF":"LF");
  }
  function setLayout(nextLayout) {
    if (["split","stack","editor","preview"].indexOf(nextLayout)<0) return;
    layout=nextLayout;
    workspace.classList.remove("layout-split","layout-stack","layout-editor","layout-preview");
    workspace.style.removeProperty("grid-template-columns");
    workspace.classList.add("layout-"+layout);
    document.querySelectorAll(".layout-button").forEach(function(b){b.setAttribute("aria-pressed",String(b.dataset.layout===layout));});
    try {localStorage.setItem("code-forge-layout-v1",layout);} catch(e){}
  }
  function readLayout() {
    try {var v=localStorage.getItem("code-forge-layout-v1");if(["split","stack","editor","preview"].indexOf(v)>=0)return v;}catch(e){}
    return "split";
  }
  function buildChannel() { runId++; return "cf-"+Date.now().toString(36)+"-"+runId.toString(36)+"-"+Math.random().toString(36).slice(2,9); }
  function clearConsole() {
    consoleOutput.replaceChildren(); consoleLines=0; consoleCount.textContent="0 entries";
    var empty=document.createElement("div");empty.className="console-empty";empty.id="consoleEmpty";
    empty.textContent="Console output and runtime errors will appear here.";consoleOutput.appendChild(empty);
  }
  function addConsoleLine(level,message) {
    var empty=document.getElementById("consoleEmpty");if(empty)empty.remove();
    var row=document.createElement("div");row.className="console-line";
    row.dataset.level=["log","info","warn","error","debug","system"].indexOf(level)>=0?level:"log";
    var tag=document.createElement("span");tag.className="console-level";tag.textContent=level;
    var msg=document.createElement("span");msg.className="console-message";msg.textContent=String(message);
    row.append(tag,msg);consoleOutput.appendChild(row);consoleLines++;
    consoleCount.textContent=consoleLines+(consoleLines===1?" entry":" entries");consoleOutput.scrollTop=consoleOutput.scrollHeight;
  }
  function renderPreview(announce) {
    rememberEditor();persist(false);currentChannel=buildChannel();clearConsole();
    frame.srcdoc=Core.buildDocument(files["index.html"],files["styles.css"],files["app.js"],currentChannel);
    document.getElementById("previewState").textContent="Running";
    document.getElementById("previewVersion").textContent="Run "+runId;
    if(announce)say("Preview refreshed");
    output("Preview", "Built preview from index.html, styles.css and app.js.");
  }
  function output(kind,message) {
    outputEntries.unshift({kind:kind,message:String(message),time:new Date().toLocaleTimeString()});
    outputEntries=outputEntries.slice(0,100);
    if(panelMode==="output") renderBottomPanel();
  }
  function renderTabs() {
    fileTabs.replaceChildren();
    openFiles.forEach(function(name) {
      if(files[name]==null) return;
      var tab=document.createElement("button");tab.type="button";tab.className="tab file-tab";
      tab.setAttribute("role","tab");tab.setAttribute("aria-selected",String(name===activeFile));tab.title=name;
      var dot=document.createElement("span");dot.className="file-type-dot type-"+lang(name);dot.setAttribute("aria-hidden","true");
      var title=document.createElement("span");title.className="file-tab-name";title.textContent=name;
      if(dirty[name]){var modified=document.createElement("span");modified.className="file-tab-dirty";modified.title="Unsaved changes";modified.setAttribute("aria-label","Unsaved changes");tab.append(modified);}
      var close=document.createElement("span");close.className="file-tab-close";close.textContent="×";close.setAttribute("role","button");close.setAttribute("aria-label","Close "+name);
      tab.append(dot,title);
      if(!["index.html","styles.css","app.js"].includes(name)){tab.append(close);close.addEventListener("click",function(e){e.stopPropagation();closeFile(name);});}
      tab.addEventListener("click",function(){openFile(name);});fileTabs.appendChild(tab);
    });
  }
  function openFile(name) {
    if(files[name]==null) return;
    rememberEditor();activeFile=name;
    if(!openFiles.includes(name))openFiles.push(name);
    switchingFile=true;editorView.dispatch({effects:languageCompartment.reconfigure(languageExtension(name))});
    editor.value=files[name];switchingFile=false;
    renderTabs();renderExplorer();updateCursor();editor.focus();
    document.getElementById("trim").disabled=false;
    output("Workspace","Opened "+name+".");
  }
  function closeFile(name) {
    if(["index.html","styles.css","app.js"].includes(name))return;
    if(dirty[name]) { if(!confirm("Close "+name+"? Its current edits are saved locally."))return; }
    rememberEditor();openFiles=openFiles.filter(function(n){return n!==name;});
    if(activeFile===name)openFile("index.html");else renderTabs();
  }
  function renderExplorer() {
    sidePanelBody.replaceChildren();
    if(sideView==="search") {
      var wrap=document.createElement("div");wrap.className="search-workspace";
      var input=document.createElement("input");input.type="search";input.id="workspaceSearch";input.placeholder="Find text in files";input.setAttribute("aria-label","Find text in workspace");
      var replacement=document.createElement("input");replacement.type="text";replacement.id="workspaceReplace";replacement.placeholder="Replace with…";replacement.setAttribute("aria-label","Replacement text");
      var replaceButton=document.createElement("button");replaceButton.type="button";replaceButton.className="tree-add-file";replaceButton.textContent="Replace all in workspace";
      var results=document.createElement("div");results.className="search-results";results.id="searchResults";
      wrap.append(input,replacement,replaceButton,results);sidePanelBody.append(wrap);
      input.addEventListener("input",function(){searchFiles(input.value,results);});
      replaceButton.addEventListener("click",function(){replaceAllFiles(input.value,replacement.value);searchFiles(input.value,results);});
      input.focus();return;
    }
    if(sideView==="settings") {
      var settings=document.createElement("div");settings.className="settings-panel";
      settings.innerHTML='<p class="settings-kicker">EDITOR</p><label class="setting-row"><span>Indentation</span><select id="indentSetting"><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tab character</option></select></label><label class="setting-row"><span>Font size</span><select id="fontSizeSetting"><option value="11">11 px</option><option value="12">12 px</option><option value="13">13 px</option><option value="14">14 px</option><option value="16">16 px</option><option value="18">18 px</option></select></label><label class="setting-row"><span>Word wrap</span><input id="wrapSetting" type="checkbox"></label><p class="settings-help">Projects and preferences stay in this browser profile. No account or cloud sync is used.</p>';
      sidePanelBody.append(settings);
      var indent=settings.querySelector("#indentSetting");try{indent.value=localStorage.getItem("code-forge-indent")||"2";}catch(e){}
      indent.addEventListener("change",function(){try{localStorage.setItem("code-forge-indent",indent.value);}catch(e){}editorView.dispatch({effects:indentCompartment.reconfigure(Engine.indentUnit.of(indent.value==="tab"?"\t":" ".repeat(Number(indent.value))))});document.getElementById("indentLabel").textContent=indent.value==="tab"?"Tabs":"Spaces: "+indent.value;});
      var fontSize=settings.querySelector("#fontSizeSetting");try{fontSize.value=localStorage.getItem("code-forge-font-size")||"12";}catch(e){}editorHost.style.setProperty("--cf-editor-font-size",fontSize.value+"px");
      fontSize.addEventListener("change",function(){var size=Number(fontSize.value);if(![11,12,13,14,16,18].includes(size))return;editorHost.style.setProperty("--cf-editor-font-size",size+"px");try{localStorage.setItem("code-forge-font-size",String(size));}catch(e){}say("Editor font size set to "+size+" px");editorView.requestMeasure();});
      var wrapSetting=settings.querySelector("#wrapSetting");
      try{wrapSetting.checked=localStorage.getItem("code-forge-word-wrap")!=="false";}catch(e){wrapSetting.checked=true;}
      editorView.dispatch({effects:wrappingCompartment.reconfigure(wrapSetting.checked?Engine.EditorView.lineWrapping:[])});
      wrapSetting.addEventListener("change",function(e){
        var enabled=!!e.target.checked;
        editorView.dispatch({effects:wrappingCompartment.reconfigure(enabled?Engine.EditorView.lineWrapping:[])});
        try{localStorage.setItem("code-forge-word-wrap",String(enabled));}catch(e){say("Could not save editor preferences in this browser.");}
      });
      return;
    }
    var root=document.createElement("div");root.className="explorer-tree";
    var projectHeading=document.createElement("div");projectHeading.className="tree-section-label";projectHeading.innerHTML='<span>▾</span><span>PROJECT</span><span class="tree-count">'+Object.keys(files).length+'</span>';root.append(projectHeading);
    Object.keys(files).sort(function(a,b){
      var rank={"index.html":0,"styles.css":1,"app.js":2};return (rank[a]??10)-(rank[b]??10)||a.localeCompare(b);
    }).forEach(function(name){
      var item=document.createElement("button");item.type="button";item.className="tree-file"+(name===activeFile?" is-active":"");item.title=name;
      var dot=document.createElement("span");dot.className="file-type-dot type-"+lang(name);
      var text=document.createElement("span");text.className="tree-file-name";text.textContent=name;
      var state=document.createElement("span");state.className="tree-file-state";state.textContent=dirty[name]?"●":"";
      item.append(dot,text,state);if(!["index.html","styles.css","app.js"].includes(name)){var actions=document.createElement("button");actions.type="button";actions.className="tree-file-action";actions.textContent="⋯";actions.title="Rename or delete "+name;actions.setAttribute("aria-label","Actions for "+name);actions.addEventListener("click",function(e){e.stopPropagation();fileMenu(name);});item.append(actions);}item.addEventListener("click",function(){openFile(name);});item.addEventListener("contextmenu",function(e){e.preventDefault();fileMenu(name);});root.append(item);
    });
    var add=document.createElement("button");add.className="tree-add-file";add.type="button";add.textContent="+ New file";add.addEventListener("click",newFile);root.append(add);
    var help=document.createElement("p");help.className="tree-help";help.textContent="Virtual files are saved in browser storage. Export a backup to move them to another device.";root.append(help);
    sidePanelBody.append(root);
  }
  function searchFiles(query,results) {
    results.replaceChildren();if(!query.trim())return;
    var q=query.toLowerCase(),count=0;
    Object.keys(files).forEach(function(name){
      var lines=files[name].split("\n");
      lines.forEach(function(line,index){
        var at=line.toLowerCase().indexOf(q);if(at<0||count>=100)return;
        var hit=document.createElement("button");hit.type="button";hit.className="search-hit";
        var filename=document.createElement("span");filename.className="search-hit-file";filename.textContent=name+":"+ (index+1);
        var excerpt=document.createElement("span");excerpt.className="search-hit-line";excerpt.textContent=line.trim().slice(0,120)||"(blank line)";
        hit.append(filename,excerpt);hit.addEventListener("click",function(){openFile(name);var lineObj=editorView.state.doc.line(Math.min(index+1,editorView.state.doc.lines));editorView.dispatch({selection:{anchor:lineObj.from+Math.max(0,at)},scrollIntoView:true});editor.focus();});
        results.append(hit);count++;
      });
    });
    if(!count){var none=document.createElement("p");none.className="settings-help";none.textContent="No matches found.";results.append(none);}
  }
  function replaceAllFiles(query,replacement) {
    query=String(query||"");replacement=String(replacement==null?"":replacement);
    if(!query){say("Enter text to find first.");return;}
    rememberEditor();var count=0;
    Object.keys(files).forEach(function(name){
      var parts=files[name].split(query);
      if(parts.length>1){count+=parts.length-1;files[name]=parts.join(replacement);}
    });
    if(!count){say("No matches to replace.");return;}
    switchingFile=true;editor.value=files[activeFile];switchingFile=false;
    var saved=persist(true);dirty=Object.create(null);renderTabs();renderExplorer();updateCursor();
    if(["index.html","styles.css","app.js"].includes(activeFile))renderPreview(false);
    say(saved?"Replaced "+count+" occurrence"+(count===1?"":"s")+" across the workspace.":"Replacement applied, but storage failed. Export a backup.");
  }
  function fileMenu(name) {
    if(["index.html","styles.css","app.js"].includes(name)){say("Core preview files cannot be renamed or deleted.");return;}
    var action=prompt("File actions for "+name+": type rename or delete","rename");if(!action)return;
    if(action.toLowerCase()==="delete")deleteFile(name);
    else if(action.toLowerCase()==="rename")renameFile(name);
  }
  function newFile() {
    var name=prompt("New file name (for example, notes.md or helper.js)");if(!name)return;
    name=name.trim();
    if(!safeName(name)){say("Use 1–64 letters, numbers, dots, underscores or hyphens. No folders.");return;}
    if(files[name]!=null){say("A file with that name already exists.");return;}
    files[name]="";dirty[name]=false;persist(true);openFile(name);renderExplorer();say("Created "+name);
  }
  function renameFile(oldName) {
    var name=prompt("Rename "+oldName+" to:",oldName);if(!name||name===oldName)return;name=name.trim();
    if(!safeName(name)){say("That file name is not supported.");return;}
    if(files[name]!=null){say("A file with that name already exists.");return;}
    files[name]=files[oldName];delete files[oldName];if(dirty[oldName])dirty[name]=true;delete dirty[oldName];
    openFiles=openFiles.map(function(n){return n===oldName?name:n;});if(activeFile===oldName)activeFile=name;
    persist(true);renderTabs();renderExplorer();openFile(name);say("Renamed to "+name);
  }
  function deleteFile(name) {
    if(["index.html","styles.css","app.js"].includes(name)){say("The three preview entry files are required.");return;}
    if(!confirm("Delete "+name+" from this browser workspace?"))return;
    delete files[name];delete dirty[name];openFiles=openFiles.filter(function(n){return n!==name;});
    if(activeFile===name){activeFile="index.html";switchingFile=true;editorView.dispatch({effects:languageCompartment.reconfigure(languageExtension(activeFile))});editor.value=files[activeFile];switchingFile=false;}
    persist(true);renderTabs();renderExplorer();updateCursor();say("Deleted "+name);
  }
  function switchSideView(view) {
    sideView=view;document.querySelectorAll(".rail-button").forEach(function(b){b.classList.toggle("is-active",b.dataset.view===view);});
    sidePanel.classList.toggle("is-collapsed",false);
    sidePanelTitle.textContent=({explorer:"EXPLORER",search:"SEARCH",settings:"SETTINGS"})[view];
    renderExplorer();
  }
  function download(name,content,type) {
    var url=URL.createObjectURL(new Blob([content],{type:type}));var a=document.createElement("a");
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},30000);
  }
  function exportWorkspace() {
    rememberEditor();persist(false);
    download("code-forge-workspace.json",JSON.stringify({format:"code-forge-workspace",version:2,files:files},null,2),"application/json;charset=utf-8");
    say("Workspace backup downloaded");
  }
  function importWorkspace(file) {
    if(!file)return;var reader=new FileReader();
    reader.onload=function(){
      try {
        var parsed=JSON.parse(String(reader.result)),next={};
        if(parsed&&parsed.format==="code-forge-workspace"&&parsed.files&&typeof parsed.files==="object"){
          Object.keys(parsed.files).forEach(function(name){if(!safeName(name)||typeof parsed.files[name]!=="string")throw new Error("Invalid file in workspace backup: "+name);next[name]=parsed.files[name];});
        } else {
          var legacy=Core.readProject(parsed);next={"index.html":legacy.html,"styles.css":legacy.css,"app.js":legacy.js};
        }
        if(!next["index.html"]||next["styles.css"]==null||next["app.js"]==null)throw new Error("Backup must include index.html, styles.css and app.js.");
        files=next;dirty=Object.create(null);openFiles=["index.html","styles.css","app.js"];activeFile="index.html";
        switchingFile=true;editorView.dispatch({effects:languageCompartment.reconfigure(languageExtension(activeFile))});editor.value=files[activeFile];switchingFile=false;
        persist(true);renderTabs();renderExplorer();updateCursor();renderPreview(false);say("Workspace imported");
      }catch(e){say(e.message||"Could not read this workspace backup.");}
    };
    reader.onerror=function(){say("Could not read that file.");};reader.readAsText(file);
  }
  function renderBottomPanel() {
    if(panelMode==="output") {
      consoleOutput.replaceChildren();
      if(!outputEntries.length){var empty=document.createElement("div");empty.className="console-empty";empty.textContent="Build and workspace activity will appear here.";consoleOutput.append(empty);return;}
      outputEntries.slice().reverse().forEach(function(entry){var row=document.createElement("div");row.className="console-line";var tag=document.createElement("span");tag.className="console-level";tag.textContent=entry.kind;var msg=document.createElement("span");msg.className="console-message";msg.textContent=entry.time+"  "+entry.message;row.append(tag,msg);consoleOutput.append(row);});
    } else if(panelMode==="problems") {
      consoleOutput.replaceChildren();var note=document.createElement("div");note.className="console-empty";note.textContent="No language-server diagnostics are configured. Runtime errors from the preview appear in Console.";consoleOutput.append(note);
    } else clearConsole();
  }

  // Build the IDE shell around the existing editor/preview workspace.
  var shell=document.getElementById("ideLayout"),rail=shell.querySelector(".activity-rail");
  document.querySelectorAll(".rail-button").forEach(function(button){button.addEventListener("click",function(){switchSideView(button.dataset.view);});});
  document.getElementById("newFile").addEventListener("click",newFile);
  document.getElementById("collapseExplorer").addEventListener("click",function(){sidePanel.classList.toggle("is-collapsed");});
  var engineExtensions=[Engine.basicSetup,Engine.theme,languageCompartment.of(languageExtension(activeFile)),wrappingCompartment.of(Engine.lineWrapping),indentCompartment.of(Engine.indentUnit.of("  ")),Engine.EditorView.updateListener.of(function(update){if(update.docChanged&&!switchingFile)emit("input");if(update.selectionSet||update.docChanged)emit("select");})];
  try{
    var savedFontSize=Number(localStorage.getItem("code-forge-font-size")||12);
    if([11,12,13,14,16,18].includes(savedFontSize))editorHost.style.setProperty("--cf-editor-font-size",savedFontSize+"px");
    var savedWrap=localStorage.getItem("code-forge-word-wrap")!=="false";
    engineExtensions[3]=wrappingCompartment.of(savedWrap?Engine.EditorView.lineWrapping:[]);
  }catch(e){}
  editorView=new Engine.EditorView({parent:editorHost,doc:files[activeFile],extensions:engineExtensions});
  setLayout(readLayout());renderTabs();renderExplorer();updateCursor();clearConsole();renderPreview(false);
  document.querySelectorAll(".layout-button").forEach(function(b){b.addEventListener("click",function(){setLayout(b.dataset.layout);});});
  editor.addEventListener("input",function(){
    rememberEditor();dirty[activeFile]=true;saveState("Unsaved changes",false);renderTabs();renderExplorer();updateCursor();
    clearTimeout(saveTimer);var changedFile=activeFile;saveTimer=setTimeout(function(){
       if(activeFile===changedFile)rememberEditor();
       var saved=persistSnapshot(false);
       if(saved){dirty[changedFile]=false;renderTabs();renderExplorer();}
     },220);
    clearTimeout(previewTimer);if(["index.html","styles.css","app.js"].includes(activeFile))previewTimer=setTimeout(function(){renderPreview(false);},500);
  });
  editor.addEventListener("select",updateCursor);
  editor.addEventListener("keydown",function(event){
    if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){event.preventDefault();clearTimeout(previewTimer);renderPreview(true);}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s"){event.preventDefault();var saved=persist(true);if(saved){dirty[activeFile]=false;renderTabs();renderExplorer();say("Saved in this browser");}}
    else if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==="p"){event.preventDefault();commandPalette();}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="n"){event.preventDefault();newFile();}
  });
  function commandPalette() {
    var old=document.querySelector("#commandOverlay");if(old){old.remove();return;}
    var commands=[
      {name:"Run preview",hint:"Ctrl + Enter",run:function(){renderPreview(true);}},
      {name:"Create new file",hint:"Ctrl + N",run:newFile},
      {name:"Search in files",hint:"Explorer search",run:function(){switchSideView("search");}},
      {name:"Export workspace backup",hint:"JSON",run:exportWorkspace},
      {name:"Open Explorer",hint:"Activity bar",run:function(){switchSideView("explorer");}},
      {name:"Open editor settings",hint:"Indentation and wrapping",run:function(){switchSideView("settings");}},
      {name:"Focus editor",hint:"",run:function(){editor.focus();}},
      {name:"Reset starter workspace",hint:"Destructive",run:function(){document.getElementById("reset").click();}}
    ];
    var overlay=document.createElement("div");overlay.id="commandOverlay";overlay.className="command-overlay";
    var dialog=document.createElement("section");dialog.className="command-dialog";dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");dialog.setAttribute("aria-label","Command palette");
    var input=document.createElement("input");input.className="command-input";input.placeholder="Type a command…";input.setAttribute("aria-label","Filter commands");
    var list=document.createElement("div");list.className="command-list";
    dialog.append(input,list);overlay.append(dialog);document.body.append(overlay);
    function render(){
      list.replaceChildren();var filtered=commands.filter(function(c){return c.name.toLowerCase().includes(input.value.toLowerCase());});
      if(!filtered.length){var empty=document.createElement("p");empty.className="command-empty";empty.textContent="No matching commands";list.append(empty);return;}
      filtered.forEach(function(command,index){var button=document.createElement("button");button.type="button";button.className="command-option";if(index===0)button.classList.add("is-selected");
        var name=document.createElement("span");name.textContent=command.name;var hint=document.createElement("small");hint.textContent=command.hint;button.append(name,hint);
        button.addEventListener("click",function(){overlay.remove();command.run();});list.append(button);});
    }
    input.addEventListener("input",render);
    input.addEventListener("keydown",function(event){
      var options=Array.from(list.querySelectorAll(".command-option")),current=options.findIndex(function(b){return b.classList.contains("is-selected");});
      if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();if(!options.length)return;if(current>=0)options[current].classList.remove("is-selected");var next=(current+(event.key==="ArrowDown"?1:-1)+options.length)%options.length;options[next].classList.add("is-selected");options[next].scrollIntoView({block:"nearest"});}
      else if(event.key==="Enter"){event.preventDefault();var selected=options.find(function(b){return b.classList.contains("is-selected");});if(selected)selected.click();}
      else if(event.key==="Escape"){overlay.remove();editor.focus();}
    });
    overlay.addEventListener("mousedown",function(event){if(event.target===overlay){overlay.remove();editor.focus();}});
    render();input.focus();
  }
  var previewDevice=document.getElementById("previewDevice");
  function setPreviewDevice(mode){
    var widths={desktop:"100%",tablet:"768px",phone:"390px"};
    if(!Object.prototype.hasOwnProperty.call(widths,mode))mode="desktop";
    frame.style.width=widths[mode];frame.style.maxWidth="100%";frame.style.marginInline="auto";
    frame.classList.toggle("preview-frame-device",mode!=="desktop");
    try{localStorage.setItem("code-forge-preview-device",mode);}catch(e){}
    previewDevice.value=mode;
  }
  try{var savedPreviewDevice=localStorage.getItem("code-forge-preview-device");if(["desktop","tablet","phone"].includes(savedPreviewDevice))setPreviewDevice(savedPreviewDevice);}catch(e){}
  previewDevice.addEventListener("change",function(){setPreviewDevice(previewDevice.value);});
  document.getElementById("run").addEventListener("click",function(){clearTimeout(previewTimer);renderPreview(true);});
  document.getElementById("refresh").addEventListener("click",function(){clearTimeout(previewTimer);renderPreview(true);});
  function markCurrentFileSaved() {
    rememberEditor();var saved=persist(false);if(saved)dirty[activeFile]=false;
    renderTabs();renderExplorer();updateCursor();return saved;
  }
  document.getElementById("clear").addEventListener("click",function(){
    editor.value="";markCurrentFileSaved();
    if(["index.html","styles.css","app.js"].includes(activeFile))renderPreview(false);
    editor.focus();say("Current file cleared");
  });
  document.getElementById("trim").addEventListener("click",function(){
    var before=editor.value,after=before.split("\n").map(function(line){return line.replace(/[ \t]+$/,"");}).join("\n");
    if(after===before){say("No trailing whitespace found.");return;}
    editor.value=after;markCurrentFileSaved();say("Trailing whitespace removed");
  });
  document.getElementById("reset").addEventListener("click",function(){
    if(!confirm("Restore the starter workspace? All local workspace files will be replaced."))return;
    clearTimeout(saveTimer);clearTimeout(previewTimer);
    files=Object.assign({},START);dirty=Object.create(null);openFiles=["index.html","styles.css","app.js"];activeFile="index.html";
    switchingFile=true;editorView.dispatch({effects:languageCompartment.reconfigure(languageExtension(activeFile))});editor.value=files[activeFile];switchingFile=false;
    persist(false);renderTabs();renderExplorer();updateCursor();renderPreview(false);say("Starter workspace restored");
  });
  document.getElementById("exportHtml").addEventListener("click",function(){rememberEditor();persist(false);download("code-forge-project.html",Core.buildDocument(files["index.html"],files["styles.css"],files["app.js"],""),"text/html;charset=utf-8");say("Standalone HTML downloaded");});
  document.getElementById("exportProject").addEventListener("click",exportWorkspace);
  document.getElementById("importButton").addEventListener("click",function(){document.getElementById("importFile").click();});
  document.getElementById("importFile").addEventListener("change",function(event){importWorkspace(event.target.files&&event.target.files[0]);event.target.value="";});
  document.getElementById("openPreview").addEventListener("click",function(){
    rememberEditor();persist(false);var url=URL.createObjectURL(new Blob([Core.buildDocument(files["index.html"],files["styles.css"],files["app.js"],"")],{type:"text/html;charset=utf-8"}));
    var opened=window.open(url,"_blank");if(!opened){URL.revokeObjectURL(url);say("Pop-up blocked. Download the HTML file instead.");}else{try{opened.opener=null;}catch(e){}setTimeout(function(){URL.revokeObjectURL(url);},60000);}
  });
  document.getElementById("clearConsole").addEventListener("click",clearConsole);
  document.querySelector(".console-heading").insertAdjacentHTML("afterbegin",'<div class="panel-tabs" role="tablist" aria-label="Output panels"><button type="button" class="panel-tab is-active" data-panel="console">Console</button><button type="button" class="panel-tab" data-panel="output">Output</button><button type="button" class="panel-tab" data-panel="problems">Problems</button></div>');
  document.querySelectorAll(".panel-tab").forEach(function(b){b.addEventListener("click",function(){panelMode=b.dataset.panel;document.querySelectorAll(".panel-tab").forEach(function(x){x.classList.toggle("is-active",x===b);});renderBottomPanel();});});
  window.addEventListener("message",function(event){
    if(event.source!==frame.contentWindow||!event.data||event.data.__codeForge!==currentChannel)return;
    var level=String(event.data.level||"log");addConsoleLine(level,String(event.data.message||""));
    if(level==="error")document.getElementById("previewState").textContent="Runtime error";
    else if(level==="system")document.getElementById("previewState").textContent="Ready";
  });
  window.addEventListener("beforeunload",function(){clearTimeout(saveTimer);rememberEditor();try{localStorage.setItem("code-forge-workspace-v2",JSON.stringify({format:"code-forge-workspace",version:2,files:files}));localStorage.setItem("code-forge-project-v1",JSON.stringify({html:files["index.html"],css:files["styles.css"],js:files["app.js"]}));}catch(e){}});
  var resizing=false,resizeRatio=.5,handle=document.getElementById("resizeHandle");
  function resizeAt(clientX){var rect=workspace.getBoundingClientRect(),ratio=(clientX-rect.left)/rect.width;ratio=Math.max(.25,Math.min(.75,ratio));resizeRatio=ratio;workspace.style.gridTemplateColumns="minmax(0,"+(ratio*100)+"fr) 8px minmax(0,"+((1-ratio)*100)+"fr)";}
  handle.addEventListener("pointerdown",function(event){if(matchMedia("(max-width: 760px)").matches)return;resizing=true;var rect=workspace.getBoundingClientRect();resizeRatio=(event.clientX-rect.left)/rect.width;handle.setPointerCapture(event.pointerId);event.preventDefault();});
  handle.addEventListener("pointermove",function(event){if(resizing)resizeAt(event.clientX);});
  handle.addEventListener("pointerup",function(){resizing=false;});handle.addEventListener("pointercancel",function(){resizing=false;});
  handle.addEventListener("keydown",function(event){if(matchMedia("(max-width: 760px)").matches)return;if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();var rect=workspace.getBoundingClientRect();resizeAt(rect.left+rect.width*Math.max(.25,Math.min(.75,resizeRatio+(event.key==="ArrowLeft"?-.03:.03))));}});
})();