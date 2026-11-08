# rsc-mfe-demo

A micro-frontend demo: one site, three teams, every team owns its page vertical end to end and
ships it on its own schedule. React Server Components on Lambda Web Functions behind CloudFront;
the same pages inside a native mobile shell.

## Three layers, one team per vertical

```
shells/      platform team   the frames that hold the teams' work
  web/         @rsc-mfe/shell: page skeleton, session contract, header + footer fragments, CloudFront
  mobile/      the Expo app: native tab bar around the teams' web pages
apps/        one web app per team; each is its own React Router build and function
  account/     /, /login, /signup, /account, /auth/*  and the <rsc-account-button> fragment
  orders/      /orders
  store/       /store, /store/cart, /store/api/*       and the <rsc-mini-cart> fragment
services/    one internal HTTP API per team, each its own function and table
  orders/      GET /orders                         (orders table)
  cart/        GET /cart, PUT|DELETE /cart/:id     (carts table)
```

Every package has its own `package.json`, `index.js` and `infra/` (its CDK stack). Cognito has no package of its own: the account app's stack creates the user pool. The
only import allowed across packages is `@rsc-mfe/shell` from an app. `CODEOWNERS` maps each
directory to its team.

## How a page is stitched

An app renders `<Page>` from the shell, which draws three areas:

```html
<rsc-header data-owner="shell">     ← filled at runtime by shells/web's header.js
<main data-owner="orders" …>        ← the app's own route
<rsc-footer data-owner="shell">     ← footer.js
```

The header places the store's mini cart and the account's sign-in button inside itself, each
loaded from its owner. A shell deploy changes the header on every page without rebuilding an
app; an app deploy changes only its own `main`. Add `?stitch` to any URL to outline each area
with its owner and build time, and look at the `x-vertical` response header to see which
function answered.
Every response also carries `x-flow-id`: minted by the first function a request reaches,
forwarded by an app to its service with the bearer, and printed in the one JSON log line each
function writes per request. One id in CloudWatch finds the page and the service calls behind it.

Every `<rsc-*>` tag ships with server HTML inside it: the nav links, the cart and sign-in
links, the footer line. Crawlers and users without the script yet get that; the fragment's shadow
root covers it once it runs. Anything that must be indexed stays in the page owner's server
render, fragments only add what they own on top.

Auth is a platform contract: `getUser(request)` from `@rsc-mfe/shell` verifies the Cognito
cookie; apps carry no other auth code. Apps call their team's service with the user's access
token as a bearer; the service verifies it and scopes every query to that user.

## Run one team's product on its own

```bash
npm install
DEV_SESSION=me@example.com npm run dev -w services/orders          # :4001, needs AWS creds for DynamoDB
ORDERS_API_URL=http://localhost:4001 DEV_SESSION=me@example.com npm run dev -w apps/orders   # :5173
```

Open `http://localhost:5173/orders`. Header and footer are empty slots until the shell runs too:

```bash
npm run dev -w shells/web                                             # :4000
SHELL_ORIGIN=http://localhost:4000 ORDERS_API_URL=… DEV_SESSION=… npm run dev -w apps/orders
```

`DEV_SESSION` names a signed-in user outside production builds; the service accepts
`Bearer dev` the same way. Links to other teams' pages 404 locally: the integrated site is
CloudFront.

Tests: `npm test -w <package>` (`node --test`, no framework).

## Deploy

Infrastructure is a CDK app (`infra/app.ts`, stages in `infra/stages.ts`) and only GitHub Actions
deploys it. Developers have read-only AWS access and no deploy permission anywhere.

### How a change reaches prod

1. Open a pull request. The `check` job runs typecheck, tests, `cdk synth`, and a `cdk diff`
   against staging, prod and the bootstrap stack with a read-only role (fork PRs skip the diff). The diff goes
   to the job summary, not to a PR comment.
2. Merge to `main` (protected; `check` must pass).
3. `deploy.yml` builds once, deploys staging, then waits for the required reviewer on the `prod` environment.
4. After approval the same build is deployed to prod.

Locally you can run `npm run synth` and `npx cdk diff --no-change-set …` (read-only credentials cannot
create change sets); there is no deploy script and none is needed.

The pipeline does not deploy changes to `infra/bootstrap.ts`: after merging one, an account admin
redeploys the bootstrap stack (`npx cdk deploy bootstrap-$ACCOUNT`). The PR diff shows the change.

### Rollback

Revert the commit and merge the revert; the pipeline deploys the previous state. When a deploy fails,
CloudFormation rolls back only the stack that failed: stacks deployed before it keep the new version, and a
failed smoke test rolls back nothing. Check the stage, then revert or redeploy it.

### One-time setup (account admin)

Run once per account, in this order, with admin credentials. The GitHub side comes first: a workflow that
names a missing environment creates it without protection, so the deploy roles must not exist before the
environments do.

