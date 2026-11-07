import fcntl
import hashlib
import json
import os
import base64
import platform
import re
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import tomllib
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

HOME = Path.home()
BASE = {
    "claude": HOME / ".claude",
    "codex": HOME / ".codex",
    "pi": HOME / ".pi/agent",
    "agy": HOME / ".gemini/config",
}
CONFIG = {
    "claude": HOME / ".claude.json",
    "codex": BASE["codex"] / "config.toml",
    "pi": BASE["pi"] / "mcp.json",
    "agy": BASE["agy"] / "mcp_config.json",
}
PROJECT_CONFIG = {"claude": ".mcp.json", "codex": ".codex/config.toml", "pi": ".pi/mcp.json", "agy": ".agents/mcp_config.json"}
PROJECT_SKILLS = {"claude": ".claude/skills", "codex": ".codex/skills", "pi": ".pi/skills", "shared": ".agents/skills"}
STATE = HOME / ".config/herdr-app/agent-manager/state.json"
FIELDS = ("command", "args", "env", "cwd", "url", "headers", "type")
ENV_START = "# agent-manager begin\n"
ENV_END = "# agent-manager end\n"
ENV_RUN = ('import json,os,sys; p,m,c,*a=sys.argv[1:]; '
           'b=open(p).read().split("# agent-manager begin\\n",1)[1].split("# agent-manager end\\n",1)[0]; '
           'd={x.split("=",1)[0]:x.split("=",1)[1] for x in b.splitlines() if x.startswith("AGENT_MANAGER_") and "=" in x}; '
           'os.execvpe(c,[c,*a],{**os.environ,**{k:json.loads(d[v]) for k,v in json.loads(m).items()}})')


def valid_id(value, kind, agent):
    pattern = r"[A-Za-z0-9_-]{1,100}" if kind == "mcp" and agent == "pi" else r"[A-Za-z0-9_.-]{1,100}"
    if value in (".", "..") or not re.fullmatch(pattern, value):
        raise ValueError("Unsupported resource id: use letters, digits, hyphen, underscore or dot")


def safe(path):
    if not path.is_relative_to(HOME):
        raise ValueError("Path outside user home")
    current = path
    while current != HOME:
        if current.is_symlink():
            raise ValueError("Linked configuration path refused: " + str(current))
        current = current.parent
    return path


def workspace(raw):
    path = Path(raw)
    if not path.is_absolute() or ".." in path.parts or path in (Path("/"), HOME) or not path.is_dir():
        raise ValueError("Select an existing absolute Workspace directory (not home)")
    current = path
    while current != current.parent:
        if current.is_symlink():
            raise ValueError("Linked Workspace path refused: " + str(current))
        current = current.parent
    return path


def scoped(path, project=None):
    if project is None:
        return safe(path)
    if not path.is_relative_to(project):
        raise ValueError("Path outside Workspace")
    current = path
    while current != project:
        if current.is_symlink():
            raise ValueError("Linked Workspace config refused: " + str(current))
        current = current.parent
    return path


def config_path(agent, project=None):
    return scoped(project / PROJECT_CONFIG[agent] if project else CONFIG[agent], project)


def skills_root(agent, project=None):
    return scoped(project / PROJECT_SKILLS[agent] if project else BASE[agent] / "skills", project)


def bucket(state, kind, agent, project=None):
    if project is None:
        return state[kind].setdefault(agent, {})
    return state.setdefault("workspaces", {}).setdefault(str(project), {}).setdefault(kind, {}).setdefault(agent, {})


def backup_root(project):
    return safe(STATE.parent / "backups" / hashlib.sha256(str(project).encode()).hexdigest()[:20])


def env_entries(project):
    path = scoped(project / ".env", project)
    text = path.read_text() if path.is_file() else ""
    if ENV_START not in text and ENV_END not in text:
        return text, {}
    if text.count(ENV_START) != 1 or text.count(ENV_END) != 1:
        raise ValueError("Invalid managed .env block")
    if text.index(ENV_START) > text.index(ENV_END):
        raise ValueError("Managed .env markers out of order")
    block = text.split(ENV_START, 1)[1].split(ENV_END, 1)[0]
    entries = {}
    for line in block.splitlines():
        key, sep, value = line.partition("=")
        if not sep or not re.fullmatch(r"AGENT_MANAGER_[A-F0-9]{24}", key):
            raise ValueError("Invalid managed .env entry")
        if key in entries:
            raise ValueError("Duplicate managed .env entry")
        entries[key] = json.loads(value)
        if not isinstance(entries[key], str):
            raise ValueError("Invalid managed .env value")
    return text, entries


def env_tracked(state, project, agent, name):
    return state.setdefault("workspaces", {}).setdefault(str(project), {}).setdefault("env", {}).setdefault(agent, {}).setdefault(name, {})


def ensure_env_unchanged(state, project, agent, name):
    tracked = env_tracked(state, project, agent, name)
    if tracked:
        _, entries = env_entries(project)
        if any(key not in entries or digest(entries[key]) != value for key, value in tracked.items()):
            raise ValueError("Managed .env credentials changed outside Agent Manager")


