#!/usr/bin/env bash
# usage: infra/cloudfront-vertical.sh <distribution-id> <orders-function-endpoint-hostname>
# Adds the orders vertical to the existing distribution: a second origin (same custom-origin
# settings as the account function) and two behaviors ahead of the rest, /orders-static/* for the
# vertical's immutable assets and /orders* for its pages. Behavior order matters: CloudFront takes
# the first pattern that matches, and /orders* would also swallow /orders-static/.
set -euo pipefail
DIST=$1
ORIGIN=$2
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
aws cloudfront get-distribution-config --id "$DIST" > "$TMP"
ETAG=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ETag' "$TMP")
CONFIG=$(node -e '
  const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).DistributionConfig;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const webfn = c.Origins.Items.find((o) => o.Id === "webfn");
  const ordersfn = { ...clone(webfn), Id: "ordersfn", DomainName: process.argv[2] };
  c.Origins.Items = [...c.Origins.Items.filter((o) => o.Id !== "ordersfn"), ordersfn];
  c.Origins.Quantity = c.Origins.Items.length;
  const assets = c.CacheBehaviors.Items.find((b) => b.PathPattern === "/assets/*");
  const staticB = { ...clone(assets), PathPattern: "/orders-static/*", TargetOriginId: "ordersfn" };
  const pageB = { ...clone(c.DefaultCacheBehavior), PathPattern: "/orders*", TargetOriginId: "ordersfn" };
  const keep = c.CacheBehaviors.Items.filter((b) => !["/orders-static/*", "/orders*"].includes(b.PathPattern));
  c.CacheBehaviors.Items = [staticB, pageB, ...keep];
  c.CacheBehaviors.Quantity = c.CacheBehaviors.Items.length;
  process.stdout.write(JSON.stringify(c));' "$TMP" "$ORIGIN")
aws cloudfront update-distribution --id "$DIST" --if-match "$ETAG" --distribution-config "$CONFIG" \
  --query "Distribution.[Id,Status]" --output text
