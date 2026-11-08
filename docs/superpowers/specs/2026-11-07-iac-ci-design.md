# IaC and CI/CD: design

Date: 2026-11-07. Status: draft.

## Why

This repo will be handed out as a template. Today every AWS resource is created, and every code
revision shipped, by shell scripts run from a laptop with admin credentials. That is the opposite
of how teams work: most developers hold restricted permissions and cannot deploy to production.
Only the pipeline can. The template must show that, or it teaches the wrong thing.

## Goals

1. Every AWS resource is defined in code, per vertical, under the same CODEOWNERS split as the app code.
2. Only GitHub Actions deploys. PR: typecheck, test, build, synth, diff. Merge to main: staging
   deploys automatically, a smoke test runs, prod deploys after a manual approval.
3. Build once: the cloud assembly synthesized from a commit is the one deployed to staging and to prod.
4. CI reaches AWS through GitHub OIDC. No long-lived AWS keys anywhere, no AWS secrets in GitHub.
5. Least privilege. The staging pipeline cannot touch prod. The CloudFormation execution role can
   only manage this project's resources (the AWS account is shared with unrelated production workloads).
6. Someone who clones the template can stand up both stages in an empty account: one admin bootstrap,
   then everything through CI.
7. `rscmfe.sph.sh` keeps serving: prod is rebuilt in the new region and the domain moves to it.

## Non-goals

- Weighted / canary rollout. `lambda-rollout.sh` goes away. A failed deploy is rolled back by
  CloudFormation; a bad release is reverted in git and the pipeline redeploys.
- Mobile shell builds (`shells/mobile`): EAS has its own pipeline.
- Multi-account AWS organization setup. Stage config carries an account id per stage, so separate
  accounts work, but this demo runs both stages in one account. The README recommends one account
  per stage to template users.
- Keeping today's users, passkeys and data. Prod moves region and starts empty (decided; see Migration).
- Seed data in IaC. The demo user and demo orders are created by the admin (runbook).
- A developer IAM policy. The README says developers get read-only access; granting it is the account owner's job.
- Moving the Cognito client secret to Secrets Manager. It stays a function environment variable, set
  inside the account stack (never exported, never in GitHub). Follow-up candidate.

## Anti-goals (failure even if it works)

- Any path that deploys from a developer laptop: no deploy npm scripts, no `cdk deploy` in developer docs.
- A pipeline role with AdministratorAccess, or use of the account's existing default CDK bootstrap
  (qualifier `hnb659fds`, whose execution role has AdministratorAccess).
- A pipeline role that can create an IAM role more powerful than itself.
- Secrets committed to git or stored as GitHub secrets.

## Decisions

### Region

`eu-central-1` for every regional resource, both stages. The account's other workloads live in
`eu-north-1`; `eu-central-1` holds nothing of theirs (checked 2026-11-07: no web functions, pools or
tables; one unrelated `CDKToolkit` stack). Lambda Web Functions and their CloudFormation types are
available there, and so is the `eu.` inference profile of the store's vision model. CloudFront and
IAM are global; the ACM certificate for CloudFront stays in `us-east-1`.

### Tool and layout

- AWS CDK v2, TypeScript. Lambda Web Functions use the L1 constructs `CfnWebFunction`,
  `CfnWebFunctionEndpoint`, `CfnWebFunctionRevision` (in `aws-cdk-lib` 2.275; no L2 exists).
- Root `cdk.json` and `infra/app.ts` (platform-owned) build one CDK Stage per environment from
  `infra/stages.ts`. Each package owns its stack in its own `infra/stack.ts`.
