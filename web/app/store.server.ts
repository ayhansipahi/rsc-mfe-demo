// The store vertical owns its catalog and its carts. The catalog ships with the code; carts live in
// one DynamoDB table, one item per line keyed by the Cognito sub and the product id, and only this
// vertical's role can read or write it.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export interface Product {
  id: string;
  name: string;
  price: number;
  tone: string;
}

export const catalog: Product[] = [
  { id: "kbd", name: "Mechanical keyboard", price: 89, tone: "bg-sky-500" },
  { id: "mse", name: "Wireless mouse", price: 39, tone: "bg-emerald-500" },
  { id: "mon", name: "27-inch monitor", price: 249, tone: "bg-amber-500" },
  { id: "dck", name: "USB-C dock", price: 129, tone: "bg-violet-500" },
  { id: "hdp", name: "Headphones", price: 179, tone: "bg-rose-500" },
  { id: "cbl", name: "Braided cable", price: 15, tone: "bg-slate-500" },
];

export interface CartLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

let doc: DynamoDBDocumentClient | undefined;
const db = () => (doc ??= DynamoDBDocumentClient.from(new DynamoDBClient({})));
const TableName = () => process.env.CARTS_TABLE!;

export const isProduct = (id: string) => catalog.some((p) => p.id === id);
export const countOf = (lines: CartLine[]) => lines.reduce((n, l) => n + l.qty, 0);

export async function getCart(sub: string): Promise<CartLine[]> {
  const out = await db().send(
    new QueryCommand({
      TableName: TableName(),
      KeyConditionExpression: "#owner = :sub",
      ExpressionAttributeNames: { "#owner": "owner" },
      ExpressionAttributeValues: { ":sub": sub },
    }),
  );
  return (out.Items ?? []).flatMap((item) => {
    const p = catalog.find((c) => c.id === item.productId);
    return p && item.qty > 0 ? [{ productId: p.id, name: p.name, price: p.price, qty: item.qty as number }] : [];
  });
}

export async function addLine(sub: string, productId: string) {
  await db().send(
    new UpdateCommand({
      TableName: TableName(),
      Key: { owner: sub, productId },
      UpdateExpression: "ADD qty :one",
      ExpressionAttributeValues: { ":one": 1 },
    }),
  );
}

export async function removeLine(sub: string, productId: string) {
  await db().send(new DeleteCommand({ TableName: TableName(), Key: { owner: sub, productId } }));
}
