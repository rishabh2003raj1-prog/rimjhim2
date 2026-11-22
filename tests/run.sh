#!/usr/bin/env bash
# Runs every test suite in tests/ against a fresh local server (wrangler dev with a local D1
# database), one server per suite so suites can't affect each other. Prints only failures.
#   bash tests/run.sh              all suites
#   bash tests/run.sh counter po   only tests/counter.cjs and tests/po.cjs
# Needs: npm ci, the "playwright" npm package with Chromium, and APP_PIN=1234 in .dev.vars
# (the tests sign in with that PIN; it is only for the local test server).
set -u
cd "$(dirname "$0")/.."
OUT="${S:-$PWD/tests/out}"; mkdir -p "$OUT"
[ -f .dev.vars ] || echo "APP_PIN=1234" > .dev.vars
# The test server runs without the AI binding (it needs a Cloudflare account).
python3 - <<'PY'
import re
s = open('wrangler.jsonc').read()
s = re.sub(r'"ai"\s*:\s*\{[^}]*\},?', '', s)
open('wrangler.test.jsonc', 'w').write(s)
PY
start_server(){
  ps -eo pid,args | grep -E "workerd|wrangler dev" | grep -v grep | awk '{print $1}' | xargs -r kill 2>/dev/null; sleep 1
  rm -rf .wrangler/state
  (npx wrangler dev -c wrangler.test.jsonc --port 8787 > "$OUT/dev.log" 2>&1 &)
  for i in $(seq 1 45); do sleep 2; c=$(curl -s -m 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8787/api/session); [ "$c" != "000" ] && return 0; done
  echo "server did not start"; tail -20 "$OUT/dev.log"; return 1
}
if [ $# -gt 0 ]; then files=""; for n in "$@"; do files="$files tests/${n%.cjs}.cjs"; done; else files=$(ls tests/*.cjs); fi
fails=0; count=0
for f in $files; do
  count=$((count+1))
  start_server || { fails=$((fails+1)); continue; }
  out=$(S="$OUT" timeout 600 node "$f" 2>&1); code=$?
  bad=$(echo "$out" | grep -E "^FAIL|Error:|TimeoutError" | head -6)
  if [ -n "$bad" ] || [ $code -ne 0 ]; then fails=$((fails+1)); echo "== $f"; echo "${bad:-exit code $code}"; echo "$out" | tail -5; fi
done
ps -eo pid,args | grep -E "workerd|wrangler dev" | grep -v grep | awk '{print $1}' | xargs -r kill 2>/dev/null
echo "$count suites, $fails failed"
[ $fails -eq 0 ]
