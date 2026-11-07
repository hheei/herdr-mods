import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Scrollbar, Editor, EditorState } from "gpui-base";
import { theme, window, focused, spaces, exec, appHome, notify, props, openOverlay, closeOverlay, shared, setShared, settings } from "herdr";

const AGENTS = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "pi", label: "Pi" },
  { id: "agy", label: "Antigravity" },
];
const PROJECT_SKILL_AGENTS = [
  { ...AGENTS[0], label: ".claude/skills" },
  { ...AGENTS[1], label: ".codex/skills" },
  { ...AGENTS[2], label: ".pi/skills" },
  { id: "shared", label: ".agents/skills", icon: "mods/workspace-chrome/layers.svg" },
];
const MANAGE = () => `${appHome()}/mods/agent-manager/manage.sh`;

function target() {
  const f = focused();
  const s = spaces().find((space) => space.id === f?.space) ?? spaces().find((space) => space.active);
  if (!s) return null;
  // ponytail: With no Space folder, use its focused terminal cwd; set Space folder for a stable multi-terminal target.
  const cwd = s.folder || (s.machine && f?.space === s.id && f?.cwd?.startsWith("/") ? f.cwd : "");
  return { machine: s.machine, cwd };
}

const identity = (dst, scope) => JSON.stringify([dst?.machine, scope, scope === "workspace" ? dst?.cwd : null]);

async function localSkills() {
  const result = await exec("python3", [`${appHome()}/mods/agent-manager/remote.py`, "inventory"], { timeout: 60_000 });
  if (result.code !== 0) throw new Error(result.stderr || "Cannot read ~/.cc-switch/skills");
  return JSON.parse(result.stdout.trim() || "{}");
}

async function localMcps() {
  const sql = "SELECT id, name, enabled_claude, enabled_codex, enabled_pi, enabled_agy FROM mcp_servers WHERE id <> 'node_repl' ORDER BY name, id";
  const result = await exec("sh", ["-c", `test -f "$HOME/.cc-switch/cc-switch.db" || { printf '[]'; exit; }; exec sqlite3 -readonly -json "$HOME/.cc-switch/cc-switch.db" "${sql}"`]);
  if (result.code !== 0) throw new Error(result.stderr || "Cannot read CC Switch MCP catalog");
  return JSON.parse(result.stdout.trim() || "[]").filter((entry) => entry.id !== "node_repl");
}

async function remoteStatus(machine, project) {
  const result = await exec("sh", [MANAGE(), "status", machine, ...(project ? [project] : [])], { timeout: 60_000 });
  if (result.code !== 0) throw new Error(result.stderr || `Remote status exited ${result.code}`);
  return JSON.parse(result.stdout);
}

export default class AgentManager extends View {
  skills = [];
  localLibrary = {};
  mcps = [];
  status = null;
  host = null;
  key = null;
  context = null;
  scope = "workspace";
  busy = false;
  message = "Refresh to inspect local catalog and remote Agent state";
  syncToken = null;
  hoveredStatus = null;

  listSkills(local, remote, deployed = {}) {
    const agentOnly = Object.values(deployed).flatMap((entries) => Object.entries(entries)
      .filter(([, state]) => state !== "off").map(([name]) => name));
    return [...new Set([...Object.keys(local), ...Object.keys(remote), ...agentOnly])]
      .sort((a, b) => Number(!(a in remote)) - Number(!(b in remote)) || a.localeCompare(b))
      .map((id) => ({ id, local: local[id] || null, remote: remote[id] || null }));
  }

