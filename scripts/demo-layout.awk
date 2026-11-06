# Derive an opt-in preview layout from a personal herdr-mods layout.
# Reads the mod's "install": "derive:<layout name>" declaration through -v prefix.
# Wraps the tab renderer in a stack so the Agent UI fixture can replace the tab
# body without touching Core, PTYs or any other layout. When the base layout has
# an unexpected shape the input is printed unchanged and the exit status is 3.
function brace_delta(line, x, a, b) {
  x=line; a=gsub(/\{/, "", x)
  x=line; b=gsub(/\}/, "", x)
  return a-b
}
function skip(message) {
  print "Demo layout: " message > "/dev/stderr"
  skipped=1
}
function bail(   i) { for (i=1; i<=NR; i++) print lines[i]; exit 3 }
function indent(line, x) { x=line; sub(/[^ \t].*$/, "", x); return x }
{ lines[NR]=$0 }
END {
  if (prefix == "") prefix="agent-ui-demo"
  if (mod == "") mod="agent-ui"
  bodyStart=bodyEnd=0
  for (i=2; i<=NR; i++) {
    if (lines[i] ~ /^[ \t]*"id"[ \t]*:[ \t]*"work-body"[ \t]*,?[ \t]*$/) {
      if (bodyStart) {skip("multiple work-body nodes"); break}
      bodyStart=i-1
      if (lines[bodyStart] !~ /^[ \t]*\{[ \t]*$/) {skip("unsupported work-body opening"); break}
      depth=0
      for (j=bodyStart; j<=NR; j++) {
        depth+=brace_delta(lines[j])
        if (depth==0) {bodyEnd=j; break}
      }
    }
  }
  if (skipped) bail()
  if (!bodyEnd) skip("expected one complete work-body node")
  if (skipped) bail()

  childStart=childEnd=0
  for (i=bodyStart; i<bodyEnd; i++) {
    if (lines[i] ~ /^[ \t]*"children"[ \t]*:[ \t]*\[[ \t]*$/) {
      for (j=i+1; j<bodyEnd; j++) {
        if (lines[j] ~ /^[ \t]*\{[ \t]*$/) {childStart=j; break}
        if (lines[j] !~ /^[ \t]*$/) break
      }
      break
    }
  }
  if (!childStart) skip("work-body has no first child")
  if (skipped) bail()
  depth=0
  for (j=childStart; j<bodyEnd; j++) {
    depth+=brace_delta(lines[j])
    if (depth==0) {childEnd=j; break}
  }
  if (!childEnd) skip("first work-body child is incomplete")
  if (skipped) bail()

  hasMain=0
  for (i=childStart; i<=childEnd; i++)
    if (lines[i] ~ /^[ \t]*"id"[ \t]*:[ \t]*"main"[ \t]*,?[ \t]*$/) hasMain=1
  if (!hasMain) skip("work-body does not start with the tab renderer; leaving it unchanged")
  if (skipped) bail()

  pad=indent(lines[childStart])
  comma=(lines[childEnd] ~ /,[ \t]*$/ ? "," : "")
  for (i=1; i<=NR; i++) {
    if (i==childStart) {
      print pad "{"
      print pad "  \"id\": \"" prefix "-surface\","
      print pad "  \"type\": \"stack\","
      print pad "  \"active\": \"" prefix "-terminal\","
      print pad "  \"children\": ["
      print pad "    {"
      print pad "      \"id\": \"" prefix "-ui\","
      print pad "      \"type\": \"block\","
      print pad "      \"content\": { \"mod\": \"" mod "\" }"
      print pad "    },"
    }
    line=lines[i]
    if (i>childStart && i<childEnd && line ~ /^[ \t]*"id"[ \t]*:[ \t]*"main"[ \t]*,?[ \t]*$/)
      sub(/"main"/, "\"" prefix "-terminal\"", line)
    if (i>=childStart && i<=childEnd) sub(/^/, "    ", line)
    if (i==childEnd) sub(/,[ \t]*$/, "", line)
    print line
    if (i==childEnd) {
      print pad "  ]"
      print pad "}" comma
    }
  }
}
