import { App, BootstraplessSynthesizer, Stage } from "aws-cdk-lib";
import { AccountStack } from "../apps/account/infra/stack.ts";
import { OrdersWebStack } from "../apps/orders/infra/stack.ts";
import { StoreWebStack } from "../apps/store/infra/stack.ts";
import { CartApiStack } from "../services/cart/infra/stack.ts";
import { OrdersApiStack } from "../services/orders/infra/stack.ts";
import { AssetsStack } from "../shells/web/infra/assets-stack.ts";
import { EdgeStack } from "../shells/web/infra/edge-stack.ts";
import { ShellStack } from "../shells/web/infra/shell-stack.ts";
import { BootstrapStack } from "./bootstrap.ts";
import { githubRepo, stages } from "./stages.ts";
import type { StageConfig } from "./stages.ts";

export function buildStage(app: App, stage: StageConfig) {
  const scope = new Stage(app, stage.name, { env: { account: stage.account, region: stage.region } });
  const assets = new AssetsStack(scope, stage);
  const account = new AccountStack(scope, stage, { bucket: assets.bucket });
  const auth = { userPoolId: account.userPoolId, clientId: account.clientId };
  const ordersApi = new OrdersApiStack(scope, stage, auth);
  const cartApi = new CartApiStack(scope, stage, auth);
  const shell = new ShellStack(scope, stage);
  const ordersWeb = new OrdersWebStack(scope, stage, { bucket: assets.bucket, ...auth, ordersApiUrl: ordersApi.url });
  const storeWeb = new StoreWebStack(scope, stage, { bucket: assets.bucket, ...auth, cartApiUrl: cartApi.url });
  const edge = new EdgeStack(scope, stage, {
    bucket: assets.bucket,
    account: account.fn.domainName,
    shell: shell.fn.domainName,
    orders: ordersWeb.fn.domainName,
    store: storeWeb.fn.domainName,
  });
  return { assets, account, ordersApi, cartApi, shell, ordersWeb, storeWeb, edge };
}

if (import.meta.main) {
  const app = new App();
  for (const stage of stages) buildStage(app, stage);
  // One admin-deployed bootstrap stack per account, in the region of its stages.
  for (const account of new Set(stages.map((s) => s.account))) {
    const accountStages = stages.filter((s) => s.account === account);
    new BootstrapStack(app, `bootstrap-${account}`, {
      stackName: "rsc-mfe-bootstrap",
      env: { account, region: accountStages[0].region },
      synthesizer: new BootstraplessSynthesizer(),
      stages: accountStages,
      repo: githubRepo,
    });
  }
  app.synth();
}
