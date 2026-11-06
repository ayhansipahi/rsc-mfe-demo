#!/usr/bin/env bash
# The store vertical's carts: one item per cart line, keyed by the Cognito sub and the product id.
# usage: services/cart/infra/table.sh
set -euo pipefail
REGION=${AWS_REGION:-eu-north-1}
NAME=rsc-mfe-carts
aws dynamodb describe-table --region "$REGION" --table-name "$NAME" >/dev/null 2>&1 || {
  aws dynamodb create-table --region "$REGION" --table-name "$NAME" --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=owner,AttributeType=S AttributeName=productId,AttributeType=S \
    --key-schema AttributeName=owner,KeyType=HASH AttributeName=productId,KeyType=RANGE >/dev/null
  aws dynamodb wait table-exists --region "$REGION" --table-name "$NAME"
}
echo "arn:aws:dynamodb:$REGION:$(aws sts get-caller-identity --query Account --output text):table/$NAME"
