import assert from "node:assert/strict";
import { test } from "node:test";
import { App } from "aws-cdk-lib";
import type { Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { buildStage } from "./app.ts";
import { stages } from "./stages.ts";
import type { StageConfig } from "./stages.ts";

const build = (stage: StageConfig) => buildStage(new App({ context: { "aws:cdk:bundling-stacks": [] } }), stage);
const staging = stages.find((s) => s.name === "staging")!;
const prod = stages.find((s) => s.name === "prod")!;
const { assets, account, ordersApi, cartApi, shell, ordersWeb, storeWeb } = build(staging);
const stagingStacks = Object.values({ assets, account, ordersApi, cartApi, shell, ordersWeb, storeWeb });

type Stmt = { Action: string | string[]; Resource: unknown };
type Resource = { Properties: Record<string, any> };

/** Logical id of the web function's execution role, read from its revision. */
function functionRoleId(stack: Stack): string {
  const [rev] = Object.values(Template.fromStack(stack).findResources("AWS::Lambda::WebFunctionRevision")) as Resource[];
  return rev.Properties.ServiceConfig.ExecutionRoleArn["Fn::GetAtt"][0];
}
/** Statements of the policies attached to the web function role (not to e.g. a BucketDeployment's role). */
function statements(stack: Stack): Stmt[] {
  const roleId = functionRoleId(stack);
  return (Object.values(Template.fromStack(stack).findResources("AWS::IAM::Policy")) as Resource[])
    .filter((p) => (p.Properties.Roles as { Ref?: string }[]).some((r) => r.Ref === roleId))
    .flatMap((p) => p.Properties.PolicyDocument.Statement as Stmt[]);
}
function countPolicies(stack: Stack): number {
  return statements(stack).length;
}
function logicalId(stack: Stack, type: string): string {
  const [id] = Object.keys(Template.fromStack(stack).findResources(type));
  return id;
}
/** The role holds exactly one statement: these actions, on exactly these resources. */
function assertRolePolicy(stack: Stack, actions: string[], resources: unknown[]) {
  const stmts = statements(stack);
  assert.equal(stmts.length, 1);
  assert.deepEqual([...[stmts[0].Action].flat()].sort(), [...actions].sort());
  assert.deepEqual([stmts[0].Resource].flat(), resources);
}
const arnOf = (stack: Stack, type: string) => ({ "Fn::GetAtt": [logicalId(stack, type), "Arn"] });

function revisionEnv(stack: Stack): Record<string, any> {
  const [rev] = Object.values(Template.fromStack(stack).findResources("AWS::Lambda::WebFunctionRevision")) as Resource[];
  return rev.Properties.ServiceConfig.EnvironmentVariables ?? {};
}

test("each function holds only its own grants, on its own resources", () => {
  assertRolePolicy(ordersApi, ["dynamodb:Query"], [arnOf(ordersApi, "AWS::DynamoDB::Table")]);
  assertRolePolicy(
    cartApi,
    ["dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:DeleteItem"],
    [arnOf(cartApi, "AWS::DynamoDB::Table")],
  );
  assertRolePolicy(
    account,
    ["cognito-idp:AdminInitiateAuth", "cognito-idp:AdminRespondToAuthChallenge"],
    [arnOf(account, "AWS::Cognito::UserPool")],
  );
  assertRolePolicy(
    storeWeb,
    ["bedrock:InvokeModel"],
    [
      `arn:aws:bedrock:eu-central-1:${staging.account}:inference-profile/eu.anthropic.claude-haiku-4-5-20251001-v1:0`,
      "arn:aws:bedrock:eu-*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0",
    ],
  );
  assert.equal(countPolicies(ordersWeb) + countPolicies(shell), 0);
});

test("stateful resources are retained", () => {
  for (const [stack, type] of [
    [account, "AWS::Cognito::UserPool"],
    [ordersApi, "AWS::DynamoDB::Table"],
    [cartApi, "AWS::DynamoDB::Table"],
    [assets, "AWS::S3::Bucket"],
  ] as const)
    Template.fromStack(stack).hasResource(type, { DeletionPolicy: "Retain" });
});

test("a stage without a domain has no PUBLIC_HOST and no passkeys", () => {
  const env = revisionEnv(account);
  assert.equal(env.PUBLIC_HOST, undefined);
  assert.equal(env.APPLE_APP_IDS, undefined);
  assert.ok(env.COGNITO_CLIENT_SECRET["Fn::GetAtt"][1] === "ClientSecret");
  const t = Template.fromStack(account);
  t.hasResourceProperties("AWS::Cognito::UserPool", {
    Policies: { SignInPolicy: { AllowedFirstAuthFactors: ["PASSWORD"] } },
  });
  const [pool] = Object.values(t.findResources("AWS::Cognito::UserPool")) as Resource[];
  assert.equal(pool.Properties.WebAuthnRelyingPartyID, undefined);
});

test("a stage with a domain sets PUBLIC_HOST and the passkey relying party", () => {
  const withDomain = {
    ...staging,
    domain: { name: "staging.example.com", certificateArn: "arn:aws:acm:us-east-1:1:certificate/x" },
  };
  const s = build(withDomain);
  assert.equal(revisionEnv(s.account).PUBLIC_HOST, "staging.example.com");
  assert.equal(revisionEnv(s.ordersWeb).PUBLIC_HOST, "staging.example.com");
  Template.fromStack(s.account).hasResourceProperties("AWS::Cognito::UserPool", {
    WebAuthnRelyingPartyID: "staging.example.com",
    WebAuthnUserVerification: "required",
    Policies: { SignInPolicy: { AllowedFirstAuthFactors: ["PASSWORD", "WEB_AUTHN"] } },
  });
});

test("prod passes the mobile association settings to the account function", () => {
  const env = revisionEnv(build(prod).account);
  assert.equal(env.APPLE_APP_IDS, prod.mobile!.appleAppIds);
  assert.equal(env.ANDROID_PACKAGE, prod.mobile!.androidPackage);
  assert.equal(env.ANDROID_CERT_SHA256, prod.mobile!.androidCertSha256);
});

test("names, wiring and the confidential client follow the design", () => {
  const t = Template.fromStack(account);
  t.hasResourceProperties("AWS::Cognito::UserPoolClient", {
    ClientName: "web-confidential",
    GenerateSecret: true,
    ExplicitAuthFlows: ["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    AuthSessionValidity: 15,
    AllowedOAuthFlowsUserPoolClient: false,
  });
  assert.equal(account.stackName, "rsc-mfe-staging-account");
  Template.fromStack(ordersApi).hasResourceProperties("AWS::DynamoDB::Table", { TableName: "rsc-mfe-staging-orders" });
  Template.fromStack(storeWeb).hasResourceProperties("AWS::Lambda::WebFunction", { FunctionName: "rsc-mfe-staging-store-web" });
  assert.ok(revisionEnv(ordersWeb).ORDERS_API_URL);
  assert.ok(revisionEnv(storeWeb).CART_API_URL);
});

test("no staging stack references a prod resource", () => {
  for (const s of stagingStacks)
    assert.doesNotMatch(JSON.stringify(Template.fromStack(s).toJSON()), /rsc-mfe-prod-/);
});
