import { RemovalPolicy } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { StageStack } from "../../../infra/stage-stack.ts";
import { prefix } from "../../../infra/stages.ts";
import type { StageConfig } from "../../../infra/stages.ts";

/** Hashed client assets of every revision, never pruned. The edge stack owns the only bucket policy. */
export class AssetsStack extends StageStack {
  readonly bucket: s3.Bucket;

  constructor(scope: Construct, stage: StageConfig) {
    super(scope, "assets", stage);
    this.bucket = new s3.Bucket(this, "Bucket", {
      bucketName: `${prefix(stage)}-assets`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: false,
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
