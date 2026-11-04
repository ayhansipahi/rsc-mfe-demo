// The orders vertical owns its data. There is no orders service to call: the web function reads
// the table directly, and the only thing standing between the page and the rows is this
// function's execution role, which can Query one table and nothing else.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

export interface Order {
  orderId: string;
  item: string;
  total: string;
}

let doc: DynamoDBDocumentClient | undefined;

export async function listOrders(user: { sub: string }): Promise<Order[]> {
  doc ??= DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const out = await doc.send(
    new QueryCommand({
      TableName: process.env.ORDERS_TABLE!,
      KeyConditionExpression: "#owner = :sub",
      ExpressionAttributeNames: { "#owner": "owner" },
      ExpressionAttributeValues: { ":sub": user.sub },
    }),
  );
  return (out.Items ?? []) as Order[];
}
