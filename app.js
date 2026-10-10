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
  var recoveryBackupRaw=null,recoveryBackupPreserved=false;
  try { recoveryBackupRaw=localStorage.getItem("code-forge-recovery-backup-v1");recoveryBackupPreserved=!!recoveryBackupRaw; } catch(e) {}
  var files = loadFiles();
  var recentFiles=[];
  try{var storedRecent=JSON.parse(localStorage.getItem("code-forge-recent-files")||"[]");if(Array.isArray(storedRecent))recentFiles=storedRecent.filter(function(name){return safeName(name);}).slice(0,5);}catch(e){}
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
  var editorStates = Object.create(null);
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
      var v2 = localStorage.getItem("code-forge-workspace-v2");
      if (v2) {
        try { return Core.readWorkspace(v2); }
        catch (invalidWorkspace) {
          recoveryBackupRaw=v2;recoveryBackupPreserved=false;
          try { localStorage.setItem("code-forge-recovery-backup-v1",v2);recoveryBackupPreserved=localStorage.getItem("code-forge-recovery-backup-v1")===v2; } catch(e) {}
          saveState(recoveryBackupPreserved?"Recovery copy preserved":"Backup recovery blocked",false);
        }
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
    if(recoveryBackupRaw&&!recoveryBackupPreserved){saveState("Recovery copy not saved",false);if(showError)say("The existing workspace backup is invalid and could not be preserved. Export the raw recovery copy before continuing.");return false;}
    var result;
    try { result=Core.writeWorkspace(localStorage,files); }
    catch(error) { result={saved:false,error:error}; }
    if(result.saved){saveState("Saved on this device",true);return true;}
    saveState("Storage unavailable",false);
    if(showError)say("Browser storage is unavailable. Export a backup to keep your work.");
    return false;
  }
  function persistSnapshot(showError) {
    if(recoveryBackupRaw&&!recoveryBackupPreserved){saveState("Recovery copy not saved",false);if(showError)say("The existing workspace backup is invalid and could not be preserved. Export the raw recovery copy before continuing.");return false;}
    var result;
    try { result=Core.writeWorkspace(localStorage,files); }
    catch(error) { result={saved:false,error:error}; }
    if(result.saved){saveState("Saved on this device",true);return true;}
    saveState("Storage unavailable",false);
    if(showError)say("Browser storage is full or unavailable. Export a backup before continuing.");
    return false;
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
  var consoleHistory=[],consoleFilter="all",consoleErrors=0,consoleWarnings=0;
  function renderConsoleHistory() {
    consoleOutput.replaceChildren();
    var visible=consoleFilter==="errors"?consoleHistory.filter(function(entry){return entry.level==="error";}):consoleHistory;
    if(!visible.length){
      var empty=document.createElement("div");empty.className="console-empty";empty.id="consoleEmpty";
      empty.textContent=consoleFilter==="errors"?"No runtime errors captured.":"Console output and runtime errors will appear here.";
      consoleOutput.appendChild(empty);
    } else visible.forEach(function(entry){
      var row=document.createElement("div");row.className="console-line";row.dataset.level=entry.level;
      var time=document.createElement("span");time.className="console-time";time.textContent=entry.time;
      var tag=document.createElement("span");tag.className="console-level";tag.textContent=entry.level;
      var msg=document.createElement("span");msg.className="console-message";msg.textContent=entry.message;
      row.append(time,tag,msg);consoleOutput.appendChild(row);
    });
    consoleLines=consoleHistory.length;
    consoleErrors=consoleHistory.filter(function(entry){return entry.level==="error";}).length;
    consoleWarnings=consoleHistory.filter(function(entry){return entry.level==="warn";}).length;
    consoleCount.textContent=consoleLines+(consoleLines===1?" entry":" entries")+" · "+consoleErrors+" errors · "+consoleWarnings+" warnings";
    consoleOutput.scrollTop=consoleOutput.scrollHeight;
  }
  function clearConsole() {consoleHistory=[];consoleErrors=0;consoleWarnings=0;consoleLines=0;consoleCount.textContent="0 entries · 0 errors · 0 warnings";if(panelMode==="console")renderConsoleHistory();}
  function addConsoleLine(level,message) {
    consoleHistory.push({level:["log","info","warn","error","debug","system"].indexOf(level)>=0?level:"log",message:String(message),time:new Date().toLocaleTimeString()});
    if(consoleHistory.length>500)consoleHistory=consoleHistory.slice(-500);
    if(panelMode==="console")renderConsoleHistory();
    else {
      consoleLines=consoleHistory.length;
      consoleErrors=consoleHistory.filter(function(entry){return entry.level==="error";}).length;
      consoleWarnings=consoleHistory.filter(function(entry){return entry.level==="warn";}).length;
      consoleCount.textContent=consoleLines+(consoleLines===1?" entry":" entries")+" · "+consoleErrors+" errors · "+consoleWarnings+" warnings";
    }
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
  function makeEditorState(name) {
    var wrap=true,indent="2";
    try { wrap=localStorage.getItem("code-forge-word-wrap")!=="false";indent=localStorage.getItem("code-forge-indent")||"2"; } catch(e) {}
    return Engine.EditorState.create({doc:files[name]||"",extensions:[
      Engine.basicSetup,Engine.syntaxHighlighting(Engine.syntax),Engine.theme,
      languageCompartment.of(languageExtension(name)),
      wrappingCompartment.of(wrap?Engine.EditorView.lineWrapping:[]),
      indentCompartment.of(Engine.indentUnit.of(indent==="tab"?"\t":" ".repeat(indent==="4"?4:2))),
      Engine.EditorView.updateListener.of(function(update){if(update.docChanged&&!switchingFile)emit("input");if(update.selectionSet||update.docChanged)emit("select");})
    ]});
  }
  function openFile(name) {
    if(files[name]==null) return;
    rememberEditor();editorStates[activeFile]=editorView.state;
    activeFile=name;
    recentFiles=[name].concat(recentFiles.filter(function(item){return item!==name&&files[item]!=null;})).slice(0,5);
    try{localStorage.setItem("code-forge-recent-files",JSON.stringify(recentFiles));}catch(e){}
    if(!openFiles.includes(name))openFiles.push(name);
    switchingFile=true;
    if(!editorStates[name])editorStates[name]=makeEditorState(name);
    editorView.setState(editorStates[name]);
    switchingFile=false;
    renderTabs();if(sideView!=="search")renderExplorer();updateCursor();editor.focus();
    document.getElementById("trim").disabled=false;
    output("Workspace","Opened "+name+".");
  }
  function closeFile(name) {
    if(["index.html","styles.css","app.js"].includes(name))return;
    if(dirty[name]) { if(!confirm("Close "+name+"? It has unsaved changes. Export a backup first if you need to keep them."))return; }
    rememberEditor();openFiles=openFiles.filter(function(n){return n!==name;});
    if(activeFile===name)openFile("index.html");else renderTabs();
  }
  function renderExplorer() {
    sidePanelBody.replaceChildren();
    if(sideView==="search") {
      var wrap=document.createElement("div");wrap.className="search-workspace";
      var input=document.createElement("input");input.type="search";input.id="workspaceSearch";input.placeholder="Find in workspace";input.setAttribute("aria-label","Find text in workspace");
      var options=document.createElement("div");options.className="search-options";
      var caseLabel=document.createElement("label");caseLabel.className="search-option";var caseSensitive=document.createElement("input");caseSensitive.type="checkbox";caseSensitive.id="searchCaseSensitive";caseLabel.append(caseSensitive,document.createTextNode("Match case"));
      var wordLabel=document.createElement("label");wordLabel.className="search-option";var wholeWord=document.createElement("input");wholeWord.type="checkbox";wholeWord.id="searchWholeWord";wordLabel.append(wholeWord,document.createTextNode("Whole word"));options.append(caseLabel,wordLabel);
      var replacement=document.createElement("input");replacement.type="text";replacement.id="workspaceReplace";replacement.placeholder="Replace with…";replacement.setAttribute("aria-label","Replacement text");
      var navigation=document.createElement("div");navigation.className="search-navigation";
      var previous=document.createElement("button");previous.type="button";previous.className="tree-add-file";previous.textContent="Previous match";previous.setAttribute("aria-label","Go to previous search match");
      var next=document.createElement("button");next.type="button";next.className="tree-add-file";next.textContent="Next match";next.setAttribute("aria-label","Go to next search match");navigation.append(previous,next);
      var replaceButton=document.createElement("button");replaceButton.type="button";replaceButton.className="tree-add-file";replaceButton.textContent="Replace all in workspace";
      var results=document.createElement("div");results.className="search-results";results.id="searchResults";
      function searchOptions(){return {caseSensitive:caseSensitive.checked,wholeWord:wholeWord.checked};}
      function refresh(){searchFiles(input.value,results,searchOptions());}
      wrap.append(input,options,replacement,navigation,replaceButton,results);sidePanelBody.append(wrap);
      input.addEventListener("input",refresh);caseSensitive.addEventListener("change",refresh);wholeWord.addEventListener("change",refresh);
      previous.addEventListener("click",function(){navigateSearchMatch(-1);});next.addEventListener("click",function(){navigateSearchMatch(1);});
      replaceButton.addEventListener("click",function(){replaceAllFiles(input.value,replacement.value,searchOptions());refresh();});
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
      var item=document.createElement("div");item.className="tree-file"+(name===activeFile?" is-active":"");
      var openButton=document.createElement("button");openButton.type="button";openButton.className="tree-file-open";openButton.title=name;
      var dot=document.createElement("span");dot.className="file-type-dot type-"+lang(name);
      var text=document.createElement("span");text.className="tree-file-name";text.textContent=name;
      var state=document.createElement("span");state.className="tree-file-state";state.textContent=dirty[name]?"●":"";
      openButton.append(dot,text,state);openButton.addEventListener("click",function(){openFile(name);});item.append(openButton);
      if(!["index.html","styles.css","app.js"].includes(name)){var actions=document.createElement("button");actions.type="button";actions.className="tree-file-action";actions.textContent="⋯";actions.title="Rename or delete "+name;actions.setAttribute("aria-label","Actions for "+name);actions.addEventListener("click",function(e){e.stopPropagation();fileMenu(name);});item.append(actions);}
      item.addEventListener("contextmenu",function(e){e.preventDefault();fileMenu(name);});root.append(item);
    });
    var visibleRecent=recentFiles.filter(function(name){return files[name]!=null;});
    if(visibleRecent.length){
      var recentHeading=document.createElement("div");recentHeading.className="tree-section-label recent-heading";recentHeading.textContent="RECENT";root.append(recentHeading);
      visibleRecent.forEach(function(name){var recent=document.createElement("button");recent.type="button";recent.className="tree-file recent-file";recent.title="Recently opened: "+name;var dot=document.createElement("span");dot.className="file-type-dot type-"+lang(name);var label=document.createElement("span");label.className="tree-file-name";label.textContent=name;recent.append(dot,label);recent.addEventListener("click",function(){openFile(name);});root.append(recent);});
    }
    var add=document.createElement("button");add.className="tree-add-file";add.type="button";add.textContent="+ New file";add.addEventListener("click",newFile);root.append(add);
    var help=document.createElement("p");help.className="tree-help";help.textContent="Virtual files are saved in browser storage. Export a backup to move them to another device.";root.append(help);
    sidePanelBody.append(root);
  }
  var searchMatches=[],searchMatchIndex=-1;
  function searchPattern(query,options) {
    var escaped="";String(query).split("").forEach(function(char){if("\\^$.*+?()[]{}|".indexOf(char)>=0)escaped+="\\";escaped+=char;});
    var source=options&&options.wholeWord?"(^|[^A-Za-z0-9_])("+escaped+")(?=$|[^A-Za-z0-9_])":escaped;
    return new RegExp(source,"g"+(options&&options.caseSensitive?"":"i")+(options&&options.wholeWord?"m":""));
  }
  function jumpToSearchMatch(index) {
    if(index<0||index>=searchMatches.length)return;
    searchMatchIndex=index;var match=searchMatches[index];openFile(match.name);
    var lineObj=editorView.state.doc.line(Math.min(match.line,editorView.state.doc.lines));
    editorView.dispatch({selection:{anchor:Math.min(lineObj.to,lineObj.from+match.column)},scrollIntoView:true});
    editor.focus();
    var results=document.querySelector(".search-results");
    if(results){results.querySelectorAll(".search-hit").forEach(function(hit){hit.classList.remove("is-current");});var current=results.querySelector('[data-match-index="'+index+'"]');if(current){current.classList.add("is-current");current.scrollIntoView({block:"nearest"});}}
    var summary=document.querySelector("#searchSummary");if(summary)summary.textContent=(index+1)+" of "+searchMatches.length+" matches";
  }
  function navigateSearchMatch(direction) {
    if(!searchMatches.length){say("No search matches to navigate.");return;}
    var next=searchMatchIndex<0?(direction<0?searchMatches.length-1:0):(searchMatchIndex+direction+searchMatches.length)%searchMatches.length;
    jumpToSearchMatch(next);
  }
  function searchFiles(query,results,options) {
    options=options||{};results.replaceChildren();searchMatches=[];searchMatchIndex=-1;
    if(!query.trim())return;
    Object.keys(files).forEach(function(name){
      var lines=files[name].split("\n");
      lines.forEach(function(line,lineIndex){
        var pattern=searchPattern(query,options),match;
        while((match=pattern.exec(line))!==null&&searchMatches.length<500){
          var prefix=options.wholeWord?(match[1]||"").length:0;
          searchMatches.push({name:name,line:lineIndex+1,column:match.index+prefix});
        }
      });
    });
    var summary=document.createElement("p");summary.className="search-summary";summary.id="searchSummary";
    summary.textContent=searchMatches.length?searchMatches.length+" match"+(searchMatches.length===1?"":"es")+" found"+(searchMatches.length===500?" (showing first 500)":""):"No matches found.";
    results.append(summary);
    searchMatches.forEach(function(matchData,index){
      var line=files[matchData.name].split("\n")[matchData.line-1];
      var hit=document.createElement("button");hit.type="button";hit.className="search-hit";hit.dataset.matchIndex=String(index);
      var filename=document.createElement("span");filename.className="search-hit-file";filename.textContent=matchData.name+":"+matchData.line+":"+(matchData.column+1);
      var excerpt=document.createElement("span");excerpt.className="search-hit-line";excerpt.textContent=line.trim().slice(0,120)||"(blank line)";
      hit.append(filename,excerpt);hit.addEventListener("click",function(){jumpToSearchMatch(index);});results.append(hit);
    });
  }
  function replaceAllFiles(query,replacement,options) {
    query=String(query||"");replacement=String(replacement==null?"":replacement);options=options||{};
    if(!query){say("Enter text to find first.");return;}
    rememberEditor();
    var count=0;
    Object.keys(files).forEach(function(name){files[name].split("\n").forEach(function(line){var re=searchPattern(query,options);while(re.exec(line)!==null)count++;});});
    if(!count){say("No matches to replace.");return;}
    if(!confirm("Replace "+count+" occurrence"+(count===1?"":"s")+" across all workspace files? You can undo the replacement in each file after opening it."))return;
    Object.keys(files).forEach(function(name){
      files[name]=files[name].split("\n").map(function(line){
        var re=searchPattern(query,options);
        if(options.wholeWord)return line.replace(re,function(full,prefix){return (prefix||"")+replacement;});
        return line.replace(re,function(){return replacement;});
      }).join("\n");
      if(name!==activeFile&&editorStates[name]){
        var previousState=editorStates[name],nextDocument=files[name];
        if(previousState.doc.toString()!==nextDocument){
          editorStates[name]=previousState.update({changes:{from:0,to:previousState.doc.length,insert:nextDocument}}).state;
        }
      }
    });
    switchingFile=true;editor.value=files[activeFile];switchingFile=false;editorStates[activeFile]=editorView.state;
    var saved=persist(true);
    if(saved)dirty=Object.create(null);
    else Object.keys(files).forEach(function(name){dirty[name]=true;});
    renderTabs();if(sideView!=="search")renderExplorer();updateCursor();
    if(["index.html","styles.css","app.js"].includes(activeFile))renderPreview(false);
    say(saved?"Replaced "+count+" occurrence"+(count===1?"":"s")+" across the workspace.":"Replacement applied in memory, but storage failed. Unsaved markers are retained; export a backup.");
  }
  function fileMenu(name) {
    if(["index.html","styles.css","app.js"].includes(name)){say("Core preview files cannot be renamed or deleted.");return;}
    var action=prompt("File actions for "+name+": type rename, duplicate or delete","rename");if(!action)return;
    if(action.toLowerCase()==="delete")deleteFile(name);
    else if(action.toLowerCase()==="rename")renameFile(name);
    else if(action.toLowerCase()==="duplicate")duplicateFile(name);
  }
  function newFile() {
    var name=prompt("New file name (for example, notes.md or helper.js)");if(!name)return;
    name=name.trim();
    if(!safeName(name)){say("Use 1–64 letters, numbers, dots, underscores or hyphens. No folders.");return;}
    if(files[name]!=null){say("A file with that name already exists.");return;}
    files[name]="";dirty[name]=false;
    var saved=persist(true);if(!saved)dirty[name]=true;
    openFile(name);renderExplorer();say(saved?"Created "+name:"Created "+name+" in memory; storage failed, so export a backup.");
  }
  function duplicateFile(sourceName) {
    if(files[sourceName]==null)return;
    // Capture the live CodeMirror buffer before copying the workspace snapshot.
    rememberEditor();
    var suggestion=sourceName.replace(/(\.[^.]+)?$/, "-copy$1");
    var name=prompt("Duplicate "+sourceName+" as:",suggestion);
    if(!name)return;name=name.trim();
    if(!safeName(name)){say("That file name is not supported.");return;}
    if(files[name]!=null){say("A file with that name already exists.");return;}
    files[name]=files[sourceName];dirty[name]=false;openFiles.push(name);
    if(!persist(true)){delete files[name];openFiles=openFiles.filter(function(n){return n!==name;});return;}
    openFile(name);renderExplorer();say("Duplicated "+sourceName+" as "+name);
  }
  function renameFile(oldName) {
    var name=prompt("Rename "+oldName+" to:",oldName);if(!name||name===oldName)return;name=name.trim();
    if(!safeName(name)){say("That file name is not supported.");return;}
    if(files[name]!=null){say("A file with that name already exists.");return;}
    // Snapshot the active editor before removing the old key, or live edits can be lost.
    rememberEditor();
    files[name]=files[oldName];if(activeFile===oldName)editorStates[oldName]=editorView.state;editorStates[name]=editorStates[oldName];delete editorStates[oldName];delete files[oldName];if(dirty[oldName])dirty[name]=true;delete dirty[oldName];
    recentFiles=recentFiles.map(function(item){return item===oldName?name:item;});
    try{localStorage.setItem("code-forge-recent-files",JSON.stringify(recentFiles));}catch(e){}
    openFiles=openFiles.map(function(n){return n===oldName?name:n;});if(activeFile===oldName)activeFile=name;
    var saved=persist(true);if(!saved)dirty[name]=true;
    renderTabs();renderExplorer();openFile(name);say(saved?"Renamed to "+name:"Renamed to "+name+" in memory; storage failed, so export a backup.");
  }
  function deleteFile(name) {
    if(["index.html","styles.css","app.js"].includes(name)){say("The three preview entry files are required.");return;}
    if(!confirm("Delete "+name+" from this browser workspace?"))return;
    if(activeFile===name)editorStates[name]=editorView.state;
    delete files[name];delete dirty[name];openFiles=openFiles.filter(function(n){return n!==name;});
    recentFiles=recentFiles.filter(function(item){return item!==name;});try{localStorage.setItem("code-forge-recent-files",JSON.stringify(recentFiles));}catch(e){}
    if(activeFile===name){openFile("index.html");}
    delete editorStates[name];
    var saved=persist(true);renderTabs();renderExplorer();updateCursor();
    say(saved?"Deleted "+name:"Deleted "+name+" in memory; storage failed, so export a backup before leaving.");
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
  function exportRecoveryBackup() {
    if(!recoveryBackupRaw){say("No recovery copy is available.");return;}
    download("code-forge-recovery-copy.json",recoveryBackupRaw,"application/json;charset=utf-8");
    say("Raw recovery copy downloaded; the original contents were not modified.");
  }
  var MAX_IMPORT_BYTES = 10 * 1024 * 1024;
  function importWorkspace(file) {
    if(!file)return;
    if(file.size>MAX_IMPORT_BYTES){say("Workspace backups must be 10 MiB or smaller.");return;}
    if(!confirm("Importing this backup replaces every file in the current local workspace. Export a backup first if you need the current version."))return;
    var reader=new FileReader();
    reader.onload=function(){
      try {
        var next=Core.readWorkspace(String(reader.result));
        clearTimeout(saveTimer);clearTimeout(previewTimer);
        files=next;dirty=Object.create(null);openFiles=["index.html","styles.css","app.js"];activeFile="index.html";editorStates=Object.create(null);
        switchingFile=true;editorView.setState(makeEditorState(activeFile));editorStates[activeFile]=editorView.state;switchingFile=false;
        var saved=persist(true);
        if(!saved)Object.keys(files).forEach(function(name){dirty[name]=true;});
        renderTabs();if(sideView!=="search")renderExplorer();updateCursor();renderPreview(false);
        say(saved?"Workspace imported and saved on this device.":"Workspace imported in memory, but browser storage failed. Export a backup before leaving.");
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
    } else renderConsoleHistory();
  }

  // Build the IDE shell around the existing editor/preview workspace.
  var shell=document.getElementById("ideLayout"),rail=shell.querySelector(".activity-rail");
  document.querySelectorAll(".rail-button").forEach(function(button){button.addEventListener("click",function(){switchSideView(button.dataset.view);});});
  document.getElementById("newFile").addEventListener("click",newFile);
  document.getElementById("collapseExplorer").addEventListener("click",function(){sidePanel.classList.toggle("is-collapsed");});
  var engineExtensions=[Engine.basicSetup,Engine.syntaxHighlighting(Engine.syntax),Engine.theme,languageCompartment.of(languageExtension(activeFile)),wrappingCompartment.of(Engine.lineWrapping),indentCompartment.of(Engine.indentUnit.of("  ")),Engine.EditorView.updateListener.of(function(update){if(update.docChanged&&!switchingFile)emit("input");if(update.selectionSet||update.docChanged)emit("select");})];
  try{
    var savedFontSize=Number(localStorage.getItem("code-forge-font-size")||12);
    if([11,12,13,14,16,18].includes(savedFontSize))editorHost.style.setProperty("--cf-editor-font-size",savedFontSize+"px");
    var savedWrap=localStorage.getItem("code-forge-word-wrap")!=="false";
    engineExtensions[4]=wrappingCompartment.of(savedWrap?Engine.EditorView.lineWrapping:[]);
  }catch(e){}
  editorView=new Engine.EditorView({parent:editorHost,doc:files[activeFile],extensions:engineExtensions});
  editorStates[activeFile]=editorView.state;
  editor.setAttribute("aria-label","Code editor content");
  editorHost.addEventListener("keydown",function(event){emit("keydown",event);});
  setLayout(readLayout());renderTabs();renderExplorer();updateCursor();clearConsole();renderPreview(false);if(recoveryBackupRaw)say(recoveryBackupPreserved?"A raw recovery copy was preserved locally. Use the command palette to export it.":"The invalid workspace backup could not be preserved locally. Export the raw recovery copy immediately.");
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
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="g"){event.preventDefault();goToLine();}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="n"){event.preventDefault();newFile();}
  });
  var TEMPLATES={"Landing page":{"index.html":"<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Launch page</title></head><body><main class=\"hero\"><p class=\"eyebrow\">BUILT WITH CODE FORGE</p><h1>Make something <span>remarkable.</span></h1><p class=\"lead\">A clear message, thoughtful design, and a page that loads fast.</p><a class=\"cta\" href=\"#details\">Explore the idea</a></main><section id=\"details\"><h2>Made for the next step</h2><p>Replace this copy with your product, project or idea.</p></section></body></html>","styles.css":"*{box-sizing:border-box}body{margin:0;background:#f3f2ec;color:#20241e;font-family:Inter,system-ui,sans-serif}.hero{min-height:78vh;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding:clamp(28px,8vw,110px);background:radial-gradient(circle at 80% 20%,#d8e9c9,transparent 35%)}.eyebrow{font-size:12px;letter-spacing:.16em;font-weight:800;color:#526b3e}h1{max-width:900px;font-size:clamp(44px,8vw,100px);line-height:.98;letter-spacing:-.065em;margin:18px 0}h1 span{color:#5d7c43}.lead{max-width:550px;color:#5b6255;line-height:1.8}.cta{margin-top:20px;padding:13px 18px;border-radius:6px;background:#b8e986;color:#182012;text-decoration:none;font-weight:750}section{padding:50px clamp(28px,8vw,110px)}","app.js":"document.querySelector('.cta')?.addEventListener('click', () => console.log('Thanks for exploring the page.'));"},"Portfolio":{"index.html":"<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Your Portfolio</title></head><body><header><a class=\"brand\" href=\"#\">YOUR NAME<span>.</span></a><nav><a href=\"#work\">Work</a><a href=\"#about\">About</a><a href=\"#contact\">Contact</a></nav></header><main><p class=\"eyebrow\">DESIGN · CODE · CURIOSITY</p><h1>Building useful things for the <span>real world.</span></h1><p class=\"intro\">I turn ideas into fast, thoughtful digital experiences.</p><a class=\"button\" href=\"#work\">View selected work ↓</a></main><section id=\"work\"><h2>Selected work</h2><article><small>PROJECT 01</small><h3>Project name</h3><p>What you built, why it matters, and what you learned.</p></article></section><section id=\"about\"><h2>About</h2><p>A short introduction goes here.</p></section><section id=\"contact\"><h2>Let's talk</h2><a href=\"mailto:hello@example.com\">hello@example.com</a></section></body></html>","styles.css":"*{box-sizing:border-box}body{margin:0;background:#111410;color:#e8ebe3;font-family:Inter,system-ui,sans-serif}header{display:flex;justify-content:space-between;align-items:center;padding:24px clamp(20px,6vw,80px);border-bottom:1px solid #2c3228}a{color:inherit;text-decoration:none}nav{display:flex;gap:22px;color:#a8b09f;font-size:13px}.brand{font-weight:850;letter-spacing:.04em}.brand span,main h1 span{color:#b8e986}.eyebrow{color:#b8e986;letter-spacing:.18em;font-size:11px;font-weight:800}main{min-height:70vh;padding:clamp(32px,9vw,120px) clamp(20px,10vw,140px);display:flex;align-items:flex-start;flex-direction:column;justify-content:center}h1{max-width:950px;font-size:clamp(44px,8vw,104px);line-height:.98;letter-spacing:-.065em;margin:18px 0}.intro{max-width:560px;color:#a8b09f;line-height:1.8}.button{margin-top:18px;padding:12px 16px;border:1px solid #59644e;border-radius:5px;color:#dce4d5}section{padding:48px clamp(20px,10vw,140px);border-top:1px solid #2c3228}article{max-width:600px;padding:24px;border:1px solid #2c3228;border-radius:8px}article small{color:#b8e986}p{line-height:1.8;color:#a8b09f}@media(max-width:500px){header{align-items:flex-start;gap:14px;flex-direction:column}nav{gap:15px}}","app.js":"document.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => console.log('Navigating to', link.getAttribute('href'))));"},"Contact form":{"index.html":"<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Contact us</title></head><body><main class=\"form-card\"><p class=\"eyebrow\">SAY HELLO</p><h1>What’s on your mind?</h1><p>Use this front-end form as a starting point. It does not send data to a server.</p><form id=\"contactForm\"><label>Name<input name=\"name\" required autocomplete=\"name\"></label><label>Email<input name=\"email\" type=\"email\" required autocomplete=\"email\"></label><label>Message<textarea name=\"message\" rows=\"5\" required></textarea></label><button>Preview submission</button><p id=\"formStatus\" aria-live=\"polite\"></p></form></main></body></html>","styles.css":"*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;background:#e9ede4;color:#20241e;font-family:Inter,system-ui,sans-serif}.form-card{width:min(640px,100%);padding:clamp(22px,5vw,48px);border:1px solid #d4dacd;border-radius:12px;background:#fafbf8;box-shadow:0 18px 60px #28331d12}.eyebrow{color:#597a42;font-size:11px;font-weight:800;letter-spacing:.16em}h1{font-size:clamp(32px,6vw,52px);letter-spacing:-.05em;line-height:1.05}p{color:#62685d;line-height:1.7}form,label{display:flex;flex-direction:column;gap:8px}form{gap:16px;margin-top:24px}label{font-size:13px;font-weight:700}input,textarea{width:100%;padding:12px;border:1px solid #cbd2c3;border-radius:6px;background:white;color:#20241e;font:inherit}button{padding:12px 16px;border:0;border-radius:6px;background:#b8e986;color:#182012;font-weight:800;cursor:pointer}#formStatus{min-height:1.5em}","app.js":"document.querySelector('#contactForm')?.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.currentTarget); document.querySelector('#formStatus').textContent = 'Preview only: ready to send a message from ' + data.get('name') + '. No data was uploaded.'; console.info('Form preview completed; no network request was made.'); });"},"Animated card":{"index.html":"<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Motion study</title></head><body><main><article class=\"motion-card\" tabindex=\"0\"><p class=\"eyebrow\">MOTION STUDY / 001</p><h1>Small details.<br><span>Better feel.</span></h1><p>Hover, focus or tap the card to explore a little motion.</p><button id=\"motionButton\">Change state</button><p id=\"motionState\" aria-live=\"polite\">Idle state</p></article></main></body></html>","styles.css":"*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#141713;color:#e8ebe3;font-family:Inter,system-ui,sans-serif}main{min-height:100vh;display:grid;place-items:center;padding:24px}.motion-card{width:min(620px,100%);padding:clamp(26px,6vw,58px);border:1px solid #414a38;border-radius:16px;background:linear-gradient(140deg,#252c21,#191d18);box-shadow:0 25px 80px #0005;transition:transform .28s ease,border-color .28s ease,box-shadow .28s ease}.motion-card:hover,.motion-card:focus-visible{transform:translateY(-7px) rotateX(1deg);border-color:#b8e986;box-shadow:0 32px 90px #0008}.eyebrow{font-size:10px;letter-spacing:.18em;color:#b8e986;font-weight:800}h1{font-size:clamp(40px,8vw,76px);line-height:1;letter-spacing:-.06em}h1 span{color:#b8e986}p{color:#a8b09f;line-height:1.8}button{padding:12px 16px;border:0;border-radius:6px;background:#b8e986;color:#182012;font-weight:800;cursor:pointer}@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}","app.js":"let active = false; document.querySelector('#motionButton')?.addEventListener('click', () => { active = !active; document.querySelector('#motionState').textContent = active ? 'Active state' : 'Idle state'; console.log('Motion state: ' + (active ? 'active' : 'idle')); });"},"Click counter game":{"index.html":"<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Click Sprint</title></head><body><main class=\"game\"><p class=\"eyebrow\">MINI GAME</p><h1>Click sprint</h1><p>How many clicks can you land? Your score stays in this page session only.</p><div class=\"score\" id=\"score\">0</div><button id=\"clicker\">Click me</button><button id=\"resetScore\" class=\"secondary\">Reset score</button><p id=\"gameMessage\" aria-live=\"polite\">Ready when you are.</p></main></body></html>","styles.css":"*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#e9ede4;color:#20241e;font-family:Inter,system-ui,sans-serif}.game{width:min(540px,100%);padding:clamp(24px,6vw,52px);border:1px solid #d1d8c9;border-radius:14px;background:#fbfcf9;text-align:center;box-shadow:0 22px 70px #1d291412}.eyebrow{color:#5a7942;font-size:11px;letter-spacing:.17em;font-weight:850}.game h1{font-size:clamp(38px,8vw,64px);letter-spacing:-.06em;margin:12px 0}.game p{color:#646b5f;line-height:1.7}.score{font:800 clamp(56px,12vw,90px)/1 ui-monospace,monospace;margin:28px 0;color:#56783b}button{padding:12px 18px;margin:4px;border:0;border-radius:6px;background:#b8e986;color:#182012;font-weight:800;cursor:pointer}.secondary{border:1px solid #d1d8c9;background:transparent;color:#41483b}","app.js":"let score = 0; const scoreNode = document.querySelector('#score'); document.querySelector('#clicker')?.addEventListener('click', () => { score += 1; scoreNode.textContent = String(score); document.querySelector('#gameMessage').textContent = score + ' click' + (score === 1 ? '' : 's') + ' so far.'; }); document.querySelector('#resetScore')?.addEventListener('click', () => { score = 0; scoreNode.textContent = '0'; document.querySelector('#gameMessage').textContent = 'Ready when you are.'; });"}};
  function applyTemplate(name) {
    var template=TEMPLATES[name];if(!template)return;
    if(!confirm('Load the '+name+' template? This replaces all three preview files in your current local workspace.'))return;
    clearTimeout(saveTimer);clearTimeout(previewTimer);
    files=Object.assign({},template);dirty=Object.create(null);openFiles=['index.html','styles.css','app.js'];activeFile='index.html';editorStates=Object.create(null);
    switchingFile=true;editorView.setState(makeEditorState(activeFile));editorStates[activeFile]=editorView.state;switchingFile=false;
    var saved=persist(true);if(!saved)Object.keys(files).forEach(function(fileName){dirty[fileName]=true;});
    renderTabs();renderExplorer();updateCursor();renderPreview(false);
    say(saved?name+' template loaded and saved on this device.':name+' template loaded in memory, but browser storage failed. Unsaved markers are retained; export a backup.');
  }
  function goToLine() {
    var previous=document.querySelector("#goToLineOverlay");if(previous){previous.remove();}
    var overlay=document.createElement("div");overlay.id="goToLineOverlay";overlay.className="command-overlay";
    var dialog=document.createElement("section");dialog.className="command-dialog";dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");dialog.setAttribute("aria-label","Go to line");
    var input=document.createElement("input");input.className="command-input";input.type="number";input.min="1";input.max=String(editorView.state.doc.lines);input.value=String(editorView.state.doc.lineAt(editorView.state.selection.main.head).number);input.setAttribute("aria-label","Line number");input.setAttribute("placeholder","Line number (1–"+editorView.state.doc.lines+")");
    var actions=document.createElement("div");actions.className="command-actions";
    var cancel=document.createElement("button");cancel.type="button";cancel.className="command-option";cancel.textContent="Cancel";
    var go=document.createElement("button");go.type="button";go.className="command-option is-selected";go.textContent="Go to line";
    function close(){overlay.remove();editor.focus();}
    function submit(){var lineNumber=Number(input.value);if(!Number.isInteger(lineNumber)||lineNumber<1||lineNumber>editorView.state.doc.lines){input.setAttribute("aria-invalid","true");input.focus();return;}var line=editorView.state.doc.line(lineNumber);overlay.remove();editorView.dispatch({selection:{anchor:line.from},scrollIntoView:true});editor.focus();}
    cancel.addEventListener("click",close);go.addEventListener("click",submit);
    input.addEventListener("keydown",function(event){if(event.key==="Enter"){event.preventDefault();submit();}else if(event.key==="Escape"){event.preventDefault();close();}});
    overlay.addEventListener("mousedown",function(event){if(event.target===overlay)close();});
    actions.append(cancel,go);dialog.append(input,actions);overlay.append(dialog);document.body.append(overlay);input.focus();input.select();
  }
  function commandPalette() {
    var old=document.querySelector("#commandOverlay");if(old){old.remove();return;}
    var commands=[
      {name:"Run preview",hint:"Ctrl + Enter",run:function(){renderPreview(true);}},
      {name:"Create new file",hint:"Ctrl + N",run:newFile},
      {name:"Search in files",hint:"Explorer search",run:function(){switchSideView("search");}},
      {name:"Export workspace backup",hint:"JSON",run:exportWorkspace},
      {name:"Open Explorer",hint:"Activity bar",run:function(){switchSideView("explorer");}},
      {name:"Open editor settings",hint:"Indentation and wrapping",run:function(){switchSideView("settings");}},
      {name:"Duplicate active file",hint:"Workspace",run:function(){duplicateFile(activeFile);}},
      {name:"Focus editor",hint:"",run:function(){editor.focus();}},
      {name:"Go to line",hint:"Ctrl + G",run:goToLine},
      {name:"Reset starter workspace",hint:"Destructive",run:function(){document.getElementById("reset").click();}}
    ];
    if(recoveryBackupRaw)commands.push({name:"Export preserved recovery copy",hint:"Raw JSON",run:exportRecoveryBackup});
    Object.keys(TEMPLATES).forEach(function(name){commands.push({name:"Template: "+name,hint:"Replace preview files",run:function(){applyTemplate(name);}});});
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
    files=Object.assign({},START);dirty=Object.create(null);openFiles=["index.html","styles.css","app.js"];activeFile="index.html";editorStates=Object.create(null);
    switchingFile=true;editorView.setState(makeEditorState(activeFile));editorStates[activeFile]=editorView.state;switchingFile=false;
    var saved=persist(false);if(!saved)Object.keys(files).forEach(function(name){dirty[name]=true;});
    renderTabs();renderExplorer();updateCursor();renderPreview(false);
    say(saved?"Starter workspace restored":"Starter workspace restored in memory, but storage failed. Export a backup before leaving.");
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
  document.querySelector(".console-heading").insertAdjacentHTML("afterbegin",'<div class="panel-tabs" role="tablist" aria-label="Output panels"><button id="panel-tab-console" type="button" role="tab" aria-selected="true" aria-controls="consoleOutput" tabindex="0" class="panel-tab is-active" data-panel="console">Console</button><button id="panel-tab-output" type="button" role="tab" aria-selected="false" aria-controls="consoleOutput" tabindex="-1" class="panel-tab" data-panel="output">Output</button><button id="panel-tab-problems" type="button" role="tab" aria-selected="false" aria-controls="consoleOutput" tabindex="-1" class="panel-tab" data-panel="problems">Problems</button></div>');
  document.querySelector(".console-heading").insertAdjacentHTML("beforeend",'<div class="console-filters" role="group" aria-label="Console filter"><button type="button" class="console-filter is-active" data-console-filter="all" aria-pressed="true">All</button><button type="button" class="console-filter" data-console-filter="errors" aria-pressed="false">Errors</button></div>');
  document.querySelectorAll(".console-filter").forEach(function(button){button.addEventListener("click",function(){consoleFilter=button.dataset.consoleFilter;document.querySelectorAll(".console-filter").forEach(function(item){var active=item===button;item.classList.toggle("is-active",active);item.setAttribute("aria-pressed",String(active));});if(panelMode==="console")renderConsoleHistory();});});
  document.querySelectorAll(".panel-tab").forEach(function(b){b.addEventListener("click",function(){panelMode=b.dataset.panel;document.querySelectorAll(".panel-tab").forEach(function(x){var active=x===b;x.classList.toggle("is-active",active);x.setAttribute("aria-selected",String(active));x.tabIndex=active?0:-1;});consoleOutput.setAttribute("aria-labelledby",b.id);renderBottomPanel();});});
  document.querySelector(".panel-tabs").addEventListener("keydown",function(event){if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;event.preventDefault();var tabs=Array.from(document.querySelectorAll(".panel-tab")),index=tabs.indexOf(document.activeElement);if(index<0)index=0;index=(index+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;tabs[index].focus();tabs[index].click();});
  window.addEventListener("message",function(event){
    if(event.source!==frame.contentWindow||!event.data||event.data.__codeForge!==currentChannel)return;
    var level=String(event.data.level||"log");addConsoleLine(level,String(event.data.message||""));
    if(level==="error")document.getElementById("previewState").textContent="Runtime error";
    else if(level==="system")document.getElementById("previewState").textContent="Ready";
  });
  window.addEventListener("beforeunload",function(event){
    clearTimeout(saveTimer);rememberEditor();
    var saved=persist(false);
    if(saved){dirty=Object.create(null);}
    if(!saved||Object.keys(dirty).some(function(name){return dirty[name];})){
      event.preventDefault();event.returnValue="";
    }
  });
  var resizing=false,resizeRatio=.5,handle=document.getElementById("resizeHandle");
  function resizeAt(clientX){var rect=workspace.getBoundingClientRect(),ratio=(clientX-rect.left)/rect.width;ratio=Math.max(.25,Math.min(.75,ratio));resizeRatio=ratio;handle.setAttribute("aria-valuenow",String(Math.round(ratio*100)));workspace.style.gridTemplateColumns="minmax(0,"+(ratio*100)+"fr) 8px minmax(0,"+((1-ratio)*100)+"fr)";}
  handle.addEventListener("pointerdown",function(event){if(matchMedia("(max-width: 760px)").matches)return;resizing=true;var rect=workspace.getBoundingClientRect();resizeRatio=(event.clientX-rect.left)/rect.width;handle.setAttribute("aria-valuenow",String(Math.round(Math.max(.25,Math.min(.75,resizeRatio))*100)));handle.setPointerCapture(event.pointerId);event.preventDefault();});
  handle.addEventListener("pointermove",function(event){if(resizing)resizeAt(event.clientX);});
  handle.addEventListener("pointerup",function(){resizing=false;});handle.addEventListener("pointercancel",function(){resizing=false;});
  handle.addEventListener("keydown",function(event){if(matchMedia("(max-width: 760px)").matches)return;if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();var rect=workspace.getBoundingClientRect();resizeAt(rect.left+rect.width*Math.max(.25,Math.min(.75,resizeRatio+(event.key==="ArrowLeft"?-.03:.03))));}});
})();

