// The mobile shell's Expo push token, sent by a page inside the app (see shells/mobile/shell.tsx).
// POST stores it under the signed-in user. DELETE drops it without a session: the token is its own
// key, and the shell drops it after a sign-out, when no session is left. The account stack's
// push-send function reads the table.
import { DeleteItemCommand, DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { getUser } from "@rsc-mfe/shell/session.server";

export const db = new DynamoDBClient({});

// ponytail: every device under one partition key, so a send is a single Query (the stage boundary
// grants no Scan). Fine to thousands of devices; key by user with an index when it outgrows that.
export async function action({ request }: { request: Request }) {
  const token = (await request.text()).trim();
  if (!/^Expo(nent)?PushToken\[[\w-]+\]$/.test(token)) return new Response("not a push token", { status: 400 });
  const Key = { pk: { S: "device" }, token: { S: token } };
  if (request.method === "DELETE") {
    await db.send(new DeleteItemCommand({ TableName: process.env.PUSH_TABLE, Key }));
    return new Response(null, { status: 204 });
  }
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const user = await getUser(request);
  if (!user) return new Response(null, { status: 401 });
  await db.send(new PutItemCommand({ TableName: process.env.PUSH_TABLE, Item: { ...Key, email: { S: user.username } } }));
  return new Response(null, { status: 204 });
}
