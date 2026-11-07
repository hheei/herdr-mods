# Puts this Mod in the right-hand panel beside Files and Changes, in the Layout.
# The block is appended and never reordered, so a panel somebody already arranged
# stays theirs; a copy parked at the Layout root (the old always-on sidebar) moves in.
function brace_delta(line, x, a, b) {
  x = line; a = gsub(/\{/, "", x)
  x = line; b = gsub(/\}/, "", x)
  return a - b
}
function bracket_delta(line, x, a, b) {
  x = line; a = gsub(/\[/, "", x)
  x = line; b = gsub(/\]/, "", x)
  return a - b
}
function indent_of(src,   s) { s = src; sub(/[^ \t].*$/, "", s); return s }
function passthrough(code) { for (i = 1; i <= NR; i++) print lines[i]; exit code }
{ lines[NR] = $0 }
END {
  for (i = 1; i <= NR; i++) if (lines[i] ~ /"id":[ ]*"panel-body"/) { panel_at = i; break }
  if (!panel_at) passthrough(3)
  for (i = panel_at + 1; i <= NR; i++)
    if (lines[i] ~ /"children":[ ]*\[/) { aopen = i; break }
  if (!aopen) passthrough(3)
  depth = 0
  for (i = aopen; i <= NR; i++) {
    depth += bracket_delta(lines[i])
    if (depth == 0) { aclose = i; break }
  }
  if (!aclose) passthrough(3)

  for (i = aopen + 1; i < aclose; i++)
    if (lines[i] ~ /"mod":[ ]*"agent-manager"/) present = 1

  for (i = 1; i <= NR && !present; i++) {
    if (lines[i] !~ /"id":[ ]*"agent-manager"/) continue
    if (i > aopen && i < aclose) continue
    start = i
    while (start > 1 && lines[start] !~ /\{[ \t]*$/) start--
    depth = 0
    for (j = start; j <= NR; j++) {
      depth += brace_delta(lines[j])
      if (depth == 0) { stop = j; break }
    }
    drop_start = start; drop_stop = stop
    break
  }

  # Taking the block out leaves the item before it without a trailing comma if it
  # was the last one; without this the JSON would not parse.
  if (drop_start != "") {
    prev = drop_start - 1
    while (prev > 1 && lines[prev] ~ /^[ \t]*$/) prev--
    nxt = drop_stop + 1
    while (nxt <= NR && lines[nxt] ~ /^[ \t]*$/) nxt++
    if (lines[prev] ~ /,[ \t]*$/ && (nxt > NR || lines[nxt] ~ /^[ \t]*[\]\}]/))
      sub(/,[ \t]*$/, "", lines[prev])
  }
  if (present && drop_start == "") passthrough(0)
  indent = indent_of(lines[aopen + 1])
  if (indent == "" || lines[aopen + 1] ~ /^[ \t]*\]/) indent = indent_of(lines[aopen]) "  "
  entry = indent "{ \"id\": \"agent-manager\", \"type\": \"block\", \"content\": { \"mod\": \"agent-manager\" } }"
  if (!present) {
    last = aclose - 1
    while (last > aopen && lines[last] ~ /^[ \t]*$/) last--
    if (last > aopen && lines[last] !~ /\][ \t]*$/ && lines[last] !~ /,[ \t]*$/) lines[last] = lines[last] ","
  }
  for (i = 1; i <= NR; i++) {
    if (drop_start != "" && i >= drop_start && i <= drop_stop) continue
    if (!present && i == aclose) print entry
    print lines[i]
  }
}
