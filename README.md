# Code Forge

A local-first browser workspace for building small web projects with HTML, CSS and JavaScript. Code Forge combines a multi-file editor, live preview and runtime console in a restrained graphite-and-muted-lime interface, tuned for clear hierarchy, long editing sessions and responsive use.

**Live app:** https://tejas-mk2.github.io/Code-Forge/

No account, cloud authentication or application backend is required. Projects and preferences stay in the current browser profile unless you export them or code you run sends data elsewhere.

## Features

- **CodeMirror 6 editor** with HTML, CSS and JavaScript language support, line numbers, completion, bracket matching, folding, search and undo/redo.
- **Live sandboxed preview** with Run/Refresh controls, desktop/tablet/phone viewport presets and a separate-window export option.
- **Browser-local workspace** with Explorer, tabs, additional virtual text files, rename/delete/duplicate actions, recent files, unsaved markers and autosave.
- **Portable project backups** in JSON format. Import validates the entire workspace before replacing the current one; older three-file project backups remain supported.
- **Recovery safeguards** that preserve malformed stored workspace data when possible, expose a recovery export, and avoid overwriting the only copy when preservation fails.
- **Workspace search and replace** with previous/next navigation, case sensitivity, whole-word matching and a confirmation step before bulk replacement.
- **Useful editor controls** including indentation, word wrap, font size, Go to Line, a command palette and four workspace layouts.
- **Runtime console** with timestamps, error/warning counts, an errors-only filter and console history.
- **Standalone HTML export** for sharing a self-contained version of the three preview entry files.
- **Local static bundle**: CodeMirror is bundled for the published site; the app does not fetch editor packages from a runtime CDN.
- **Installable offline shell**: after one successful visit, a service worker caches the editor assets so the app can reopen without a network connection. Projects remain in that browser profile; offline caching is not cloud sync or a substitute for exported backups.

## Getting started

### Use the hosted app

Open the [live app](https://tejas-mk2.github.io/Code-Forge/). Work is stored in that browser profile on that device. Export a backup before clearing site data, changing browsers or moving to another device.

### Run locally

Requirements: Node.js 22 or newer and npm.

1. Clone this repository and enter the project directory.
2. Install development dependencies and build the static site:

   ```sh
   npm install --no-package-lock --no-fund
   npm run build
   ```

3. Serve the generated `dist/` directory over HTTP using your preferred static server. The site is designed to run as static files; no app server or database is needed. The offline service worker requires HTTPS or localhost, as enforced by browsers.

To run the browser regression tests as well, install Playwright's Chromium browser once:

```sh
npx playwright install chromium
npm test
npm run test:e2e
```

The end-to-end test starts its own temporary local static server and uses an isolated browser context. It does not use a deployed site or your personal browser storage.

## Everyday workflow

1. Edit `index.html`, `styles.css` or `app.js` in the editor.
2. Choose **Run** or press **Ctrl/⌘ + Enter** to refresh the preview.
3. Use Explorer to open existing files or create additional browser-local text files.
4. Use **Backup JSON** to export every workspace file. Import is validated before it can replace your open workspace.
5. Use **Download HTML** to export a standalone document made from the three preview entry files.

Additional virtual text files are included in workspace backups, but they are not automatically merged into the live preview. The preview is built from `index.html`, `styles.css` and `app.js`.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl/⌘ + Enter | Run the current project |
| Ctrl/⌘ + S | Save to this browser |
| Ctrl/⌘ + N | Create a workspace file |
| Ctrl/⌘ + Shift + P | Open the command palette |
| Ctrl/⌘ + G | Go to a line in the current file |
| Tab | Insert the configured indentation (two spaces by default) |

## Data and security

Code Forge stores the workspace and editor preferences in browser-local storage. It does not provide cloud sync, user accounts or a server-side database. Browser storage is not a backup: clear site data, browser-profile changes, private browsing and device loss may make local projects unavailable. Export important projects regularly.

The preview uses a sandboxed iframe with scripts enabled but without `allow-same-origin`. That keeps preview code on an opaque origin, separate from the editor's origin. **Sandboxing does not make arbitrary code safe:** code you choose to run can still perform network requests, display deceptive content or affect the preview itself. Run only code you trust, and do not paste secrets into a project or issue report.

See [SECURITY.md](SECURITY.md) for responsible vulnerability reporting and [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Tests and deployment

The unit/regression suite covers document generation, workspace import validation, legacy backup compatibility, storage-write failure behavior, editor wiring, keyboard shortcuts, accessibility hooks, mobile overflow safeguards and repository documentation/templates.

Run the build and checks with:

```sh
npm run build
node --check core.js
node --check app.js
node --check scripts/build.cjs
npm test
npm run test:e2e
```

The end-to-end suite exercises the built app in Chromium, including preview execution, editor changes, local autosave/reload, malformed and oversized import preservation, storage-quota failure with backup export, an offline reload after the app shell is cached, and narrow viewport overflow. GitHub Actions validates pushes and pull requests with syntax checks, a production build, regression tests and Chromium browser checks. Pull requests are never deployed; only a successful run on `main` can publish `dist/` to GitHub Pages. Workflow actions are SHA-pinned, deployment permissions are scoped to the deploy job, CI runs `npm audit --audit-level=high` and fails on high or critical dependency vulnerabilities, and Dependabot checks dependency updates weekly.

- [Latest workflow runs](https://github.com/TEJAS-MK2/Code-Forge/actions)
- [Open the live app](https://tejas-mk2.github.io/Code-Forge/)

## Repository layout

- `index.html` — accessible application structure and local script references.
- `styles.css` — responsive interface styling.
- `app.js` — editor interactions, workspace management, persistence, preview and console.
- `core.js` — document generation and validated project/workspace formats.
- `src/editor.js` — CodeMirror 6 setup, language support and editor theme.
- `scripts/build.cjs` — produces the static site in `dist/`.
- `manifest.webmanifest`, `icon.svg` and `sw.js` — install metadata, app icon and offline app-shell cache.
- `tests/*.test.cjs` — Node.js unit/regression tests.
- `tests/browser.e2e.cjs` — Chromium end-to-end smoke and responsive checks.
- `.github/workflows/pages.yml` — CI validation and GitHub Pages deployment.
- `.github/ISSUE_TEMPLATE/` — structured bug, feature and question forms.

## License

Code Forge is licensed under the [MIT License](LICENSE).
