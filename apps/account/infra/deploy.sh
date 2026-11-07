#!/usr/bin/env bash
# Deploys the account app: the distribution's default origin (rsc-mfe-web). First run: CREATE=1 apps/account/infra/deploy.sh
# env: COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET (if the client has one),
#      PUBLIC_HOST (the CloudFront domain), APPLE_APP_IDS, ANDROID_PACKAGE, ANDROID_CERT_SHA256 (mobile passkeys).
set -euo pipefail
: "${COGNITO_USER_POOL_ID:?}" "${COGNITO_CLIENT_ID:?}"
export ASSET_BASE=
exec "$(dirname "$0")/../../../scripts/lambda-deploy.sh" apps/account rsc-mfe-web \
  --env COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" --env COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID" \
  ${COGNITO_CLIENT_SECRET:+--env COGNITO_CLIENT_SECRET="$COGNITO_CLIENT_SECRET"} \
  ${PUBLIC_HOST:+--env PUBLIC_HOST="$PUBLIC_HOST"} \
  ${APPLE_APP_IDS:+--env APPLE_APP_IDS="$APPLE_APP_IDS"} \
  ${ANDROID_PACKAGE:+--env ANDROID_PACKAGE="$ANDROID_PACKAGE"} \
  ${ANDROID_CERT_SHA256:+--env ANDROID_CERT_SHA256="$ANDROID_CERT_SHA256"}
