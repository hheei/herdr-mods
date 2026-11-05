// Minimal Herdr App project opener. Left click: last choice; right click: menu.
// This module runs in Herdr's gpui-kit runtime, NOT a browser.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  theme, window, focused, spaces, agents, keys, run, exec, shared, setShared,
  notify, openOverlay, closeOverlay, props,
} from "herdr";

const LAST_ACTION_KEY = "project-open.last-action";
const ACTIONS = ["vscode", "finder"];
const ICON = {
  vscode: "mods/project-open/vscode.svg",
  finder: "mods/project-open/finder.svg",
};

function lastAction() {
  const saved = shared(LAST_ACTION_KEY);
  return ACTIONS.includes(saved) ? saved : "vscode";
}

function target() {
  const f = focused();
  const s = spaces().find((space) => space.id === f.space);
  const cwd = f.cwd || s.folder;
  return cwd ? { cwd, machine: s.machine } : null;
}

async function launch(action, t) {
  const platform = window().platform;
  if (action === "finder") {
    if (t.machine) {
      notify({
        title: "Remote folder",
        body: "A remote path is not a local folder. Mount it locally or use VS Code Remote SSH.",
        level: "warning",
      });
      return;
    }
    const opener = platform === "macos" ? "open"
      : platform === "windows" ? "explorer.exe"
      : "xdg-open";
    const result = await exec(opener, [t.cwd]);
    if (result.code !== 0) throw new Error(result.stderr || `${opener} exited with ${result.code}`);
    return;
  }
  const args = t.machine ? ["--remote", `ssh-remote+${t.machine}`, t.cwd] : [t.cwd];
  const result = await exec("code", args);
  if (result.code !== 0) throw new Error(result.stderr || `code exited with ${result.code}`);
}

async function openAction(action) {
  const t = target();
  if (!t) {
    notify({ title: "No active directory", body: "Focus a terminal in a Space.", level: "warning" });
    return;
  }
  // The remembered choice is what the user chose, even when launching fails.
  setShared(LAST_ACTION_KEY, action);
  try {
    await launch(action, t);
  } catch (error) {
    notify({ title: "Cannot open project", body: String(error), level: "error" });
  }
}

export default class ProjectOpen extends View {
  // Keep the official workspace-status content and layout, with a single
  // extra icon inside the same status bar (no separate layout block).
  hint() {
    const mac = window().platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  run(action, cx) {
    // Async work belongs to a Herdr-managed task, not the UI render cycle.
    cx.spawn(async () => { await openAction(action); });
  }

  render(cx) {
    const t = theme();
    const p = props() || {};
    if (p.menu) {
      const row = (action, label) =>
        h_flex().id(`action-${action}`).h(34).gap(10).px(10)
          .items_center().rounded(7)
          .text_color(t.foreground).cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => {
            closeOverlay(p.overlay);
            // Context menu changes the default; only a later left click launches.
            setShared(LAST_ACTION_KEY, action);
          })
          .child(svg(ICON[action]).size(17).flex_none())
          .child(div().text_size(12.5).child(label));
      return v_flex().id("project-open-menu").w_full().p(5)
        .gap(2).bg(t.popover)
        .children([
          row("vscode", "Open in VS Code"),
          row("finder", window().platform === "macos" ? "Open in Finder" : "Open in File Manager"),
        ]);
    }

    const action = lastAction();
    const button = div().id("project-open-button").size(22).flex_none()
      .flex().items_center().justify_center()
      .text_color(t.muted).cursor_pointer()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_mouse_down("right", (e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "project-open", kind: "popup", at: "pointer", width: 192, height: 86, props: { menu: true } });
      })
      .on_click((_e, cx) => this.run(action, cx))
      .child(svg(ICON[action]).size(15));

    const space = spaces().find((s) => s.active);
    const list = agents();
    const needs = list.filter((a) => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center()
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(13))
      .child(text);
    return h_flex().size_full().px(14).gap(16).items_center()
      .bg(t.chrome).border_t(1).border_color(t.border)
      .text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), (el) => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center()
        .child(div().size(6).rounded(3).bg(t.dim))
        .child(`${list.length} agents`)
        .when(needs > 0, (el) => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim)
        .on_click(() => run("app.palette")).child(this.hint()))
      .child(button);
  }
}
