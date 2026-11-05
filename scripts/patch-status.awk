# Patch project-open into the status bar, preserving the original status mod.
# Accepts standard Herdr layout JSON; no external JSON/Node/Python dependencies.
# Called only for project-open. The installer makes a backup before applying output.
function brace_delta(line, x, a, b) {
  x=line; a=gsub(/\{/, "", x)
  x=line; b=gsub(/\}/, "", x)
  return a-b
}
function die(msg) { print "Status layout patch: " msg > "/dev/stderr"; exit 2 }
function indent_of(line, x) {
  x=line; sub(/[^ \t].*$/, "", x); return x
}
{
  a[NR]=$0
}
END {
  statusCount=0
  for (i=2; i<=NR; i++) {
    if (a[i] ~ /^[ \t]*"id"[ \t]*:[ \t]*"status"[ \t]*,?[ \t]*$/) {
      statusCount++
      start=i-1
      if (a[start] !~ /^[ \t]*\{[ \t]*$/) die("unsupported status node format")
      depth=0; stop=0
      for (j=start; j<=NR; j++) {
        depth+=brace_delta(a[j])
        if (depth==0) {stop=j; break}
      }
      if (!stop) die("unterminated status node")
    }
  }
  if (statusCount!=1) die("expected exactly one status node")
  ready=0
  for (i=start; i<=stop; i++) {
    if (a[i] ~ /"mod"[ \t]*:[ \t]*"project-open"/) ready=1
  }
  if (!ready) {
    if (a[start+2] !~ /"type"[ \t]*:[ \t]*"block"/) {
      # The parent layout was customized beyond the known main.json structure.
      die("status is not a supported block; leaving layout unchanged")
    }
  }
  # Previous shell releases inserted a one-line block before sidebar-footer.
  oldStart=oldEnd=0
  for (i=1; i<start; i++) {
    if (a[i] ~ /"id"[ \t]*:[ \t]*"project-open"/) {
      if (a[i] ~ /^[ \t]*\{"id":"project-open"/) {
        oldStart=oldEnd=i
      } else if (a[i-1] ~ /^[ \t]*\{[ \t]*$/) {
        oldStart=i-1; depth=0
        for (j=oldStart; j<start; j++) {
          depth+=brace_delta(a[j])
          if (depth==0) {oldEnd=j; break}
        }
        if (!oldEnd) die("old sidebar node is malformed")
      } else die("unrecognized existing project-open placement")
      break
    }
  }
  # Preserve everything except the previous sidebar position (when migrating).
  for (i=1; i<=NR; i++) {
    if (oldStart && i>=oldStart && i<=oldEnd) continue
    if (i!=start || ready) { print a[i]; continue }
    pad=indent_of(a[start])
    # Turn the existing status block into an elastic child of a row.
    print pad "{"
    print pad "  \"id\": \"status\","
    print pad "  \"type\": \"row\","
    print pad "  \"size\": {\"px\": 28},"
    print pad "  \"children\": ["
    skippedSize=0
    for (j=start; j<=stop; j++) {
      line=a[j]
      if (j==stop) {
        sub(/,[ \t]*$/, "", line)
        print line ","
        continue
      }
      if (line ~ /"id"[ \t]*:[ \t]*"status"/) sub(/"status"/, "\"status-original\"", line)
      if (line ~ /^[ \t]*"size"[ \t]*:[ \t]*\{/) {
        print indent_of(line) "\"size\": {\"weight\": 1},"
        skippedSize=1
        continue
      }
      if (skippedSize) {
        if (line ~ /^[ \t]*\}[ \t]*,?[ \t]*$/) skippedSize=0
        continue
      }
      print line
    }
    print pad "    {\"id\":\"project-open\",\"type\":\"block\",\"size\":{\"px\":32},\"content\":{\"mod\":\"project-open\"}}"
    print pad "  ]"
    endLine=a[stop]
    suffix=(endLine ~ /,[ \t]*$/ ? "," : "")
    print pad "}" suffix
    i=stop
  }
}
