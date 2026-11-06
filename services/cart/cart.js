// The store team's carts: one item per line, keyed by the Cognito sub and the product id. The
// catalog lives in the store app, so this service stores ids and quantities only.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

let doc;
const db = () => (doc ??= DynamoDBDocumentClient.from(new DynamoDBClient({})));
const TableName = () => process.env.CARTS_TABLE;

export async function getLines(sub) {
  const out = await db().send(
    new QueryCommand({
      TableName: TableName(),
      KeyConditionExpression: "#owner = :sub",
      ExpressionAttributeNames: { "#owner": "owner" },
      ExpressionAttributeValues: { ":sub": sub },
    }),
  );
  return (out.Items ?? []).filter((i) => i.qty > 0).map((i) => ({ productId: i.productId, qty: i.qty }));
}

export async function addLine(sub, productId) {
  await db().send(
    new UpdateCommand({
      TableName: TableName(),
      Key: { owner: sub, productId },
      UpdateExpression: "ADD qty :one",
      ExpressionAttributeValues: { ":one": 1 },
    }),
  );
}

export async function removeLine(sub, productId) {
  await db().send(new DeleteCommand({ TableName: TableName(), Key: { owner: sub, productId } }));
}
