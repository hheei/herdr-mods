#!/usr/bin/env python3
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import remote

CODE = Path(remote.__file__).read_text()


def command(*args, stdin=None):
    with stdin.open("rb") if stdin else open(os.devnull, "rb") as stream:
        result = subprocess.run(["hc", *args], stdin=stream, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace").strip() or "hc command failed")
    return result.stdout.decode(errors="strict").strip()


def execute(machine, action, *args):
    return command("exec", "--on", machine, "--timeout", "600", "python3", "-c", CODE, action, *args)


def check_remote_path(path):
    if not re.fullmatch(r"/tmp/agent-manager-skill[-.][A-Za-z0-9_-]+(?:\.b64)?", path):
        raise ValueError("Unexpected remote Skill archive path")
    return path


def upload(machine, name, local_hash, remote_hash):
    archive = remote.pack_skill(name, local_hash)
    path = ""
    try:
        path = check_remote_path(command("exec", "--on", machine, "mktemp", "/tmp/agent-manager-skill.XXXXXX"))
        command("file", "write", "--on", machine, path, stdin=archive)
        print(execute(machine, "unpack", name, path, local_hash, remote_hash))
    finally:
        archive.unlink(missing_ok=True)
        if path:
            command("exec", "--on", machine, "rm", "-f", path)


def download(machine, name, local_hash, remote_hash):
    info = json.loads(execute(machine, "pack", name, remote_hash))
    path = check_remote_path(info["path"])
    lines = info["lines"]
    if not isinstance(lines, int) or lines < 1:
        raise ValueError("Invalid remote archive length")
    fd, archive_path = tempfile.mkstemp(prefix="agent-manager-skill-", dir="/tmp")
    try:
        with os.fdopen(fd, "wb") as archive:
            for offset in range(1, lines + 1, 20000):
                count = min(20000, lines - offset + 1)
                chunk = command("file", "read", "--on", machine, "--offset", str(offset), "--limit", str(count), path)
                if len(chunk.splitlines()) != count:
                    raise ValueError("Remote Skill archive truncated")
                archive.write(base64.b64decode(chunk, validate=False))
        print(remote.unpack_skill(name, archive_path, remote_hash, local_hash))
    finally:
        Path(archive_path).unlink(missing_ok=True)
        command("exec", "--on", machine, "rm", "-f", path)


def main():
    if len(sys.argv) not in (2, 4, 6):
        raise ValueError("usage: sync.sh MACHINE [SKILL upload|download [LOCAL_HASH REMOTE_HASH]]")
    machine = sys.argv[1]
    if not re.fullmatch(r"[a-zA-Z0-9_.-]{1,100}", machine):
        raise ValueError("Invalid Herdr machine alias")
    if os.environ.get("AGENT_MANAGER_TEST") == "1":
        source = Path(os.environ["AGENT_MANAGER_SOURCE"])
        remote.HOME = source.parent.parent
    elif sys.platform != "darwin":
        raise ValueError("Run Skill sync on Mac hosting Herdr App")
    if command("exec", "--on", machine, "uname", "-s") != "Linux":
        raise ValueError("Target is not a Linux machine")
    local = remote.library_inventory()
    other = json.loads(execute(machine, "inventory"))
    if any(value == "blocked" for value in [*local.values(), *other.values()]):
        raise ValueError("Linked or special Skill entry refused")
    if len(sys.argv) == 2:
        conflicts = sorted(name for name in local.keys() & other.keys() if local[name] != other[name])
        if conflicts:
            print(json.dumps({"conflicts": conflicts}))
            return 3
        pending = [("upload", name) for name in sorted(local.keys() - other.keys())]
        pending += [("download", name) for name in sorted(other.keys() - local.keys())]
    else:
        name, direction = sys.argv[2:4]
        remote.valid_id(name, "skills", "shared")
        if direction not in ("upload", "download"):
            raise ValueError("Choose upload or download")
        pending = [(direction, name)]
        if len(sys.argv) == 6 and (sys.argv[4] != local.get(name, "absent") or sys.argv[5] != other.get(name, "absent")):
            raise ValueError("Skill changed since confirmation; Refresh before transfer")
        if len(sys.argv) == 4 and name in local and name in other and local[name] != other[name]:
            print(json.dumps({"conflicts": [name]}))
            return 3
    performed = 0
    for direction, name in pending:
        left, right = local.get(name, "absent"), other.get(name, "absent")
        if left == right:
            continue
        if direction == "upload":
            if left == "absent":
                raise ValueError("Local Skill missing")
            upload(machine, name, left, right)
        else:
            if right == "absent":
                raise ValueError("Remote Skill missing")
            download(machine, name, left, right)
        performed += 1
    print(f"{performed} Skill(s) synchronized; conflicting existing copies require explicit choice")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, RuntimeError, json.JSONDecodeError) as error:
        print("agent-manager sync: " + str(error), file=sys.stderr)
        sys.exit(1)
