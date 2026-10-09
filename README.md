# Code Forge

A small, local-first browser workspace for writing HTML, CSS and JavaScript. No account, backend, package installation or cloud authentication is required.

**Live site:** https://tejas-mk2.github.io/Code-Forge/

## What it does

- **Three source files:** edit HTML, CSS and JavaScript in separate tabs.
- **Live preview:** changes refresh the preview automatically; use **Run** or **Ctrl/⌘ + Enter** to run immediately.
- **Runtime console:** view console output, warnings and JavaScript runtime errors without leaving the page.
- **Local autosave:** your current project is saved to this browser's localStorage.
- **Portable project backup:** export and import a JSON project file to move work between browsers or devices.
- **Standalone HTML export:** download a single HTML file with your HTML, CSS and JavaScript combined.
- **Flexible workspace:** switch between side-by-side, stacked, editor-focus and preview-focus layouts. The editor/preview split is resizable on desktop, and your preferred layout is saved locally.
- **CodeMirror 6 editor:** syntax highlighting for HTML, CSS and JavaScript, line numbers, bracket matching, code folding, completion, search and undo/redo.
- **Keyboard and accessibility basics:** keyboard shortcuts, visible focus styles, labeled editor controls and reduced-motion support.
- **Local static bundle:** the editor libraries are bundled into the published site; no CDN, application backend or runtime package download is needed.

## Getting started

1. Open the [live site](https://tejas-mk2.github.io/Code-Forge/). For local development, install Node.js 20 or newer and run `npm install` followed by `npm run build`, then serve the generated `dist/` folder over HTTP.
2. Choose the HTML, CSS or JS tab and edit the source.
3. Check the live preview and console.
4. Use **Backup JSON** to keep a portable copy of all three source files, or **Download HTML** for a standalone page.

Saved work belongs to the current browser profile on the current device. Clearing site data or switching browsers can remove or hide local edits. Export important projects regularly.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl/⌘ + Enter | Run the current project |
| Ctrl/⌘ + S | Save to this browser |
| Tab | Insert two spaces |

## Security notes

The preview is rendered in a sandboxed iframe with scripts enabled and without same-origin access. This keeps the preview in an opaque origin, separate from the editor's origin. Code you write in the preview still executes, and can make network requests, so only run code you trust. This is a lightweight playground, not a production IDE or server-side compiler.

Project content stays in browser-local storage unless you choose to export it or run code that sends it elsewhere. GitHub Pages serves the static app; there is no application backend or cloud sign-in.

## Tests

The repository includes Node.js regression tests for document generation, missing head handling, fragment wrapping, runtime diagnostics, script-tag escaping and project backup round-tripping.

Run locally with Node.js 20 or newer:

```sh
npm install
npm run build
node --check core.js
node --check app.js
node --test tests/*.test.cjs
```

GitHub Actions runs these checks before publishing the site to GitHub Pages.

## Development

The main files are:

- index.html — accessible application structure.
- styles.css — responsive visual system.
- app.js — editor interactions, local persistence, preview and console.
- core.js — document generation and portable project format.
- src/editor.js — CodeMirror 6 setup, HTML/CSS/JavaScript language support and the editor theme.
- scripts/build.cjs — builds a self-contained static site into `dist/`.
- tests/editor.test.cjs — regression tests for document generation and the editor build wiring.
- .github/workflows/pages.yml — dependency install, build, validation and GitHub Pages deployment.

## License

No license is specified yet. Add a license file if you want to grant others explicit reuse rights.