- Stacks per stage, named `rsc-mfe-<stage>-<name>`:

  | Stack      | Lives in                     | Contents                                                        |
  |------------|------------------------------|-----------------------------------------------------------------|
  | assets     | `shells/web/infra`           | S3 bucket for hashed client assets                              |
  | account    | `apps/account/infra`         | Cognito user pool and confidential client, account web function |
  | orders-api | `services/orders/infra`      | orders table, orders service function                          |
  | cart-api   | `services/cart/infra`        | carts table, cart service function                             |
  | shell      | `shells/web/infra`           | shell fragment function                                         |
  | orders-web | `apps/orders/infra`          | orders app function                                             |
  | store-web  | `apps/store/infra`           | store app function (Bedrock InvokeModel grant)                  |
  | edge       | `shells/web/infra`           | CloudFront distribution, cache policy, OAC, bucket policy       |

  Cognito sits in the account stack so the client secret never crosses a stack boundary.
  `services/auth/` held only Cognito scripts and is deleted.
- Physical names follow `rsc-mfe-<stage>-<thing>`. Stateful resources (pool, tables, bucket) get
  `RemovalPolicy.RETAIN`.
- Every resource that accepts tags carries `project=rsc-mfe` and `stage=<stage>` (CDK `Tags.of(stage)`).
- One shared construct, `infra/web-function.ts`, replaces `lambda-deploy.sh` and `lambda-role.sh`:
  execution role (logs plus the grants the caller passes), bundled code asset, revision, one endpoint.
  Each function keeps exactly the grants its `role.sh` gives today.
- Bundling is CDK asset bundling, so `cdk synth` yields deployable assets on any machine: build the
  package, then an isolated production install (workspace `file:` dependencies installed as copies,
  not symlinks), then the react-router patch. Runtime `nodejs24.x`, timeout 30 s, max concurrency 64,
  as today.
- Each web stack uploads its `build/client/assets` to the assets bucket under its base path
  (`/assets`, `/orders-static/assets`, `/store-static/assets`), `immutable` cache-control, never pruning:
  a page served by any revision still finds its files. The bucket has no expiration rule: CDK uploads
  only when a package's assets change, so an age-based rule would delete files a long-lived revision
  still serves. Hashed assets are small; the storage cost is negligible.
- Cross-stack values (endpoint hostnames, pool and client ids, bucket) are CDK references.
  `cdk deploy` orders the stacks from those references.
- The edge stack reproduces today's distribution: origins and behavior order, the custom cache
  policy (query strings in the key, no Host header), AllViewerExceptHostHeader, S3 origin with OAC
  for `*/assets/*`, keepalive 60 s, http2and3, IPv6. No response headers policy: the live
  distribution has none attached.

### Stages

- `staging` and `prod`. Config per stage in `infra/stages.ts`: account id, domain name, ACM
  certificate ARN (us-east-1), mobile app ids (prod only).
- Every stage has its own custom domain. The passkey relying party ID and `PUBLIC_HOST` must be
  fixed strings known before deploy; a generated CloudFront hostname would create a dependency cycle.
- DNS records and certificates live outside IaC: `sph.sh` is not hosted in Route 53.

### CI/CD (GitHub Actions)

- `ci.yml`, on pull_request: `npm ci`, typecheck, test, build, `cdk synth`. For PRs from this
  repo (not forks), `cdk diff` against staging and prod with the read-only role, written to the job
  summary. Fork PRs get no AWS access.
- `deploy.yml`, on push to main (and `workflow_dispatch` to redeploy a commit):
  1. `synth`: build and synth once, upload `cdk.out` as an artifact.
  2. `staging` (GitHub environment `staging`): deploy `staging/*` from that `cdk.out`, then a smoke test
     against the stage domain.
  3. `prod` (GitHub environment `prod`, required reviewer, needs `staging`): deploy `prod/*` from the
     same `cdk.out`, then the same smoke test.
  One concurrency group per stage, no cancel-in-progress.
- Branch protection on main (PR required, `ci` must pass) and the two GitHub environments are set
  up once by the repo admin; the runbook lists the commands.

### Identity and permissions

- No `cdk bootstrap`. The stock bootstrap deploy role may create, update and delete any stack in the
  account (`Resource: "*"`), and CloudFormation reuses a stack's existing service role when none is
  passed, so a staging pipeline could reach prod stacks or other workloads' admin-role stacks.
  Instead the app uses `CliCredentialsStackSynthesizer`: CDK deploys with the pipeline role's own
  credentials, and that role's policy is written in this repo.
