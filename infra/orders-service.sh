#!/usr/bin/env bash
# Creates (or updates) the private orders Lambda. No URL, no trigger: invoke-only.
set -euo pipefail
REGION=${AWS_REGION:-eu-north-1}
NAME=rsc-mfe-orders
cd "$(dirname "$0")/../services/orders"
ZIP=$(mktemp -t orders).zip
zip -q -j "$ZIP" index.mjs

TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
if ! ROLE_ARN=$(aws iam get-role --role-name "$NAME-role" --query Role.Arn --output text 2>/dev/null); then
  ROLE_ARN=$(aws iam create-role --role-name "$NAME-role" --assume-role-policy-document "$TRUST" --query Role.Arn --output text)
  aws iam attach-role-policy --role-name "$NAME-role" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  sleep 10 # IAM propagation before the first create-function
fi

if aws lambda get-function --region "$REGION" --function-name "$NAME" >/dev/null 2>&1; then
  aws lambda update-function-code --region "$REGION" --function-name "$NAME" --zip-file "fileb://$ZIP" --query FunctionArn --output text
else
  aws lambda create-function --region "$REGION" --function-name "$NAME" --runtime nodejs24.x --architectures arm64 \
    --handler index.handler --role "$ROLE_ARN" --zip-file "fileb://$ZIP" --query FunctionArn --output text
fi
