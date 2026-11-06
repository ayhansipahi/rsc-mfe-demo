// The orders team's data: one DynamoDB table keyed by the Cognito sub. Only this function's role
// can Query it.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

let doc;

export async function listOrders(sub) {
  doc ??= DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const out = await doc.send(
    new QueryCommand({
      TableName: process.env.ORDERS_TABLE,
      KeyConditionExpression: "#owner = :sub",
      ExpressionAttributeNames: { "#owner": "owner" },
      ExpressionAttributeValues: { ":sub": sub },
    }),
  );
  return out.Items ?? [];
}
