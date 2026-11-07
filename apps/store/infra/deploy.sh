#!/usr/bin/env bash
# Deploys the store app. First run: CREATE=1 apps/store/infra/deploy.sh
# Then, once, add it to the distribution:
#   shells/web/infra/cloudfront-vertical.sh <distribution-id> store <function-endpoint-hostname>
# env: CART_API_URL (the cart service's https endpoint), COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID,
#      PUBLIC_HOST (the CloudFront domain).
set -euo pipefail
: "${CART_API_URL:?}" "${COGNITO_USER_POOL_ID:?}" "${COGNITO_CLIENT_ID:?}"
export ASSET_BASE=/store-static
exec "$(dirname "$0")/../../../scripts/lambda-deploy.sh" apps/store rsc-mfe-store-web \
  --env CART_API_URL="$CART_API_URL" \
  --env COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" --env COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID" \
  ${PUBLIC_HOST:+--env PUBLIC_HOST="$PUBLIC_HOST"}
