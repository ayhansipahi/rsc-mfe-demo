#!/usr/bin/env bash
# usage: infra/cognito-rp.sh <relying-party-id>  (passkeys already registered stay bound to the old RP ID)
set -euo pipefail
REGION=${AWS_REGION:-eu-north-1}
: "${COGNITO_USER_POOL_ID:?}"
aws cognito-idp set-user-pool-mfa-config --region "$REGION" --user-pool-id "$COGNITO_USER_POOL_ID" --mfa-configuration OFF \
  --web-authn-configuration "{\"RelyingPartyId\":\"$1\",\"UserVerification\":\"required\"}" --query WebAuthnConfiguration --output json
