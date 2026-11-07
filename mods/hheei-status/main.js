// Herdr's built-in workspace-status mod (31 lines), cloned: this collection's status
// bar. A shipped Mod is read-only -- Herdr replaces mods/workspace-status/ whole on
// start -- and its render root is size_full(), so a second block beside it in the
// Layout would be squeezed to nothing. A clone is the only place an icon can go.
// ponytail: the two buttons below are hardcoded on purpose; another Mod author's
// status icon belongs in that author's own clone, not here.
// This module runs in Herdr's gpui-kit runtime, NOT a browser.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  theme, window, focused, spaces, agents, keys, run, exec, shared, setShared,
  notify, openOverlay, closeOverlay, props,
} from "herdr";

const LAST_ACTION_KEY = "hheei-status.last-action";
const ACTIONS = ["vscode", "finder"];
const ICON = {
  vscode: "mods/hheei-status/vscode.svg",
  finder: "mods/hheei-status/finder.svg",
};

// The Agent UI is a view of what an agent is doing in the focused pane, so the
// Status Bar offers it only while such a pane is focused, and shows it over that
// pane: a dialog, which dims what is behind it, rather than a window, which by
// design does not. Herdr has no way to swap a pane's terminal for a mod in place
// (`pane.split {mod}` makes a new pane), and a Layout's Stack would tie the button
// to one layout, so no layout is touched and no PTY is replaced.
const UI_OVERLAY_KEY = "hheei-status.agent-ui-overlay";
function agentPane() {
  return agents().find((agent) => agent.focused) ?? null;
}
function uiOverlay() {
  const id = shared(UI_OVERLAY_KEY);
  return typeof id === "string" ? id : null;
}

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

export default class HheeiStatus extends View {
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
      return v_flex().id("hheei-status-menu").w_full().p(5)
        .gap(2).bg(t.popover)
        .children([
          row("vscode", "Open in VS Code"),
          row("finder", window().platform === "macos" ? "Open in Finder" : "Open in File Manager"),
        ]);
    }

    const agent = agentPane();
    const open = uiOverlay() !== null;
    // One icon, same size and treatment as the launcher beside it.
    const modeToggle = agent === null && !open ? null :
      div().id("agent-ui-mode").size(22).flex_none()
        .flex().items_center().justify_center()
        .cursor_pointer().text_color(t.muted)
        .on_click((_e, context) => {
          context.stop_propagation();
          const id = uiOverlay();
          if (id !== null) {
            setShared(UI_OVERLAY_KEY, null);
            closeOverlay(id);
            return;
          }
          if (!agentPane()) return;
          setShared(UI_OVERLAY_KEY, openOverlay({
            mod: "agent-ui", kind: "dialog", modal: true, frame: "none",
            width: 0.62, height: 0.8,
          }));
        })
        .child(svg(open ? "mods/hheei-status/agent-terminal.svg"
          : "mods/hheei-status/agent-ui.svg").size(15));
    const action = lastAction();
    const button = div().id("hheei-status-button").size(22).flex_none()
      .flex().items_center().justify_center()
      .text_color(t.muted).cursor_pointer()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_mouse_down("right", (e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "hheei-status", kind: "popup", at: "pointer", width: 192, height: 86, props: { menu: true } });
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
        .when(needs > 0, (el) => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`)))
        // Both buttons belong to the existing left status cluster: the bar reads
        // left to right, and a lone icon on the far side reads as a different bar.
        .child(button)
        .when(modeToggle !== null, (el) => el.child(modeToggle)))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim)
        .on_click(() => run("app.palette")).child(this.hint()));
  }
}
