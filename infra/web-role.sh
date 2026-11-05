#!/usr/bin/env bash
# Execution role for a web function: logs, plus one data grant per vertical, each behind its own flag:
#   ORDERS_TABLE=1   Query on the orders table             (orders vertical)
#   CARTS_TABLE=1    Query/UpdateItem/DeleteItem on carts   (store vertical)
#   COGNITO_ADMIN=1  the Cognito Admin* sign-in operations  (account vertical, needs COGNITO_USER_POOL_ID)
#   BEDROCK=1        InvokeModel on one vision model         (store vertical, photo search)
# usage: NAME=rsc-mfe-store-web CARTS_TABLE=1 BEDROCK=1 infra/web-role.sh
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
if [ "${CARTS_TABLE:-0}" = "1" ]; then
  aws iam put-role-policy --role-name "$NAME-role" --policy-name cart-access --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"dynamodb:Query\",\"dynamodb:UpdateItem\",\"dynamodb:DeleteItem\"],\"Resource\":\"arn:aws:dynamodb:$REGION:$ACCOUNT:table/rsc-mfe-carts\"}]}"
else
  aws iam delete-role-policy --role-name "$NAME-role" --policy-name cart-access 2>/dev/null || true
fi
if [ "${COGNITO_ADMIN:-0}" = "1" ]; then
  : "${COGNITO_USER_POOL_ID:?}"
  aws iam put-role-policy --role-name "$NAME-role" --policy-name cognito-admin-auth --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"cognito-idp:AdminInitiateAuth\",\"cognito-idp:AdminRespondToAuthChallenge\"],\"Resource\":\"arn:aws:cognito-idp:$REGION:$ACCOUNT:userpool/$COGNITO_USER_POOL_ID\"}]}"
else
  aws iam delete-role-policy --role-name "$NAME-role" --policy-name cognito-admin-auth 2>/dev/null || true
fi
if [ "${BEDROCK:-0}" = "1" ]; then
  # The eu. inference profile in this region, plus the model it routes to in any EU region.
  MODEL=anthropic.claude-haiku-4-5-20251001-v1:0
  aws iam put-role-policy --role-name "$NAME-role" --policy-name photo-search-model --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"bedrock:InvokeModel\",\"Resource\":[\"arn:aws:bedrock:$REGION:$ACCOUNT:inference-profile/eu.$MODEL\",\"arn:aws:bedrock:eu-*::foundation-model/$MODEL\"]}]}"
else
  aws iam delete-role-policy --role-name "$NAME-role" --policy-name photo-search-model 2>/dev/null || true
fi
aws iam get-role --role-name "$NAME-role" --query Role.Arn --output text
