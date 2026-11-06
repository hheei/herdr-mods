# Insert a sidebar footer button for a mod that is not in the layout yet.
# The layout is printed unchanged with exit status 3 when there is no single
# sidebar-footer to hang the button on.
{ lines[NR]=$0 }
END {
  count=0; at=0; present=0
  for (i=1; i<=NR; i++)
    if (index(lines[i], "\"id\": \"" name "\"") || index(lines[i], "\"id\":\"" name "\"")) present=1
  if (present) { for (i=1; i<=NR; i++) print lines[i]; exit 0 }
  for (i=2; i<=NR; i++)
    if (lines[i] ~ /^[[:space:]]*"id"[[:space:]]*:[[:space:]]*"sidebar-footer"/) { count++; at=i }
  if (count != 1) {
    for (i=1; i<=NR; i++) print lines[i]
    print "Sidebar integration: expected one sidebar-footer; layout left unchanged." > "/dev/stderr"
    exit 3
  }
  lead=lines[at-1]; sub(/\{[[:space:]]*$/, "", lead)
  for (i=1; i<=NR; i++) {
    if (i==at-1) print lead "{\"id\":\"" name "\",\"type\":\"block\",\"size\":{\"px\":38},\"content\":{\"mod\":\"" name "\"}},"
    print lines[i]
  }
}
