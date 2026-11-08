import type { Construct } from "constructs";
import { StageStack } from "../../../infra/stage-stack.ts";
import { prefix } from "../../../infra/stages.ts";
import type { StageConfig } from "../../../infra/stages.ts";
import { WebFunction } from "../../../infra/web-function.ts";

export class ShellStack extends StageStack {
  readonly fn: WebFunction;

  constructor(scope: Construct, stage: StageConfig) {
    super(scope, "shell", stage);
    this.fn = new WebFunction(this, "Web", {
      functionName: `${prefix(stage)}-shell-web`,
      packageDir: "shells/web",
    });
  }
}
