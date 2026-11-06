#!/usr/bin/env bash
# usage: shells/web/infra/cloudfront-vertical.sh <distribution-id> <vertical> <function-endpoint-hostname>
# Adds a vertical to the existing distribution: an origin "<vertical>fn" (same custom-origin settings
# as the account function) and two behaviors ahead of the rest, /<vertical>-static/* for its assets
# and fragments and /<vertical>* for its pages. Behavior order matters: CloudFront takes the first
# pattern that matches, and /<vertical>* would also swallow /<vertical>-static/.
# Used for: shell (/shell-static), orders (/orders, /orders-static) and store (/store, /store-static).
set -euo pipefail
DIST=$1
VERTICAL=$2
ORIGIN=$3
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
aws cloudfront get-distribution-config --id "$DIST" > "$TMP"
ETAG=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ETag' "$TMP")
CONFIG=$(node -e '
  const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).DistributionConfig;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const webfn = c.Origins.Items.find((o) => o.Id === "webfn");
  const v = process.argv[3];
  const id = `${v}fn`;
  const fn = { ...clone(webfn), Id: id, DomainName: process.argv[2] };
  c.Origins.Items = [...c.Origins.Items.filter((o) => o.Id !== id), fn];
  c.Origins.Quantity = c.Origins.Items.length;
  const assets = c.CacheBehaviors.Items.find((b) => b.PathPattern === "/assets/*");
  const staticB = { ...clone(assets), PathPattern: `/${v}-static/*`, TargetOriginId: id };
  const pageB = { ...clone(c.DefaultCacheBehavior), PathPattern: `/${v}*`, TargetOriginId: id };
  const keep = c.CacheBehaviors.Items.filter((b) => ![`/${v}-static/*`, `/${v}*`].includes(b.PathPattern));
  c.CacheBehaviors.Items = [staticB, pageB, ...keep];
  c.CacheBehaviors.Quantity = c.CacheBehaviors.Items.length;
  process.stdout.write(JSON.stringify(c));' "$TMP" "$ORIGIN" "$VERTICAL")
aws cloudfront update-distribution --id "$DIST" --if-match "$ETAG" --distribution-config "$CONFIG" \
  --query "Distribution.[Id,Status]" --output text
