# Contributing

Add independent mods under `mods/<name>/`, each with `main.js`, `mod.json`, assets and `README.md`. Do not edit shipped Herdr App mods: they are replaced whole on every start.

## Wiring

`mod.json` holds Herdr's own contract (`place`, `size`, `title`, `overlay`) and nothing else. What the installer should do is declared separately in `layout.json`, so the Mod itself never knows about layouts:

| `layout.json` | Effect |
| --- | --- |
| `{ "status": "workspace-status" }` | Point the Status Bar at this Mod (`scripts/patch-mod.awk`) |
| `{ "tabs": "tabs" }` | Same, for the tab bar |
| `{ "panel": true }` | Append a block to `panel-body` (`scripts/patch-panel.awk`) |
| `{ "sidebar": true }` | Append a sidebar footer button (`scripts/patch-sidebar.awk`) |
| `{ "pi": "<file>" }` | Install a Pi extension into `~/.pi/extensions` |

Patchers do two things and nothing else: **append a node** or **point a value at another Mod**. They are byte-idempotent and print the layout back unchanged when they cannot apply, so nobody's layout is ever rewritten or reordered. A new shape belongs in one awk patcher, never in ad-hoc JSON editing.

## JavaScript, with types

Mods are JavaScript. `main.js` is the entry Herdr looks for (`src/mods.rs`), and the runtime has no bundler or transpiler, so TypeScript would only add a build step whose output can drift from the source.

Types come from Herdr instead. The App generates `herdr.d.ts` and `gpui-kit.d.ts` for mod authors, so nothing here is hand-written:

- `types/herdr.d.ts` is committed: 22 KB, and the surface Mods actually misuse (an option that does not exist, a function that changed shape). Bumping it is a visible diff, which is the point.
- `types/gpui-kit.d.ts` is generated from Herdr's component registry, 800 KB, and stays out of git. A machine with the App gets it from `scripts/sync-host-types.sh`; CI, which has no App, writes loose stand-ins from `scripts/host-types-stub.sh`. Elements go unchecked there, `herdr` does not.

~~~sh
sh scripts/sync-host-types.sh   # after a Herdr update: copies both from ~/.config/herdr-app
tsc -p jsconfig.json            # what CI runs (with the stub where the real one is missing)
~~~

Every Mod file starts with `// @ts-check`. That is what catches a host API that does not exist or an option that is silently ignored — a broken Mod otherwise loads and renders nothing.

## Checks

~~~sh
sh tests/syntax-check.sh              # every Mod file, ESM-parsed
tsc -p jsconfig.json
for file in tests/*.test.cjs; do node "$file"; done
sh tests/install-smoke.sh             # installs into a throwaway HERDR_APP_HOME
sh tests/agent-ui-install.test.sh
herdr-app check ~/.config/herdr-app/mods/hheei-status
~~~

Tests are single-file assert scripts, no framework. Node is a maintainer dependency for tests and type checking only, never for installation. Always try UI changes in an actual Herdr App before marking a Mod release-ready.

Pull requests should describe motivation, platform and Herdr version, test output, and screenshots for UI changes. Never commit secrets, private SSH configs or live app shared-state files. By contributing, you agree to release changes under Apache-2.0.
