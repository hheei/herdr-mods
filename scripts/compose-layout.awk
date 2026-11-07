# Fills the status bar with one block per Mod whose own layout.json asks for it,
# minus any Mod the user named under "exclude" in herdr-mods.config.json:
#   { "status-bar": { "order": 20, "size": { "px": 64 }, "props": { "mode": "bar" } } }
# Mods stay independent: no Mod is named here, and nothing already in the bar is
# removed or reordered -- a missing Mod is appended in order, so a bar somebody
# edited by hand stays theirs. Without a single missing Mod the Layout is printed
# unchanged, which keeps the installer idempotent.
function str(src, key,   s) {
  s = src
  if (!match(s, "\"" key "\"[ \t]*:[ \t]*\"[^\"]*\"")) return ""
  s = substr(s, RSTART, RLENGTH)
  sub(/^[^:]*:[ \t]*"/, "", s)
  sub(/"$/, "", s)
  return s
}
function num(src, key,   s) {
  s = src
  if (!match(s, "\"" key "\"[ \t]*:[ \t]*[0-9]+")) return ""
  s = substr(s, RSTART, RLENGTH)
  sub(/^[^:]*:[ \t]*/, "", s)
  return s
}
function object(src, key,   at, i, depth, c, len) {
  if (!match(src, "\"" key "\"[ \t]*:[ \t]*\\{")) return ""
  at = RSTART + RLENGTH - 1
  depth = 0
  len = length(src)
  for (i = at; i <= len; i++) {
    c = substr(src, i, 1)
    if (c == "{") depth++
    else if (c == "}") { depth--; if (depth == 0) return substr(src, at, i - at + 1) }
  }
  return ""
}
# Names listed under "exclude" in the user's own herdr-mods.config.json, as " a b ".
function list(src, key,   seg, out, s) {
  out = " "
  if (!match(src, "\"" key "\"[ \t]*:[ \t]*\\[[^]]*\\]")) return out
  seg = substr(src, RSTART, RLENGTH)
  while (match(seg, /"[^"]*"/)) {
    s = substr(seg, RSTART + 1, RLENGTH - 2)
    seg = substr(seg, RSTART + RLENGTH)
    out = out s " "
  }
  return out
}
function indent_of(src,   s) { s = src; sub(/[^ \t].*$/, "", s); return s }
function brace_delta(line, x, a, b) {
  x=line; a=gsub(/\{/, "", x)
  x=line; b=gsub(/\}/, "", x)
  return a-b
}
BEGIN {
  if (config != "") {
    settings = ""
    while ((getline l < config) > 0) settings = settings l "\n"
    close(config)
    skip_mod = list(settings, "exclude")
  }
  cmd = "ls -1 \"" mods "\" 2>/dev/null"
  while ((cmd | getline name) > 0) {
    file = mods "/" name "/layout.json"
    content = ""
    while ((getline l < file) > 0) content = content l "\n"
    close(file)
    if (content == "" || content !~ /"status-bar"/) continue
    if (index(skip_mod, " " name " ")) continue
    entry = object(content, "status-bar")
    if (entry == "") continue
    total++
    mod[total] = name
    ord[total] = num(entry, "order") == "" ? 50 : num(entry, "order") + 0
    size[total] = object(entry, "size")
    props[total] = object(entry, "props")
  }
  close(cmd)
}
{ lines[NR] = $0 }
END {
  if (total == 0) { for (i = 1; i <= NR; i++) print lines[i]; exit 0 }

  start = stop = 0
  for (i = 2; i <= NR; i++) {
    if (lines[i] !~ /^[ \t]*"id"[ \t]*:[ \t]*"status"[ \t]*,?[ \t]*$/) continue
    start = i - 1
    if (lines[start] !~ /^[ \t]*\{[ \t]*$/) { start = 0; continue }
    depth = 0
    for (j = start; j <= NR; j++) {
      depth += brace_delta(lines[j])
      if (depth == 0) { stop = j; break }
    }
    if (stop) break
  }
  if (!stop || start == 0) { for (i = 1; i <= NR; i++) print lines[i]; exit 0 }
  isRow = 0
  for (i = start; i <= stop; i++) if (lines[i] ~ /"type"[ \t]*:[ \t]*"row"/) isRow = 1
  if (!isRow) { for (i = 1; i <= NR; i++) print lines[i]; exit 0 }

  # Where the (possibly absent) children array opens and closes inside the node.
  open_line = open_col = close_line = close_col = 0
  for (i = start; i <= stop && !open_line; i++) {
    if (match(lines[i], /"children"[ \t]*:[ \t]*\[/)) {
      open_line = i
      open_col = RSTART + RLENGTH - 1
    }
  }
  if (open_line) {
    depth = 0
    for (i = open_line; i <= stop && !close_line; i++) {
      from = (i == open_line ? open_col : 1)
      for (j = from; j <= length(lines[i]); j++) {
        c = substr(lines[i], j, 1)
        if (c == "[") { depth++ }
        else if (c == "]") { depth--; if (depth == 0) { close_line = i; close_col = j; break } }
      }
    }
    if (!close_line) {
      print "compose: the status children array is not closed" > "/dev/stderr"
      exit 2
    }
  } else {
    close_line = stop
    close_col = 0
  }

  for (i = start; i <= stop; i++) {
    if (lines[i] !~ /"id"[ \t]*:[ \t]*"status-bar-/) continue
    id = str(lines[i], "id")
    have[id] = 1
  }
  missing = 0
  for (i = 1; i <= total; i++) {
    if (("status-bar-" mod[i]) in have) continue
    missing++
    pick[missing] = i
  }
  if (missing == 0) { for (i = 1; i <= NR; i++) print lines[i]; exit 0 }

  for (i = 1; i <= missing; i++) {
    best = i
    for (j = i + 1; j <= missing; j++) {
      a = ord[pick[j]]; b = ord[pick[best]]
      if (a < b || (a == b && mod[pick[j]] < mod[pick[best]])) best = j
    }
    if (best != i) { t = pick[i]; pick[i] = pick[best]; pick[best] = t }
  }

  pad = indent_of(lines[start])
  box = pad "    "
  last = 0
  for (i = start; i < close_line; i++) if (lines[i] ~ /[^ \t]/) last = i
  if (open_line && last == open_line) {
    tail = substr(lines[open_line], open_col + 1)
    for (j = 1; j <= length(tail); j++) if (substr(tail, j, 1) !~ /[ \t]/) { last = 0; break }
  }

  for (i = 1; i <= NR; i++) {
    if (i == close_line && !open_line) {
      print pad "  \"children\": ["
      emit_blocks()
      print pad "  ]"
      print lines[i]
      continue
    }
    if (i == close_line) {
      head = substr(lines[i], 1, close_col - 1)
      if (head ~ /[^ \t]/) print head
      emit_blocks()
      print pad "  " substr(lines[i], close_col)
      continue
    }
    if (i == last && lines[i] !~ /,[ \t]*$/) {
      print lines[i] ","
      continue
    }
    print lines[i]
  }
}

function emit_blocks(   k, n, size_field, props_field) {
  for (k = 1; k <= missing; k++) {
    n = pick[k]
    size_field = size[n] == "" ? "\"weight\": 1" : "\"size\": " size[n]
    props_field = props[n] == "" ? "" : ", \"props\": " props[n]
    printf "%s{ \"id\": \"status-bar-%s\", \"type\": \"block\", %s, \"content\": { \"mod\": \"%s\"%s } }%s\n", \
      box, mod[n], size_field, mod[n], props_field, (k < missing ? "," : "")
  }
}
