#!/bin/sh
# Prints Claude Code's usage (one `control_response` JSON line) and exits.
#
# Runs your own `claude` CLI briefly and sends it the `get_usage` control request
# (undocumented; checked on 2026-11-13). The CLI signs in by itself: this script reads
# no token or credential file, sends no prompt and starts no turn. `--safe-mode` keeps
# hooks, MCP servers and customizations out of it. The account is whichever
# CLAUDE_CONFIG_DIR the caller set (unset for the default one).
# Approach: jmalicki/herdr-mod-ai-usage (MIT), via nozikov/herdr-usage-limits (MIT).
#
# Exit: 0 = printed the reply, 127 = claude CLI not found, 1 = no reply in time.
# Tests: USAGE_CLAUDE_BIN replaces the binary, USAGE_WAIT_TICKS the wait (0.2 s each).

CLAUDE=$(command -v "${USAGE_CLAUDE_BIN:-claude}" 2>/dev/null) || exit 127
ticks=${USAGE_WAIT_TICKS:-75}

dir=$(mktemp -d "${TMPDIR:-/tmp}/usage-claude.XXXXXX") || exit 1
out="$dir/out"

# A regular file, not a FIFO: the CLI still answers a control request it read before
# the end of its input, and $! stays the CLI's own pid, so the kill below reaches it.
printf '%s\n' '{"type":"control_request","request_id":"usage","request":{"subtype":"get_usage","skip_behaviors":true}}' >"$dir/in"
"$CLAUDE" -p --safe-mode --no-session-persistence \
  --input-format stream-json --output-format stream-json --verbose \
  <"$dir/in" >"$out" 2>/dev/null &
pid=$!

i=0
while [ "$i" -lt "$ticks" ]; do
  grep -q '"control_response"' "$out" 2>/dev/null && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.2
  i=$((i + 1))
done
kill "$pid" 2>/dev/null
wait "$pid" 2>/dev/null

status=1
grep -m1 '"control_response"' "$out" && status=0
rm -rf "$dir"
exit $status
