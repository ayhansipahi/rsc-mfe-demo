#!/usr/bin/env bash
# The account app signs users in: the Cognito Admin* auth operations on the one pool, nothing else.
# usage: COGNITO_USER_POOL_ID=... apps/account/infra/role.sh
set -euo pipefail
: "${COGNITO_USER_POOL_ID:?}"
REGION=${AWS_REGION:-eu-north-1}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
exec "$(dirname "$0")/../../../scripts/lambda-role.sh" rsc-mfe-web cognito-admin-auth \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"cognito-idp:AdminInitiateAuth\",\"cognito-idp:AdminRespondToAuthChallenge\"],\"Resource\":\"arn:aws:cognito-idp:$REGION:$ACCOUNT:userpool/$COGNITO_USER_POOL_ID\"}]}"
