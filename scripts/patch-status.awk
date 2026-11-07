# Patch the status area so Mods can share it without adding layout space.
# Handles the stock status block, the old split-row implementation and a bar with
# its own children; also removes the old sidebar button. Other people's Mods are
# nobody's business here: anything already sitting in that corner is carried over,
# and a bar this script does not recognise is printed unchanged with exit status 3.
function brace_delta(line, x, a, b) {
  x=line; a=gsub(/\{/, "", x)
  x=line; b=gsub(/\}/, "", x)
  return a-b
}
function bracket_delta(line, x, a, b) {
  x=line; a=gsub(/\[/, "", x)
  x=line; b=gsub(/\]/, "", x)
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

  isRow=isBlock=hasWorkspace=hasProject=0
  for (i=start; i<=stop; i++) {
    if (lines[i] ~ /"type"[ \t]*:[ \t]*"row"/) isRow=1
    if (lines[i] ~ /"type"[ \t]*:[ \t]*"block"/) isBlock=1
    if (lines[i] ~ /"mod"[ \t]*:[ \t]*"workspace-status"/) hasWorkspace=1
    if (lines[i] ~ /"mod"[ \t]*:[ \t]*"project-open"/) hasProject=1
  }
  if (!isRow && (!isBlock || (!hasWorkspace && !hasProject))) skip("status bar is customized; leaving it unchanged")
  if (skipped) bail()

  # Whatever already lives in the bar belongs to somebody else: carry it over.
  arrStart=arrEnd=0
  for (i=start; i<=stop; i++) {
    if (!arrStart && lines[i] ~ /"children"[ \t]*:[ \t]*\[/) arrStart=i
  }
  kept=0; items=0
  if (arrStart) {
    depth=0
    for (i=arrStart; i<=stop; i++) {
      depth+=bracket_delta(lines[i])
      if (depth==0) {arrEnd=i; break}
    }
    itemStart=0; depth=0
    for (i=arrStart+1; i<arrEnd; i++) {
      if (!itemStart && lines[i] ~ /^[ \t]*\{/) {itemStart=i; depth=0}
      if (!itemStart) continue
      depth+=brace_delta(lines[i])
      if (depth!=0) continue
      items++
      item=""
      for (j=itemStart; j<=i; j++) item = item lines[j] "\n"
      if (item !~ /"mod"[ \t]*:[ \t]*"workspace-status"/ \
          && item !~ /"id"[ \t]*:[ \t]*"(status-original|project-open)"/) {
        kept++
        keepFrom[kept]=itemStart
        keepTo[kept]=i
      }
      itemStart=0
    }
  }
  migrate = !isRow || kept < items
  if (!migrate) { for (i=1; i<=NR; i++) print lines[i]; exit 0 }

  pad=indent(lines[start])
  suffix=(lines[stop] ~ /,[ \t]*$/ ? "," : "")
  for (i=1; i<=NR; i++) {
    if (oldSidebarStart && i>=oldSidebarStart && i<=oldSidebarEnd) continue
    if (i!=start) { print lines[i]; continue }
    print pad "{"
    print pad "  \"id\": \"status\","
    print pad "  \"type\": \"row\","
    if (kept) {
      print pad "  \"size\": {\"px\": 28},"
      print pad "  \"children\": ["
      for (k=1; k<=kept; k++) {
        for (j=keepFrom[k]; j<=keepTo[k]; j++) {
          if (j!=keepTo[k]) { print lines[j]; continue }
          line=lines[j]
          if (k<kept) { if (line !~ /,[ \t]*$/) line=line "," }
          else sub(/,[ \t]*$/, "", line)
          print line
        }
      }
      print pad "  ]"
    } else {
      print pad "  \"size\": {\"px\": 28}"
    }
    print pad "}" suffix
    i=stop
  }
}
