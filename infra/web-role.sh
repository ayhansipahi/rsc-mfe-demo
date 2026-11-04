#!/usr/bin/env bash
# Execution role for a web function: logs, plus invoke on the orders service when INVOKE_ORDERS=1.
# usage: NAME=rsc-mfe-orders-web INVOKE_ORDERS=1 infra/web-role.sh
set -euo pipefail
REGION=${AWS_REGION:-eu-north-1}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
NAME=${NAME:-rsc-mfe-web}
TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
if ! aws iam get-role --role-name "$NAME-role" >/dev/null 2>&1; then
  aws iam create-role --role-name "$NAME-role" --assume-role-policy-document "$TRUST" >/dev/null
  aws iam attach-role-policy --role-name "$NAME-role" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
fi
if [ "${INVOKE_ORDERS:-0}" = "1" ]; then
  aws iam put-role-policy --role-name "$NAME-role" --policy-name invoke-orders --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:$REGION:$ACCOUNT:function:rsc-mfe-orders\"}]}"
else
  aws iam delete-role-policy --role-name "$NAME-role" --policy-name invoke-orders 2>/dev/null || true
fi
aws iam get-role --role-name "$NAME-role" --query Role.Arn --output text
