#!/usr/bin/env bash
# usage: shells/web/infra/cloudfront.sh <web-function-endpoint-hostname>
# One distribution in front of the web function: custom cache policy (no Host header in the key,
# query strings for _routes), AllViewerExceptHostHeader, keepalive 60 s. Prints the domain name.
set -euo pipefail
ORIGIN=$1
cd "$(dirname "$0")/cloudfront"
POLICY_ID=$(aws cloudfront list-cache-policies --type custom --query "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='rsc-mfe-origin-cc-qs'].CachePolicy.Id" --output text)
if [ -z "$POLICY_ID" ] || [ "$POLICY_ID" = "None" ]; then
  POLICY_ID=$(node -e '
    const p=JSON.parse(require("fs").readFileSync("cache-policy.json","utf8")); p.Name="rsc-mfe-origin-cc-qs";
    process.stdout.write(JSON.stringify(p));' | aws cloudfront create-cache-policy --cache-policy-config file:///dev/stdin --query CachePolicy.Id --output text)
fi
CONFIG=$(node -e '
  const t=JSON.parse(require("fs").readFileSync("distribution.json","utf8")).DistributionConfig;
  t.CallerReference="rsc-mfe-"+Date.now();
  t.Comment="rsc-mfe-demo: RSC micro-frontend on a Lambda Web Function";
  t.Origins.Items[0].DomainName=process.argv[1];
  t.DefaultCacheBehavior.CachePolicyId=process.argv[2];
  delete t.DefaultCacheBehavior.ResponseHeadersPolicyId;
  process.stdout.write(JSON.stringify(t));' "$ORIGIN" "$POLICY_ID")
aws cloudfront create-distribution --distribution-config "$CONFIG" --query "Distribution.[Id,DomainName]" --output text
