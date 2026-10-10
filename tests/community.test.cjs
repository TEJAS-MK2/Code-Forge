"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("README points to the live app, MIT license, local-first model and executable checks", () => {
  const readme = read("README.md");
  assert.match(readme, /https:\/\/tejas-mk2\.github\.io\/Code-Forge\//);
  assert.match(readme, /\[MIT License\]\(LICENSE\)/);
  assert.match(readme, /browser-local storage/i);
  assert.match(readme, /npm test/);
  assert.match(readme, /npm run test:e2e/);
  assert.doesNotMatch(readme, /No license is specified yet/i);
});

test("contributor guide documents reproducible checks and the local-first constraints", () => {
  const guide = read("CONTRIBUTING.md");
  for (const value of ["npm run build", "npm test", "npm run test:e2e", "local-first", "allow-same-origin", "SECURITY.md"]) {
    assert.ok(guide.includes(value), `CONTRIBUTING.md is missing ${value}`);
  }
});

test("setup guides use the committed lockfile for reproducible installs", () => {
  for (const file of ["README.md", "CONTRIBUTING.md"]) {
    const guide = read(file);
    assert.match(guide, /npm ci --no-fund/, `${file} should install the committed lockfile`);
    assert.doesNotMatch(guide, /npm install --no-package-lock/, `${file} should not bypass the lockfile`);
  }
});

test("security policy provides private disclosure instructions and describes preview limitations", () => {
  const policy = read("SECURITY.md");
  for (const value of ["Report a vulnerability", "privately", "sandboxed iframe", "network requests", "local storage", "public issue"]) {
    assert.ok(policy.toLowerCase().includes(value.toLowerCase()), `SECURITY.md is missing ${value}`);
  }
});

test("all issue form definitions have required GitHub issue-form structure", () => {
  const forms = [
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml",
    ".github/ISSUE_TEMPLATE/question.yml"
  ];
  for (const file of forms) {
    const content = read(file);
    assert.match(content, /^name:\s*\S+/m, file);
    assert.match(content, /^description:\s*\S+/m, file);
    assert.match(content, /^title:\s*["']/m, file);
    assert.match(content, /^body:\s*$/m, file);
    assert.match(content, /^  - type: textarea$/m, file);
    assert.match(content, /^    validations:\s*$/m, file);
  }
});

test("issue chooser disables unstructured reports and links maintainers' security policy", () => {
  const config = read(".github/ISSUE_TEMPLATE/config.yml");
  assert.match(config, /^blank_issues_enabled:\s*false$/m);
  assert.match(config, /security\/policy/);
  assert.match(config, /Do not post vulnerability details in a public issue/i);
});

test("issue forms warn reporters not to publish secrets or private project data", () => {
  const bug = read(".github/ISSUE_TEMPLATE/bug_report.yml");
  const question = read(".github/ISSUE_TEMPLATE/question.yml");
  assert.match(bug, /API keys/i);
  assert.match(bug, /private project source/i);
  assert.match(question, /security-sensitive details/i);
});

test("workflow checks community files and executes browser tests before deployment", () => {
  const workflow = read(".github/workflows/pages.yml");
  for (const value of [
    "CONTRIBUTING.md",
    "SECURITY.md",
    ".github/dependabot.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml",
    ".github/ISSUE_TEMPLATE/question.yml",
    "playwright install --with-deps chromium",
    "npm run test:e2e"
  ]) {
    assert.ok(workflow.includes(value), `Workflow is missing validation: ${value}`);
  }
});


test("CI pins every action, limits deployment permissions, and validates pull requests without deploying", () => {
  const workflow = read(".github/workflows/pages.yml");
  const actionRefs = workflow.split("\n")
    .filter(line => line.trim().startsWith("uses:"))
    .map(line => line.split("#")[0].trim().slice("uses:".length).trim());
  assert.ok(actionRefs.length > 0, "workflow should use explicit actions");
  for (const ref of actionRefs) {
    const sha = ref.slice(ref.lastIndexOf("@") + 1);
    assert.equal(sha.length, 40, "Action is not pinned to a full SHA: " + ref);
    assert.ok(/^[a-f0-9]+$/.test(sha), "Action SHA is invalid: " + ref);
  }
  assert.ok(workflow.includes("permissions:\n  contents: read"));
  assert.ok(workflow.includes("deploy:\n    if: github.event_name !="));
  assert.ok(workflow.includes("pages: write"));
  assert.ok(workflow.includes("id-token: write"));
  assert.ok(workflow.includes("pull_request:\n    branches: [main]"));
  assert.ok(workflow.includes("group: code-forge-${{ github.event.pull_request.number || github.ref }}"));
});

test("Dependabot is configured to check npm and GitHub Actions updates weekly", () => {
  const config = read(".github/dependabot.yml");
  assert.match(config, /package-ecosystem: npm/);
  assert.match(config, /package-ecosystem: github-actions/);
  assert.equal((config.match(/interval: weekly/g) || []).length, 2);
});