  refresh(cx) {
    if (this.busy) return;
    const dst = target();
    const machine = dst?.machine;
    const scope = this.scope;
    const project = scope === "workspace" && dst?.cwd?.startsWith("/") ? dst.cwd : null;
    const key = identity(dst, scope);
    this.context = key;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const [library, mcps, status] = await Promise.all([
          localSkills(), localMcps(), machine && (scope === "global" || project) ? remoteStatus(machine, project) : Promise.resolve(null),
        ]);
        this.localLibrary = library;
        this.skills = this.listSkills(library, status?.library || {}, status?.skills || {});
        this.mcps = mcps;
        this.host = machine;
        this.status = identity(target(), this.scope) === key ? status : null;
        this.key = this.status ? key : null;
        this.message = this.status ? `${this.skills.length} Skills · ${mcps.length} MCP · ${machine}`
          : !machine ? "Select a remote Workspace, or switch to one connected to a Host."
          : "Project needs an absolute Workspace folder or its focused terminal directory.";
      } catch (error) {
        this.status = null;
        this.key = null;
        this.message = String(error);
        notify({ title: "Agent Manager refresh failed", body: this.message, level: "error" });
      } finally { this.busy = false; cx.notify(); }
    });
  }

  switchScope(cx) {
    if (this.busy) return;
    this.scope = this.scope === "workspace" ? "global" : "workspace";
    this.status = null;
    this.key = null;
    this.refresh(cx);
  }

  importCandidates() {
    return this.skills.filter((skill) => !skill.remote).flatMap((skill) => skill.local
      ? skill.local === "blocked" ? [] : [{ ...skill, origin: "mac" }]
      : Object.entries(this.status?.skills || {}).filter(([, entries]) => ["on", "external"].includes(entries[skill.id]))
        .map(([agent]) => ({ ...skill, origin: agent })));
  }

  openImport() {
    const dst = target();
    if (this.busy || !this.status || this.key !== identity(dst, this.scope) || !dst?.machine) return;
    openOverlay({ mod: "agent-manager", kind: "dialog", width: 450, height: 440,
      props: { imports: { items: this.importCandidates(), machine: dst.machine, cwd: dst.cwd, scope: this.scope } } });
  }

  importOne(cx, skill, agent) {
    const dst = target();
    const p = props()?.imports;
    if (this.busy || window()?.platform !== "macos" || !p || identity(dst, p.scope) !== identity(p, p.scope)
      || skill.local || skill.remote || !["claude", "codex", "pi", "agy", "shared"].includes(agent)) return;
    const project = p.scope === "workspace" ? p.cwd : null;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const result = await exec("sh", [MANAGE(), "import", dst.machine, skill.id, agent, ...(project ? [project] : [])], { timeout: 120_000 });
        if (result.code !== 0) throw new Error(result.stderr || `Skill import exited ${result.code}`);
        const copied = await exec("sh", [`${appHome()}/mods/agent-manager/sync.sh`, dst.machine, skill.id, "download"], { timeout: 600_000 });
        if (copied.code !== 0) throw new Error(copied.stderr || `Skill download exited ${copied.code}`);
        setShared("agent-manager.sync-token", `${Date.now()}-${skill.id}`);
        closeOverlay(props().overlay);
      } catch (error) {
        notify({ title: "Skill import failed", body: String(error), level: "error" });
      } finally { this.busy = false; cx.notify(); }
    });
  }

  askConflict(skill, machine) {
    openOverlay({ mod: "agent-manager", kind: "dialog", width: 410, height: 220,
      props: { conflict: { ...skill, machine } } });
  }

  syncOne(cx, skill, direction) {
    const dst = target();
    if (this.busy || !dst?.machine || dst.machine !== (skill.machine || dst.machine) || window()?.platform !== "macos"
      || !skill.local && !skill.remote || [skill.local, skill.remote].includes("blocked")) return;
    if (!direction && skill.local && skill.remote && skill.local !== skill.remote) return this.askConflict(skill, dst.machine);
    direction ||= skill.local ? "upload" : "download";
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const args = [`${appHome()}/mods/agent-manager/sync.sh`, dst.machine, skill.id, direction];
        if (skill.local && skill.remote && skill.local !== skill.remote) args.push(skill.local, skill.remote);
        const result = await exec("sh", args, { timeout: 600_000 });
        if (result.code !== 0) throw new Error(result.stdout.trim() || result.stderr || `Transfer exited ${result.code}`);
        this.message = `${skill.id}: ${result.stdout.trim()}`;
        setShared("agent-manager.sync-token", `${Date.now()}-${skill.id}`);
        if (props()?.conflict || props()?.imports) closeOverlay(props().overlay);
        else {
          this.localLibrary = await localSkills();
          const status = await remoteStatus(dst.machine, this.scope === "workspace" ? dst.cwd : null);
          this.status = status;
          this.skills = this.listSkills(this.localLibrary, status.library || {}, status.skills || {});
          this.syncToken = shared("agent-manager.sync-token");
        }
      } catch (error) {
        this.message = String(error);
        notify({ title: "Skill transfer failed", body: this.message, level: "error" });
      } finally { this.busy = false; cx.notify(); }
    });
  }

  toggle(cx, kind, id, agent, current) {
    const dst = target();
    const key = identity(dst, this.scope);
    if (this.busy || !dst?.machine || this.key !== key || window()?.platform !== "macos") return;
    if (!(kind === "skills" && this.scope === "workspace" && agent === "shared") && !this.status?.agents?.[agent]) return;
    if (["conflict", "cc-switch", "external", "library-link"].includes(current)) return;
    const mode = current === "on" ? "disable" : "enable";
    const project = this.scope === "workspace" ? dst.cwd : null;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const result = await exec("sh", [MANAGE(), "apply", dst.machine, kind, id, agent, mode, ...(project ? [project] : [])], { timeout: 120_000 });
        if (result.code !== 0) throw new Error(result.stderr || `Deploy exited ${result.code}`);
        this.message = result.stdout.trim() || `${kind} ${id}: ${mode} on ${dst.machine}/${agent}`;
        const resultStatus = await remoteStatus(dst.machine, project);
        this.status = identity(target(), this.scope) === key ? resultStatus : null;
        this.key = this.status ? key : null;
        if (kind !== "skills") notify({ title: "Agent updated", body: this.message, level: "info" });
      } catch (error) {
        this.message = String(error);
        notify({ title: "Agent update failed", body: this.message, level: "error" });
      } finally { this.busy = false; cx.notify(); }
    });
  }

  menu(data) {
    const dst = target();
    if (this.busy || !this.status || this.key !== identity(dst, this.scope) || !dst?.machine) return;
    const adopters = !data.agent && this.scope === "global"
      ? AGENTS.filter((agent) => ["external", "library-link"].includes(this.status.skills?.[agent.id]?.[data.id]))
        .map((agent) => ({ id: agent.id, label: agent.label })) : [];
    openOverlay({ mod: "agent-manager", kind: "popup", at: "pointer", width: 200,
      props: { skillMenu: { ...data, adopters, machine: dst.machine, cwd: dst.cwd, scope: this.scope } } });
  }

  adoptSkill(cx, data, agent) {
    const dst = target();
    if (this.busy || data.scope !== "global" || !data.adopters?.some((a) => a.id === agent)
      || identity(dst, data.scope) !== identity(data, data.scope) || window()?.platform !== "macos") return;
    const overlay = props().overlay;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const result = await exec("sh", [MANAGE(), "apply", dst.machine, "skills", data.id, agent, "adopt"], { timeout: 120_000 });
        if (result.code !== 0) throw new Error(result.stderr || `Adopt exited ${result.code}`);
        closeOverlay(overlay);
        setShared("agent-manager.sync-token", `${Date.now()}-${data.id}`);
      } catch (error) { notify({ title: "Skill adoption failed", body: String(error), level: "error" }); }
      finally { this.busy = false; cx.notify(); }
    });
  }

  openSkill(data) {
    if (window()?.platform !== "macos" || identity(target(), data.scope) !== identity(data, data.scope)
      || !/^[a-f0-9]{64}$/.test(data.remote)) return;
    if (props()?.skillMenu) closeOverlay(props().overlay);
    openOverlay({ mod: "agent-manager", kind: "dialog", width: 700, height: 560, props: { skillView: data } });
  }

  confirmDelete(data) {
    if (identity(target(), data.scope) !== identity(data, data.scope)) return;
    closeOverlay(props().overlay);
    openOverlay({ mod: "agent-manager", kind: "dialog", width: 410, height: 185, props: { skillDelete: data } });
  }

  deleteSkill(cx, data) {
    if (this.busy || window()?.platform !== "macos" || identity(target(), data.scope) !== identity(data, data.scope)) return;
    const overlay = props().overlay;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const args = [MANAGE(), "delete", data.machine, data.id, data.remote];
        if (data.scope === "workspace") args.push(data.cwd);
        const result = await exec("sh", args, { timeout: 120_000 });
        if (result.code !== 0) throw new Error(result.stderr || `Delete exited ${result.code}`);
        closeOverlay(overlay);
        setShared("agent-manager.sync-token", `${Date.now()}-${data.id}`);
      } catch (error) { notify({ title: "Delete refused", body: String(error), level: "error" }); }
      finally { this.busy = false; cx.notify(); }
    });
  }

  setMethod(cx, data, method) {
    if (this.busy || window()?.platform !== "macos" || identity(target(), data.scope) !== identity(data, data.scope)
      || !["on", "off"].includes(data.current) || data.locked) return;
    if (data.current === "on" && data.method === method && method === "link") { closeOverlay(props().overlay); return; }
    const overlay = props().overlay;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const project = data.scope === "workspace" ? data.cwd : "-";
        const result = await exec("sh", [MANAGE(), "apply", data.machine, "skills", data.id, data.agent, "enable", project, method], { timeout: 120_000 });
        if (result.code !== 0) throw new Error(result.stderr || `Deploy exited ${result.code}`);
        closeOverlay(overlay);
        setShared("agent-manager.sync-token", `${Date.now()}-${data.id}`);
      } catch (error) { notify({ title: "Skill deployment failed", body: String(error), level: "error" }); }
      finally { this.busy = false; cx.notify(); }
    });
  }

  renderConflict(cx) {
    const t = theme();
    const skill = props().conflict;
    const choice = (direction, label, icon) => div().id(`skill-${direction}`).h(34).px(10)
      .flex().items_center().gap(8).rounded(7).bg(t.raised).text_color(t.foreground)
      .cursor_pointer().hover((el) => el.bg(t.hover))
      .on_click((_event, cx) => this.syncOne(cx, skill, direction))
      .child(svg(`mods/agent-manager/icons/${icon}.svg`).size(15))
      .child(label);
    return v_flex().id("skill-conflict-dialog").size_full().p(16).gap(10).rounded(8).bg(t.popover)
      .child(div().font_semibold().text_size(15).child(`Skill conflict · ${skill.id}`))
      .child(div().text_size(12).text_color(t.muted)
        .child("Mac and remote copies differ. Choose which version to keep; the overwritten version is backed up first."))
      .child(div().text_size(11).text_color(t.dim).child(`Mac: ${skill.local?.slice(0, 12)} · ${skill.machine}: ${skill.remote?.slice(0, 12)}`))
      .child(h_flex().gap(8).child(choice("upload", "Use Mac → remote", "upload"))
        .child(choice("download", "Use remote → Mac", "download")))
      .child(div().id("skill-cancel").text_size(12).text_color(t.muted).cursor_pointer()
        .on_click(() => closeOverlay(props().overlay)).child("Cancel"));
  }

  renderSkillDocument(cx) {
    const t = theme(), data = props().skillView;
    const key = JSON.stringify([data.machine, data.id, data.remote]);
    if (this.preview?.key !== key) {
      this.preview?.editor?.release();
      this.preview = { key, editor: null, error: null };
      cx.spawn(async (cx) => {
        try {
          const result = await exec("sh", [MANAGE(), "read", data.machine, data.id, data.remote], { timeout: 120_000 });
          if (result.code !== 0) throw new Error(result.stderr || `Read exited ${result.code}`);
          if (this.preview?.key !== key) return;
          this.preview.editor = EditorState.new({ language: "markdown", readonly: true, value: result.stdout,
            font_family: settings().font_family, font_size: 12 });
        } catch (error) { if (this.preview?.key === key) this.preview.error = String(error); }
        finally { cx.notify(); }
      });
    }
    return v_flex().id("skill-document").size_full().min_h(0).p(12).gap(8).rounded(8).bg(t.popover).text_color(t.foreground)
      .child(h_flex().h(28).flex_none().gap(8).items_center()
        .child(div().font_semibold().child(`${data.id}/SKILL.md`))
        .child(div().flex_1())
        .child(div().id("skill-document-close").text_color(t.muted).cursor_pointer().on_click(() => {
          this.preview?.editor?.release(); this.preview = null; closeOverlay(props().overlay);
        }).child("Close")))
      .child(this.preview.editor ? Editor.new(this.preview.editor).flex_1().min_h(0)
        : div().p(8).text_color(t.muted).child(this.preview.error || "Loading SKILL.md…"));
  }

  renderSkillMenu(cx) {
    const t = theme(), data = props().skillMenu;
    const row = (id, label, icon, action, selected = false) => h_flex().id(id).h(31).px(8).gap(9)
      .items_center().rounded(7).text_color(t.foreground).cursor_pointer().hover((el) => el.bg(t.hover))
      .when(selected, (el) => el.bg(t.selected)).on_click((_event, cx) => action(cx))
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(14).flex_none().text_color(t.muted))
      .child(div().flex_1().child(label))
      .when(selected, (el) => el.child(div().text_size(11).text_color(t.dim).child("✓")));
    return v_flex().id("skill-context-menu").w_full().min_h(0).p(5).gap(2).bg(t.popover).text_size(12.8)
      .when(!data.agent, (el) => el
        .child(row("skill-menu-open", "Open", "file-text", () => this.openSkill(data)))
        .child(row("skill-menu-delete", "Delete", "x", () => this.confirmDelete(data))))
      .when(Boolean(data.agent), (el) => el
        .child(row("skill-menu-link", "Softlink", "layers", (cx) => this.setMethod(cx, data, "link"), data.method === "link"))
        .child(row("skill-menu-copy", "Copy", "files", (cx) => this.setMethod(cx, data, "copy"), data.method === "copy")))
      .when(Boolean(data.adopters?.length), (el) => el.children(data.adopters.map((agent) =>
        row(`skill-menu-adopt-${agent.id}`, `Adopt · ${agent.label}`, "square-pen",
          (cx) => this.adoptSkill(cx, data, agent.id)))));
  }

  renderSkillDelete(cx) {
    const t = theme(), data = props().skillDelete;
    return v_flex().id("skill-delete-confirm").size_full().p(16).gap(10).rounded(8).bg(t.popover).text_color(t.foreground).text_size(13)
      .child(div().font_semibold().child(`Delete ${data.id} from ${data.machine}?`))
      .child(div().text_size(12).text_color(t.muted)
        .child("Remote library only. Mac copy stays; active Agent deployments block deletion. Removed files are backed up."))
      .child(h_flex().gap(10).child(div().id("skill-delete-cancel").cursor_pointer()
        .on_click(() => closeOverlay(props().overlay)).child("Cancel"))
        .child(div().id("skill-delete-action").text_color(t.blocked).cursor_pointer()
          .on_click((_event, cx) => this.deleteSkill(cx, data)).child("Delete remote Skill")));
  }

  renderImport(cx) {
    const t = theme();
    const data = props().imports;
    this.scope = data.scope;
    return v_flex().id("skill-import-dialog").size_full().p(16).gap(12).rounded(8).bg(t.popover).text_color(t.foreground)
      .child(div().font_semibold().text_size(15).child("Import Skills"))
      .child(div().text_size(12).text_color(t.muted).child("Copy missing Skills into ~/.cc-switch/skills on both hosts; Agent files and CC Switch database stay unchanged."))
      .child(div().flex_1().min_h(0).relative()
        .child(v_flex().id("skill-import-list").absolute().inset_0().overflow_y_scroll().gap(4)
          .children(data.items.map((skill, index) =>
            h_flex().id(`skill-import-${index}`).h(38).px(10).gap(8).flex_none().items_center().rounded(7)
              .bg(t.raised).cursor_pointer().hover((el) => el.bg(t.hover))
              .on_click((_event, cx) => {
                if (identity(target(), data.scope) !== identity(data, data.scope)) return;
                if (skill.origin === "mac") this.syncOne(cx, { ...skill, machine: data.machine }, "upload");
                else this.importOne(cx, skill, skill.origin);
              })
              .child(div().flex_1().min_w(0).truncate().child(skill.id))
              .child(div().text_size(11).text_color(t.dim)
                .child(skill.origin === "mac" ? "Mac → remote" : `${skill.origin} → library`))))
          .when(!data.items.length, (el) => el.child(div().py(10).text_size(12).text_color(t.dim).child("No Skills to import"))))
        .child(Scrollbar.vertical("skill-import-list").absolute().inset_0()))
      .child(div().id("skill-import-close").text_size(12).text_color(t.muted).cursor_pointer()
        .on_click(() => closeOverlay(props().overlay)).child("Close"));
  }

  render(cx) {
    if (props()?.conflict) return this.renderConflict(cx);
    if (props()?.imports) return this.renderImport(cx);
    if (props()?.skillView) return this.renderSkillDocument(cx);
    if (props()?.skillMenu) return this.renderSkillMenu(cx);
    if (props()?.skillDelete) return this.renderSkillDelete(cx);
    const dst = target();
    const token = shared("agent-manager.sync-token");
    if (token !== this.syncToken && !this.busy) {
      this.syncToken = token;
      if (token) this.refresh(cx);
    }
    if (window()?.platform === "macos" && dst?.machine && !this.busy && this.context !== identity(dst, this.scope)) this.refresh(cx);
    const t = theme();
    const ready = window()?.platform === "macos" && !!dst?.machine && this.key === identity(dst, this.scope) && !!this.status;
    const button = (id, label, action, enabled) =>
      div().id(id).h(32).px(10).flex_none().flex().items_center().justify_center().rounded(8)
        .bg(t.raised).text_size(12).text_color(enabled ? t.foreground : t.dim)
        .when(enabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => action.call(this, cx)))
        .child(label);
    const statusCell = (kind, item, index, agent, state, enabled, width = 28) => {
      const cellId = `${kind}-${index}-${agent}`;
      const method = kind === "skills" ? this.status?.skill_methods?.[agent]?.[item.id] : null;
      const locked = this.status?.skill_locked?.[agent]?.includes(item.id);
      const adoptable = kind === "skills" && this.scope === "global" && ["external", "library-link"].includes(state);
      const mark = kind === "skills" ? adoptable ? "+" : method === "link" ? "~" : method === "copy" ? "✓" : "" : state === "on" ? "✓" : "";
      return div().id(cellId).w(width).h(28).flex_none().flex().items_center().justify_center()
        .rounded(6)
        .text_color(["on", "cc-switch"].includes(state) ? t.ansi2 : ["conflict", "external"].includes(state) ? t.blocked : state === "unknown" ? t.dim : t.muted)
        .when(enabled, (el) => el.cursor_pointer()
          .on_hover((hovered, cx) => {
            if (!hovered && this.hoveredStatus !== cellId) return;
            const next = hovered ? cellId : null;
            if (this.hoveredStatus !== next) { this.hoveredStatus = next; cx.notify(); }
          })
          .on_click((_e, cx) => this.toggle(cx, kind, item.id, agent, state)))
        .when(kind === "skills" && ready && !this.busy && ["on", "off"].includes(state) && !locked, (el) => el
          .on_mouse_down("right", (_event, cx) => { cx.stop_propagation(); this.menu({ id: item.id, agent, current: state, method }); }))
        .child(div().w(11).h(11).rounded(2).border_1()
          .border_color(state === "conflict" ? t.blocked : enabled && this.hoveredStatus === cellId ? t.muted : t.dim)
          .flex().items_center().justify_center().text_size(9).font_semibold().child(mark));
    };
    const row = (kind, item, index) => {
      const line = h_flex().id(`${kind}-row-${index}`).h(28).px(kind === "skills" ? 4 : 8).gap(kind === "skills" ? 3 : 6).flex_none()
        .items_center().rounded(7)
        .when(kind === "skills", (el) => {
          const source = item.local && item.remote ? "sync" : item.remote ? "download" : item.local ? "upload" : null;
          const equal = item.local && item.remote && item.local === item.remote;
          const label = source === null ? "Agent-only Skill: not in either CC Switch library"
            : item.local && item.remote ? equal ? "Both: identical; synchronized" : "Both: versions differ; choose source in conflict dialog"
            : item.remote ? "Remote only: download to Mac CC Switch library" : "Mac only: upload to remote CC Switch library";
          return el.child(div().id(`skills-source-${index}`).w(16).h(28).flex_none().flex().items_center().justify_center()
            .rounded(6).tooltip(label).text_color(item.local && item.remote && !equal ? t.blocked : t.muted)
            .when(ready && !this.busy && source !== null && ![item.local, item.remote].includes("blocked"), (icon) => icon.cursor_pointer().hover((s) => s.bg(t.hover))
              .on_click((_event, cx) => this.syncOne(cx, item)))
            .child(svg(source ? `mods/agent-manager/icons/${source}.svg` : "mods/workspace-chrome/archive.svg").size(11)));
        })
        .child(div().id(`${kind}-name-${index}`).flex_1().min_w(0).truncate().child(item.name || item.id)
          .when(kind === "skills" && ready && !this.busy && /^[a-f0-9]{64}$/.test(item.remote || ""), (el) => el.cursor_pointer()
            .rounded(6).hover((s) => s.bg(t.hover))
            .on_mouse_down("right", (_event, cx) => { cx.stop_propagation(); this.menu({ id: item.id, remote: item.remote }); })
            .on_click(() => this.openSkill({ id: item.id, remote: item.remote, machine: dst.machine, cwd: dst.cwd, scope: this.scope }))));
      const agents = kind === "skills" && this.scope === "workspace" ? PROJECT_SKILL_AGENTS : AGENTS;
      return line.children(agents.map((a) => {
        const state = ready ? this.status[kind]?.[a.id]?.[item.id] || "off" : "unknown";
        const display = kind === "mcp" && state === "off" && this.status.mcp_library?.[item.id] ? "library" : state;
        const enabled = ready && !this.busy && (a.id === "shared" || this.status.agents[a.id])
          && !["conflict", "cc-switch", "external", "library-link"].includes(state);
        return statusCell(kind, item, index, a.id, display, enabled);
      }));
    };
    const section = (kind, entries) => {
      const agents = kind === "skills" && this.scope === "workspace" ? PROJECT_SKILL_AGENTS : AGENTS;
      const list = `agent-manager-${kind}-list`;
      return v_flex().id(`${kind}-section`).flex_1().min_h(0).gap(2)
        .child(h_flex().id(`${kind}-header`).h(28).px(kind === "skills" ? 4 : 8).gap(kind === "skills" ? 3 : 6).flex_none().items_center().text_size(11).text_color(t.muted)
          .child(div().font_semibold().child(kind === "skills" ? "Skills" : "MCP"))
          .child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).child(String(entries.length)))
          .child(div().flex_1())
          .children(agents.map((a) =>
            div().w(28).h(28).flex_none().flex().items_center().justify_center()
              .tooltip(a.label).child(svg(a.icon || `mods/agent-manager/icons/${a.id}.svg`).size(13).flex_none()))))
        .child(div().flex_1().min_h(0).relative()
          .child(v_flex().id(list).absolute().inset_0().overflow_y_scroll().gap(2)
            .children(entries.map((entry, index) => row(kind, entry, index)))
            .when(!entries.length, (el) => el.child(div().px(8).py(6).text_size(12).text_color(t.dim)
              .child(this.busy ? `Loading ${kind === "skills" ? "Skills" : "MCP servers"}…` : kind === "skills" ? "No Skills" : "No MCP servers"))))
          .child(Scrollbar.vertical(list).absolute().inset_0()));
    };
    const visibleSkills = this.skills.filter((skill) => skill.remote);
    return v_flex().id("agent-manager").size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Agent Manager"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim)
          .child(dst?.cwd ? `${dst.machine || "local"} · ${dst.cwd}` : dst?.machine || "No Workspace")))
      .child(div().flex_1().min_h(0).relative()
        .child(v_flex().id("agent-manager-list").absolute().inset_0().p(6).gap(8)
          .when(Boolean(this.message) && !this.busy && (!ready || this.message.startsWith("Error:")), (el) => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.message)))
          .child(section("skills", visibleSkills))
          .child(section("mcp", this.mcps))))
      .child(h_flex().flex_none().p(10).gap(8).border_t(1).border_color(t.border)
        .child(button("skills-refresh", "Refresh", this.refresh, !this.busy))
        .child(button("scope-toggle", this.scope === "workspace" ? "Project" : "Global", this.switchScope, !this.busy))
        .child(button("skills-import", "Import", this.openImport, ready && !this.busy)));
  }
}
