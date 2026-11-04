#!/usr/bin/env bash
# Execution role for a web function: logs, plus Query on the orders table when ORDERS_TABLE=1, plus the
# Cognito Admin* sign-in operations on the pool when COGNITO_ADMIN=1 (needs COGNITO_USER_POOL_ID).
# usage: NAME=rsc-mfe-orders-web ORDERS_TABLE=1 infra/web-role.sh | NAME=rsc-mfe-web COGNITO_ADMIN=1 infra/web-role.sh
# No function invokes another function: the vertical that owns the data reads its own table.
set -euo pipefail
REGION=${AWS_REGION:-eu-north-1}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
NAME=${NAME:-rsc-mfe-web}
TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
if ! aws iam get-role --role-name "$NAME-role" >/dev/null 2>&1; then
  aws iam create-role --role-name "$NAME-role" --assume-role-policy-document "$TRUST" >/dev/null
  aws iam attach-role-policy --role-name "$NAME-role" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
fi
aws iam delete-role-policy --role-name "$NAME-role" --policy-name invoke-orders 2>/dev/null || true
if [ "${ORDERS_TABLE:-0}" = "1" ]; then
  aws iam put-role-policy --role-name "$NAME-role" --policy-name query-orders --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"dynamodb:Query\",\"Resource\":\"arn:aws:dynamodb:$REGION:$ACCOUNT:table/rsc-mfe-orders\"}]}"
else
  aws iam delete-role-policy --role-name "$NAME-role" --policy-name query-orders 2>/dev/null || true
fi
if [ "${COGNITO_ADMIN:-0}" = "1" ]; then
  : "${COGNITO_USER_POOL_ID:?}"
  aws iam put-role-policy --role-name "$NAME-role" --policy-name cognito-admin-auth --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"cognito-idp:AdminInitiateAuth\",\"cognito-idp:AdminRespondToAuthChallenge\"],\"Resource\":\"arn:aws:cognito-idp:$REGION:$ACCOUNT:userpool/$COGNITO_USER_POOL_ID\"}]}"
else
  aws iam delete-role-policy --role-name "$NAME-role" --policy-name cognito-admin-auth 2>/dev/null || true
fi
aws iam get-role --role-name "$NAME-role" --query Role.Arn --output text
