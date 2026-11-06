"use client";

import { useState } from "react";
import { postToShell } from "@rsc-mfe/shell/shell-bridge";
import { buttonClass } from "@rsc-mfe/shell/styles";

export function AddToCart({ productId }: { productId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "added">("idle");

  async function add() {
    setState("busy");
    const r = await fetch("/store/api/cart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "add", productId }),
    });
    if (r.status === 401) {
      // Signed out: the web goes to the login page; the app switches its own tab bar instead.
      if (!postToShell({ type: "auth-required" })) window.location.assign("/login?next=/store");
      return setState("idle");
    }
    if (!r.ok) return setState("idle");
    // The mini cart is another fragment in the nav; it listens for this and re-reads the cart.
    window.dispatchEvent(new Event("cart:changed"));
    setState("added");
    setTimeout(() => setState("idle"), 1200);
  }

  return (
    <button type="button" onClick={add} disabled={state === "busy"} className={buttonClass}>
      {state === "added" ? "Added" : "Add to cart"}
    </button>
  );
}
