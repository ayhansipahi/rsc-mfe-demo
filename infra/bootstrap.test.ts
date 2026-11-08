import assert from "node:assert/strict";
import { test } from "node:test";
import { App, BootstraplessSynthesizer } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { BootstrapStack } from "./bootstrap.ts";
import { githubSubject, stages } from "./stages.ts";

const account = "644789169398";
const region = "eu-central-1";
const t = Template.fromStack(
  new BootstrapStack(new App(), "bootstrap", {
    stackName: "rsc-mfe-bootstrap",
    env: { account, region },
    synthesizer: new BootstraplessSynthesizer(),
    stages,
    subject: githubSubject,
  }),
);

type Stmt = { Effect: string; Action: string | string[]; Resource: string | string[]; Condition?: any };
type Doc = { Statement: Stmt[] };
type Resource = { Type: string; Properties: Record<string, any>; Condition?: string };

const pseudo: Record<string, string> = { "AWS::AccountId": account, "AWS::Region": region, "AWS::Partition": "aws" };
/** Resolves Fn::Join, Fn::Sub and pseudo-parameter Refs with the test account and region; leaves the rest as is. */
function resolve(v: any): any {
  if (Array.isArray(v)) return v.map(resolve);
  if (v === null || typeof v !== "object") return v;
  if ("Fn::Join" in v) return resolve(v["Fn::Join"][1]).join(v["Fn::Join"][0]);
  if (typeof v["Fn::Sub"] === "string") return v["Fn::Sub"].replace(/\$\{(AWS::\w+)\}/g, (_: string, k: string) => pseudo[k]);
  if (typeof v.Ref === "string" && v.Ref in pseudo) return pseudo[v.Ref];
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
}
const resources = (t: Template) => Object.values(resolve(t.toJSON().Resources)) as Resource[];
function role(t: Template, name: string): Resource {
  const found = resources(t).find((r) => r.Type === "AWS::IAM::Role" && r.Properties.RoleName === name);
  assert.ok(found, `role ${name}`);
  return found;
}
/** A managed policy's document, or all inline policies of a role, by name. */
function policyOf(t: Template, name: string): Doc {
  const managed = resources(t).find((r) => r.Type === "AWS::IAM::ManagedPolicy" && r.Properties.ManagedPolicyName === name);
  if (managed) return managed.Properties.PolicyDocument;
  return { Statement: role(t, name).Properties.Policies.flatMap((p: any) => p.PolicyDocument.Statement) };
}
const actionsOf = (s: Stmt) => [s.Action].flat();
const resourcesOf = (s: Stmt) => [s.Resource].flat();
const resourcesFor = (doc: Doc, action: string) =>
  doc.Statement.filter((s) => s.Effect === "Allow" && actionsOf(s).includes(action)).flatMap(resourcesOf);
function statementWith(doc: Doc, action: string): Stmt {
  const found = doc.Statement.filter((s) => actionsOf(s).includes(action));
  assert.equal(found.length, 1, `exactly one statement with ${action}`);
  return found[0];
}
const trustOf = (t: Template, name: string) => role(t, name).Properties.AssumeRolePolicyDocument.Statement[0];
const trustSub = (t: Template, name: string) =>
  trustOf(t, name).Condition.StringEquals["token.actions.githubusercontent.com:sub"];
function allStatements(t: Template): Stmt[] {
  return resources(t)
    .flatMap((r) => [
      ...(r.Properties.Policies ?? []).map((p: any) => p.PolicyDocument),
      r.Properties.PolicyDocument,
      r.Properties.AssumeRolePolicyDocument,
    ])
    .filter(Boolean)
    .flatMap((d: Doc) => d.Statement);
}
const execRoleArn = (stage: string) => `arn:aws:iam::${account}:role/rsc-mfe-cfn-exec-${stage}`;
const boundaryArn = (stage: string) => `arn:aws:iam::${account}:policy/rsc-mfe-boundary-${stage}`;

