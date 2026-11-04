#!/usr/bin/env bash
# usage: infra/cloudfront-domain.sh <distribution-id> <domain> <acm-certificate-arn-in-us-east-1>
# Puts a custom domain on the distribution. The certificate must be issued in us-east-1 and the
# domain's DNS must CNAME to the distribution (DNS only, not proxied by another CDN).
# After this, the passkey relying party ID and PUBLIC_HOST must move to the same domain:
# infra/cognito-rp.sh <domain>, then redeploy both web functions with PUBLIC_HOST=<domain>.
set -euo pipefail
DIST=$1
DOMAIN=$2
CERT=$3
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
aws cloudfront get-distribution-config --id "$DIST" > "$TMP"
ETAG=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ETag' "$TMP")
CONFIG=$(node -e '
  const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).DistributionConfig;
  const items = new Set(c.Aliases?.Items ?? []);
  items.add(process.argv[2]);
  c.Aliases = { Quantity: items.size, Items: [...items] };
  c.ViewerCertificate = {
    ACMCertificateArn: process.argv[3],
    SSLSupportMethod: "sni-only",
    MinimumProtocolVersion: "TLSv1.2_2021",
    CloudFrontDefaultCertificate: false,
  };
  process.stdout.write(JSON.stringify(c));' "$TMP" "$DOMAIN" "$CERT")
aws cloudfront update-distribution --id "$DIST" --if-match "$ETAG" --distribution-config "$CONFIG" \
  --query "Distribution.[Id,Status,DistributionConfig.Aliases.Items]" --output text
