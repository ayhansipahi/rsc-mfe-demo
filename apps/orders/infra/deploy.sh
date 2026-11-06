#!/usr/bin/env bash
# Deploys the orders app. First run: CREATE=1 apps/orders/infra/deploy.sh
# Then, once, add it to the distribution:
#   shells/web/infra/cloudfront-vertical.sh <distribution-id> orders <function-endpoint-hostname>
# env: ORDERS_API_URL (the orders service's https endpoint), COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID,
#      PUBLIC_HOST (the CloudFront domain).
set -euo pipefail
: "${ORDERS_API_URL:?}" "${COGNITO_USER_POOL_ID:?}" "${COGNITO_CLIENT_ID:?}"
exec "$(dirname "$0")/../../../scripts/lambda-deploy.sh" apps/orders rsc-mfe-orders-web \
  --env ORDERS_API_URL="$ORDERS_API_URL" \
  --env COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" --env COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID" \
  ${PUBLIC_HOST:+--env PUBLIC_HOST="$PUBLIC_HOST"}
