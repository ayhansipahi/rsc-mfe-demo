#!/usr/bin/env bash
# The store app's only AWS call is the photo search's vision model: InvokeModel on that one model.
# Carts live behind the cart service; no table access here.
set -euo pipefail
REGION=${AWS_REGION:-eu-north-1}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
# The eu. inference profile in this region, plus the model it routes to in any EU region.
MODEL=anthropic.claude-haiku-4-5-20251001-v1:0
exec "$(dirname "$0")/../../../scripts/lambda-role.sh" rsc-mfe-store-web photo-search-model \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"bedrock:InvokeModel\",\"Resource\":[\"arn:aws:bedrock:$REGION:$ACCOUNT:inference-profile/eu.$MODEL\",\"arn:aws:bedrock:eu-*::foundation-model/$MODEL\"]}]}"
