# Changelog

## 2026-10-09

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
