import assert from "node:assert/strict";
import { test } from "node:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
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