/** IAM wildcard match: `*` spans any characters, actions compare case-insensitively. */
const glob = (pattern: string, value: string) =>
  new RegExp(`^${pattern.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i").test(value);
const matches = (s: Stmt, action: string, arn: string) =>
  actionsOf(s).some((a) => glob(a, action)) && resourcesOf(s).some((r) => glob(r, arn));
/** Only StringEquals on aws:ResourceTag/* is evaluated (against `tags`); any other condition grants nothing. */
const holds = (condition: any, tags: Record<string, string>) =>
  !condition ||
  (Object.keys(condition).every((op) => op === "StringEquals") &&
    Object.entries(condition.StringEquals).every(
      ([key, value]) => key.startsWith("aws:ResourceTag/") && tags[key.slice("aws:ResourceTag/".length)] === value,
    ));
/** True when an Allow covers the call on a resource with these tags, and no Deny covers it. */
const allows = (doc: Doc, action: string, arn: string, tags: Record<string, string> = {}) =>
  doc.Statement.some((s) => s.Effect === "Allow" && holds(s.Condition, tags) && matches(s, action, arn)) &&
  !doc.Statement.some((s) => s.Effect === "Deny" && matches(s, action, arn));

test("the staging pipeline reaches only staging stacks and the staging exec role", () => {
  const doc = policyOf(t, "rsc-mfe-gh-staging");
  assert.deepEqual(resourcesFor(doc, "cloudformation:*"), ["arn:aws:cloudformation:eu-central-1:644789169398:stack/rsc-mfe-staging-*/*"]);
  assert.deepEqual(resourcesFor(doc, "iam:PassRole"), [execRoleArn("staging")]);
  const bucket = `arn:aws:s3:::rsc-mfe-cdk-staging-${account}-${region}`;
  for (const action of ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:GetBucketLocation"])
    assert.deepEqual(resourcesFor(doc, action), [bucket, `${bucket}/*`]);
  assert.equal(doc.Statement.length, 4);
  assert.doesNotMatch(JSON.stringify(doc), /prod/);
});

test("pipeline roles cannot import existing resources into their stacks", () => {
  for (const stage of stages) {
    const deny = statementWith(policyOf(t, `rsc-mfe-gh-${stage.name}`), "cloudformation:CreateChangeSet");
    assert.deepEqual(deny, {
      Effect: "Deny",
      Action: "cloudformation:CreateChangeSet",
      Resource: "*",
      Condition: { Null: { "cloudformation:ImportResourceTypes": "false" } },
    });
  }
});

test("pipeline roles trust one environment each", () => {
  assert.equal(trustSub(t, "rsc-mfe-gh-staging"), "repo:ayhansipahi@721142/rsc-mfe-demo@1445500800:environment:staging");
  assert.equal(trustSub(t, "rsc-mfe-gh-prod"), "repo:ayhansipahi@721142/rsc-mfe-demo@1445500800:environment:prod");
  assert.equal(trustSub(t, "rsc-mfe-gh-diff"), "repo:ayhansipahi@721142/rsc-mfe-demo@1445500800:pull_request");
  for (const name of ["rsc-mfe-gh-staging", "rsc-mfe-gh-prod", "rsc-mfe-gh-diff"]) {
    const trust = trustOf(t, name);
    assert.equal(trust.Action, "sts:AssumeRoleWithWebIdentity");
    assert.equal(trust.Condition.StringEquals["token.actions.githubusercontent.com:aud"], "sts.amazonaws.com");
  }
});

test("the pull request role only reads rsc-mfe stacks", () => {
  const [stmt, ...rest] = policyOf(t, "rsc-mfe-gh-diff").Statement;
  assert.equal(rest.length, 0);
  assert.deepEqual(actionsOf(stmt).sort(), [
    "cloudformation:DescribeStackResources",
    "cloudformation:DescribeStacks",
    "cloudformation:GetTemplate",
    "cloudformation:GetTemplateSummary",
  ]);
  assert.deepEqual(stmt.Resource, `arn:aws:cloudformation:${region}:${account}:stack/rsc-mfe-*/*`);
});

test("the GitHub OIDC provider is created only on request, and the roles trust its ARN either way", () => {
  const json = t.toJSON();
  assert.equal(json.Parameters.CreateOidcProvider.Default, "false");
  assert.deepEqual(json.Parameters.CreateOidcProvider.AllowedValues, ["true", "false"]);
  const [[providerId, provider], ...others] = Object.entries(t.findResources("AWS::IAM::OIDCProvider")) as [string, Resource][];
  assert.equal(others.length, 0);
  assert.deepEqual(provider.Properties.Url, "https://token.actions.githubusercontent.com");
  assert.deepEqual(provider.Properties.ClientIdList, ["sts.amazonaws.com"]);
  assert.deepEqual(json.Conditions[provider.Condition!], { "Fn::Equals": [{ Ref: "CreateOidcProvider" }, "true"] });
  const arn = `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`;
  for (const name of ["rsc-mfe-gh-staging", "rsc-mfe-gh-prod", "rsc-mfe-gh-diff"])
    assert.deepEqual(trustOf(t, name).Principal.Federated, { "Fn::If": [provider.Condition, { Ref: providerId }, arn] });
});

test("the exec role cannot create a role without the boundary", () => {
  const doc = policyOf(t, "rsc-mfe-cfn-exec-staging");
  const stmt = statementWith(doc, "iam:CreateRole");
  assert.deepEqual(stmt.Condition.StringEquals["iam:PermissionsBoundary"], boundaryArn("staging"));
  assert.deepEqual(actionsOf(stmt).sort(), ["iam:AttachRolePolicy", "iam:CreateRole", "iam:PutRolePermissionsBoundary", "iam:PutRolePolicy"]);
  assert.deepEqual(stmt.Resource, `arn:aws:iam::${account}:role/rsc-mfe-staging-*`);
  const deny = statementWith(doc, "iam:DeleteRolePermissionsBoundary");
  assert.deepEqual([deny.Effect, deny.Resource], ["Deny", "*"]);
  assert.equal(trustOf(t, "rsc-mfe-cfn-exec-staging").Principal.Service, "cloudformation.amazonaws.com");
});

test("no statement allows every action on every resource", () => {
  for (const s of allStatements(t))
    assert.ok(!(s.Effect === "Allow" && actionsOf(s).includes("*") && resourcesOf(s).includes("*")), JSON.stringify(s));
});

test("the boundary grants nothing in iam", () => {
  assert.doesNotMatch(JSON.stringify(policyOf(t, "rsc-mfe-boundary-staging")), /"iam:/);
});

test("the boundary covers what staging roles call, and nothing of prod", () => {
  const doc = policyOf(t, "rsc-mfe-boundary-staging");
  const prefix = (service: string) => `arn:aws:${service}:${region}:${account}`;
  const pool = `${prefix("cognito-idp")}:userpool/eu-central-1_abc`;
  const allowed: [string, string, Record<string, string>?][] = [
    // Web functions log to /aws/lambda/web/<function>, the BucketDeployment handler to /aws/lambda/<function>.
    ["logs:CreateLogGroup", `${prefix("logs")}:log-group:/aws/lambda/web/rsc-mfe-staging-web`],
    ["logs:PutLogEvents", `${prefix("logs")}:log-group:/aws/lambda/web/rsc-mfe-staging-web:log-stream:x`],
    ["logs:CreateLogStream", `${prefix("logs")}:log-group:/aws/lambda/rsc-mfe-staging-account-CustomCDKBucketDeploy-x:log-stream:y`],
    ["dynamodb:Query", `${prefix("dynamodb")}:table/rsc-mfe-staging-orders`],
    ["dynamodb:UpdateItem", `${prefix("dynamodb")}:table/rsc-mfe-staging-carts`],
    ["cognito-idp:AdminInitiateAuth", pool, { stage: "staging" }],
    ["cognito-idp:AdminRespondToAuthChallenge", pool, { project: "rsc-mfe", stage: "staging" }],
    ["bedrock:InvokeModel", `${prefix("bedrock")}:inference-profile/eu.anthropic.claude-haiku-4-5-20251001-v1:0`],
    ["bedrock:InvokeModel", "arn:aws:bedrock:eu-west-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0"],
    ["s3:GetObject", `arn:aws:s3:::rsc-mfe-cdk-staging-${account}-${region}/abc.zip`],
    ["s3:PutObject", "arn:aws:s3:::rsc-mfe-staging-assets/assets/app.js"],
  ];
  for (const [action, arn, tags] of allowed) assert.ok(allows(doc, action, arn, tags), `${action} ${arn}`);
  const denied: [string, string, Record<string, string>?][] = [
    ["dynamodb:Query", `${prefix("dynamodb")}:table/rsc-mfe-prod-orders`],
    ["s3:PutObject", "arn:aws:s3:::rsc-mfe-prod-assets/assets/app.js"],
    ["s3:GetObject", `arn:aws:s3:::rsc-mfe-cdk-prod-${account}-${region}/abc.zip`],
    ["dynamodb:Scan", `${prefix("dynamodb")}:table/rsc-mfe-staging-orders`],
    ["cognito-idp:AdminInitiateAuth", pool, { project: "rsc-mfe", stage: "prod" }],
    ["cognito-idp:AdminRespondToAuthChallenge", pool, { stage: "prod" }],
    ["cognito-idp:AdminInitiateAuth", pool],
    ["logs:PutLogEvents", `${prefix("logs")}:log-group:/aws/lambda/web/rsc-mfe-prod-web:log-stream:x`],
    ["logs:CreateLogGroup", `${prefix("logs")}:log-group:/aws/lambda/other-workload`],
    ["logs:PutLogEvents", `${prefix("logs")}:log-group:/aws/lambda/other-workload:log-stream:x`],
  ];
  for (const [action, arn, tags] of denied) assert.ok(!allows(doc, action, arn, tags), `${action} ${arn}`);
});

test("the exec role manages only its stage's names", () => {
  const doc = policyOf(t, "rsc-mfe-cfn-exec-staging");
  const prefix = (service: string) => `arn:aws:${service}:${region}:${account}`;
  const allowed: [string, string][] = [
    ["lambda:CreateWebFunction", `${prefix("lambda")}:web-function/rsc-mfe-staging-web`],
    ["lambda:CreateWebFunctionRevision", `${prefix("lambda")}:web-function/rsc-mfe-staging-web/revision/1`],
    ["lambda:InvokeFunction", `${prefix("lambda")}:function:rsc-mfe-staging-account-CustomCDKBucketDeploy-x`],
    ["dynamodb:CreateTable", `${prefix("dynamodb")}:table/rsc-mfe-staging-orders`],
    ["s3:PutBucketPolicy", "arn:aws:s3:::rsc-mfe-staging-assets"],
    ["s3:GetObject", `arn:aws:s3:::rsc-mfe-cdk-staging-${account}-${region}/abc.zip`],
    // CreateWebFunctionRevision checks the caller can read the code object, versions included.
    ["s3:GetObjectVersion", `arn:aws:s3:::rsc-mfe-cdk-staging-${account}-${region}/abc.zip`],
    ["iam:PassRole", `arn:aws:iam::${account}:role/rsc-mfe-staging-account-WebRole-x`],
  ];
  for (const [action, arn] of allowed) assert.ok(allows(doc, action, arn), `${action} ${arn}`);
  const denied: [string, string][] = [
    ["lambda:UpdateWebFunction", `${prefix("lambda")}:web-function/rsc-mfe-prod-web`],
    ["dynamodb:DeleteTable", `${prefix("dynamodb")}:table/rsc-mfe-prod-orders`],
    ["s3:PutObject", "arn:aws:s3:::rsc-mfe-prod-assets/x"],
    ["s3:PutObject", `arn:aws:s3:::rsc-mfe-cdk-staging-${account}-${region}/abc.zip`],
    ["iam:PassRole", `arn:aws:iam::${account}:role/rsc-mfe-prod-account-WebRole-x`],
    ["iam:PassRole", execRoleArn("staging")],
    ["iam:DeleteRolePermissionsBoundary", `arn:aws:iam::${account}:role/rsc-mfe-staging-account-WebRole-x`],
    ["lambda:GetFunction", `${prefix("lambda")}:function:other-workload`],
    ["lambda:GetWebFunctionRevision", `${prefix("lambda")}:web-function/rsc-mfe-prod-web/revision/1`],
  ];
  for (const [action, arn] of denied) assert.ok(!allows(doc, action, arn), `${action} ${arn}`);
  // Lambda reads return environment variables, so none is granted outside the stage's names.
  for (const s of doc.Statement.filter((s) => resourcesOf(s).includes("*")))
    assert.ok(!actionsOf(s).some((a) => a.startsWith("lambda:")), JSON.stringify(s));
  assert.deepEqual(resourcesFor(doc, "acm:DescribeCertificate"), [`arn:aws:acm:us-east-1:${account}:certificate/*`]);
  assert.deepEqual(resourcesFor(doc, "acm:ListCertificates"), ["*"]);
  for (const name of ["rsc-mfe-cfn-exec-staging", "rsc-mfe-boundary-staging", "rsc-mfe-gh-staging"])
    assert.doesNotMatch(JSON.stringify(policyOf(t, name)), /prod/);
  for (const name of ["rsc-mfe-cfn-exec-prod", "rsc-mfe-boundary-prod", "rsc-mfe-gh-prod"])
    assert.doesNotMatch(JSON.stringify(policyOf(t, name)), /staging/);
});

test("user pools and distributions are reachable only through the stage's tags", () => {
  const doc = policyOf(t, "rsc-mfe-cfn-exec-staging");
  const requestTags = { "aws:RequestTag/project": "rsc-mfe", "aws:RequestTag/stage": "staging" };
  const ownTag = { "aws:ResourceTag/stage": "staging" };
  // Creating and tagging require the stage's tags, and never re-tag a resource another stage owns.
  const createPool = statementWith(doc, "cognito-idp:CreateUserPool");
  assert.deepEqual(actionsOf(createPool).sort(), ["cognito-idp:CreateUserPool", "cognito-idp:TagResource"]);
  assert.deepEqual(createPool.Condition, { StringEquals: requestTags, StringEqualsIfExists: ownTag });
  const pools = statementWith(doc, "cognito-idp:*");
  assert.deepEqual([pools.Resource, pools.Condition], [`arn:aws:cognito-idp:${region}:${account}:userpool/*`, { StringEquals: ownTag }]);

  const distribution = `arn:aws:cloudfront::${account}:distribution/*`;
  const create = statementWith(doc, "cloudfront:CreateDistribution");
  assert.deepEqual([create.Resource, create.Condition], [distribution, undefined]);
  const tag = statementWith(doc, "cloudfront:TagResource");
  assert.deepEqual([tag.Resource, tag.Condition], [distribution, { StringEquals: requestTags, StringEqualsIfExists: ownTag }]);
  for (const action of [
    "cloudfront:GetDistribution",
    "cloudfront:GetDistributionConfig",
    "cloudfront:UpdateDistribution",
    "cloudfront:DeleteDistribution",
    "cloudfront:UntagResource",
    "cloudfront:ListTagsForResource",
    "cloudfront:CreateInvalidation",
  ]) {
    const s = statementWith(doc, action);
    assert.deepEqual([s.Resource, s.Condition], [distribution, { StringEquals: ownTag }], action);
  }
  // Only the untaggable CloudFront types are granted on every resource.
  for (const s of doc.Statement.filter((s) => resourcesOf(s).includes("*")))
    for (const action of actionsOf(s).filter((a) => a.startsWith("cloudfront:")))
      assert.match(action, /^cloudfront:\*?\w*(CachePolic|OriginAccessControl|OriginRequestPolic)/);
  assert.ok(allows(doc, "cloudfront:CreateCachePolicy", `arn:aws:cloudfront::${account}:cache-policy/x`));
  assert.ok(allows(doc, "cloudfront:CreateOriginAccessControl", `arn:aws:cloudfront::${account}:origin-access-control/x`));
});

test("CDK asset buckets are private, TLS-only, retained and expire replaced objects", () => {
  for (const stage of stages)
    t.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
      Properties: Match.objectLike({
        BucketName: `rsc-mfe-cdk-${stage.name}-${account}-${region}`,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        VersioningConfiguration: { Status: "Enabled" },
        LifecycleConfiguration: { Rules: [{ NoncurrentVersionExpiration: { NoncurrentDays: 30 }, Status: "Enabled" }] },
      }),
    });
  t.resourcePropertiesCountIs(
    "AWS::S3::BucketPolicy",
    {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Effect: "Deny", Action: "s3:*", Condition: { Bool: { "aws:SecureTransport": "false" } } }),
        ]),
      }),
    },
    stages.length,
  );
  // Lambda reads web function code from the CDK bucket as its service principal, only for its stage's revisions.
  for (const stage of stages)
    t.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: ["s3:GetObject", "s3:GetObjectVersion"],
            Resource: `arn:aws:s3:::rsc-mfe-cdk-${stage.name}-${account}-${region}/*`,
            Condition: {
              ArnLike: {
                "aws:SourceArn": `arn:aws:lambda:${region}:${account}:web-function/rsc-mfe-${stage.name}-*/revision/*`,
              },
            },
          }),
        ]),
      }),
    });
});

test("policies fit IAM's size limits", () => {
  // Inline policies of a role: 10,240 characters in total; a managed policy: 6,144 (whitespace not counted).
  for (const stage of stages) {
    assert.ok(JSON.stringify(policyOf(t, `rsc-mfe-cfn-exec-${stage.name}`)).length < 10240);
    assert.ok(JSON.stringify(policyOf(t, `rsc-mfe-boundary-${stage.name}`)).length < 6144);
  }
});
