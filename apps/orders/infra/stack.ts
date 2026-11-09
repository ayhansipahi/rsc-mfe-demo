import * as iam from "aws-cdk-lib/aws-iam";
import type * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { StageStack } from "../../../infra/stage-stack.ts";
import { prefix } from "../../../infra/stages.ts";
import type { StageConfig } from "../../../infra/stages.ts";
import { WebFunction } from "../../../infra/web-function.ts";

export class OrdersWebStack extends StageStack {
  readonly fn: WebFunction;

  constructor(
    scope: Construct,
    stage: StageConfig,
    deps: { bucket: s3.IBucket; userPoolId: string; clientId: string; ordersApiUrl: string; ordersApiEndpointArn: string },
  ) {
    super(scope, "orders-web", stage);
    this.fn = new WebFunction(this, "Web", {
      functionName: `${prefix(stage)}-orders-web`,
      packageDir: "apps/orders",
      environment: {
        ORDERS_API_URL: deps.ordersApiUrl,
        COGNITO_USER_POOL_ID: deps.userPoolId,
        COGNITO_CLIENT_ID: deps.clientId,
        ...(stage.domain && { PUBLIC_HOST: stage.domain.name }),
      },
      clientAssets: { bucket: deps.bucket, prefix: "orders-static/assets" },
    });
    // The orders service endpoint is IAM-only; this role is the only one allowed to call it.
    this.fn.role.addToPolicy(
      new iam.PolicyStatement({ actions: ["lambda:InvokeWebFunctionEndpoint"], resources: [deps.ordersApiEndpointArn] }),
    );
  }
}
