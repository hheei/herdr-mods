# Points the tab bar at this Mod instead of the read-only built-in one.
# Herdr re-owns mods/<name>/ on every start (an edit is moved to <name>-edited), so
# the swap belongs in the Layout: one value changes, the tree stays as it was.
{
  line = $0
  if (!changed && match(line, /"mod"[ \t]*:[ \t]*"tabs"/)) {
    tail = substr(line, RSTART, RLENGTH)
    sub(/tabs"$/, "tabs-agent-manager\"", tail)
    line = substr(line, 1, RSTART - 1) tail substr(line, RSTART + RLENGTH)
    changed = 1
  }
  lines[NR] = line
}
END { for (i = 1; i <= NR; i++) print lines[i] }