def keep_env_untracked(project):
    tracked = subprocess.run(["git", "-C", str(project), "ls-files", "--error-unmatch", "--", ".env"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if tracked.returncode == 0:
        raise ValueError("Workspace .env is tracked by Git; refusing to write credentials")
    repo = subprocess.run(["git", "-C", str(project), "rev-parse", "--is-inside-work-tree"],
                          capture_output=True, text=True)
    if repo.returncode != 0 or repo.stdout.strip() != "true":
        return
    ignored = subprocess.run(["git", "-C", str(project), "check-ignore", "--no-index", "-q", "--", ".env"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if ignored.returncode != 0:
        path = scoped(project / ".gitignore", project)
        old = path.read_text() if path.is_file() else ""
        write_file(path, (old.rstrip("\n") + "\n# agent-manager local MCP credentials\n.env\n").encode(), project=project)


def save_env(state, project, agent, name, variables):
    ensure_env_unchanged(state, project, agent, name)
    keep_env_untracked(project)
    text, entries = env_entries(project)
    tracked = env_tracked(state, project, agent, name)
    for key in tracked:
        entries.pop(key, None)
    mapping = {}
    for label, value in variables.items():
        key = "AGENT_MANAGER_" + hashlib.sha256((agent + "\0" + name + "\0" + label).encode()).hexdigest()[:24].upper()
        if key in entries:
            raise ValueError("Managed .env name collision")
        entries[key] = value
        mapping[label] = key
    prefix = text.split(ENV_START, 1)[0] if ENV_START in text else text
    suffix = text.split(ENV_END, 1)[1] if ENV_END in text else ""
    block = ENV_START + "".join(key + "=" + json.dumps(value, ensure_ascii=False) + "\n" for key, value in sorted(entries.items())) + ENV_END
    write_file(scoped(project / ".env", project), (prefix.rstrip("\n") + "\n" + block + suffix).encode(), project=project)
    tracked.clear()
    tracked.update({key: digest(entries[key]) for key in mapping.values()})
    return mapping


def remove_env(state, project, agent, name):
    tracked = env_tracked(state, project, agent, name)
    if not tracked:
        return
    ensure_env_unchanged(state, project, agent, name)
    text, entries = env_entries(project)
    for key in tracked:
        entries.pop(key, None)
    prefix = text.split(ENV_START, 1)[0]
    suffix = text.split(ENV_END, 1)[1]
    block = (ENV_START + "".join(key + "=" + json.dumps(value, ensure_ascii=False) + "\n" for key, value in sorted(entries.items())) + ENV_END) if entries else ""
    write_file(scoped(project / ".env", project), (prefix.rstrip("\n") + ("\n" if block or suffix else "") + block + suffix).encode(), project=project)
    tracked.clear()


def installed(agent):
    base = safe(BASE[agent])
    return base.is_dir()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def skill_digest(path, project=None):
    scoped(path, project)
    if not path.is_dir():
        raise ValueError("Skill directory missing")
    h = hashlib.sha256()
    for item in sorted(path.rglob("*")):
        if item.is_symlink() or not (item.is_file() or item.is_dir()):
            raise ValueError("Linked or special Skill entry refused")
        h.update((b"F" if item.is_file() else b"D") + str(item.relative_to(path)).encode() + b"\0")
        if item.is_file():
            with item.open("rb") as stream:
                h.update(hashlib.file_digest(stream, "sha256").digest())
    return h.hexdigest()


def link_digest(target):
    return "link:" + hashlib.sha256(target.encode()).hexdigest()


def library_inventory():
    root = safe(HOME / ".cc-switch/skills")
    if not root.exists():
        return {}
    if not root.is_dir():
        raise ValueError("Invalid CC Switch Skills library")
    result = {}
    for path in root.iterdir():
        if path.name.startswith("."):
            continue
        if path.is_symlink():
            result[path.name] = "blocked"
        elif path.is_dir() and (path / "SKILL.md").is_file():
            try:
                result[path.name] = skill_digest(path)
            except ValueError:
                result[path.name] = "blocked"
    return result


def skill_snapshot(name, expected):
    valid_id(name, "skills", "shared")
    root = safe(HOME / ".cc-switch/skills")
    path = safe(root / name)
    current = skill_digest(path) if path.exists() else "absent"
    if current != expected or current == "blocked":
        raise ValueError("Skill changed since inspection; Refresh before transfer")
    return path


def pack_skill(name, expected):
    path = skill_snapshot(name, expected)
    if expected == "absent":
        raise ValueError("Source Skill missing")
    fd, archive_path = tempfile.mkstemp(prefix="agent-manager-skill-", dir="/tmp")
    os.close(fd)
    try:
        with tarfile.open(archive_path, "w:gz") as archive:
            archive.add(path, arcname=name, recursive=False)
            for item in sorted(path.rglob("*")):
                if item.is_symlink() or not (item.is_dir() or item.is_file()):
                    raise ValueError("Linked or special Skill entry refused")
                archive.add(item, arcname=name + "/" + str(item.relative_to(path)), recursive=False)
        skill_snapshot(name, expected)
        return Path(archive_path)
    except BaseException:
        Path(archive_path).unlink(missing_ok=True)
        raise


def unpack_skill(name, archive_path, source_hash, old_hash):
    valid_id(name, "skills", "shared")
    if not re.fullmatch(r"/tmp/agent-manager-skill[-.][A-Za-z0-9_-]+", str(archive_path)) or Path(archive_path).is_symlink():
        raise ValueError("Unexpected Skill archive path")
    if not re.fullmatch(r"[a-f0-9]{64}", source_hash) or not (old_hash == "absent" or re.fullmatch(r"[a-f0-9]{64}", old_hash)):
        raise ValueError("Invalid Skill transfer digest")
    root = safe(HOME / ".cc-switch/skills")
    if root.exists() and not root.is_dir():
        raise ValueError("Invalid CC Switch Skills library")
    skill_snapshot(name, old_hash)
    root.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    root.mkdir(mode=0o700, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".agent-manager-stage-", dir=root.parent))
    backup = None
    try:
        with tarfile.open(archive_path, "r:gz") as archive:
            members = archive.getmembers()
            if not members or len(members) > 10000 or sum(member.size for member in members) > 512 * 1024 * 1024:
                raise ValueError("Skill archive exceeds safety limits")
            seen = set()
            for member in members:
                parts = member.name.rstrip("/").split("/")
                if parts[0] != name or any(part in ("", ".", "..") for part in parts) or member.name in seen or not (member.isdir() or member.isfile()):
                    raise ValueError("Unsafe Skill archive entry")
                seen.add(member.name)
                dest = stage.joinpath(*parts)
                if member.isdir():
                    dest.mkdir(mode=0o700, parents=True, exist_ok=True)
                else:
                    dest.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    with archive.extractfile(member) as source, dest.open("xb") as output:
                        shutil.copyfileobj(source, output)
                    dest.chmod(0o700 if member.mode & 0o100 else 0o600)
        source = stage / name
        if not (source / "SKILL.md").is_file() or skill_digest(source) != source_hash:
            raise ValueError("Transferred Skill digest mismatch")
        dest = skill_snapshot(name, old_hash)
        if old_hash != "absent":
            backup = Path(tempfile.mkdtemp(prefix=".agent-manager-backup-", dir=root.parent))
            os.rename(dest, backup / name)
        try:
            os.replace(source, dest)
        except BaseException:
            if backup:
                os.rename(backup / name, dest)
            raise
        return "Skill transferred" + (" (previous version backed up at " + str(backup) + ")" if backup else "")
    finally:
        shutil.rmtree(stage, ignore_errors=True)
        if backup and not (backup / name).exists():
            backup.rmdir()


def load_state():
    path = safe(STATE)
    data = json.loads(path.read_text()) if path.is_file() else {}
    if not isinstance(data, dict):
        raise ValueError("Invalid agent-manager state")
    for kind in ("mcp", "skills"):
        data.setdefault(kind, {})
        if not isinstance(data[kind], dict):
            raise ValueError("Invalid agent-manager state: " + kind)
        if any(not isinstance(entries, dict) for entries in data[kind].values()):
            raise ValueError("Invalid agent-manager state entries: " + kind)
    links = data.setdefault("adopted_links", {})
    if not isinstance(links, dict) or any(not isinstance(entries, dict) or any(not isinstance(target, str) for target in entries.values()) for entries in links.values()):
        raise ValueError("Invalid adopted Skill links")
    workspaces = data.get("workspaces", {})
    if not isinstance(workspaces, dict):
        raise ValueError("Invalid agent-manager Workspace state")
    for entry in workspaces.values():
        if not isinstance(entry, dict) or not isinstance(entry.get("skills", {}), dict):
            raise ValueError("Invalid agent-manager Workspace Skills state")
        skills = entry.get("skills", {})
        legacy = skills.pop("agy", {})
        if legacy:
            if not isinstance(legacy, dict):
                raise ValueError("Invalid legacy Antigravity Skills state")
            shared = skills.setdefault("shared", {})
            if not isinstance(shared, dict):
                raise ValueError("Invalid shared Skills state")
            for name, checksum in legacy.items():
                shared.setdefault(name, checksum)
    return data


def write_file(path, content, backup=True, project=None):
    scoped(path, project)
    path.parent.mkdir(parents=True, exist_ok=True)
    if backup and path.exists():
        parent = backup_root(project) if project else path.parent
        parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd, old = tempfile.mkstemp(prefix=".agent-manager-backup-", dir=parent)
        os.close(fd)
        shutil.copy2(path, old)
        os.chmod(old, 0o600)
    fd, temp = tempfile.mkstemp(prefix=".agent-manager-tmp-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def save_state(data):
    write_file(STATE, (json.dumps(data, indent=2, sort_keys=True) + "\n").encode(), backup=False)


def document(agent, project=None):
    path = config_path(agent, project)
    text = path.read_text() if path.is_file() else ""
    if agent == "codex":
        doc = tomllib.loads(text)
        entries = doc.get("mcp_servers", {})
    else:
        doc = json.loads(text) if text.strip() else {}
        if not isinstance(doc, dict):
            raise ValueError("Invalid Agent JSON")
        entries = doc.get("mcpServers", {})
    if not isinstance(entries, dict):
        raise ValueError("Invalid MCP server map")
    return text, doc, entries


def server_status(agent, entry, tracked):
    if entry is None:
        return "off"
    if not isinstance(entry, dict):
        return "conflict" if tracked else "external"
    if not tracked:
        return "external"
    if digest(entry) != tracked:
        return "conflict"
    if agent == "pi" and entry.get("enabled") is False:
        return "off"
    if agent == "agy" and entry.get("disabled") is True:
        return "off"
    return "on"


def cc_skill_owners():
    owners = {agent: {} for agent in BASE}
    db = safe(HOME / ".cc-switch/cc-switch.db")
    if not db.is_file():
        return owners
    with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as conn:
        columns = {item[1] for item in conn.execute("PRAGMA table_info(skills)")}
        required = {"directory", "enabled_claude", "enabled_codex", "enabled_agy"}
        if not required.issubset(columns):
            return owners
        for name, claude, codex, agy in conn.execute("SELECT directory, enabled_claude, enabled_codex, enabled_agy FROM skills"):
            if not isinstance(name, str):
                continue
            for agent, flag in (("claude", claude), ("codex", codex), ("agy", agy), ("pi", True)):
                owners[agent][name] = owners[agent].get(name, False) or bool(flag)
    return owners


def cc_skill_copy(root, name, library):
    if library.get(name) in (None, "blocked"):
        return False
    try:
        source = safe(HOME / ".cc-switch/skills" / name)
        dest = root / name
        if not source.is_dir():
            return False
        if dest.is_symlink():
            return dest.resolve() == source.resolve()
        return skill_digest(dest) == library[name]
    except (OSError, ValueError):
        return False


def library_link(root, name, library):
    if library.get(name) in (None, "blocked") or not (root / name).is_symlink():
        return False
    try:
        return (root / name).resolve() == safe(HOME / ".cc-switch/skills" / name).resolve()
    except (OSError, ValueError):
        return False


def skill_states(root, tracked, project=None, owner=None, library=None):
    skills = {}
    names = {p.name for p in root.iterdir()} if root.is_dir() else set()
    for name in names | tracked.keys():
        path = root / name
        if name not in tracked and owner and name in owner and (owner[name] or path.is_symlink()) and cc_skill_copy(root, name, library):
            skills[name] = "cc-switch"
        elif name not in tracked and owner is not None and library_link(root, name, library):
            skills[name] = "library-link"
        elif path.is_symlink():
            skills[name] = "on" if name in tracked and link_digest(os.readlink(path)) == tracked[name] else "conflict" if name in tracked else "external"
        elif not path.exists():
            skills[name] = "off"
        elif name not in tracked:
            skills[name] = "external"
        else:
            try:
                skills[name] = "on" if skill_digest(path, project) == tracked[name] else "conflict"
            except ValueError:
                skills[name] = "conflict"
    return skills


def status(project=None):
    state = load_state()
    library = library_inventory()
    owners = cc_skill_owners() if not project else {}
    result = {"agents": {}, "mcp": {}, "skills": {}, "skill_methods": {}, "skill_locked": {}, "library": library,
              "mcp_library": state.get("mcp_library", {})}
    for agent in BASE:
        active = installed(agent)
        result["agents"][agent] = active
        mcp = {}
        if active:
            _, _, entries = document(agent, project)
            tracked = bucket(state, "mcp", agent, project)
            for name in entries.keys() | tracked.keys():
                mcp[name] = server_status(agent, entries.get(name), tracked.get(name))
                if project and mcp[name] == "on":
                    try:
                        ensure_env_unchanged(state, project, agent, name)
                    except ValueError:
                        mcp[name] = "conflict"
        result["mcp"][agent] = mcp
        if not project:
            result["skills"][agent] = skill_states(skills_root(agent), bucket(state, "skills", agent), owner=owners[agent], library=library) if active else {}
            root = skills_root(agent)
            result["skill_methods"][agent] = {name: "link" if (root / name).is_symlink() else "copy"
                                               for name, value in result["skills"][agent].items() if value != "off"}
            result["skill_locked"][agent] = list(state.get("adopted_links", {}).get(agent, {}))
    if project:
        for agent in PROJECT_SKILLS:
            root = skills_root(agent, project)
            result["skills"][agent] = skill_states(root, bucket(state, "skills", agent, project), project)
            result["skill_methods"][agent] = {name: "link" if (root / name).is_symlink() else "copy"
                                               for name, value in result["skills"][agent].items() if value != "off"}
            result["skill_locked"][agent] = []
    print(json.dumps(result, separators=(",", ":")))


def validate_spec(spec, agent):
    if not isinstance(spec, dict):
        raise ValueError("Invalid MCP server definition")
    value = {key: spec[key] for key in FIELDS if key in spec}
    typ = value.get("type", "http" if "url" in value else "stdio")
    if typ not in ("stdio", "http", "streamable-http", "sse"):
        raise ValueError("Unsupported MCP transport")
    if typ == "sse" and agent in ("codex", "pi", "agy"):
        raise ValueError("SSE is not supported for this Agent")
    if typ == "stdio":
        if "url" in value:
            raise ValueError("MCP cannot define both stdio and HTTP")
        command = value.get("command")
        if not isinstance(command, str) or not command:
            raise ValueError("Missing stdio command")
        if command.startswith("/") and not Path(command).is_file():
            raise ValueError("Absolute MCP command not present on remote Host")
        if not command.startswith("/") and not shutil.which(command):
            raise ValueError("MCP command not found in remote PATH")
        if value.get("cwd") and not Path(value["cwd"]).is_dir():
            raise ValueError("MCP cwd not present on remote Host")
        if not isinstance(value.get("args", []), list) or not all(isinstance(x, str) for x in value.get("args", [])):
            raise ValueError("MCP args must be strings")
        if any(arg.startswith("/") and not Path(arg).exists() for arg in value.get("args", [])):
            raise ValueError("Absolute MCP argument path not present on remote Host")
    else:
        if "command" in value:
            raise ValueError("MCP cannot define both HTTP and stdio")
        if not isinstance(value.get("url"), str) or not value["url"].startswith(("https://", "http://")):
            raise ValueError("Missing HTTP MCP URL")
    for field in ("env", "headers"):
        if field in value and (not isinstance(value[field], dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in value[field].items())):
            raise ValueError("Invalid MCP " + field)
    if "cwd" in value and not isinstance(value["cwd"], str):
        raise ValueError("Invalid MCP cwd")
    if agent == "agy":
        value.pop("type", None)
        value.pop("cwd", None)
    elif agent == "pi" and typ == "streamable-http":
        value["type"] = "http"
    return value, typ


def toml_block(name, spec, typ):
    quote = lambda value: json.dumps(value, ensure_ascii=False)
    lines = ["[mcp_servers." + quote(name) + "]"]
    if typ == "stdio":
        lines.append("command = " + quote(spec["command"]))
        if "args" in spec:
            lines.append("args = " + json.dumps(spec["args"], ensure_ascii=False))
        if "env" in spec:
            lines.append("env = { " + ", ".join(quote(k) + " = " + quote(v) for k, v in spec["env"].items()) + " }")
        if "cwd" in spec:
            lines.append("cwd = " + quote(spec["cwd"]))
    else:
        lines.append("url = " + quote(spec["url"]))
        if "headers" in spec:
            lines.append("http_headers = { " + ", ".join(quote(k) + " = " + quote(v) for k, v in spec["headers"].items()) + " }")
    return "\n".join(lines) + "\n"


def strip_block(text, name):
    start = "# agent-manager begin " + name + "\n"
    end = "# agent-manager end " + name + "\n"
    if text.count(start) != 1 or text.count(end) != 1:
        raise ValueError("Managed Codex block missing or duplicated")
    a = text.index(start)
    b = text.index(end)
    if b < a:
        raise ValueError("Invalid managed Codex block")
    return text[:a] + text[b + len(end):]


def update_mcp(agent, name, action, payload, state, project=None):
    text, doc, entries = document(agent, project)
    tracked = bucket(state, "mcp", agent, project)
    current = entries.get(name)
    saved = tracked.get(name)
    if current is not None and (not saved or digest(current) != saved):
        raise ValueError("MCP name already exists or was changed outside Agent Manager")
    if project:
        ensure_env_unchanged(state, project, agent, name)
    if action == "disable" and not saved:
        return "Already disabled"
    variables = {}
    if action == "enable":
        rows = payload
        if len(rows) != 1 or not isinstance(rows[0], dict):
            raise ValueError("MCP server not found in local CC Switch catalog")
        spec, typ = validate_spec(json.loads(rows[0]["server_config"]), agent)
        if project:
            if spec.get("headers"):
                raise ValueError("Project HTTP headers cannot safely load .env for this Agent")
            if typ == "stdio" and any(re.search(r"(?:^|[-_])(?:token|api[-_]?key|secret|password)(?:$|[-_=])", arg, re.I) for arg in spec.get("args", [])):
                raise ValueError("Potential credential in MCP args; move it to env")
            if typ != "stdio":
                url = urlsplit(spec["url"])
                if url.username or url.password or any(re.search(r"token|api[-_]?key|secret|password", key, re.I) for key, _ in parse_qsl(url.query)):
                    raise ValueError("Potential credential in MCP URL; move it to env")
            variables = spec.pop("env", {})
            if variables:
                if typ != "stdio":
                    raise ValueError("Project HTTP credentials require an Agent-specific loader")
                command, args = spec["command"], spec.get("args", [])
                mapping = save_env(state, project, agent, name, variables)
                spec["command"] = "python3"
                spec["args"] = ["-c", ENV_RUN, str(project / ".env"), json.dumps(mapping), command, *args]
            if agent == "agy" and typ != "stdio":
                spec["serverUrl"] = spec.pop("url")
        if agent == "pi" and any(other != name and other.replace("-", "_") == name.replace("-", "_") for other in entries):
            raise ValueError("Pi treats hyphen and underscore MCP names as the same server")
    if agent == "codex":
        if saved and current is None and "# agent-manager begin " + name + "\n" in text:
            raise ValueError("Managed Codex block was edited outside Agent Manager")
        if saved and current is not None:
            text = strip_block(text, name)
        if action == "enable":
            # ponytail: marked TOML block preserves unrelated config; reject existing unmanaged IDs.
            block = "# agent-manager begin " + name + "\n" + toml_block(name, spec, typ) + "# agent-manager end " + name + "\n"
            text = text.rstrip("\n") + "\n\n" + block
        parsed = tomllib.loads(text)
        updated = parsed.get("mcp_servers", {}).get(name)
        output = text.encode()
    else:
        servers = doc.setdefault("mcpServers", {})
        if action == "enable":
            updated = dict(current or {})
            for field in FIELDS + ("disabled", "enabled", "serverUrl"):
                updated.pop(field, None)
            updated.update(spec)
            if agent == "agy":
                updated["disabled"] = False
            if agent == "pi":
                updated["enabled"] = True
            servers[name] = updated
        elif agent == "pi" and current is not None:
            current["enabled"] = False
            updated = current
        elif agent == "agy" and current is not None:
            current["disabled"] = True
            updated = current
        else:
            servers.pop(name, None)
            updated = None
        output = (json.dumps(doc, indent=2, ensure_ascii=False) + "\n").encode()
    if action == "disable" and current is None:
        tracked.pop(name, None)
        if project:
            remove_env(state, project, agent, name)
        save_state(state)
        return "Already absent"
    write_file(config_path(agent, project), output, project=project)
    if updated is None:
        tracked.pop(name, None)
    else:
        tracked[name] = digest(updated)
    if project and (action == "disable" or not variables):
        remove_env(state, project, agent, name)
    save_state(state)
    return "MCP updated"


def store_mcp_library(name, payload, state):
    if name == "node_repl" or len(payload) != 1 or not isinstance(payload[0], dict):
        raise ValueError("MCP server unavailable for library import")
    row = payload[0]
    title, config = row["name"], row["server_config"]
    if not isinstance(title, str) or not title or not isinstance(config, str):
        raise ValueError("Invalid MCP catalog entry")
    parsed = json.loads(config)
    if not isinstance(parsed, dict):
        raise ValueError("Invalid MCP server configuration")
    db = safe(HOME / ".cc-switch/cc-switch.db")
    if not db.is_file():
        raise ValueError("Remote CC Switch database missing")
    # ponytail: store only unusable definitions; never project them into live Agent configs without a Linux command.
    with sqlite3.connect(f"file:{db}?mode=rw", uri=True, timeout=5) as conn:
        columns = {item[1] for item in conn.execute("PRAGMA table_info(mcp_servers)")}
        if not {"id", "name", "server_config"}.issubset(columns):
            raise ValueError("Unsupported remote CC Switch MCP schema")
        old = conn.execute("SELECT name, server_config FROM mcp_servers WHERE id = ?", (name,)).fetchone()
        if old and (old[0] != title or json.loads(old[1]) != parsed):
            raise ValueError("Remote CC Switch MCP id already has a different definition")
        if not old:
            conn.execute("INSERT INTO mcp_servers (id, name, server_config) VALUES (?, ?, ?)", (name, title, config))
    state.setdefault("mcp_library", {})[name] = digest(parsed)
    save_state(state)
    return "Stored in remote CC Switch library only; Linux command unavailable, Agent not enabled"


def update_skill(agent, name, action, state, project=None, method="link"):
    root = skills_root(agent, project)
    dest = root / name
    backups = backup_root(project) if project else safe(BASE[agent] / ".agent-manager-backups")
    tracked = bucket(state, "skills", agent, project)
    current = tracked.get(name)
    links = state.setdefault("adopted_links", {}).setdefault(agent, {}) if not project else {}
    if action == "adopt":
        if project or current or not dest.is_dir() or not (dest / "SKILL.md").is_file():
            raise ValueError("Only an existing unmanaged Global Skill can be adopted")
        if name in cc_skill_owners()[agent] and cc_skill_copy(root, name, library_inventory()):
            raise ValueError("Skill already managed by CC Switch; use CC Switch to change deployment")
        link_target = os.readlink(dest) if dest.is_symlink() else None
        checksum = link_digest(link_target) if link_target else skill_digest(dest)
        backups.mkdir(mode=0o700, parents=True, exist_ok=True)
        backup = Path(tempfile.mkdtemp(prefix="adopt-", dir=backups)) / name
        if link_target:
            os.symlink(link_target, backup)
            links[name] = link_target
        else:
            shutil.copytree(dest, backup)
        tracked[name] = checksum
        save_state(state)
        return "Existing Global Skill adopted (original backup retained)"
    if dest.exists() or dest.is_symlink():
        checksum = link_digest(os.readlink(dest)) if dest.is_symlink() else skill_digest(dest, project)
        if not current or checksum != current:
            raise ValueError("Skill already exists or was changed outside Agent Manager")
    if action == "disable":
        if not current:
            return "Already disabled"
        if dest.is_dir() or dest.is_symlink():
            backups.mkdir(mode=0o700, parents=True, exist_ok=True)
            backup = Path(tempfile.mkdtemp(prefix="skill-", dir=backups)) / name
            old = Path(tempfile.mkdtemp(prefix=".agent-manager-old-", dir=root))
            removed = False
            try:
                os.rename(dest, old / name)
                try:
                    if (old / name).is_symlink():
                        os.symlink(os.readlink(old / name), backup)
                    else:
                        shutil.copytree(old / name, backup)
                except BaseException:
                    os.rename(old / name, dest)
                    raise
                removed = True
            finally:
                if removed or not (old / name).exists():
                    shutil.rmtree(old, ignore_errors=True)
        tracked.pop(name, None)
        save_state(state)
        return "Skill removed (backup retained)"
    if links.get(name):
        if method != "link":
            raise ValueError("Adopted external links cannot be converted into CC Switch copies")
        if current and dest.is_symlink():
            return "Already enabled"
        target = links[name]
        if not (dest.parent / target).resolve().is_dir():
            raise ValueError("Adopted Skill link target no longer exists")
        root.mkdir(parents=True, exist_ok=True)
        os.symlink(target, dest)
        tracked[name] = link_digest(target)
        save_state(state)
        return "Adopted Skill link restored (target unchanged)"
    source = safe(HOME / ".cc-switch/skills" / name)
    if not source.is_dir() or not (source / "SKILL.md").is_file():
        raise ValueError("Sync Skills to remote library first")
    source_hash = skill_digest(source)
    new_hash = link_digest(str(source)) if method == "link" else source_hash
    if current == new_hash and (dest.is_symlink() if method == "link" else dest.is_dir() and not dest.is_symlink()):
        return "Already deployed"
    root.mkdir(parents=True, exist_ok=True)
    backups.mkdir(mode=0o700, parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".agent-manager-stage-", dir=root))
    old = None
    deployed = False
    try:
        if method == "link":
            os.symlink(str(source), stage / name)
        else:
            shutil.copytree(source, stage / name, symlinks=False)
            if skill_digest(stage / name) != source_hash:
                raise ValueError("Source Skill changed during copy; retry deployment")
        if dest.exists() or dest.is_symlink():
            backup = Path(tempfile.mkdtemp(prefix="skill-", dir=backups)) / name
            old = Path(tempfile.mkdtemp(prefix=".agent-manager-old-", dir=root))
            os.rename(dest, old / name)
            try:
                if (old / name).is_symlink():
                    os.symlink(os.readlink(old / name), backup)
                else:
                    shutil.copytree(old / name, backup)
            except BaseException:
                os.rename(old / name, dest)
                raise
        try:
            os.replace(stage / name, dest)
            deployed = True
        except BaseException:
            if old and (old / name).exists():
                os.rename(old / name, dest)
            raise
    finally:
        shutil.rmtree(stage, ignore_errors=True)
        if old and (deployed or not (old / name).exists()):
            shutil.rmtree(old, ignore_errors=True)
    tracked[name] = new_hash
    save_state(state)
    return "Skill deployed as " + method


def import_skill(agent, name, project=None):
    source = skills_root(agent, project) / name
    if source.is_symlink() or not source.is_dir() or not (source / "SKILL.md").is_file():
        raise ValueError("Agent Skill missing or linked; cannot import")
    checksum = skill_digest(source, project)
    root = safe(HOME / ".cc-switch/skills")
    if root.exists() and not root.is_dir():
        raise ValueError("Invalid CC Switch Skills library")
    dest = safe(root / name)
    if dest.exists() or dest.is_symlink():
        raise ValueError("Skill already exists in remote CC Switch library")
    root.mkdir(parents=True, mode=0o700, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".agent-manager-import-", dir=root))
    try:
        shutil.copytree(source, stage / name, symlinks=False)
        if skill_digest(source, project) != checksum or skill_digest(stage / name) != checksum:
            raise ValueError("Agent Skill changed during import")
        if dest.exists() or dest.is_symlink():
            raise ValueError("Skill appeared in remote CC Switch library during import")
        os.rename(stage / name, dest)
        return "Agent Skill copied into remote CC Switch library (Agent files unchanged)"
    finally:
        shutil.rmtree(stage, ignore_errors=True)


def read_skill(name, expected):
    source = skill_snapshot(name, expected)
    document = source / "SKILL.md"
    if not document.is_file() or document.is_symlink() or document.stat().st_size > 400_000:
        raise ValueError("SKILL.md missing, linked, or larger than 400 KB")
    content = document.read_bytes()
    if b"\0" in content or skill_digest(source) != expected:
        raise ValueError("SKILL.md is not text or Skill changed during reading")
    return content.decode("utf-8")


def uses_skill(root, name, source):
    direct = root / name
    if direct.exists() or direct.is_symlink():
        return True
    if root.is_dir():
        for entry in root.iterdir():
            if entry.is_symlink():
                target = entry.resolve(strict=False)
                if target == source or source in target.parents:
                    return True
    return False


def delete_skill(name, expected, project=None):
    source = skill_snapshot(name, expected)
    if not source.is_dir() or not (source / "SKILL.md").is_file():
        raise ValueError("Remote library Skill missing")
    db = safe(HOME / ".cc-switch/cc-switch.db")
    if db.is_file():
        with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as conn:
            if conn.execute("SELECT 1 FROM skills WHERE directory = ? LIMIT 1", (name,)).fetchone():
                raise ValueError("Skill is registered in CC Switch; remove it there first")
    state = load_state()
    for agent in BASE:
        if uses_skill(skills_root(agent), name, source) or name in state.get("skills", {}).get(agent, {}):
            raise ValueError("Skill is deployed to a Global Agent; disable it first")
    known = dict(state.get("workspaces", {}))
    if project and str(project) not in known:
        known[str(project)] = {}
    for folder, entries in known.items():
        for agent, relative in PROJECT_SKILLS.items():
            if name in entries.get("skills", {}).get(agent, {}):
                raise ValueError("Skill is deployed to a Project Agent; disable it first")
            if uses_skill(Path(folder) / relative, name, source):
                raise ValueError("Skill is present in a known Workspace; remove it first")
    shared = HOME / ".agents/skills" / name
    if shared.exists() or shared.is_symlink():
        raise ValueError("Skill may be in use by global .agents/skills; remove it there first")
    backups = safe(STATE.parent / "backups/library")
    backups.mkdir(parents=True, mode=0o700, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix="delete-", dir=backups)) / name
    os.rename(source, backup)
    return "Remote Skill removed (backup: " + str(backup) + ")"


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "inventory":
        print(json.dumps(library_inventory(), separators=(",", ":")))
        return
    if platform.system() != "Linux":
        raise ValueError("Agent Manager supports Linux remote Hosts only")
    op = sys.argv[1]
    if op == "pack" and len(sys.argv) == 4:
        path = pack_skill(sys.argv[2], sys.argv[3])
        try:
            encoded = path.with_suffix(".b64")
            fd = os.open(encoded, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with path.open("rb") as source, os.fdopen(fd, "wb") as output:
                base64.encode(source, output)
            print(json.dumps({"path": str(encoded), "lines": sum(1 for _ in encoded.open("rb"))}))
        finally:
            path.unlink(missing_ok=True)
        return
    if op == "unpack" and len(sys.argv) == 6:
        print(unpack_skill(*sys.argv[2:6]))
        return
    if op == "status":
        if len(sys.argv) not in (2, 3):
            raise ValueError("usage: status [WORKSPACE]")
        status(workspace(sys.argv[2]) if len(sys.argv) == 3 else None)
        return
    if op in ("read", "delete") and (len(sys.argv) == 4 or op == "delete" and len(sys.argv) == 5):
        name, expected = sys.argv[2:4]
        valid_id(name, "skills", "shared")
        if not re.fullmatch(r"[a-f0-9]{64}", expected):
            raise ValueError("Expected Skill digest missing")
        if op == "read":
            print(read_skill(name, expected), end="")
            return
        safe(STATE.parent).mkdir(parents=True, exist_ok=True)
        fd = os.open(safe(STATE.parent / "lock"), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "rb") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            print(delete_skill(name, expected, workspace(sys.argv[4]) if len(sys.argv) == 5 else None))
        return
    if op == "import" and len(sys.argv) in (4, 5):
        agent, name = sys.argv[2:4]
        project = workspace(sys.argv[4]) if len(sys.argv) == 5 else None
        if agent not in (PROJECT_SKILLS if project else BASE):
            raise ValueError("Unknown Agent for Skill import")
        valid_id(name, "skills", agent)
        safe(STATE.parent).mkdir(parents=True, exist_ok=True)
        fd = os.open(safe(STATE.parent / "lock"), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "rb") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            print(import_skill(agent, name, project))
        return
    if op != "apply" or len(sys.argv) not in (7, 8, 9):
        raise ValueError("usage: apply KIND AGENT ACTION ID PAYLOAD [WORKSPACE] [METHOD]")
    kind, agent, action, name, payload = sys.argv[2:7]
    project = workspace(sys.argv[7]) if len(sys.argv) >= 8 and sys.argv[7] != "-" else None
    method = sys.argv[8] if len(sys.argv) == 9 else "link"
    allowed = PROJECT_SKILLS if kind == "skills" and project else BASE
    if (kind not in ("mcp", "skills") or agent not in allowed or action not in ("enable", "disable", "adopt")
            or (action == "adopt" and (kind != "skills" or project)) or method not in ("link", "copy")
            or (method != "link" and (kind != "skills" or action != "enable"))):
        raise ValueError("Unknown Agent or operation")
    valid_id(name, kind, agent)
    if kind == "mcp" and name == "node_repl":
        raise ValueError("node_repl is excluded from Agent Manager")
    if not (kind == "skills" and project and agent == "shared") and not installed(agent):
        raise ValueError("Agent configuration directory not installed")
    safe(STATE.parent).mkdir(parents=True, exist_ok=True)
    lock_path = safe(STATE.parent / "lock")
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "rb") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = load_state()
        if kind == "mcp":
            if action == "enable":
                source = Path(payload)
                if (not re.fullmatch(r"/tmp/agent-manager-mcp\.[A-Za-z0-9]+(?:/payload\.json)?", str(source))
                        or source.is_symlink() or source.parent.is_symlink()):
                    raise ValueError("Unexpected MCP payload path")
                try:
                    payload = json.loads(source.read_text())
                finally:
                    source.unlink(missing_ok=True)
                if not isinstance(payload, list) or len(payload) != 1 or not isinstance(payload[0], dict):
                    raise ValueError("MCP server not found in local CC Switch catalog")
                try:
                    validate_spec(json.loads(payload[0]["server_config"]), agent)
                except ValueError as exc:
                    if str(exc) in ("Absolute MCP command not present on remote Host", "Absolute MCP argument path not present on remote Host", "MCP command not found in remote PATH", "MCP cwd not present on remote Host"):
                        print(store_mcp_library(name, payload, state))
                        return
                    raise
            print(update_mcp(agent, name, action, payload, state, project))
        else:
            print(update_skill(agent, name, action, state, project, method))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, IndexError, TypeError) as exc:
        print("agent-manager: " + str(exc), file=sys.stderr)
        sys.exit(1)
