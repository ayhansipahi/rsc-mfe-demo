"use client";

import { useEffect } from "react";

// ?stitch: flags <html> after hydration (an inline script would change the DOM before React
// compares it with the server HTML and get reported as a mismatch).
export function Stitch() {
  useEffect(() => {
    document.documentElement.classList.add("stitch");
  }, []);
  return null;
}
