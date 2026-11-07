import assert from "node:assert/strict";
import { test } from "node:test";
import { App } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import type { EdgeStack } from "../shells/web/infra/edge-stack.ts";
import { buildStage } from "./app.ts";
import { stages } from "./stages.ts";

const staging = stages.find((s) => s.name === "staging")!;
const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
const { edge } = buildStage(app, staging);
const stagingEdge = edge;

const domainStage = {
  ...staging,
  domain: { name: "staging.example.com", certificateArn: "arn:aws:acm:us-east-1:644789169398:certificate/abc" },
};
const domainEdge = buildStage(new App({ context: { "aws:cdk:bundling-stacks": [] } }), domainStage).edge;

type Behavior = Record<string, any>;
function config(stack: EdgeStack) {
  const [dist] = Object.values(Template.fromStack(stack).findResources("AWS::CloudFront::Distribution"));
  return dist.Properties.DistributionConfig as Record<string, any>;
}
const behaviors = (stack: EdgeStack): Behavior[] => config(stack).CacheBehaviors;

test("behaviors keep the live order", () => {
  assert.deepEqual(
    behaviors(edge).map((b) => b.PathPattern),
    ["/orders-static/assets/*", "/store-static/assets/*", "/shell-static/*", "/shell*",
      "/store-static/*", "/store*", "/orders-static/*", "/orders*", "/assets/*"],
  );
});

test("every behavior redirects to https and compresses; distribution settings", () => {
  const cfg = config(edge);
  for (const b of [cfg.DefaultCacheBehavior, ...cfg.CacheBehaviors]) {
    assert.equal(b.ViewerProtocolPolicy, "redirect-to-https");
    assert.equal(b.Compress, true);
  }
  assert.equal(cfg.HttpVersion, "http2and3");
  assert.equal(cfg.IPV6Enabled, true);
  assert.equal(cfg.PriceClass, "PriceClass_All");
});

test("page behaviors use the custom cache policy and all methods; static ones are cached and GET/HEAD", () => {
  const cfg = config(edge);
  const byPath = (p: string) => cfg.CacheBehaviors.find((b: Behavior) => b.PathPattern === p);
  const t = Template.fromStack(edge);
  const [customId] = Object.keys(t.findResources("AWS::CloudFront::CachePolicy"));
  for (const b of [cfg.DefaultCacheBehavior, byPath("/shell*"), byPath("/store*"), byPath("/orders*")]) {
    assert.deepEqual(b.CachePolicyId, { Ref: customId });
    assert.equal(b.AllowedMethods.length, 7);
    assert.equal(b.OriginRequestPolicyId, "b689b0a8-53d0-40ab-baf2-68738e2966ac");
  }
  for (const p of ["/shell-static/*", "/store-static/*", "/orders-static/*"]) {
    assert.equal(byPath(p).CachePolicyId, "658327ea-f89d-4fab-a63d-7e88639e58f6");
    assert.deepEqual(byPath(p).AllowedMethods, ["GET", "HEAD"]);
    assert.equal(byPath(p).OriginRequestPolicyId, "b689b0a8-53d0-40ab-baf2-68738e2966ac");
  }
  for (const p of ["/orders-static/assets/*", "/store-static/assets/*", "/assets/*"]) {
    assert.equal(byPath(p).CachePolicyId, "658327ea-f89d-4fab-a63d-7e88639e58f6");
    assert.equal(byPath(p).OriginRequestPolicyId, undefined);
  }
  assert.notEqual(byPath("/assets/*").TargetOriginId, byPath("/shell-static/*").TargetOriginId);
});

test("custom cache policy: origin cache-control, all query strings, no headers or cookies", () => {
  Template.fromStack(edge).hasResourceProperties("AWS::CloudFront::CachePolicy", {
    CachePolicyConfig: Match.objectLike({
      Name: "rsc-mfe-staging-origin-cc-qs",
      MinTTL: 0,
      DefaultTTL: 0,
      MaxTTL: 31536000,
      ParametersInCacheKeyAndForwardedToOrigin: {
        EnableAcceptEncodingGzip: true,
        EnableAcceptEncodingBrotli: true,
        HeadersConfig: { HeaderBehavior: "none" },
        CookiesConfig: { CookieBehavior: "none" },
        QueryStringsConfig: { QueryStringBehavior: "all" },
      },
    }),
  });
});

test("function origins: https only, TLSv1.2, 30s read, 60s keepalive, 3 attempts, 10s connect", () => {
  const origins = config(edge).Origins.filter((o: Behavior) => o.CustomOriginConfig);
  assert.equal(origins.length, 4);
  for (const o of origins) {
    assert.deepEqual(o.CustomOriginConfig, ({
      OriginProtocolPolicy: "https-only",
      OriginSSLProtocols: ["TLSv1.2"],
      OriginReadTimeout: 30,
      OriginKeepaliveTimeout: 60,
    }));
    assert.equal(o.ConnectionAttempts, 3);
    assert.equal(o.ConnectionTimeout, 10);
  }
});

test("no domain: no aliases, DistributionUrl is the CloudFront hostname", () => {
  const t = Template.fromStack(stagingEdge);
  t.hasResourceProperties("AWS::CloudFront::Distribution", { DistributionConfig: Match.objectLike({ Aliases: Match.absent() }) });
  t.hasOutput("DistributionUrl", { Value: { "Fn::Join": ["", ["https://", { "Fn::GetAtt": [Match.anyValue(), "DomainName"] }]] } });
});

test("with a domain: alias, certificate, TLSv1.2_2021", () => {
  const t = Template.fromStack(domainEdge);
  t.hasResourceProperties("AWS::CloudFront::Distribution", { DistributionConfig: Match.objectLike({
    Aliases: ["staging.example.com"],
    ViewerCertificate: Match.objectLike({ MinimumProtocolVersion: "TLSv1.2_2021", SslSupportMethod: "sni-only" }),
  }) });
  t.hasOutput("DistributionUrl", { Value: { "Fn::Join": ["", ["https://", { "Fn::GetAtt": [Match.anyValue(), "DomainName"] }]] } });
});

test("only this distribution may read the bucket; plain http is denied", () => {
  Template.fromStack(edge).hasResourceProperties("AWS::S3::BucketPolicy", { PolicyDocument: { Statement: Match.arrayWith([
    Match.objectLike({ Effect: "Allow", Principal: { Service: "cloudfront.amazonaws.com" }, Action: "s3:GetObject",
      Condition: { StringEquals: { "AWS:SourceArn": Match.anyValue() } } }),
    Match.objectLike({ Effect: "Deny", Action: "s3:*", Condition: { Bool: { "aws:SecureTransport": "false" } } }),
  ]) } });
});

test("the distribution carries the stage tags", () => {
  Template.fromStack(edge).hasResourceProperties("AWS::CloudFront::Distribution", {
    Tags: Match.arrayWith([{ Key: "project", Value: "rsc-mfe" }, { Key: "stage", Value: "staging" }]),
  });
});

test("the imported-bucket OAC warning is acknowledged: no warnings from the edge stack's own constructs", () => {
  const warnings = Annotations.fromStack(edge).findWarning("*", Match.anyValue());
  assert.deepEqual(warnings.filter((w) => String(w.entry.data).includes("imported bucket")), []);
});
