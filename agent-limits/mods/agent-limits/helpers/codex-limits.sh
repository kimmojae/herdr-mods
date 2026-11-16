#!/bin/sh
# Prints Codex's rate limits (the JSON-RPC reply with "id":2) and exits.
#
# Asks `codex app-server`: initialize, initialized, account/rateLimits/read. Codex signs
# in by itself; this script reads no token and sends no prompt.
# Approach: nozikov/herdr-usage-limits (MIT), helpers/codex-limits.sh.
#
# Exit: 0 = printed the reply, 127 = codex CLI not found, 1 = no reply in time.
# Tests: USAGE_CODEX_BIN replaces the binary, USAGE_WAIT_TICKS the wait (0.2 s each).

CODEX=$(command -v "${USAGE_CODEX_BIN:-codex}" 2>/dev/null) || exit 127
ticks=${USAGE_WAIT_TICKS:-75}

dir=$(mktemp -d "${TMPDIR:-/tmp}/usage-codex.XXXXXX") || exit 1
out="$dir/out"
mkfifo "$dir/in" || { rm -rf "$dir"; exit 1; }

"$CODEX" app-server <"$dir/in" >"$out" 2>/dev/null &
pid=$!
exec 3>"$dir/in"
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"herdr-agent-limits","version":"1.0"}}}' >&3
printf '%s\n' '{"jsonrpc":"2.0","method":"initialized"}' >&3
printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"account/rateLimits/read","params":{}}' >&3

i=0
while [ "$i" -lt "$ticks" ]; do
  grep -q '"id":2' "$out" 2>/dev/null && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.2
  i=$((i + 1))
done
exec 3>&-
kill "$pid" 2>/dev/null
wait "$pid" 2>/dev/null

status=1
grep -m1 '"id":2' "$out" && status=0
rm -rf "$dir"
exit $status
