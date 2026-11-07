# Patch the status area so Mods can share it without adding layout space.
# Handles the stock status block, the old split-row implementation and the slot
# form written by an earlier version; also removes the old sidebar button. When the
# status area is customized the layout is printed unchanged and the exit status is
# 3, so existing layouts are safe.
function brace_delta(line, x, a, b) {
  x=line; a=gsub(/\{/, "", x)
  x=line; b=gsub(/\}/, "", x)
  return a-b
}
function skip(message) {
  print "Status integration: " message > "/dev/stderr"
  skipped=1
}
function bail(   i) { for (i=1; i<=NR; i++) print lines[i]; exit 3 }
function indent(line, x) { x=line; sub(/[^ \t].*$/, "", x); return x }
{ lines[NR]=$0 }
END {
  count=0; start=stop=0
  for (i=2; i<=NR; i++) {
    if (lines[i] ~ /^[ \t]*"id"[ \t]*:[ \t]*"status"[ \t]*,?[ \t]*$/) {
      count++
      start=i-1
      if (lines[start] !~ /^[ \t]*\{[ \t]*$/) {skip("unsupported status opening"); break}
      depth=0
      for (j=start; j<=NR; j++) {
        depth+=brace_delta(lines[j])
        if (depth==0) {stop=j; break}
      }
    }
  }
  if (count!=1 || !stop) skip("expected exactly one complete status node")
  if (skipped) bail()

  oldSidebarStart=oldSidebarEnd=0
  for (i=1; i<start; i++) {
    if (lines[i] ~ /"id"[ \t]*:[ \t]*"project-open"/) {
      if (oldSidebarStart) {skip("multiple old sidebar blocks"); break}
      if (lines[i] ~ /^[ \t]*\{"id":"project-open"/) {
        oldSidebarStart=oldSidebarEnd=i
      } else if (i>1 && lines[i-1] ~ /^[ \t]*\{[ \t]*$/) {
        oldSidebarStart=i-1
        depth=0
        for (j=oldSidebarStart; j<start; j++) {
          depth+=brace_delta(lines[j])
          if (depth==0) {oldSidebarEnd=j; break}
        }
        if (!oldSidebarEnd) skip("invalid old sidebar block")
      } else skip("unrecognized old sidebar button")
    }
  }
  if (skipped) bail()

  # A bar that already holds only status-bar-* blocks is the current form: leave the
  # node alone (compose-layout.sh fills in whatever is missing).
  isRow=isBlock=hasWorkspace=hasProject=foreign=0
  for (i=start; i<=stop; i++) {
    if (lines[i] ~ /"id"[ \t]*:[ \t]*"status-bar-/) continue
    if (lines[i] ~ /"id"[ \t]*:[ \t]*"status"[ \t]*,?[ \t]*$/) continue
    if (lines[i] ~ /"id"[ \t]*:[ \t]*"[^"]*"/) foreign=1
    if (lines[i] ~ /"type"[ \t]*:[ \t]*"row"/) isRow=1
    if (lines[i] ~ /"type"[ \t]*:[ \t]*"block"/) isBlock=1
    if (lines[i] ~ /"mod"[ \t]*:[ \t]*"workspace-status"/) hasWorkspace=1
    if (lines[i] ~ /"mod"[ \t]*:[ \t]*"project-open"/) hasProject=1
  }
  if (!isRow && (!isBlock || (!hasWorkspace && !hasProject))) skip("status bar is customized; leaving it unchanged")
  if (skipped) bail()
  migrate = !isRow || foreign

  for (i=1; i<=NR; i++) {
    if (oldSidebarStart && i>=oldSidebarStart && i<=oldSidebarEnd) continue
    if (i==start && migrate) {
      pad=indent(lines[start])
      suffix=(lines[stop] ~ /,[ \t]*$/ ? "," : "")
      print pad "{"
      print pad "  \"id\": \"status\","
      print pad "  \"type\": \"row\","
      print pad "  \"size\": {\"px\": 28}"
      print pad "}" suffix
      i=stop
      continue
    }
    print lines[i]
  }
}
