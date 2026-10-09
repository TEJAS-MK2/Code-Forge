# Security Policy

## Scope and security model

Code Forge is a static, browser-local HTML/CSS/JavaScript editor. There is no application backend, account system or cloud project store. Workspace data and preferences are held in the current browser profile unless the user exports them or runs code that transmits data elsewhere.

The live preview is hosted in a sandboxed iframe with `allow-scripts` and without `allow-same-origin`. The missing same-origin permission is intentional: preview code should not share the editor's origin or gain direct access to its DOM and local storage. Do not remove this isolation to solve ordinary preview issues.

Sandboxing is not a guarantee that user-supplied code is safe. Code executed in the preview may make network requests, render misleading content, consume browser resources or attempt to interact with external services. Users should only run code they trust. Code Forge is a development playground, not a hardened execution environment for hostile code.

## Reporting a vulnerability

Please report suspected security vulnerabilities privately and do not publish exploit details, proof-of-concept payloads, private project data or credentials in a public issue.

1. If private vulnerability reporting is available, open the repository's **Security** tab and use **Report a vulnerability** to create a private report.
2. If that option is unavailable, contact the repository maintainer privately through a verified contact channel linked from the [maintainer's GitHub profile](https://github.com/TEJAS-MK2). If no private channel is available, open a minimal issue asking for a private reporting channel; do not include sensitive technical details until a private channel is established.

Include the affected URL or commit, the impact, precise reproduction steps and any safe proof needed to establish the issue. Please test only against systems you own or have permission to test, and avoid actions that disrupt other users or third-party services.

## Handling and scope

Reports will be reviewed as maintainers' availability permits. This project does not promise a particular response or fix timeline. Please keep vulnerability discussions private until a fix or coordinated disclosure is agreed.

The project does not have a supported server-side service or remote account system. Reports involving a browser extension, browser, operating system or third-party package should identify the component and explain how the issue affects Code Forge.

## User data

Do not attach real passwords, API keys, access tokens, personal information or private project source to public issues. Treat exported JSON backups as user content: they can contain every file in a workspace.