```bash
# 1. Repository variable the workflows read (with one account per stage, also set it per environment:
#    gh variable set AWS_ACCOUNT_ID --env <stage> --body <id>)
ACCOUNT=644789169398
gh variable set AWS_ACCOUNT_ID --body "$ACCOUNT" --repo ayhansipahi/rsc-mfe-demo

# 2. Environments, limited to protected branches (the OIDC trust is per environment, so only
#    protected branches may reach the deploy roles)
gh api -X PUT repos/ayhansipahi/rsc-mfe-demo/environments/staging \
  --input - <<<'{"deployment_branch_policy":{"protected_branches":true,"custom_branch_policies":false}}'
gh api -X PUT repos/ayhansipahi/rsc-mfe-demo/environments/prod \
  --input - <<JSON
{"deployment_branch_policy":{"protected_branches":true,"custom_branch_policies":false},
 "reviewers":[{"type":"User","id":$(gh api users/ayhansipahi --jq .id)}]}
JSON

# 3. Protect main, with the CI check required
gh api -X PUT repos/ayhansipahi/rsc-mfe-demo/branches/main/protection --input - <<'JSON'
{"required_status_checks":{"strict":true,"contexts":["check"]},
 "enforce_admins":true,
 "required_pull_request_reviews":{"required_approving_review_count":0},
 "restrictions":null}
JSON

# 4. Bootstrap stack: GitHub OIDC trust, pipeline roles, execution roles, permissions boundaries,
#    asset buckets. Use CreateOidcProvider=true only if the account has no GitHub OIDC provider yet.
#    It deploys only if steps 2 and 3 took effect.
R=repos/ayhansipahi/rsc-mfe-demo
if gh api $R/environments/staging --jq .deployment_branch_policy.protected_branches | grep -qx true &&
   gh api $R/environments/prod --jq '.deployment_branch_policy.protected_branches and any(.protection_rules[]; .type == "required_reviewers")' | grep -qx true &&
   gh api $R/branches/main/protection --jq '.enforce_admins.enabled and (.required_status_checks.contexts | index("check") != null)' | grep -qx true; then
  npm ci && npx cdk deploy bootstrap-$ACCOUNT --parameters CreateOidcProvider=false
else
  echo "GitHub protections missing: redo steps 2 and 3 before the bootstrap" >&2
fi
```

For a team, also turn on `require_code_owner_reviews`, at least 1 approving review in step 3, and
`prevent_self_review` on the `prod` environment's protection rules.

Without steps 2 and 3 any branch could assume a deploy role, so do not skip them.

To move an existing environment from the old shell scripts, follow
[`docs/runbooks/2026-11-eu-central-1-migration.md`](docs/runbooks/2026-11-eu-central-1-migration.md).

With one account per stage, set `AWS_ACCOUNT_ID` on each GitHub environment
(`gh variable set AWS_ACCOUNT_ID --env <stage> --body <id> --repo ayhansipahi/rsc-mfe-demo`); an environment
variable overrides the repository variable in `deploy-stage.yml`. The PR `cdk diff` job has no environment,
so it uses the repository-level variable's account only and cannot diff a stage in another account.

### Using this template

Before the first deploy in your own account and repository, change:

- `infra/stages.ts`: each stage's `account`, `githubRepo`, the `mobile` ids and the `domain`.
- The hard-coded account id, repository and GitHub user in the commands on this page and in the runbook.
- The bootstrap deploy: use `CreateOidcProvider=true` in an account that has no GitHub OIDC provider yet.

### Attaching a domain

A stage is reachable on its CloudFront address (the `DistributionUrl` output of the `rsc-mfe-<stage>-edge` stack). The pipeline's smoke test uses that address, so it does not depend on DNS.
That address serves pages only. Sign-in, sign-up, logout and cart writes need the stage's domain: React
Router's CSRF check compares the request's Origin with `PUBLIC_HOST`, which is set from the domain, so those
actions are rejected on the CloudFront address. Attach a domain to every stage that people sign in on.
To use your own name: request an ACM certificate for it in `us-east-1`, set `domain: { name, certificateArn }`
on the stage in `infra/stages.ts`, merge through the pipeline, then point a CNAME for the name at the
`DistributionUrl` host (the distribution's `*.cloudfront.net` name).

### Permissions and what they leave open

Each stage deploys through its own execution role, limited to this project's services, to
`eu-central-1`, and to names starting `rsc-mfe-<stage>-`. Every role a stack creates carries the
stage's permissions boundary. The pipeline roles hold only CloudFormation actions on their stage's
stacks and cannot import existing resources into a stack. Known gaps:

- CloudFront cache policies, origin access controls and origin request policies cannot be tagged or
  scoped by name, so the execution role can change any of them in the account. Through the pipeline it
  only reaches the ones its own stacks create.
- User pools and distributions are scoped by the `stage` tag, and creating one must tag it, so the
  execution role may add its tag to an existing pool (in `eu-central-1`) or distribution (any in the account)
  that has no `stage` tag, and then manage it. Only CloudFormation can use the role and stacks cannot import
  resources, so no stack reaches one directly; other workloads' distributions usually have no `stage` tag.
- Stage roles may invoke any EU Bedrock model in the account (cost exposure, nothing else).
- The execution role has `dynamodb:DescribeTable` on `*` (table metadata only).
- The execution role can read any ACM certificate's metadata in `us-east-1` and list certificates; read-only.
- A stack can publish Lambda layer versions under any name in the region.
- Stages can write to their own buckets' policies and public access block.
- A stack role can be given any trust policy, so a stage could let another principal assume its own boundary-capped role.
- A stage stack that existed before with a stronger service role keeps that role until it is redeployed through the pipeline.

The pipeline's `cloudformation:*` must stay limited to stack ARNs; widening it to `*` would open
the Cloud Control API with the execution role.

Recommended for real use: one AWS account per stage, so staging cannot reach prod at all. Add an
entry with its own `account` in `infra/stages.ts` and run the bootstrap in that account.
