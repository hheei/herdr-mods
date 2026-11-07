#!/usr/bin/env node
const fs = require("node:fs");
const file = process.argv[2];
if (!file) { console.error("usage: node scripts/agent-manager-panel.cjs <personal-layout.json>"); process.exit(2); }
const layout = JSON.parse(fs.readFileSync(file, "utf8"));
const child = (node, id) => node?.children?.find((item) => item.id === id);
const work = child(layout, "work");
const tabs = child(work, "tabs");
const body = child(child(child(work, "work-body"), "panel"), "panel-body");
const old = layout.children?.filter((item) => item.id === "agent-manager") ?? [];
const existing = body?.children?.filter((item) => item.id === "agent-manager") ?? [];
if (layout.type !== "row" || !Array.isArray(body?.children)
  || !["tabs", "tabs-agent-manager"].includes(tabs?.content?.mod)
  || old.length > 1 || existing.length > 1
  || old.some((item) => item.type !== "block" || item.content?.mod !== "agent-manager")
  || existing.some((item) => item.type !== "block" || item.content?.mod !== "agent-manager")) {
  console.error("Not a supported personal Herdr layout; no changes made"); process.exit(1);
}
if (!old.length && existing.length && tabs.content.mod === "tabs-agent-manager") {
  console.log("Agent Manager panel already installed"); process.exit(0);
}
layout.children = layout.children.filter((item) => item.id !== "agent-manager");
if (!existing.length) body.children.push({ id: "agent-manager", type: "block", content: { mod: "agent-manager" } });
tabs.content.mod = "tabs-agent-manager";
const backup = file + ".bak-agent-manager-panel-" + Date.now();
const tmp = file + ".tmp-" + process.pid;
fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
try {
  fs.writeFileSync(tmp, JSON.stringify(layout, null, 2) + "\n", { mode: fs.statSync(file).mode });
  fs.renameSync(tmp, file);
} catch (error) { try { fs.unlinkSync(tmp); } catch {} throw error; }
console.log("Agent Manager moved to Files/Changes panel; backup: " + backup);
