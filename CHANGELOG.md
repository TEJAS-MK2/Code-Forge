# Changelog

## 2026-10-10 — Offline workspace

- Added an installable web-app manifest and a matching graphite/lime SVG icon.
- Added network-first app-shell caching so the editor can reopen offline after a successful visit.
- Kept project data in browser-local storage; no backend, account or cloud sync was introduced.
- Added Chromium coverage for an offline reload and CI checks for every published app-shell asset.
- Added an accessible footer status cue for browser-reported online/offline state.
- Added a conditional install action when the browser offers app installation.

## 2026-10-10 — Studio polish

- Restored the intended graphite-and-muted-lime design system and removed a conflicting blue-theme override.
- Refined the editor, explorer, preview and console surfaces with consistent borders, restrained contrast and focus states.
- Improved header spacing and responsive layout polish while respecting reduced-motion preferences.
- Added Chromium checks for the design tokens and the visibility of the editor, preview and console.


## 2026-10-10

- Added Chromium end-to-end coverage proving malformed workspace imports leave existing local data untouched.
- Added a real-browser storage-quota failure regression that checks the unsaved state remains visible and a complete backup can still be exported.


## 2026-10-09

- Re-enabled npm's install-time vulnerability audit in CI and aligned contributor setup commands so dependency advisories are visible instead of being suppressed.
- Added an explicit CI gate that fails on high or critical npm dependency vulnerabilities before publishing the site.
- Hardened GitHub Actions with immutable SHA-pinned actions and least-privilege deployment permissions.
- Added weekly Dependabot checks and pull-request CI that validates changes without deploying pull request code.

- Fixed startup recovery initialization so malformed workspace backups remain available for export.
- Removed nested interactive buttons from the file explorer for more reliable keyboard and screen-reader interaction.
- Added regression checks for startup recovery and explorer semantics.

- Fixed data-loss edge cases by snapshotting the live editor before file duplication and rename.
- Rejected workspace backup imports larger than 10 MiB before reading or replacing local data.
- Added browser regressions for unsaved-file rename/duplicate behavior and oversized-import preservation.

- Fixed keyboard-event forwarding so editor shortcuts (run, save, new file and command palette) reach the application handlers.
- Added desktop, tablet and phone preview viewport presets with a browser-local preference.
- Added workspace-wide find/replace with a confirmation step before changes are applied.
- Persisted word-wrap preferences and hardened debounced local autosave and saved-state indicators.
- Added five local starter templates, duplicate-file workflow and import-overwrite confirmation.
- Added recent-file navigation and timestamped console entries with error/warning counts and an errors-only filter.
- Expanded regression coverage and updated the project documentation.

- Added strict all-or-nothing workspace backup validation, including file names, content types, supported version and required preview files.
- Kept unsaved markers visible after failed workspace-wide replacements or imports when browser storage is unavailable.
- Added regression coverage for malformed workspace backups, unsafe paths, invalid file values and legacy backup compatibility.
- Added case-sensitive and whole-word workspace search, previous/next match navigation, match positions and clearer result counts.
- Added mobile overflow constraints and regression checks for narrow layouts while retaining the existing desktop design.
- Added an accessible Go to Line dialog with line validation and Ctrl/⌘ + G shortcut, also available in the command palette.
- Preserved search controls and result navigation after opening a match or applying replacements.
- Kept template files visibly unsaved when local storage fails and clarified the warning shown when closing an unsaved virtual file.
- Added a tested storage writer that distinguishes primary workspace failures from failures of the legacy compatibility mirror, with quota-failure recovery tests.
- Addressed accessibility-audit findings with a main heading, toolbar landmark, named editor textbox, adjustable separator values, keyboard-navigable output tabs, and higher-contrast editor/interface text.
- Added startup recovery protection for malformed stored workspaces: preserve raw backup locally before overwriting, expose a recovery export command, and block writes if preservation fails.
- Hardened narrow-screen sizing across the main flex container, IDE workspace, CodeMirror scroller and preview panes to prevent intrinsic editor widths from expanding the document.
- Added Chromium end-to-end checks for preview JavaScript, editor input, autosave/reload, workspace backup downloads, layout controls and 390px/320px responsive widths.
- Added browser-local storage failure tests, required contribution and security-policy guidance, and structured bug, feature and support issue forms.
- Updated CI to use Node.js 22 and require the production build, unit suite and Chromium end-to-end suite to pass before deployment.