- One-time admin bootstrap per account, documented as a runbook: an `rsc-mfe-bootstrap` stack
  (`infra/bootstrap.ts`, deployed by the admin) holding:
  - the GitHub OIDC provider, created only if the account has none (parameter; this account has one);
  - per stage: a CDK asset bucket, a CloudFormation execution role and a permissions boundary;
  - `rsc-mfe-gh-diff`: trusted for `repo:<owner>/<repo>:pull_request`; `GetTemplate` /
    `DescribeStacks` on `rsc-mfe-*` stacks, nothing else (`cdk diff --no-change-set`);
  - `rsc-mfe-gh-staging`: trusted for `repo:<owner>/<repo>:environment:staging`; CloudFormation
    actions only on `stack/rsc-mfe-staging-*`, `iam:PassRole` only on the staging execution role,
    write only to the staging asset bucket;
  - `rsc-mfe-gh-prod`: the same for `environment:prod` and prod.
  Every deploy passes the stage's execution role (`--role-arn`); the pipeline role itself holds no
  resource permissions.
- Execution role per stage: only the services this project uses (lambda-web, dynamodb, cognito-idp,
  cloudfront, s3, iam, logs, lambda for CDK custom resources).
  - Regional services are limited to `eu-central-1` in the resource ARN, and by the
    `rsc-mfe-<stage>-` name prefix where the ARN carries a name.
  - Cognito user pools (ID in the ARN): creating requires the request tags `project=rsc-mfe` and
    `stage=<stage>`; every other action requires those resource tags.
  - CloudFront distributions (global, ID in the ARN): the same tag conditions.
  - CloudFront cache policies, response headers policies and OACs take no tags. The execution role
    can modify any of them in the account. This gap is accepted and written in the README.
- Every IAM role a stack creates must carry the stage's permissions boundary; the execution role is
  denied `iam:CreateRole` / `iam:PutRolePolicy` / `iam:AttachRolePolicy` without it.
- Developers can run `cdk synth` and `cdk diff` locally; deploy permissions exist only on the two
  pipeline roles.

### Migration of the live prod environment

One-time, run by the account admin, written down as a runbook. Not part of the template's normal flow.

1. Admin bootstrap (above), GitHub environments and branch protection.
2. Merge to main: the pipeline builds staging and prod from nothing in `eu-central-1`. Prod's
   distribution comes up without the `rscmfe.sph.sh` alias at first (`domainName` unset in prod
   config, so the passkey RP ID and `PUBLIC_HOST` wait too). Builder decides how the config expresses
   "domain not attached yet".
3. Cutover: remove the alias from the old distribution `E38EEA6HS61O94`, set the prod domain in config
   and merge (the new distribution takes the alias), the owner points the `rscmfe.sph.sh` CNAME at the
   new distribution. A few minutes of downtime.
4. The admin recreates the App Store review demo user with the same email and password, and seeds the
   demo orders.
5. After the smoke test, the admin deletes the old `eu-north-1` resources: six web functions, their
   roles, tables `rsc-mfe-orders` and `rsc-mfe-carts`, pool `rsc-mfe-demo`, bucket `rsc-mfe-assets`,
   the old distribution and its cache policy, OAC and response headers policy. The runbook lists them.

### Removed

`scripts/lambda-deploy.sh`, `scripts/lambda-role.sh`, `scripts/lambda-rollout.sh`, every
`*/infra/*.sh`, `shells/web/infra/cloudfront/*.json`, `services/auth/`. The two build helpers stay:
`scripts/patch-react-router.mjs` (postinstall and bundling) and `scripts/stamp-fragments.mjs`
(package builds). The README deploy section is rewritten. CODEOWNERS: `/infra/` and `/.github/`
go to platform; `/services/auth/` goes.

## Left to the builder

- Endpoint name per function (today `dev`).
- Smoke test paths and how many.
- How `cdk diff` runs with read-only credentials, as long as the diff role cannot deploy.
- The staging domain and its certificate are an input from the owner; the plan names where it goes.
