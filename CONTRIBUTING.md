# Contributing to Code Forge

Thanks for helping improve Code Forge. Please keep changes focused, tested and consistent with the project's local-first design.

## Before opening an issue

Search [existing issues](https://github.com/TEJAS-MK2/Code-Forge/issues) first. Use the bug report form for reproducible defects, the feature request form for proposed behavior, and the question form for usage help. Do not report security vulnerabilities in a public issue; follow [SECURITY.md](SECURITY.md).

Useful bug reports include the browser and OS, viewport width, exact reproduction steps, expected behavior and actual behavior. Remove passwords, API keys, private project contents and personal data from screenshots and logs.

## Development setup

Requirements: Node.js 22 or newer and npm.

```sh
git clone https://github.com/TEJAS-MK2/Code-Forge.git
cd Code-Forge
npm ci --no-fund
npm run build
```

To serve the built `dist/` directory, use any static HTTP server. The application does not require an application backend, database, cloud authentication or cloud storage.

## Checks before submitting

Run the applicable checks after changing code or build configuration:

```sh
node --check core.js
node --check app.js
node --check scripts/build.cjs
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

The browser test starts a temporary local server and uses a fresh Chromium context. It checks startup, live preview execution, editing and browser-local persistence, reload behavior and narrow viewport overflow. The CI workflow runs the production build and automated tests before deployment.

Dependency installation intentionally leaves npm's install-time vulnerability audit enabled. If npm reports an advisory, review the affected dependency and its remediation rather than suppressing the audit output. If Playwright's browser is already installed, you do not need to install it again. If a test fails, fix the cause rather than weakening an assertion just to get a green build.

## Implementation guidelines

- Preserve the graphite-and-muted-lime visual identity and prioritize readable, deliberate UI over decorative effects.
- Keep the application static and local-first. Do not add cloud authentication, remote project storage or a backend without a separate, explicit product decision.
- Keep workspace import validation all-or-nothing. A rejected backup must not partially replace the current project.
- Treat browser-storage failures as real failures. Do not clear unsaved indicators when the primary workspace save fails.
- Keep the preview sandboxed. Do not add `allow-same-origin` to the preview iframe as a convenience fix.
- Prefer local bundled dependencies over runtime CDN imports.
- Ensure controls work by keyboard, retain visible focus styles and consider narrow screens and reduced-motion preferences.
- Add regression tests for fixes and meaningful new behavior. Update README documentation and CHANGELOG.md when user-visible behavior changes.
- Keep pull requests small enough to review and explain the problem, solution and evidence from tests.

## Pull requests

1. Describe the user problem and the change.
2. Include reproduction steps for bug fixes where relevant.
3. List the checks you actually ran and their results. Do not state that browser tests or deployment passed unless they were run and verified.
4. Include screenshots for meaningful visual changes when practical, avoiding private project content.
5. Keep unrelated formatting or refactoring out of focused fixes.

By contributing, you agree that your contributions will be distributed under the repository's MIT license.
