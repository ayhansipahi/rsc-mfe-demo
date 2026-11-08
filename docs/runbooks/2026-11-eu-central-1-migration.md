# Runbook: move prod from eu-north-1 (shell scripts) to eu-central-1 (CDK pipeline)

One time, run by the account admin (`644789169398`). Not part of the template's normal flow.
Old resources live in `eu-north-1`; new ones in `eu-central-1`.

## 1. Bootstrap and GitHub settings

Follow "One-time setup" in the README, in its order: `AWS_ACCOUNT_ID`, the `staging` and `prod` environments,
branch protection on `main`, then the bootstrap stack (`CreateOidcProvider=false`, this account has the provider).

## 2. Build staging and prod

Merge to `main`. The pipeline deploys staging, waits for approval, then deploys prod. Prod has no `domain`
yet, so it comes up on its CloudFront address without the `rscmfe.sph.sh` alias. The smoke test hits the distribution directly, so it passes regardless of DNS. Get that address:

```bash
aws cloudformation describe-stacks --region eu-central-1 --stack-name rsc-mfe-prod-edge \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionUrl'].OutputValue" --output text
```

## 3. Cutover (a few minutes of downtime)

Prerequisite: a domain is attached to staging and sign-in is verified on it (sign-in, sign-up, logout and
cart writes need the stage's domain, see "Attaching a domain" in the README). Do not cut prod over before that.

Users and passkeys do not carry over: the new pool is empty, so users register again, and iOS passkeys bound
to the old pool fail.

1. In a PR, set prod's domain in `infra/stages.ts`:
   ```ts
   domain: {
     name: "rscmfe.sph.sh",
     certificateArn: "arn:aws:acm:us-east-1:644789169398:certificate/2ce976c9-3236-4a77-bd0a-bcf27799271c",
   },
   ```
   Merge it. Staging deploys, then the prod job waits for approval. Do not approve yet.
2. While the prod job waits, remove the `rscmfe.sph.sh` alias from the old distribution `E38EEA6HS61O94`
   (console, or `aws cloudfront get-distribution-config` / `update-distribution` with the alias removed) and wait:
   ```bash
   aws cloudfront wait distribution-deployed --id E38EEA6HS61O94
   ```
3. Approve the prod deploy. It attaches the alias to the new distribution.
4. The owner points the `rscmfe.sph.sh` CNAME at the new distribution's domain name
   (the `DistributionUrl` host from step 2; it stays the same after the alias is attached).

### Rollback

1. Remove the alias from the new distribution: revert the domain PR and let the pipeline deploy it. In an
   emergency you may remove the alias by hand first, but merge the revert anyway: CloudFormation does not undo
   a manual edit, and the next edge deploy would try to take the alias back. Wait until the new distribution
   is deployed before going on:
   ```bash
   NEW=$(aws cloudformation describe-stack-resources --region eu-central-1 --stack-name rsc-mfe-prod-edge \
     --query "StackResources[?ResourceType=='AWS::CloudFront::Distribution'].PhysicalResourceId | [0]" --output text)
   aws cloudfront wait distribution-deployed --id "$NEW"
   ```
2. Add the `rscmfe.sph.sh` alias back to the old distribution `E38EEA6HS61O94` and wait for
   `aws cloudfront wait distribution-deployed --id E38EEA6HS61O94`.
3. Point the CNAME back at the old distribution.

Keep the old distribution until the old CNAME's TTL has expired everywhere and the new site is verified;
only then go on to section 5.

## 4. Demo user and orders

The new pool is empty. Recreate the App Store review demo user with the same email and password as in the
"Demo Account" fields of the app's review information in App Store Connect
(`docs/app-store/review-notes.txt` only refers to them); do not copy the password anywhere else.

```bash
POOL=$(aws cognito-idp list-user-pools --region eu-central-1 --max-results 20 \
  --query "UserPools[?Name=='rsc-mfe-prod-users'].Id | [0]" --output text)
EMAIL=<demo email from App Store Connect>
aws cognito-idp admin-create-user --region eu-central-1 --user-pool-id "$POOL" --username "$EMAIL" \
  --message-action SUPPRESS --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true
# Type the demo password from App Store Connect. It goes through a private temp file, never the command line
# or shell history. If `cli_history` is enabled in ~/.aws/config, turn it off first: it records requests.
read -rs PASS
F=$(mktemp) && printf '%s' "$PASS" | jq -Rs '{Password: ., Permanent: true}' > "$F"
aws cognito-idp admin-set-user-password --region eu-central-1 --user-pool-id "$POOL" --username "$EMAIL" \
  --cli-input-json "file://$F"
rm -f "$F"; unset PASS
SUB=$(aws cognito-idp admin-get-user --region eu-central-1 --user-pool-id "$POOL" --username "$EMAIL" \
  --query "UserAttributes[?Name=='sub'].Value | [0]" --output text)

while read -r id item total; do
  aws dynamodb put-item --region eu-central-1 --table-name rsc-mfe-prod-orders \
    --item "{\"owner\":{\"S\":\"$SUB\"},\"orderId\":{\"S\":\"$id\"},\"item\":{\"S\":\"$item\"},\"total\":{\"S\":\"$total\"}}"
done <<'ROWS'
ORD-1TL Keyboard 31.00
ORD-7XK Monitor 46.00
ORD-E1J Cable 61.00
ROWS
```

If the account app does not allow admin password auth, sign the user up through the app instead and run only the
seed loop with that user's `sub`.

## 5. Smoke test, then delete the old resources

Sign in as the demo user on `https://rscmfe.sph.sh` (and on the iOS app), check orders and cart.
Wait out the old CNAME's TTL first. Only then delete, all in `eu-north-1` (`R=eu-north-1`). Deletion is permanent.

```bash
R=eu-north-1
for f in rsc-mfe-web rsc-mfe-shell-web rsc-mfe-orders-web rsc-mfe-store-web rsc-mfe-orders-api rsc-mfe-cart-api; do
  aws lambda-web delete-web-function --region $R --function-name "$f"
  for p in $(aws iam list-attached-role-policies --role-name "$f-role" --query 'AttachedPolicies[].PolicyArn' --output text); do
    aws iam detach-role-policy --role-name "$f-role" --policy-arn "$p"
  done
  for p in $(aws iam list-role-policies --role-name "$f-role" --query 'PolicyNames[]' --output text); do
    aws iam delete-role-policy --role-name "$f-role" --policy-name "$p"
  done
  aws iam delete-role --role-name "$f-role"
done

aws dynamodb delete-table --region $R --table-name rsc-mfe-orders
aws dynamodb delete-table --region $R --table-name rsc-mfe-carts
aws cognito-idp delete-user-pool --region $R --user-pool-id eu-north-1_Xk6oBtn8p
aws s3 rb s3://rsc-mfe-assets --force --region $R

# Distribution: disable, wait until deployed, delete, then its policies.
ETAG=$(aws cloudfront get-distribution-config --id E38EEA6HS61O94 --query ETag --output text)
aws cloudfront get-distribution-config --id E38EEA6HS61O94 --query DistributionConfig \
  | jq '.Enabled=false' > /tmp/dist.json
aws cloudfront update-distribution --id E38EEA6HS61O94 --if-match "$ETAG" --distribution-config file:///tmp/dist.json
aws cloudfront wait distribution-deployed --id E38EEA6HS61O94
ETAG=$(aws cloudfront get-distribution-config --id E38EEA6HS61O94 --query ETag --output text)
aws cloudfront delete-distribution --id E38EEA6HS61O94 --if-match "$ETAG"

CP=$(aws cloudfront list-cache-policies --type custom \
  --query "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='rsc-mfe-origin-cc-qs'].CachePolicy.Id | [0]" --output text)
aws cloudfront delete-cache-policy --id "$CP" --if-match "$(aws cloudfront get-cache-policy --id "$CP" --query ETag --output text)"
aws cloudfront delete-origin-access-control --id E1D9M5TY1ZDL8V \
  --if-match "$(aws cloudfront get-origin-access-control --id E1D9M5TY1ZDL8V --query ETag --output text)"
```

The old distribution also had a response headers policy; find it with
`aws cloudfront list-response-headers-policies --type custom` and delete it the same way
(`delete-response-headers-policy`) once it names no distribution.
