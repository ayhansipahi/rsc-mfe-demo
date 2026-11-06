#!/usr/bin/env bash
# The orders service may Query the orders table and nothing else.
set -euo pipefail
REGION=${AWS_REGION:-eu-north-1}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
exec "$(dirname "$0")/../../../scripts/lambda-role.sh" rsc-mfe-orders-api query-orders \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"dynamodb:Query\",\"Resource\":\"arn:aws:dynamodb:$REGION:$ACCOUNT:table/rsc-mfe-orders\"}]}"
