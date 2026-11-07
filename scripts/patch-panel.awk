# Puts this Mod in the right-hand panel beside Files and Changes, in the Layout.
#   awk -v mod=agent-manager -f patch-panel.awk layout.json
# The block is appended and never reordered, so a panel somebody already arranged
# stays theirs. Nothing else in the tree is inspected or moved.
function bracket_delta(line, x, a, b) {
  x = line; a = gsub(/\[/, "", x)
  x = line; b = gsub(/\]/, "", x)
  return a - b
}
function indent_of(src,   s) { s = src; sub(/[^ \t].*$/, "", s); return s }
function passthrough() { for (i = 1; i <= NR; i++) print lines[i]; exit 3 }
{ lines[NR] = $0 }
END {
  for (i = 1; i <= NR; i++) if (lines[i] ~ /"id":[ ]*"panel-body"/) { panel_at = i; break }
  if (!panel_at) passthrough()
  for (i = panel_at + 1; i <= NR; i++)
    if (lines[i] ~ /"children":[ ]*\[/) { aopen = i; break }
  if (!aopen) passthrough()
  depth = 0
  for (i = aopen; i <= NR; i++) {
    depth += bracket_delta(lines[i])
    if (depth == 0) { aclose = i; break }
  }
  if (!aclose) passthrough()
  for (i = aopen + 1; i < aclose; i++)
    if (lines[i] ~ ("\"mod\":[ ]*\"" mod "\"")) present = 1
  if (present) passthrough()

  indent = indent_of(lines[aopen + 1])
  if (indent == "" || lines[aopen + 1] ~ /^[ \t]*\]/) indent = indent_of(lines[aopen]) "  "
  entry = indent "{ \"id\": \"" mod "\", \"type\": \"block\", \"content\": { \"mod\": \"" mod "\" } }"
  last = aclose - 1
  while (last > aopen && lines[last] ~ /^[ \t]*$/) last--
  if (last > aopen && lines[last] !~ /\][ \t]*$/ && lines[last] !~ /,[ \t]*$/) lines[last] = lines[last] ","
  for (i = 1; i <= NR; i++) {
    if (i == aclose) print entry
    print lines[i]
  }
}
