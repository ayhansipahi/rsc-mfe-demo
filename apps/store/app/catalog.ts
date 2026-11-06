// The store team owns its catalog. It ships with the code; the cart service stores only ids.
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

export const isProduct = (id: string) => catalog.some((p) => p.id === id);
