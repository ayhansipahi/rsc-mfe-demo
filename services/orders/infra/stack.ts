import { RemovalPolicy } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { StageStack } from "../../../infra/stage-stack.ts";
import { prefix } from "../../../infra/stages.ts";
import type { StageConfig } from "../../../infra/stages.ts";
import { WebFunction } from "../../../infra/web-function.ts";

export class OrdersApiStack extends StageStack {
  readonly url: string;
  /** Only the orders app's role is granted lambda:InvokeWebFunctionEndpoint on this. */
  readonly endpointArn: string;

  constructor(scope: Construct, stage: StageConfig, deps: { userPoolId: string; clientId: string }) {
    super(scope, "orders-api", stage);
    const table = new dynamodb.Table(this, "Table", {
      tableName: `${prefix(stage)}-orders`,
      partitionKey: { name: "owner", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "orderId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const fn = new WebFunction(this, "Api", {
      functionName: `${prefix(stage)}-orders-api`,
      packageDir: "services/orders",
      authType: "IamAuth",
      environment: {
        ORDERS_TABLE: table.tableName,
        COGNITO_USER_POOL_ID: deps.userPoolId,
        COGNITO_CLIENT_ID: deps.clientId,
      },
    });
    fn.role.addToPolicy(new iam.PolicyStatement({ actions: ["dynamodb:Query"], resources: [table.tableArn] }));
    this.url = fn.url;
    this.endpointArn = fn.endpointArn;
  }
}
