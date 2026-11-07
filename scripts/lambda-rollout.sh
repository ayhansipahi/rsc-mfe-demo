#!/usr/bin/env bash
# Moves an endpoint's traffic between the two newest Active revisions of a Web Function.
# usage: scripts/lambda-rollout.sh <function-name> <weight|rollback> [endpoint-name]
#   <weight>   route that percent of traffic to the newest Active revision, the rest to the
#              revision serving now (10 = canary, 100 = finish the rollout)
#   rollback   route 100% to the revision that served before the newest one
# Always sets the endpoint to Disabled auto-deployment: from then on a deploy creates a revision
# but moves no traffic until this script (or WEIGHT= on deploy) says so. Weights are an endpoint
# setting; the API takes at most two revisions, both Active, summing to 100.
# ponytail: health is yours to judge between steps (logs carry the build id); no automatic rollback.
set -euo pipefail
NAME=$1
STEP=$2
EP=${3:-dev}
REGION=${AWS_REGION:-eu-north-1}
aws() { command aws --region "$REGION" --output json "$@"; }

ACTIVE=$(aws lambda-web list-web-function-revisions --function-name "$NAME" \
  | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8")).revisions.filter(x=>x.state==="Active").map(x=>x.revisionId);process.stdout.write(r.join(" "))')
SERVING=$(aws lambda-web get-web-function-endpoint --function-name "$NAME" --endpoint-name "$EP" \
  | node -e 'const w=JSON.parse(require("fs").readFileSync(0,"utf8")).revisionWeights??[];process.stdout.write(w.sort((a,b)=>b.weight-a.weight).map(x=>x.revisionId).join(" "))')
set -- $ACTIVE; NEWEST=$1; SECOND=${2:-}
# The revision to keep or go back to: whatever serves now that is not the newest, else the second newest.
PREVIOUS=$(for r in $SERVING; do [ "$r" != "$NEWEST" ] && { echo "$r"; break; }; done; true)
PREVIOUS=${PREVIOUS:-$SECOND}

case "$STEP" in
  rollback) [ -n "$PREVIOUS" ] || { echo "no previous revision to roll back to" >&2; exit 1; }
            WEIGHTS="[{\"revisionId\":\"$PREVIOUS\",\"weight\":100}]" ;;
  100)      WEIGHTS="[{\"revisionId\":\"$NEWEST\",\"weight\":100}]" ;;
  *)        [[ "$STEP" =~ ^[1-9][0-9]?$ ]] || { echo "weight must be 1-100 or rollback" >&2; exit 1; }
            [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$NEWEST" ] || { echo "only one Active revision; use 100" >&2; exit 1; }
            WEIGHTS="[{\"revisionId\":\"$PREVIOUS\",\"weight\":$((100 - STEP))},{\"revisionId\":\"$NEWEST\",\"weight\":$STEP}]" ;;
esac
aws lambda-web update-web-function-endpoint --function-name "$NAME" --endpoint-name "$EP" \
  --auto-deployment-mode Disabled --revision-weights "$WEIGHTS" > /dev/null
aws lambda-web wait web-function-endpoint-updated --function-name "$NAME" --endpoint-name "$EP"
echo "$NAME/$EP: $WEIGHTS"
