import { CliCredentialsStackSynthesizer, Stack, Tags } from "aws-cdk-lib";
import type { StackProps } from "aws-cdk-lib";
import { ManagedPolicy, PermissionsBoundary } from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { prefix } from "./stages.ts";
import type { StageConfig } from "./stages.ts";

export class StageStack extends Stack {
  readonly stage: StageConfig;

  constructor(scope: Construct, name: string, stage: StageConfig, props?: StackProps) {
    super(scope, `${prefix(stage)}-${name}`, {
      ...props,
      stackName: `${prefix(stage)}-${name}`,
      env: { account: stage.account, region: stage.region },
      synthesizer: new CliCredentialsStackSynthesizer({
        fileAssetsBucketName: `rsc-mfe-cdk-${stage.name}-\${AWS::AccountId}-\${AWS::Region}`,
      }),
    });
    this.stage = stage;
    Tags.of(this).add("project", "rsc-mfe");
    Tags.of(this).add("stage", stage.name);
    PermissionsBoundary.of(this).apply(
      ManagedPolicy.fromManagedPolicyName(this, "Boundary", `rsc-mfe-boundary-${stage.name}`),
    );
  }
}
