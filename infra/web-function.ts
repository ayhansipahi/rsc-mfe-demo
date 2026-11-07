import path from "node:path";
import { AssetHashType, DockerImage, Stack } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import type * as s3 from "aws-cdk-lib/aws-s3";
import * as s3_assets from "aws-cdk-lib/aws-s3-assets";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import { bundlePackage, sourceHash } from "./bundle.ts";

const root = path.resolve(import.meta.dirname, "..");

export interface WebFunctionProps {
  functionName: string;
  /** Repo-relative workspace path, e.g. "services/orders". */
  packageDir: string;
  environment?: Record<string, string>;
  /** Hashed client assets are copied here, never pruned, so every revision's HTML finds its files. */
  clientAssets?: { bucket: s3.IBucket; prefix: string };
}

/** One Lambda Web Function: its own role, a bundled revision, and a `live` endpoint at 100%. */
export class WebFunction extends Construct {
  readonly role: iam.Role;
  readonly domainName: string;
  readonly url: string;

  constructor(scope: Construct, id: string, props: WebFunctionProps) {
    super(scope, id);
    const { functionName, packageDir, environment = {}, clientAssets } = props;

    this.role = new iam.Role(this, "Role", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
    });

    const asset = new s3_assets.Asset(this, "Code", {
      path: path.join(root, packageDir),
      assetHashType: AssetHashType.CUSTOM,
      assetHash: sourceHash(packageDir),
      bundling: {
        image: DockerImage.fromRegistry("node:24"),
        local: {
          tryBundle(outputDir: string) {
            bundlePackage(packageDir, outputDir);
            return true;
          },
        },
      },
    });

    const fn = new lambda.CfnWebFunction(this, "Function", { functionName });

    const revision = new lambda.CfnWebFunctionRevision(this, "Revision", {
      functionName,
      buildConfig: {
        codeConfig: { s3Object: { bucket: asset.s3BucketName, key: asset.s3ObjectKey } },
        runtimeConfig: { runtime: "nodejs24.x" },
      },
      serviceConfig: {
        executionRoleArn: this.role.roleArn,
        timeoutSeconds: 30,
        maxConcurrencyPerEnvironment: 64,
        environmentVariables: Object.keys(environment).length > 0 ? environment : undefined,
      },
    });
    revision.addDependency(fn);

    const endpoint = new lambda.CfnWebFunctionEndpoint(this, "Endpoint", {
      functionName,
      endpointName: "live",
      endpointType: "HomeRegion",
      authType: "ApplicationManaged",
      revisionWeights: [{ revisionId: revision.attrRevisionId, weight: 100 }],
    });
    endpoint.addDependency(fn);

    this.domainName = endpoint.attrDomainName;
    this.url = `https://${this.domainName}`;

    if (clientAssets && Stack.of(this).bundlingRequired) {
      const deployment = new s3deploy.BucketDeployment(this, "ClientAssets", {
        sources: [s3deploy.Source.asset(path.join(root, packageDir, "build/client/assets"))],
        destinationBucket: clientAssets.bucket,
        destinationKeyPrefix: clientAssets.prefix,
        prune: false,
        cacheControl: [s3deploy.CacheControl.fromString("public,max-age=31536000,immutable")],
      });
      // New hashed assets must be in S3 before any traffic can reach the revision that references them.
      revision.node.addDependency(deployment);
    }
  }
}
