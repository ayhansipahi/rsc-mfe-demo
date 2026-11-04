// The orders service is a Lambda with no URL and no API Gateway. The only way in is
// lambda:InvokeFunction, which the web function's execution role has and nothing else does.
// Identity is passed as data: the service trusts the caller because IAM already did.
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { SessionUser } from "./session.server";

let cached: LambdaClient | undefined;
const lambda = () => (cached ??= new LambdaClient({ region: process.env.AWS_REGION ?? process.env.COGNITO_USER_POOL_ID!.split("_")[0] }));

export interface Order {
  id: string;
  item: string;
  total: number;
}

export async function listOrders(user: SessionUser): Promise<Order[]> {
  const out = await lambda().send(
    new InvokeCommand({
      FunctionName: process.env.ORDERS_FUNCTION!,
      Payload: JSON.stringify({ sub: user.sub, username: user.username }),
    }),
  );
  const body = JSON.parse(out.Payload!.transformToString());
  if (out.FunctionError) throw new Error(body.errorMessage ?? out.FunctionError);
  return body.orders;
}
