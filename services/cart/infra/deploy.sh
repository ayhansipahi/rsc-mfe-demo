#!/usr/bin/env bash
# Deploys the cart service. First run: CREATE=1 services/cart/infra/deploy.sh
# The function's endpoint hostname is what the store app gets as CART_API_URL.
set -euo pipefail
: "${COGNITO_USER_POOL_ID:?}" "${COGNITO_CLIENT_ID:?}"
exec "$(dirname "$0")/../../../scripts/lambda-deploy.sh" services/cart rsc-mfe-cart-api \
  --env CARTS_TABLE=rsc-mfe-carts --env COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" --env COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID"
