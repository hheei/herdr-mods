# Contributing

Add independent mods under mods/<name>/, each with main.js, mod.json, assets and README.md. Do not edit shipped Herdr App layouts.

`scripts/install.sh` knows no mod by name: it copies the mod folders, then applies whatever each `mod.json` declares:

~~~json
{"place": "none", "install": "status"}
~~~

- `install: "status"` — the mod replaces the status bar renderer; `scripts/patch-status.awk` patches the personal layout once.
- `install: "sidebar"` — a sidebar footer button with the mod's own id is inserted (`scripts/patch-sidebar.awk`).
- `install: "derive:<layout name>"` — a preview layout `<layout name>.json` is derived from the personal layout (`scripts/demo-layout.awk`).
- no `install` key — the mod needs no layout wiring.

Wiring is applied after every mod folder is copied, status/sidebar first and derived layouts second, so order never matters. Modules never edit layout JSON from shell hooks: a new shape belongs in one awk patcher that prints the layout unchanged and exits 3 when it cannot apply it.

Use the official Herdr App mod API and validate with:

~~~sh
node tests/project-open.test.cjs
sh tests/install-smoke.sh
herdr-app check ~/.config/herdr-app/mods/project-open
~~~

`tests/install-smoke.sh` installs into a throwaway `HERDR_APP_HOME`, so it never touches your real config.

Node is used only by maintainers for tests, never for installation. Always test UI interactions in an actual Herdr App before marking the mod release-ready.

Pull requests should describe motivation, platform and Herdr version, test output, and screenshots for UI changes. Never commit secrets, private SSH configs or live app shared-state files. By contributing, you agree to release changes under Apache-2.0.
