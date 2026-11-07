# Points the tab bar at our own Mod instead of the read-only shipped one.
# Herdr re-owns mods/tabs/ on every start (an edit is moved to tabs-edited), so the
# swap belongs in the Layout: one value changes, the tree stays as it was.
{
  line = $0
  if (!changed && match(line, /"mod"[ \t]*:[ \t]*"tabs"/)) {
    whole = substr(line, RSTART, RLENGTH)
    sub(/"[^"]*"[ \t]*$/, "\"hheei-tabs\"", whole)
    line = substr(line, 1, RSTART - 1) whole substr(line, RSTART + RLENGTH)
    changed = 1
  }
  lines[NR] = line
}
END { for (i = 1; i <= NR; i++) print lines[i] }
