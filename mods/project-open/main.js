// Minimal Herdr App project opener. Left click: last choice; right click: menu.
// This module runs in Herdr's gpui-kit runtime, NOT a browser.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  theme, window, focused, spaces, exec, shared, setShared,
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
  if (!f) return null;
  const s = spaces().find((space) => space.id === f.space);
  if (!s) return null;
  const cwd = f.cwd || s.folder;
  if (!cwd || !cwd.trim()) return null;
  return { cwd, machine: s.machine };
}

function remoteUri(machine, cwd) {
  // VS Code accepts vscode-remote URLs. Encode host/path components, not '/'.
  const host = encodeURIComponent(machine);
  const path = cwd.split("/").map(encodeURIComponent).join("/");
  return `vscode://vscode-remote/ssh-remote+${host}${path.startsWith("/") ? path : "/" + path}`;
}

function localUri(cwd) {
  const path = cwd.split("/").map(encodeURIComponent).join("/");
  return `vscode://file${path.startsWith("/") ? path : "/" + path}`;
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
    const argv = platform === "macos" ? ["open", [t.cwd]]
      : platform === "windows" ? ["explorer.exe", [t.cwd]]
      : ["xdg-open", [t.cwd]];
    const result = await exec(argv[0], argv[1]);
    if (result.code !== 0) throw new Error(result.stderr || `${argv[0]} exited with ${result.code}`);
    return;
  }

  // First try VS Code's CLI, which uses argv (no shell interpolation) and
  // properly supports Remote SSH without relying on URL scheme registration.
  const args = t.machine
    ? ["--remote", `ssh-remote+${t.machine}`, t.cwd]
    : [t.cwd];
  try {
    const result = await exec("code", args);
    if (result.code === 0) return;
  } catch (_) {
    // On macOS/Linux the CLI may not be installed in PATH. Try URL scheme.
  }
  const uri = t.machine ? remoteUri(t.machine, t.cwd) : localUri(t.cwd);
  if (platform === "windows") {
    throw new Error("VS Code 'code' CLI was unavailable. Add it to PATH.");
  }
  const opener = platform === "macos" ? "open" : "xdg-open";
  const result = await exec(opener, [uri]);
  if (result.code !== 0) {
    throw new Error(result.stderr || `${opener} cannot open VS Code URI`);
  }
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
            this.run(action, cx);
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
    return div().id("project-open-button").size(30).flex_none()
      .flex().items_center().justify_center()
      .rounded(7).text_color(t.muted).cursor_pointer()
      .tooltip(action === "vscode" ? "Open in VS Code · right-click for options" : "Open in file manager · right-click for options")
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_mouse_down("right", (e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "project-open", kind: "popup", at: "pointer", width: 192, height: 86, props: { menu: true } });
      })
      .on_click((_e, cx) => this.run(action, cx))
      .child(svg(ICON[action]).size(18));
  }
}
