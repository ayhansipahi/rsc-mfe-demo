"use client";

import { useEffect } from "react";

// Cart page actions re-render the page on the server. This tells the mini cart, a fragment in the
// nav, to re-read the cart whenever the count it was rendered with changes.
export function CartChanged({ count }: { count: number }) {
  useEffect(() => {
    window.dispatchEvent(new Event("cart:changed"));
  }, [count]);
  return null;
}
