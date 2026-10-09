# Code Forge

A lightweight browser-based HTML, CSS and JavaScript editor with a live preview.

## Features

- **Three editors in one:** switch between HTML, CSS and JavaScript.
- **Live preview:** the preview refreshes as you edit; use Run code or Ctrl/Cmd + Enter to run on demand.
- **Local autosave:** code is stored in this browser's localStorage. No account, cloud authentication, or backend is required.
- **Export:** download a standalone HTML file containing the current HTML, CSS and JavaScript.
- **Responsive layout:** editor and preview stack on smaller screens.
- **No build step:** plain HTML, CSS and JavaScript.

## Use it

1. Open the published site, or open index.html in a modern browser.
2. Edit the HTML, CSS and JavaScript tabs.
3. Inspect the live preview.
4. Select **Export HTML** to download a portable copy.

Saved work is specific to this browser and device. Clearing site data or switching browsers may remove or hide local edits, so export important projects.

## GitHub Pages

A GitHub Actions workflow publishes the repository root to GitHub Pages. In **Settings → Pages**, select **GitHub Actions** as the build and deployment source. The workflow runs on pushes to main and can also be started manually.

## Security

The preview runs in a sandboxed iframe. Code you write is executed in that preview, so only run code you trust. This is a client-side playground, not a server-side compiler or full production IDE.

## License

No license is specified yet. Add a license file if you want to grant others explicit reuse rights.
