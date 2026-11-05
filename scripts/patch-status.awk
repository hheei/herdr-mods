# Patch Project Open into the existing status block without adding layout space.
# Handles stock status block and the old split-row implementation; also removes
# the old sidebar button. Fails closed if custom status structure is unknown.
function brace_delta(line, x, a, b) {
  x=line; a=gsub(/\{/, "", x)
  x=line; b=gsub(/\}/, "", x)
  return a-b
}
function fail(message) {
  print "Status integration: " message > "/dev/stderr"
  bad=1
}
function indent(line, x) { x=line; sub(/[^ \t].*$/, "", x); return x }
{ lines[NR]=$0 }
END {
  count=0; start=stop=0
  for (i=2; i<=NR; i++) {
    if (lines[i] ~ /^[ \t]*"id"[ \t]*:[ \t]*"status"[ \t]*,?[ \t]*$/) {
      count++
      start=i-1
      if (lines[start] !~ /^[ \t]*\{[ \t]*$/) {fail("unsupported status opening"); break}
      depth=0
      for (j=start; j<=NR; j++) {
        depth+=brace_delta(lines[j])
        if (depth==0) {stop=j; break}
      }
    }
  }
  if (count!=1 || !stop) fail("expected exactly one complete status node")
  if (bad) exit 2

  oldSidebarStart=oldSidebarEnd=0
  for (i=1; i<start; i++) {
    if (lines[i] ~ /"id"[ \t]*:[ \t]*"project-open"/) {
      if (oldSidebarStart) {fail("multiple old sidebar blocks"); break}
      if (lines[i] ~ /^[ \t]*\{"id":"project-open"/) {
        oldSidebarStart=oldSidebarEnd=i
      } else if (i>1 && lines[i-1] ~ /^[ \t]*\{[ \t]*$/) {
        oldSidebarStart=i-1
        depth=0
        for (j=oldSidebarStart; j<start; j++) {
          depth+=brace_delta(lines[j])
          if (depth==0) {oldSidebarEnd=j; break}
        }
        if (!oldSidebarEnd) fail("invalid old sidebar block")
      } else fail("unrecognized old sidebar button")
    }
  }
  if (bad) exit 2

  isRow=isBlock=hasOriginal=hasProject=hasWorkspace=0
  for (i=start; i<=stop; i++) {
    if (lines[i] ~ /"type"[ \t]*:[ \t]*"row"/) isRow=1
    if (lines[i] ~ /"type"[ \t]*:[ \t]*"block"/) isBlock=1
    if (lines[i] ~ /"id"[ \t]*:[ \t]*"status-original"/) hasOriginal=1
    if (lines[i] ~ /"mod"[ \t]*:[ \t]*"project-open"/) hasProject=1
    if (lines[i] ~ /"mod"[ \t]*:[ \t]*"workspace-status"/) hasWorkspace=1
  }
  if (isRow) {
    if (!hasOriginal || !hasProject || !hasWorkspace) {
      fail("cannot collapse customized status row safely")
    }
  } else if (!isBlock || (!hasWorkspace && !hasProject)) {
    fail("unexpected status content; expected workspace-status block")
  }
  if (bad) exit 2

  for (i=1; i<=NR; i++) {
    if (oldSidebarStart && i>=oldSidebarStart && i<=oldSidebarEnd) continue

    if (i==start && isRow) {
      # We only collapse the known old status row into the original block.
      pad=indent(lines[start])
      suffix=(lines[stop] ~ /,[ \t]*$/ ? "," : "")
      print pad "{"
      print pad "  \"id\": \"status\","
      print pad "  \"type\": \"block\","
      print pad "  \"size\": {\"px\": 28},"
      print pad "  \"content\": {\"mod\": \"project-open\"}"
      print pad "}" suffix
      i=stop
      continue
    }
    line=lines[i]
    if (i>=start && i<=stop && hasWorkspace && line ~ /"mod"[ \t]*:[ \t]*"workspace-status"/)
      sub(/"workspace-status"/, "\"project-open\"", line)
    print line
  }
}
