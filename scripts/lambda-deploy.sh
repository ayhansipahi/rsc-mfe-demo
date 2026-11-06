#!/usr/bin/env bash
# The mechanical half of every package's infra/deploy.sh: install the workspace, build one package,
# give it its own node_modules, and ship that directory as a Lambda Web Function.
# usage: scripts/lambda-deploy.sh <workspace-path> <function-name> [aws lambda-web deploy args...]
# env: CREATE=1 for the first deploy, DRY=1 to stop before the AWS call, AWS_REGION (eu-north-1).
set -euo pipefail
PKG=$1
NAME=$2
shift 2
REGION=${AWS_REGION:-eu-north-1}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
npm ci --no-fund --no-audit
npm run build -w "$PKG"
cd "$PKG"
# Workspaces hoist dependencies to the root; the function gets its own copy, with workspace packages
# copied in (--install-links) instead of symlinked. The lockfile this writes is not the workspace's.
rm -rf node_modules
npm install --omit=dev --workspaces=false --install-links --no-fund --no-audit
rm -f package-lock.json
# The isolated install brought its own react-router: patch that copy too (no-op where absent).
node "$ROOT/scripts/patch-react-router.mjs"
[ -n "${DRY:-}" ] && { echo "DRY: would deploy $PKG as $NAME"; exit 0; }
ROLE_ARN=$(aws iam get-role --role-name "$NAME-role" --query Role.Arn --output text)
aws lambda-web deploy --region "$REGION" --name "$NAME" --code . --execution-role-arn "$ROLE_ARN" \
  ${CREATE:+--create --auth-type ApplicationManaged} "$@"
