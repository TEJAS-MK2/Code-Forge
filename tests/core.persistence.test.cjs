"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../core.js");

function createStorage(options = {}) {
  const values = new Map();
  return {
    values,
    setItem(key, value) {
      if (options.failOnKey === key) throw new Error("QuotaExceededError");
      values.set(key, String(value));
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    }
  };
}

const sampleFiles = {
  "index.html": "<h1>Local project</h1>",
  "styles.css": "h1 { color: #b8e986; }",
  "app.js": "console.log('local');",
  "notes.md": "A workspace-only file."
};

test("workspace writer persists a complete local snapshot and legacy mirror", () => {
  const storage = createStorage();
  const result = Core.writeWorkspace(storage, sampleFiles);

  assert.equal(result.saved, true);
  assert.equal(result.legacySaved, true);
  assert.deepEqual({ ...Core.readWorkspace(storage.getItem("code-forge-workspace-v2")) }, sampleFiles);
  assert.deepEqual(JSON.parse(storage.getItem("code-forge-project-v1")), {
    html: sampleFiles["index.html"],
    css: sampleFiles["styles.css"],
    js: sampleFiles["app.js"]
  });
});

test("primary workspace quota failure is reported and does not write a partial legacy mirror", () => {
  const storage = createStorage({ failOnKey: "code-forge-workspace-v2" });
  const result = Core.writeWorkspace(storage, sampleFiles);

  assert.equal(result.saved, false);
  assert.equal(result.legacySaved, false);
  assert.ok(result.error instanceof Error);
  assert.equal(storage.getItem("code-forge-workspace-v2"), null);
  assert.equal(storage.getItem("code-forge-project-v1"), null);
});

test("legacy compatibility-mirror failure does not discard a successful workspace save", () => {
  const storage = createStorage({ failOnKey: "code-forge-project-v1" });
  const result = Core.writeWorkspace(storage, sampleFiles);

  assert.equal(result.saved, true);
  assert.equal(result.legacySaved, false);
  assert.match(result.error.message, /QuotaExceededError/);
  assert.deepEqual({ ...Core.readWorkspace(storage.getItem("code-forge-workspace-v2")) }, sampleFiles);
});

test("workspace reader accepts 500 files and rejects 501 files atomically", () => {
  const files = {
    "index.html": "<h1>Safe</h1>",
    "styles.css": "",
    "app.js": ""
  };
  for (let i = 0; i < 497; i += 1) files[`extra-${i}.txt`] = "local";
  assert.equal(Object.keys(Core.readWorkspace({ format: "code-forge-workspace", version: 2, files })).length, 500);
  files["extra-over-limit.txt"] = "must fail";
  assert.throws(
    () => Core.readWorkspace({ format: "code-forge-workspace", version: 2, files }),
    /too many files/i
  );
});

 
test("project index validation rejects duplicate names, unsafe IDs and unknown active projects", () => {
  const valid = { format: "code-forge-project-index", version: 1, activeId: "default", projects: [{ id: "default", name: "My Project" }] };
  assert.deepEqual(Core.readProjectIndex(valid), valid);
  assert.throws(() => Core.readProjectIndex({ ...valid, projects: [{ id: "bad/id", name: "Project" }] }), /identifier/i);
  assert.throws(() => Core.readProjectIndex({ ...valid, projects: [{ id: "one", name: "Same" }, { id: "two", name: "same" }] }), /unique/i);
  assert.throws(() => Core.readProjectIndex({ ...valid, activeId: "missing" }), /active project/i);
  assert.throws(() => Core.readProjectIndex({ ...valid, projects: [] }), /invalid or unsupported/i);
});

test("project index JSON is normalized and versioned", () => {
  const json = Core.projectIndexJSON({ format: "code-forge-project-index", version: 1, activeId: "default", projects: [{ id: "default", name: "  Local Project  " }] });
  assert.equal(JSON.parse(json).projects[0].name, "Local Project");
  assert.equal(JSON.parse(json).version, 1);
});
