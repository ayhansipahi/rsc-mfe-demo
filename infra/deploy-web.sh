#!/usr/bin/env bash
# Builds and deploys one web function. First run: CREATE=1 infra/deploy-web.sh
# Verticals: VERTICAL=account NAME=rsc-mfe-web | VERTICAL=orders NAME=rsc-mfe-orders-web
set -euo pipefail
REGION=${AWS_REGION:-eu-north-1}
NAME=${NAME:-rsc-mfe-web}
VERTICAL=${VERTICAL:-all}
: "${COGNITO_USER_POOL_ID:?}" "${COGNITO_CLIENT_ID:?}"
ROLE_ARN=$(aws iam get-role --role-name "$NAME-role" --query Role.Arn --output text)
cd "$(dirname "$0")/../web"
npm ci --no-fund --no-audit
VERTICAL="$VERTICAL" npm run build
npm prune --omit=dev
aws lambda-web deploy --region "$REGION" --name "$NAME" --code . --execution-role-arn "$ROLE_ARN" \
  ${CREATE:+--create --auth-type ApplicationManaged} \
  --env COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" --env COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID" \
  --env ORDERS_TABLE=rsc-mfe-orders --env VERTICAL="$VERTICAL" \
  ${PUBLIC_HOST:+--env PUBLIC_HOST="$PUBLIC_HOST"} \
  ${APPLE_APP_IDS:+--env APPLE_APP_IDS="$APPLE_APP_IDS"} \
  ${ANDROID_PACKAGE:+--env ANDROID_PACKAGE="$ANDROID_PACKAGE"} \
  ${ANDROID_CERT_SHA256:+--env ANDROID_CERT_SHA256="$ANDROID_CERT_SHA256"}
