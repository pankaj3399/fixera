#!/usr/bin/env bash
# Run the professional-lead / invitation-campaign wire fixture generator against
# a private, disposable MongoDB 7 container.
#
# Isolation:
#   - a unique container name and random loopback port for this invocation
#   - the container uses host networking so the single-node replica set can
#     advertise 127.0.0.1:<port> and be reached by Mongoose
#   - only the generator-owned database
#     fixera_lead_campaign_wire_fixtures_test is dropped
#   - the container is removed on exit, success or failure
#
# It does not reuse the reviewer's Mongo container, port 27027, or any
# integration test database. No provider, email, S3, Stripe, Brevo, Odoo or SMS
# call is made; the generator denies non-loopback HTTP(S)/fetch/net/tls before
# importing backend modules.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
SERVER_ROOT="${FIXERA_SERVER_DIR:-$(cd "$FRONTEND_ROOT/.." && pwd)/fixera-server}"
TSX="$SERVER_ROOT/node_modules/.bin/tsx"
MONGO_IMAGE="${FIXERA_WIRE_MONGO_IMAGE:-mongo:7}"

if [[ ! -x "$TSX" ]]; then
  echo "FAIL missing backend tsx at $TSX" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "FAIL docker is required for the private disposable Mongo container" >&2
  exit 1
fi

NAME="fixera-lead-campaign-wire-$$-$(date +%s)"
SCRATCH="$(mktemp -d /tmp/opencode/fixera-lead-wire.XXXXXX)"
STAGING="$SCRATCH/fixtures"
PORT=""

mkdir -p "$STAGING"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$SCRATCH"
}
trap cleanup EXIT INT TERM

if ! docker image inspect "$MONGO_IMAGE" >/dev/null 2>&1; then
  echo "FAIL docker image $MONGO_IMAGE is not present locally; pull it explicitly before running" >&2
  exit 1
fi

for candidate in $(shuf -i 27400-27900 -n 80); do
  if ! ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${candidate}$"; then
    PORT="$candidate"
    break
  fi
done
if [[ -z "$PORT" ]]; then
  echo "FAIL could not find a free loopback port" >&2
  exit 1
fi

echo "container      $NAME"
echo "mongo port     $PORT (loopback only, host network)"
echo "database       fixera_lead_campaign_wire_fixtures_test"
echo "server         $SERVER_ROOT"

docker run --rm -d \
  --name "$NAME" \
  --network host \
  "$MONGO_IMAGE" \
  --replSet rs0 \
  --bind_ip 127.0.0.1 \
  --port "$PORT" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if docker exec "$NAME" mongosh --quiet --port "$PORT" --eval 'db.adminCommand({ping:1}).ok' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  docker logs "$NAME" >&2 || true
  echo "FAIL disposable mongod did not become ready" >&2
  exit 1
fi

docker exec "$NAME" mongosh --quiet --port "$PORT" --eval \
  'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:'"$PORT"'"}]})' >/dev/null

primary=0
for _ in $(seq 1 60); do
  if docker exec "$NAME" mongosh --quiet --port "$PORT" --eval 'db.hello().isWritablePrimary' 2>/dev/null | grep -q true; then
    primary=1
    break
  fi
  sleep 1
done
if [[ "$primary" != "1" ]]; then
  docker logs "$NAME" >&2 || true
  echo "FAIL disposable mongod did not elect a primary" >&2
  exit 1
fi

cd "$FRONTEND_ROOT"
FIXERA_TEST_MONGODB_URI="mongodb://127.0.0.1:${PORT}/fixera_lead_campaign_wire_fixtures_test?replicaSet=rs0" \
FIXERA_WIRE_OUT_DIR="$STAGING" \
  "$TSX" tests/fixtures/leadCampaigns/wire/generate-wire-fixtures.mjs

# Publish only after the complete run succeeded, so a failed generation cannot
# leave a mixed fixture set behind.
find "$SCRIPT_DIR" -maxdepth 1 -name '*.json' -delete
cp "$STAGING"/*.json "$SCRIPT_DIR"/

echo "fixtures written under $SCRIPT_DIR"
