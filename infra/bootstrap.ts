import { CfnCondition, CfnParameter, Duration, Fn, RemovalPolicy, Stack, Token } from "aws-cdk-lib";
import type { StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { prefix } from "./stages.ts";
import type { StageConfig } from "./stages.ts";

const oidcHost = "token.actions.githubusercontent.com";

type Conditions = Record<string, Record<string, string>>;
const allow = (actions: string[], resources: string[], conditions?: Conditions) =>
  new iam.PolicyStatement({ actions, resources, conditions });

export interface BootstrapProps extends StackProps {
  stages: StageConfig[];
  /** GitHub `owner/name` whose workflows may assume the pipeline roles. */
  repo: string;
}

/**
 * Deployed once per account by an admin, instead of `cdk bootstrap`: GitHub OIDC trust, the read-only PR
 * role, and per stage the CDK asset bucket, the permissions boundary, the CloudFormation execution role and
 * the pipeline role. Its names never match a stage's `rsc-mfe-<stage>-*`, so no stage can touch them.
 */
export class BootstrapStack extends Stack {
  constructor(scope: Construct, id: string, props: BootstrapProps) {
    super(scope, id, props);

    const createOidc = new CfnParameter(this, "CreateOidcProvider", {
      type: "String",
      allowedValues: ["true", "false"],
      default: "false",
      description: "true only when the account has no GitHub Actions OIDC provider yet",
    });
    const condition = new CfnCondition(this, "CreateOidc", {
      expression: Fn.conditionEquals(createOidc.valueAsString, "true"),
    });
    const provider = new iam.CfnOIDCProvider(this, "GitHubOidc", {
      url: `https://${oidcHost}`,
      clientIdList: ["sts.amazonaws.com"],
    });
    provider.cfnOptions.condition = condition;
    // The same ARN either way; the Ref only orders the roles after the provider when this stack creates it.
    const providerArn = Token.asString(
      Fn.conditionIf(condition.logicalId, provider.ref, `arn:aws:iam::${this.account}:oidc-provider/${oidcHost}`),
    );
    const github = (sub: string) =>
      new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: { [`${oidcHost}:aud`]: "sts.amazonaws.com", [`${oidcHost}:sub`]: `repo:${props.repo}:${sub}` },
      });

    // `cdk diff --no-change-set` on pull requests.
    new iam.Role(this, "DiffRole", {
      roleName: "rsc-mfe-gh-diff",
      assumedBy: github("pull_request"),
      inlinePolicies: {
        diff: new iam.PolicyDocument({
          statements: [
            allow(
              [
                "cloudformation:DescribeStacks",
                "cloudformation:GetTemplate",
                "cloudformation:GetTemplateSummary",
                "cloudformation:DescribeStackResources",
              ],
              [this.stackArn("rsc-mfe-*")],
            ),
          ],
        }),
      },
    });

    for (const stage of props.stages) this.addStage(stage, github(`environment:${stage.name}`));
  }

  private stackArn(name: string): string {
    return `arn:aws:cloudformation:${this.region}:${this.account}:stack/${name}/*`;
  }

  private addStage(stage: StageConfig, pipelinePrincipal: iam.IPrincipal) {
    const { account, region } = this;
    const s = stage.name;
    const p = prefix(stage);
    const scope = new Construct(this, s);

    const cdkBucketName = `rsc-mfe-cdk-${s}-${account}-${region}`;
    new s3.Bucket(scope, "CdkAssets", {
      bucketName: cdkBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      // Versioned so the lifecycle rule has replaced and deleted objects to expire.
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }],
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const cdkBucketArn = `arn:aws:s3:::${cdkBucketName}`;
    const cdkObjects = `${cdkBucketArn}/*`;
    const stageBuckets = [`arn:aws:s3:::${p}-*`, `arn:aws:s3:::${p}-*/*`];
    const stageTables = `arn:aws:dynamodb:${region}:${account}:table/${p}-*`;
    const stageRoles = `arn:aws:iam::${account}:role/${p}-*`;
    const userPools = `arn:aws:cognito-idp:${region}:${account}:userpool/*`;
    const distributions = `arn:aws:cloudfront::${account}:distribution/*`;
    const boundaryArn = `arn:aws:iam::${account}:policy/rsc-mfe-boundary-${s}`;
    const execRoleArn = `arn:aws:iam::${account}:role/rsc-mfe-cfn-exec-${s}`;
    const requestTags = { "aws:RequestTag/project": "rsc-mfe", "aws:RequestTag/stage": s };
    const ownTag = { "aws:ResourceTag/stage": s };

    // The ceiling for every role a stage stack creates: what the web functions and BucketDeployment call.
    new iam.ManagedPolicy(scope, "Boundary", {
      managedPolicyName: `rsc-mfe-boundary-${s}`,
      statements: [
        allow(["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], [
          `arn:aws:logs:${region}:${account}:log-group:*`,
        ]),
        allow(["dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"], [
          stageTables,
        ]),
        allow(["cognito-idp:AdminInitiateAuth", "cognito-idp:AdminRespondToAuthChallenge"], [userPools]),
        allow(["bedrock:InvokeModel"], [
          `arn:aws:bedrock:${region}:${account}:inference-profile/eu.*`,
          "arn:aws:bedrock:eu-*::foundation-model/*",
        ]),
        allow(["s3:GetObject"], [cdkObjects]),
        allow(["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"], stageBuckets),
      ],
    });

    new iam.Role(scope, "ExecRole", {
      roleName: `rsc-mfe-cfn-exec-${s}`,
      assumedBy: new iam.ServicePrincipal("cloudformation.amazonaws.com"),
      inlinePolicies: {
        exec: new iam.PolicyDocument({
          statements: [
            // Web functions, and the BucketDeployment handler (CloudFormation names it after the stack).
            allow(["lambda:*"], [
              `arn:aws:lambda:${region}:${account}:web-function/${p}-*`,
              `arn:aws:lambda:${region}:${account}:web-function/${p}-*/*`,
              `arn:aws:lambda:${region}:${account}:function:${p}-*`,
            ]),
            // The AwsCliLayer of BucketDeployment gets a generated name.
            allow(["lambda:PublishLayerVersion", "lambda:GetLayerVersion", "lambda:DeleteLayerVersion"], [
              `arn:aws:lambda:${region}:${account}:layer:*`,
            ]),
            allow(["lambda:Get*", "lambda:List*"], ["*"]),
            allow(["dynamodb:*"], [stageTables]),
            allow(["dynamodb:DescribeTable", "dynamodb:ListTables"], ["*"]),
            allow(["s3:*"], stageBuckets),
            allow(["s3:GetObject"], [cdkObjects]),
            // User pool ids are generated, so pools are scoped by tag. CreateUserPool takes no resource.
            allow(["cognito-idp:CreateUserPool", "cognito-idp:TagResource"], ["*"], {
              StringEquals: requestTags,
              StringEqualsIfExists: ownTag,
            }),
            allow(["cognito-idp:*"], [userPools], { StringEquals: ownTag }),
            // Distribution ids are generated too. Creating cannot touch an existing distribution; tagging
            // (CreateDistributionWithTags also authorizes TagResource) must carry the stage's tags.
            allow(["cloudfront:CreateDistribution"], [distributions]),
            allow(["cloudfront:TagResource"], [distributions], {
              StringEquals: requestTags,
              StringEqualsIfExists: ownTag,
            }),
            allow(
              [
                "cloudfront:GetDistribution",
                "cloudfront:GetDistributionConfig",
                "cloudfront:UpdateDistribution",
                "cloudfront:DeleteDistribution",
                "cloudfront:UntagResource",
                "cloudfront:ListTagsForResource",
                "cloudfront:CreateInvalidation",
                "cloudfront:GetInvalidation",
              ],
              [distributions],
              { StringEquals: ownTag },
            ),
            // Cache policies, origin access controls and origin request policies take no tags: the documented gap.
            allow(
              [
                "cloudfront:*CachePolicy*",
                "cloudfront:ListCachePolicies",
                "cloudfront:*OriginAccessControl*",
                "cloudfront:*OriginRequestPolicy*",
                "cloudfront:ListOriginRequestPolicies",
              ],
              ["*"],
            ),
            allow(
              [
                "iam:GetRole",
                "iam:DeleteRole",
                "iam:TagRole",
                "iam:UntagRole",
                "iam:DeleteRolePolicy",
                "iam:DetachRolePolicy",
                "iam:GetRolePolicy",
                "iam:List*RolePolicies",
                "iam:UpdateAssumeRolePolicy",
                "iam:PassRole",
              ],
              [stageRoles],
            ),
            allow(["iam:CreateRole", "iam:PutRolePolicy", "iam:AttachRolePolicy", "iam:PutRolePermissionsBoundary"], [stageRoles], {
              StringEquals: { "iam:PermissionsBoundary": boundaryArn },
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.DENY,
              actions: ["iam:DeleteRolePermissionsBoundary"],
              resources: ["*"],
            }),
          ],
        }),
      },
    });

    // Deploys with its own credentials only to publish assets; CloudFormation acts as the exec role.
    new iam.Role(scope, "PipelineRole", {
      roleName: `rsc-mfe-gh-${s}`,
      assumedBy: pipelinePrincipal,
      inlinePolicies: {
        deploy: new iam.PolicyDocument({
          statements: [
            allow(["cloudformation:*"], [this.stackArn(`${p}-*`)]),
            allow(["iam:PassRole"], [execRoleArn]),
            allow(["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:GetBucketLocation"], [cdkBucketArn, cdkObjects]),
          ],
        }),
      },
    });
  }
}
