#!/usr/bin/env bash
# The orders vertical's data: one DynamoDB table keyed by the Cognito sub. Seeds three rows for
# the demo user. usage: services/orders/infra/table.sh <cognito-sub>
set -euo pipefail
REGION=${AWS_REGION:-eu-north-1}
SUB=$1
NAME=rsc-mfe-orders
aws dynamodb describe-table --region "$REGION" --table-name "$NAME" >/dev/null 2>&1 || {
  aws dynamodb create-table --region "$REGION" --table-name "$NAME" --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=owner,AttributeType=S AttributeName=orderId,AttributeType=S \
    --key-schema AttributeName=owner,KeyType=HASH AttributeName=orderId,KeyType=RANGE >/dev/null
  aws dynamodb wait table-exists --region "$REGION" --table-name "$NAME"
}
for row in "ORD-1TL Keyboard 31.00" "ORD-7XK Monitor 46.00" "ORD-E1J Cable 61.00"; do
  set -- $row
  aws dynamodb put-item --region "$REGION" --table-name "$NAME" \
    --item "{\"owner\":{\"S\":\"$SUB\"},\"orderId\":{\"S\":\"$1\"},\"item\":{\"S\":\"$2\"},\"total\":{\"S\":\"$3\"}}"
done
echo "arn:aws:dynamodb:$REGION:$(aws sts get-caller-identity --query Account --output text):table/$NAME"
