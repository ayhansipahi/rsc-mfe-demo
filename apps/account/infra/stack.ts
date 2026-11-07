import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import type * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { StageStack } from "../../../infra/stage-stack.ts";
import { prefix } from "../../../infra/stages.ts";
import type { StageConfig } from "../../../infra/stages.ts";
import { WebFunction } from "../../../infra/web-function.ts";

export class AccountStack extends StageStack {
  readonly userPoolId: string;
  readonly clientId: string;
  readonly fn: WebFunction;

  constructor(scope: Construct, stage: StageConfig, deps: { bucket: s3.IBucket }) {
    super(scope, "account", stage);
    const { domain, mobile } = stage;

    const pool = new cognito.UserPool(this, "Pool", {
      userPoolName: `${prefix(stage)}-users`,
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      signInPolicy: { allowedFirstAuthFactors: { password: true, passkey: domain !== undefined } },
      ...(domain && {
        passkeyRelyingPartyId: domain.name,
        passkeyUserVerification: cognito.PasskeyUserVerification.REQUIRED,
      }),
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Confidential client: the secret stays in the web function's environment.
    const client = pool.addClient("Web", {
      userPoolClientName: "web-confidential",
      generateSecret: true,
      disableOAuth: true,
      authFlows: { user: true },
      authSessionValidity: Duration.minutes(15),
    });
    this.userPoolId = pool.userPoolId;
    this.clientId = client.userPoolClientId;

    this.fn = new WebFunction(this, "Web", {
      functionName: `${prefix(stage)}-web`,
      packageDir: "apps/account",
      environment: {
        COGNITO_USER_POOL_ID: pool.userPoolId,
        COGNITO_CLIENT_ID: client.userPoolClientId,
        COGNITO_CLIENT_SECRET: (client.node.defaultChild as cognito.CfnUserPoolClient).attrClientSecret,
        ...(domain && { PUBLIC_HOST: domain.name }),
        ...(mobile && {
          APPLE_APP_IDS: mobile.appleAppIds,
          ANDROID_PACKAGE: mobile.androidPackage,
          ANDROID_CERT_SHA256: mobile.androidCertSha256,
        }),
      },
      clientAssets: { bucket: deps.bucket, prefix: "assets" },
    });
    this.fn.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:AdminInitiateAuth", "cognito-idp:AdminRespondToAuthChallenge"],
        resources: [pool.userPoolArn],
      }),
    );
  }
}
