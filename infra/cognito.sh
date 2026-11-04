#!/usr/bin/env bash
# usage: infra/cognito.sh <relying-party-id> [email] [password]
# One pool, passkeys as a first factor, one seeded user. Prints the env the web function needs.
set -euo pipefail
REGION=${AWS_REGION:-eu-north-1}
RP=$1
EMAIL=${2:-demo@example.com}
PASS=${3:-Demo-pass-1234}

POOL=$(aws cognito-idp create-user-pool --region "$REGION" --pool-name rsc-mfe-demo --user-pool-tier ESSENTIALS \
  --policies '{"PasswordPolicy":{"MinimumLength":8},"SignInPolicy":{"AllowedFirstAuthFactors":["PASSWORD","WEB_AUTHN"]}}' \
  --admin-create-user-config '{"AllowAdminCreateUserOnly":true}' \
  --query UserPool.Id --output text)
aws cognito-idp set-user-pool-mfa-config --region "$REGION" --user-pool-id "$POOL" --mfa-configuration OFF \
  --web-authn-configuration "{\"RelyingPartyId\":\"$RP\",\"UserVerification\":\"required\"}" >/dev/null
# A confidential client: the secret stays in the web function's environment, and sign-in goes through
# the Admin* operations under IAM, so no browser can start a sign-in for this client on its own.
read -r CLIENT SECRET < <(aws cognito-idp create-user-pool-client --region "$REGION" --user-pool-id "$POOL" --client-name web-confidential \
  --explicit-auth-flows ALLOW_USER_AUTH ALLOW_REFRESH_TOKEN_AUTH --generate-secret \
  --query 'UserPoolClient.[ClientId,ClientSecret]' --output text)
aws cognito-idp admin-create-user --region "$REGION" --user-pool-id "$POOL" --username "$EMAIL" --message-action SUPPRESS \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true >/dev/null
aws cognito-idp admin-set-user-password --region "$REGION" --user-pool-id "$POOL" --username "$EMAIL" --password "$PASS" --permanent

echo "COGNITO_USER_POOL_ID=$POOL"
echo "COGNITO_CLIENT_ID=$CLIENT"
echo "COGNITO_CLIENT_SECRET=$SECRET"
