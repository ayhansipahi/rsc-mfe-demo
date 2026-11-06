#!/usr/bin/env bash
# Deploys the orders service. First run: CREATE=1 services/orders/infra/deploy.sh
# The function's endpoint hostname is what the orders app gets as ORDERS_API_URL.
set -euo pipefail
: "${COGNITO_USER_POOL_ID:?}" "${COGNITO_CLIENT_ID:?}"
exec "$(dirname "$0")/../../../scripts/lambda-deploy.sh" services/orders rsc-mfe-orders-api \
  --env ORDERS_TABLE=rsc-mfe-orders --env COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" --env COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID"
