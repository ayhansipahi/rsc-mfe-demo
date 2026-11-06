#!/usr/bin/env bash
# The cart service may Query, UpdateItem and DeleteItem on the carts table and nothing else.
set -euo pipefail
REGION=${AWS_REGION:-eu-north-1}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
exec "$(dirname "$0")/../../../scripts/lambda-role.sh" rsc-mfe-cart-api cart-access \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"dynamodb:Query\",\"dynamodb:UpdateItem\",\"dynamodb:DeleteItem\"],\"Resource\":\"arn:aws:dynamodb:$REGION:$ACCOUNT:table/rsc-mfe-carts\"}]}"
