(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CodeForgeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function safeScript(value) {
    return String(value == null ? "" : value).replace(/<\/script/gi, "<\\/script");
  }

  function buildDocument(html, css, js, channel) {
    var source = String(html == null ? "" : html);
    var styles = "<style id=\"code-forge-user-styles\">\n" + String(css == null ? "" : css) + "\n</style>";
    var meta = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
    if (!/<html(?:\s|>)/i.test(source)) {
      if (/<(?:head|body)(?:\s|>)/i.test(source)) {
        source = "<!doctype html>\n<html lang=\"en\">\n" + source + "\n</html>";
      } else {
        source = "<!doctype html>\n<html lang=\"en\">\n<head>" + meta + "</head>\n<body>" + source + "</body>\n</html>";
      }
    }
    if (!/<head(?:\s|>)/i.test(source)) {
      source = source.replace(/<html([^>]*)>/i, function (match) {
        return match + "\n<head>" + meta + styles + "</head>";
      });
    } else {
      var headClose = /<\/head\s*>/i;
      if (headClose.test(source)) {
        source = source.replace(headClose, styles + "\n</head>");
      } else {
        source = source.replace(/<head([^>]*)>/i, function (match) { return match + meta + styles; });
      }
    }

    var channelLiteral = JSON.stringify(String(channel || ""));
    var runtime = [
      "(function(){",
      "var channel=" + channelLiteral + ";",
      "function send(level,args){try{parent.postMessage({__codeForge:channel,level:level,message:Array.prototype.map.call(args,function(v){if(typeof v==='string')return v;try{return JSON.stringify(v,function(k,x){return typeof x==='bigint'?String(x)+'n':x;});}catch(e){return String(v);}}).join(' ').slice(0,3000)},'*');}catch(e){}}",
      "['log','info','warn','error','debug'].forEach(function(level){var original=console[level]&&console[level].bind(console);console[level]=function(){send(level,arguments);if(original)original.apply(null,arguments);};});",
      "window.addEventListener('error',function(e){var stack=e.error&&e.error.stack||'';var match=String(stack).match(/code-forge-user\\.js:(\\d+):(\\d+)/);var location=match?' (app.js:'+match[1]+':'+match[2]+')':' ('+e.lineno+':'+e.colno+')';send('error',[e.message+location]);});",
      "window.addEventListener('unhandledrejection',function(e){send('error',['Unhandled promise rejection:',e.reason]);});",
      "send('system',['Preview started']);",
      "})();"
    ].join("\n");
    var scriptTag = "<script>\n" + runtime + "\n</script>\n<script>\n" + safeScript(js) + "\n//# sourceURL=code-forge-user.js\n</script>";
    if (/<\/body\s*>/i.test(source)) {
      source = source.replace(/<\/body\s*>/i, scriptTag + "\n</body>");
    } else if (/<\/html\s*>/i.test(source)) {
      source = source.replace(/<\/html\s*>/i, "<body>" + scriptTag + "</body>\n</html>");
    } else {
      source += "\n" + scriptTag;
    }
    return source;
  }

  function validProject(value) {
    return !!value && typeof value === "object" &&
      ["html", "css", "js"].every(function (key) { return typeof value[key] === "string"; });
  }

  function projectJSON(project) {
    return JSON.stringify({ format: "code-forge-project", version: 1, files: {
      html: String(project.html == null ? "" : project.html),
      css: String(project.css == null ? "" : project.css),
      js: String(project.js == null ? "" : project.js)
    }}, null, 2);
  }

  function readProject(value) {
    var parsed = typeof value === "string" ? JSON.parse(value) : value;
    var files = parsed && parsed.format === "code-forge-project" ? parsed.files : parsed;
    if (!validProject(files)) throw new Error("This file is not a valid Code Forge project.");
    return { html: files.html, css: files.css, js: files.js };
  }

  function safeWorkspaceName(name) {
    return typeof name === "string" && name.length > 0 && name.length <= 64 &&
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && name !== "." && name !== "..";
  }

  function writeWorkspace(storage, files) {
    var workspace = JSON.stringify({ format: "code-forge-workspace", version: 2, files: files });
    try {
      storage.setItem("code-forge-workspace-v2", workspace);
    } catch (error) {
      return { saved: false, legacySaved: false, error: error };
    }
    try {
      storage.setItem("code-forge-project-v1", JSON.stringify({
        html: files["index.html"], css: files["styles.css"], js: files["app.js"]
      }));
      return { saved: true, legacySaved: true };
    } catch (error) {
      // The v2 workspace is the source of truth; a failed legacy mirror must not mark it unsaved.
      return { saved: true, legacySaved: false, error: error };
    }
  }

  function readWorkspace(value) {
    var parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && parsed.format === "code-forge-workspace") {
      if (parsed.version !== 2 || !parsed.files || typeof parsed.files !== "object" || Array.isArray(parsed.files)) {
        throw new Error("This workspace backup has an unsupported or invalid format.");
      }
      var names = Object.keys(parsed.files);
      if (names.length > 500) throw new Error("This workspace backup contains too many files (maximum 500).");
      var next = Object.create(null);
      names.forEach(function (name) {
        if (!safeWorkspaceName(name)) throw new Error("Invalid file name in workspace backup: " + name);
        if (typeof parsed.files[name] !== "string") throw new Error("Invalid file contents in workspace backup: " + name);
        next[name] = parsed.files[name];
      });
      if (!next["index.html"] || next["styles.css"] == null || next["app.js"] == null) {
        throw new Error("Backup must include index.html, styles.css and app.js.");
      }
      return next;
    }
    var legacy = readProject(parsed);
    return { "index.html": legacy.html, "styles.css": legacy.css, "app.js": legacy.js };
  }


  function readProjectIndex(value) {
    var parsed=typeof value==="string"?JSON.parse(value):value;
    if(!parsed||parsed.format!=="code-forge-project-index"||parsed.version!==1||!Array.isArray(parsed.projects)||parsed.projects.length<1||parsed.projects.length>50) {
      throw new Error("This project index is invalid or unsupported.");
    }
    var ids=Object.create(null),names=Object.create(null),projects=[];
    parsed.projects.forEach(function(project){
      if(!project||typeof project.id!=="string"||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(project.id))throw new Error("Invalid project identifier.");
      if(typeof project.name!=="string")throw new Error("Invalid project name.");
      var name=project.name.trim();
      if(!name||name.length>48||/[\u0000-\u001f\u007f]/.test(name))throw new Error("Project names must contain 1–48 printable characters.");
      var normalized=name.toLowerCase();
      if(ids[project.id]||names[normalized])throw new Error("Project identifiers and names must be unique.");
      ids[project.id]=true;names[normalized]=true;projects.push({id:project.id,name:name});
    });
    if(typeof parsed.activeId!=="string"||!ids[parsed.activeId])throw new Error("The active project is missing from the project index.");
    return {format:"code-forge-project-index",version:1,activeId:parsed.activeId,projects:projects};
  }
  function projectIndexJSON(index) { return JSON.stringify(readProjectIndex(index),null,2); }


  function zipWorkspace(files) {
    var checked=readWorkspace({format:"code-forge-workspace",version:2,files:files});
    var encoder=new TextEncoder(),crcTable=new Uint32Array(256);
    for(var n=0;n<256;n++){var value=n;for(var bit=0;bit<8;bit++)value=(value&1)?(0xedb88320^(value>>>1)):(value>>>1);crcTable[n]=value>>>0;}
    function crc32(bytes){var crc=0xffffffff;for(var i=0;i<bytes.length;i++)crc=crcTable[(crc^bytes[i])&0xff]^(crc>>>8);return (crc^0xffffffff)>>>0;}
    function concat(parts,total){var result=new Uint8Array(total),offset=0;parts.forEach(function(part){result.set(part,offset);offset+=part.length;});return result;}
    var localParts=[],centralParts=[],localOffset=0,centralSize=0,entries=[];
    Object.keys(checked).sort().forEach(function(name){
      var nameBytes=encoder.encode(name),data=encoder.encode(checked[name]),crc=crc32(data);
      if(nameBytes.length>65535||data.length>0xffffffff)throw new Error("A ZIP entry exceeds the supported size.");
      var local=new Uint8Array(30+nameBytes.length),lv=new DataView(local.buffer);
      lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);
      lv.setUint16(8,0,true);lv.setUint16(10,0,true);lv.setUint16(12,0x21,true);
      lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);
      lv.setUint16(26,nameBytes.length,true);lv.setUint16(28,0,true);local.set(nameBytes,30);
      localParts.push(local,data);localOffset+=local.length+data.length;
      var central=new Uint8Array(46+nameBytes.length),cv=new DataView(central.buffer);
      cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);
      cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint16(12,0,true);cv.setUint16(14,0x21,true);
      cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);
      cv.setUint16(28,nameBytes.length,true);cv.setUint16(30,0,true);cv.setUint16(32,0,true);
      cv.setUint16(34,0,true);cv.setUint16(36,0,true);cv.setUint32(38,0,true);cv.setUint32(42,localOffset-local.length-data.length,true);
      central.set(nameBytes,46);centralParts.push(central);centralSize+=central.length;entries.push(name);
    });
    var centralOffset=localOffset,end=new Uint8Array(22),ev=new DataView(end.buffer);
    ev.setUint32(0,0x06054b50,true);ev.setUint16(4,0,true);ev.setUint16(6,0,true);
    ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);
    ev.setUint32(12,centralSize,true);ev.setUint32(16,centralOffset,true);ev.setUint16(20,0,true);
    return concat(localParts.concat(centralParts,[end]),localOffset+centralSize+end.length);
  }


  function diffLines(before, after) {
    var oldLines=String(before==null?"":before).split(/\r?\n/),newLines=String(after==null?"":after).split(/\r?\n/);
    if(oldLines.length>600||newLines.length>600||oldLines.length*newLines.length>360000)throw new Error("This file is too large for an in-browser line diff (maximum 600 lines).");
    var rows=oldLines.length+1,cols=newLines.length+1,table=new Array(rows);
    for(var i=0;i<rows;i++)table[i]=new Uint16Array(cols);
    for(var oi=oldLines.length-1;oi>=0;oi--)for(var ni=newLines.length-1;ni>=0;ni--){
      table[oi][ni]=oldLines[oi]===newLines[ni]?table[oi+1][ni+1]+1:Math.max(table[oi+1][ni],table[oi][ni+1]);
    }
    var result=[],oldIndex=0,newIndex=0;
    while(oldIndex<oldLines.length||newIndex<newLines.length){
      if(oldIndex<oldLines.length&&newIndex<newLines.length&&oldLines[oldIndex]===newLines[newIndex]){
        result.push({type:"context",text:oldLines[oldIndex],oldLine:oldIndex+1,newLine:newIndex+1});oldIndex++;newIndex++;
      } else if(oldIndex<oldLines.length&&(newIndex>=newLines.length||table[oldIndex+1][newIndex]>=table[oldIndex][newIndex+1])){
        result.push({type:"remove",text:oldLines[oldIndex],oldLine:oldIndex+1,newLine:null});oldIndex++;
      } else {
        result.push({type:"add",text:newLines[newIndex],oldLine:null,newLine:newIndex+1});newIndex++;
      }
    }
    return result;
  }

  return { buildDocument: buildDocument, validProject: validProject, projectJSON: projectJSON, readProject: readProject, readWorkspace: readWorkspace, writeWorkspace: writeWorkspace, readProjectIndex: readProjectIndex, projectIndexJSON: projectIndexJSON, zipWorkspace: zipWorkspace, diffLines: diffLines };
});