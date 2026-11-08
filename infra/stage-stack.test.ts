import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as iam from "aws-cdk-lib/aws-iam";
import { StageStack } from "./stage-stack.ts";
import { stages } from "./stages.ts";

const staging = stages.find((s) => s.name === "staging")!;

test("a stage stack is named, tagged, bounded and publishes to its own bucket", () => {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  const stack = new StageStack(app, "orders-api", staging);
  new iam.Role(stack, "R", { assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com") });
  const t = Template.fromStack(stack);
  assert.equal(stack.stackName, "rsc-mfe-staging-orders-api");
  t.hasResourceProperties("AWS::IAM::Role", {
    PermissionsBoundary: { "Fn::Join": ["", Match.arrayWith([Match.stringLikeRegexp(":policy/rsc-mfe-boundary-staging")])] },
    Tags: Match.arrayWith([{ Key: "project", Value: "rsc-mfe" }, { Key: "stage", Value: "staging" }]),
  });
  const assembly = app.synth();
  const assets = readFileSync(join(assembly.directory, "rsc-mfe-staging-orders-api.assets.json"), "utf8");
  assert.match(assets, /"bucketName": "rsc-mfe-cdk-staging-644789169398-eu-central-1"/);
});
