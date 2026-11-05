# Security

Herdr App mods execute trusted JavaScript. They can start local programs, access files, and potentially act on remote machines. There is no per-action permissions sandbox. Review mod JavaScript and layout references before installing.

Report sensitive vulnerabilities using GitHub private security advisories if enabled when this repository is published; do not post credentials or exploit details in public issues. Non-sensitive bugs may use public issues with redacted logs.

Install scripts only write under the Herdr App Home, avoid modifying bundled layouts, and back up existing mod files during updates. Project Open uses exec(program, argv) instead of interpolating paths into a shell.

See official Herdr App security guidance: https://github.com/herdrdev/herdr-app/blob/master/docs/security.md
