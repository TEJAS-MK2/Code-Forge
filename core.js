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
      "window.addEventListener('error',function(e){send('error',[e.message+' ('+e.lineno+':'+e.colno+')']);});",
      "window.addEventListener('unhandledrejection',function(e){send('error',['Unhandled promise rejection:',e.reason]);});",
      "send('system',['Preview started']);",
      "})();"
    ].join("\n");
    var scriptTag = "<script>\n" + runtime + "\n</script>\n<script>\n" + safeScript(js) + "\n</script>";
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

  return { buildDocument: buildDocument, validProject: validProject, projectJSON: projectJSON, readProject: readProject, readWorkspace: readWorkspace };
});