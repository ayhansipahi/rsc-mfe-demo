import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as s3 from "aws-cdk-lib/aws-s3";
import { StageStack } from "./stage-stack.ts";
import { stages } from "./stages.ts";
import { WebFunction } from "./web-function.ts";

const staging = stages.find((s) => s.name === "staging")!;
const packageDir = "services/orders";

test("a web function has one revision at 100% on a live endpoint", () => {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  const stack = new StageStack(app, "orders-api", staging);
  const fn = new WebFunction(stack, "Fn", {
    functionName: "rsc-mfe-staging-orders-api",
    packageDir,
    environment: { ORDERS_TABLE: "t" },
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties("AWS::Lambda::WebFunction", { FunctionName: "rsc-mfe-staging-orders-api" });
  t.hasResourceProperties("AWS::Lambda::WebFunctionRevision", {
    BuildConfig: {
      RuntimeConfig: { Runtime: "nodejs24.x" },
      CodeConfig: { S3Object: { Bucket: Match.anyValue(), Key: Match.stringLikeRegexp("\\.zip$") } },
    },
    ServiceConfig: Match.objectLike({
      TimeoutSeconds: 30,
      MaxConcurrencyPerEnvironment: 64,
      EnvironmentVariables: { ORDERS_TABLE: "t" },
    }),
  });
  t.hasResourceProperties("AWS::Lambda::WebFunctionEndpoint", {
    EndpointName: "live",
    EndpointType: "HomeRegion",
    AuthType: "ApplicationManaged",
    RevisionWeights: [{ RevisionId: { "Fn::GetAtt": [Match.anyValue(), "RevisionId"] }, Weight: 100 }],
  });
  assert.match(stack.resolve(fn.url)["Fn::Join"][1][0], /^https:\/\//);
});

test("the execution role trusts Lambda, has basic logging and no fixed name", () => {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  const stack = new StageStack(app, "orders-api", staging);
  new WebFunction(stack, "Fn", { functionName: "rsc-mfe-staging-orders-api", packageDir });
  const t = Template.fromStack(stack);
  t.hasResourceProperties("AWS::IAM::Role", {
    AssumeRolePolicyDocument: Match.objectLike({
      Statement: [Match.objectLike({ Principal: { Service: "lambda.amazonaws.com" } })],
    }),
    ManagedPolicyArns: [
      { "Fn::Join": ["", Match.arrayWith([Match.stringLikeRegexp("service-role/AWSLambdaBasicExecutionRole")])] },
    ],
  });
  const role = Object.values(t.findResources("AWS::IAM::Role"))[0] as { Properties: Record<string, unknown> };
  assert.equal(role.Properties.RoleName, undefined);
  t.hasResourceProperties("AWS::Lambda::WebFunctionRevision", {
    ServiceConfig: Match.objectLike({ EnvironmentVariables: Match.absent() }),
  });
});

function assetsFixture(t: TestContext) {
  const dir = join(import.meta.dirname, "..", packageDir, "build/client/assets");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "app-abc123.js"), "//");
  t.after(() => rmSync(join(import.meta.dirname, "..", packageDir, "build"), { recursive: true, force: true }));
}

test("client assets are deployed without pruning, before the revision takes traffic", (t) => {
  assetsFixture(t);
  const outdir = mkdtempSync(join(tmpdir(), "cdk-out-"));
  t.after(() => rmSync(outdir, { recursive: true, force: true }));
  const app = new App({ outdir });
  const stack = new StageStack(app, "orders-api", staging);
  const bucket = new s3.Bucket(stack, "Assets");
  new WebFunction(stack, "Fn", {
    functionName: "rsc-mfe-staging-orders-api",
    packageDir,
    clientAssets: { bucket, prefix: "orders-static/assets" },
  });
  const tpl = Template.fromStack(stack);
  tpl.hasResourceProperties("Custom::CDKBucketDeployment", {
    Prune: false,
    DestinationBucketKeyPrefix: "orders-static/assets",
    SystemMetadata: Match.objectLike({ "cache-control": "public,max-age=31536000,immutable" }),
  });
  const [deploymentId] = Object.keys(tpl.findResources("Custom::CDKBucketDeployment"));
  const revision = Object.values(tpl.findResources("AWS::Lambda::WebFunctionRevision"))[0] as { DependsOn: string[] };
  assert.ok(revision.DependsOn.includes(deploymentId));
});

test("without bundling there is no client asset deployment", () => {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  const stack = new StageStack(app, "orders-api", staging);
  new WebFunction(stack, "Fn", {
    functionName: "rsc-mfe-staging-orders-api",
    packageDir,
    clientAssets: { bucket: new s3.Bucket(stack, "Assets"), prefix: "orders-static/assets" },
  });
  Template.fromStack(stack).resourceCountIs("Custom::CDKBucketDeployment", 0);
});
