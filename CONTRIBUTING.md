# Contributing

Add independent mods under mods/<name>/, each with main.js, mod.json, assets and README.md. Optional ready-made layouts go under layouts/<name>.json. Do not edit shipped Herdr App layouts.

Use the official Herdr App mod API and validate with:

~~~sh
node tests/project-open.test.cjs
sh tests/install-smoke.sh
herdr-app check ~/.config/herdr-app/mods/project-open
~~~

Node is used only by maintainers for tests, never for installation. Always test UI interactions in an actual Herdr App before marking the mod release-ready.

Pull requests should describe motivation, platform and Herdr version, test output, and screenshots for UI changes. Never commit secrets, private SSH configs or live app shared-state files. By contributing, you agree to release changes under Apache-2.0.
