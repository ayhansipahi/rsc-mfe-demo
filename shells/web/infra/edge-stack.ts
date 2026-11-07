import { Annotations, CfnOutput, Duration } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { StageStack } from "../../../infra/stage-stack.ts";
import { prefix } from "../../../infra/stages.ts";
import type { StageConfig } from "../../../infra/stages.ts";

export interface EdgeProps {
  bucket: s3.IBucket;
  /** Endpoint hostnames of the web functions. */
  account: string;
  shell: string;
  orders: string;
  store: string;
}

/** CloudFront in front of the four verticals (account is the default origin) and the assets bucket. */
export class EdgeStack extends StageStack {
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, stage: StageConfig, props: EdgeProps) {
    super(scope, "edge", stage);

    const fn = (domainName: string) =>
      new origins.HttpOrigin(domainName, {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
        readTimeout: Duration.seconds(30),
        keepaliveTimeout: Duration.seconds(60),
        connectionAttempts: 3,
        connectionTimeout: Duration.seconds(10),
      });
    const account = fn(props.account);
    const shell = fn(props.shell);
    const orders = fn(props.orders);
    const store = fn(props.store);
    Annotations.of(this).acknowledgeWarning(
      "@aws-cdk/aws-cloudfront-origins:updateImportedBucketPolicyOac",
      "the explicit CfnBucketPolicy below grants this distribution read access to the bucket",
    );
    // Name-only reference: the edge stack owns the bucket policy, so OAC must not edit the bucket's own.
    const assets = origins.S3BucketOrigin.withOriginAccessControl(
      s3.Bucket.fromBucketName(this, "Assets", props.bucket.bucketName),
    );

    const originCacheControl = new cloudfront.CachePolicy(this, "OriginCacheControl", {
      cachePolicyName: `${prefix(stage)}-origin-cc-qs`,
      minTtl: Duration.seconds(0),
      defaultTtl: Duration.seconds(0),
      maxTtl: Duration.days(365),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
    const originRequestPolicy = cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER;
    const common = { viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, compress: true };
    const page = (origin: cloudfront.IOrigin) => ({
      ...common,
      origin,
      cachePolicy: originCacheControl,
      originRequestPolicy,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
    });
    const functionStatic = (origin: cloudfront.IOrigin) => ({
      ...common,
      origin,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      originRequestPolicy,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
    });
    const bucketStatic = {
      ...common,
      origin: assets,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
    };

    const domain = stage.domain;
    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: page(account),
      // Order matters: more specific patterns first, as on the live distribution.
      additionalBehaviors: {
        "/orders-static/assets/*": bucketStatic,
        "/store-static/assets/*": bucketStatic,
        "/shell-static/*": functionStatic(shell),
        "/shell*": page(shell),
        "/store-static/*": functionStatic(store),
        "/store*": page(store),
        "/orders-static/*": functionStatic(orders),
        "/orders*": page(orders),
        "/assets/*": bucketStatic,
      },
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      ...(domain && {
        domainNames: [domain.name],
        certificate: acm.Certificate.fromCertificateArn(this, "Certificate", domain.certificateArn),
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      }),
    });

    const bucketArn = `arn:${this.partition}:s3:::${props.bucket.bucketName}`;
    new s3.CfnBucketPolicy(this, "AssetsPolicy", {
      bucket: props.bucket.bucketName,
      policyDocument: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
            actions: ["s3:GetObject"],
            resources: [`${bucketArn}/*`],
            conditions: {
              StringEquals: {
                "AWS:SourceArn": `arn:${this.partition}:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
              },
            },
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            principals: [new iam.AnyPrincipal()],
            actions: ["s3:*"],
            resources: [bucketArn, `${bucketArn}/*`],
            conditions: { Bool: { "aws:SecureTransport": "false" } },
          }),
        ],
      }),
    });

    // Always the CloudFront name: it keeps answering with an alias attached, and it is the CNAME target.
    new CfnOutput(this, "DistributionUrl", { value: `https://${this.distribution.distributionDomainName}` });
  }
}