// Progressive enhancement: keep the static app shell available offline after first load.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js").catch(function () {
      // The editor remains usable when service workers are unavailable.
    });
  });
}

var networkState = document.getElementById("networkState");
function updateNetworkState() {
  if (!networkState) return;
  var online = navigator.onLine;
  networkState.textContent = online ? "Browser online" : "Browser offline";
  networkState.dataset.network = online ? "online" : "offline";
}
window.addEventListener("online", updateNetworkState);
window.addEventListener("offline", updateNetworkState);
updateNetworkState();


// Show an install action only when the browser says installation is available.
var installToastTimer = null;
function notifyInstall(message) {
  var toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(installToastTimer);
  installToastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2200);
}
var installButton = document.getElementById("installApp");
var deferredInstallPrompt = null;
if (installButton && window.matchMedia("(display-mode: standalone)").matches) installButton.hidden = true;
window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (installButton) installButton.hidden = false;
});
if (installButton) {
  installButton.addEventListener("click", async function () {
    if (!deferredInstallPrompt) {
      notifyInstall("Use your browser menu to install Code Forge.");
      return;
    }
    var promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    installButton.hidden = true;
    await promptEvent.prompt();
    var choice = await promptEvent.userChoice;
    notifyInstall(choice && choice.outcome === "accepted" ? "Code Forge installed." : "Installation dismissed.");
  });
}
window.addEventListener("appinstalled", function () {
  deferredInstallPrompt = null;
  if (installButton) installButton.hidden = true;
  notifyInstall("Code Forge installed.");
});
