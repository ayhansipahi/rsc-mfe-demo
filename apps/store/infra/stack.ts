import * as iam from "aws-cdk-lib/aws-iam";
import type * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { StageStack } from "../../../infra/stage-stack.ts";
import { prefix } from "../../../infra/stages.ts";
import type { StageConfig } from "../../../infra/stages.ts";
import { WebFunction } from "../../../infra/web-function.ts";

export class StoreWebStack extends StageStack {
  readonly fn: WebFunction;

  constructor(
    scope: Construct,
    stage: StageConfig,
    deps: { bucket: s3.IBucket; userPoolId: string; clientId: string; cartApiUrl: string },
  ) {
    super(scope, "store-web", stage);
    this.fn = new WebFunction(this, "Web", {
      functionName: `${prefix(stage)}-store-web`,
      packageDir: "apps/store",
      environment: {
        CART_API_URL: deps.cartApiUrl,
        COGNITO_USER_POOL_ID: deps.userPoolId,
        COGNITO_CLIENT_ID: deps.clientId,
        ...(stage.domain && { PUBLIC_HOST: stage.domain.name }),
      },
      clientAssets: { bucket: deps.bucket, prefix: "store-static/assets" },
    });
    this.fn.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:eu-central-1:${stage.account}:inference-profile/eu.anthropic.claude-haiku-4-5-20251001-v1:0`,
          "arn:aws:bedrock:eu-*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0",
        ],
      }),
    );
  }
}
