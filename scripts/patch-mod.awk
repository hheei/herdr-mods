# Points a Layout node's Mod at ours. Herdr's own Mods are read-only (they are
# replaced whole on every start, an edit is moved to <name>-edited), so replacing one
# is a value change here, not an edit under mods/. from = the Mod being replaced.
#   awk -v from=workspace-status -v to=hheei-status -f patch-mod.awk layout.json
{
  line = $0
  if (!changed && match(line, /"mod"[ \t]*:[ \t]*"[^"]*"/)) {
    whole = substr(line, RSTART, RLENGTH)
    if (whole ~ ("^\"mod\"[ \t]*:[ \t]*\"" from "\"")) {
      sub(/"[^"]*"[ \t]*$/, "\"" to "\"", whole)
      line = substr(line, 1, RSTART - 1) whole substr(line, RSTART + RLENGTH)
      changed = 1
    }
  }
  lines[NR] = line
}
END { for (i = 1; i <= NR; i++) print lines[i] }
