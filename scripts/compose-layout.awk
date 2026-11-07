# Expands Layout slots. Given a node
#   { "id": "status", "type": "row", "size": { "px": 28 }, "slot": "status-bar" }
# (one line or many) it keeps the node and replaces the slot field with one block per
# Mod whose own mod.json declares that slot:
#   "layout": { "slot": "status-bar", "order": 20, "size": { "px": 64 }, "props": { "mode": "bar" } }
# Mods stay independent: no Mod is named here. order sorts inside a slot (default 50,
# then Mod name); no size takes a share (weight 1); props pass through as written.
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

function object(src, key,   s) {
  s = src
  if (!match(s, "\"" key "\"[ \t]*:[ \t]*\{[^}]*\}")) return ""
  s = substr(s, RSTART, RLENGTH)
  sub(/^[^:]*:[ \t]*/, "", s)
  return s
}

function indent_of(src,   s) {
  s = src
  sub(/[^ \t].*$/, "", s)
  return s
}

function blocks(slot, pad,   total, i, j, best, t, out, order, who, size, props, box, extra) {
  total = count[slot] + 0
  for (i = 1; i <= total; i++) {
    order[i] = ord[slot, i]; who[i] = mod[slot, i]
    size[i] = sz[slot, i]; props[i] = pr[slot, i]
  }
  for (i = 1; i <= total; i++) {
    best = i
    for (j = i + 1; j <= total; j++) {
      if (order[j] < order[best] || (order[j] == order[best] && who[j] < who[best])) best = j
    }
    if (best != i) {
      t = order[i]; order[i] = order[best]; order[best] = t
      t = who[i]; who[i] = who[best]; who[best] = t
      t = size[i]; size[i] = size[best]; size[best] = t
      t = props[i]; props[i] = props[best]; props[best] = t
    }
  }
  out = ""
  for (i = 1; i <= total; i++) {
    box = size[i] == "" ? "\"weight\": 1" : "\"size\": " size[i]
    extra = props[i] == "" ? "" : ", \"props\": " props[i]
    out = out pad "    { \"id\": \"" slot "-" who[i] "\", \"type\": \"block\", " box \
      ", \"content\": { \"mod\": \"" who[i] "\"" extra " } }" (i < total ? "," : "") "\n"
  }
  return out
}

BEGIN {
  cmd = "ls -1 \"" mods "\" 2>/dev/null"
  while ((cmd | getline name) > 0) {
    meta = mods "/" name "/mod.json"
    entry = ""
    while ((getline l < meta) > 0) {
      if (l ~ /"layout"/) { entry = l; break }
    }
    close(meta)
    if (entry == "") continue
    slot = str(entry, "slot")
    if (slot == "") continue
    count[slot]++
    n = count[slot]
    ord[slot, n] = num(entry, "order") == "" ? 50 : num(entry, "order") + 0
    mod[slot, n] = name
    sz[slot, n] = object(entry, "size")
    pr[slot, n] = object(entry, "props")
  }
  close(cmd)
}

{ ln[NR] = $0 }

END {
  nodes = 0
  for (i = 1; i <= NR; i++) {
    if (ln[i] !~ /"slot"[ \t]*:/) continue
    if (ln[i] ~ /\{/ && ln[i] ~ /"slot"/) start = i
    else {
      start = i
      back = 0
      for (j = i; j >= 1; j--) {
        u = ln[j]; opens = gsub(/\{/, "{", u); closes = gsub(/\}/, "}", u)
        back += closes - opens
        if (back < 0) { start = j; break }
      }
    }
    depth = 0
    stop = 0
    for (j = start; j <= NR; j++) {
      u = ln[j]; opens = gsub(/\{/, "{", u); closes = gsub(/\}/, "}", u)
      depth += opens - closes
      if (depth <= 0) { stop = j; break }
    }
    if (stop < i) {
      printf "compose: slot node at line %d is not closed by its own braces\n", start > "/dev/stderr"
      exit 2
    }
    nodes++
    from[nodes] = start; to[nodes] = stop
    covered[from[nodes]] = nodes
  }
  if (nodes == 0) { for (i = 1; i <= NR; i++) print ln[i]; exit 0 }

  i = 1
  while (i <= NR) {
    if (!(i in covered)) { print ln[i]; i++; continue }
    k = covered[i]
    stop = to[k]
    text = ""
    for (j = from[k]; j <= stop; j++) text = text ln[j] "\n"
    pad = indent_of(ln[from[k]])
    slot = str(text, "slot")
    if (match(text, /,[ \t]*\n?[ \t]*"children"[ \t]*:[ \t]*\[/)) {
      head2 = substr(text, 1, RSTART - 1)
      rest = substr(text, RSTART + RLENGTH)
      d = 1
      cut = 0
      for (j = 1; j <= length(rest); j++) {
        c = substr(rest, j, 1)
        if (c == "[") d++
        else if (c == "]") { d--; if (d == 0) { cut = j; break } }
      }
      text = head2 ", " substr(rest, cut + 1)
    }
    pos = 0
    for (j = 1; j <= length(text); j++) if (substr(text, j, 1) == "}") pos = j
    head = substr(text, 1, pos - 1)
    tail = substr(text, pos + 1)
    sub(/[ \t]*\n?[ \t]*$/, "", head)
    sub(/,[ \t]*$/, "", head)
    print head ","
    print pad "  \"children\": ["
    printf "%s", blocks(slot, pad)
    print pad "  ]"
    sub(/[ \t]*\n?[ \t]*$/, "", tail)
    print pad "}" tail
    i = stop + 1
  }
}
