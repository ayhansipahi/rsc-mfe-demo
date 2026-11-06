#!/usr/bin/env bash
# Execution role for one function: logs, plus whatever inline policies the caller passes.
# usage: scripts/lambda-role.sh <function-name> [policy-name policy-json]...
# Prints the role ARN. Each package's infra/role.sh calls this with only the grants it needs:
# no function can reach another team's data.
set -euo pipefail
NAME=$1
shift
TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
if ! aws iam get-role --role-name "$NAME-role" >/dev/null 2>&1; then
  aws iam create-role --role-name "$NAME-role" --assume-role-policy-document "$TRUST" >/dev/null
  aws iam attach-role-policy --role-name "$NAME-role" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
fi
while [ $# -ge 2 ]; do
  aws iam put-role-policy --role-name "$NAME-role" --policy-name "$1" --policy-document "$2"
  shift 2
done
aws iam get-role --role-name "$NAME-role" --query Role.Arn --output text
