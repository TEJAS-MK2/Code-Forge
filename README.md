# Code Forge

A small, local-first browser workspace for writing HTML, CSS and JavaScript. No account, backend, package installation or cloud authentication is required.

**Live site:** https://tejas-mk2.github.io/Code-Forge/

## What it does

- **Local multi-file workspace:** use the activity rail and Explorer to create, open, rename and delete additional text files. The workspace is virtual and browser-local, not a disk filesystem.
- **Live preview:** changes refresh the preview automatically; use **Run** or **Ctrl/⌘ + Enter** to run immediately. Switch between desktop, tablet and phone viewport widths.
- **Runtime console:** view timestamped console output, warnings and JavaScript runtime errors with aggregate error/warning counts, filter to errors, and keep console history when switching bottom panels.
- **Local autosave:** your current project is saved to this browser's localStorage.
- **Portable workspace backup:** export/import JSON backups containing all workspace files. Older three-file backups remain supported. Imports validate the complete file list and required preview files before replacing the current workspace; if localStorage fails, unsaved markers remain visible and the app recommends exporting a backup.
- **Standalone HTML export:** download a single HTML file with your HTML, CSS and JavaScript combined.
- **IDE workspace:** activity rail, file explorer, tabs, recent files, duplicate-file action, unsaved indicators, workspace-wide text search and confirmed replace, editor settings and a command palette (Ctrl/⌘ + Shift + P).
- **CodeMirror 6 editor:** syntax highlighting for HTML, CSS and JavaScript, line numbers, bracket matching, code folding, completion, search and undo/redo. Built-in landing page, portfolio, contact form, animated card and click-counter templates are available in the command palette.
- **Keyboard and accessibility basics:** keyboard shortcuts, visible focus styles, labeled editor controls and reduced-motion support.
- **Local static bundle:** the editor libraries are bundled into the published site; no CDN, application backend or runtime package download is needed.

## Getting started

1. Open the [live site](https://tejas-mk2.github.io/Code-Forge/). For local development, install Node.js 20 or newer and run `npm install` followed by `npm run build`, then serve the generated `dist/` folder over HTTP.
2. Choose a file in Explorer or its editor tab. Use New file to add a browser-local text file.
3. Check the live preview and console.
4. Use **Backup JSON** to keep a portable copy of all three source files, or **Download HTML** for a standalone page.

Saved work belongs to the current browser profile on the current device. Clearing site data or switching browsers can remove or hide local edits. Export important projects regularly.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl/⌘ + Enter | Run the current project |
| Ctrl/⌘ + S | Save to this browser |
| Ctrl/⌘ + N | Create a workspace file |
| Ctrl/⌘ + Shift + P | Open the command palette |
| Tab | Insert two spaces |

## Security notes

The preview is rendered in a sandboxed iframe with scripts enabled and without same-origin access. This keeps the preview in an opaque origin, separate from the editor's origin. Code you write in the preview still executes, and can make network requests, so only run code you trust. This is a lightweight playground, not a production IDE or server-side compiler.

Project content stays in browser-local storage unless you choose to export it or run code that sends it elsewhere. GitHub Pages serves the static app; there is no application backend or cloud sign-in.

## Tests

The repository includes Node.js regression tests for document generation, runtime diagnostics, workspace backup validation (including malformed data and unsafe filenames), legacy import compatibility, local-save failure indicators and IDE wiring.

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

The workspace's three preview entry files are `index.html`, `styles.css` and `app.js`; additional virtual text files are editable and included in workspace backups, but are not automatically imported by the preview. The main source files are:

- index.html — accessible application structure.
- styles.css — responsive visual system.
- app.js — editor interactions, local persistence, preview and console.
- core.js — document generation and portable project format.
- src/editor.js — CodeMirror 6 setup, HTML/CSS/JavaScript language support and the editor theme.
- scripts/build.cjs — builds a self-contained static site into `dist/`.
- tests/editor.test.cjs — regression tests for document generation, editor wiring and IDE workspace behavior.
- .github/workflows/pages.yml — dependency install, build, validation and GitHub Pages deployment.

## License

No license is specified yet. Add a license file if you want to grant others explicit reuse rights.

### Editor preferences

Use **Explorer → Settings** to choose indentation, toggle word wrapping, and adjust the editor font size from 11–18 px. Word wrap and font size are saved in this browser only. Choose desktop, tablet or phone under the preview's Viewport selector. Search can replace matching text across the local workspace; export a backup before large replacements. No account or cloud sync is involved.
