// Sends a notification to the mobile shell through the Expo push service. Run by hand: the Lambda
// console's Test tab, or `aws lambda invoke --function-name rsc-mfe-<stage>-push-send
// --cli-binary-format raw-in-base64-out --payload '{"title":"..."}' /dev/stdout`. Event:
// { "title": "Order shipped", "body": "On its way.", "url": "https://<domain>/orders", "email": "only@this.user" }
// Without email it goes to every device. A tap opens url in the app. Inline code: the runtime's
// AWS SDK and fetch are all it needs.
// ponytail: tokens Expo reports as DeviceNotRegistered stay in the table; delete them here if the
// list grows stale.
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const db = new DynamoDBClient({});

exports.handler = async ({ title, body, url, email }) => {
  const { Items = [] } = await db.send(
    new QueryCommand({
      TableName: process.env.PUSH_TABLE,
      KeyConditionExpression: "pk = :pk",
      ...(email && { FilterExpression: "email = :email" }),
      ExpressionAttributeValues: { ":pk": { S: "device" }, ...(email && { ":email": { S: email } }) },
    }),
  );
  const messages = Items.map((i) => ({ to: i.token.S, title, body, sound: "default", data: url ? { url } : {} }));
  const tickets = [];
  // The push service takes up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const r = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
    tickets.push(...((await r.json()).data ?? []));
  }
  return { devices: messages.length, tickets };
};
