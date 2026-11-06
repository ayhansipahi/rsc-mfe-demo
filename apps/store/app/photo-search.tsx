"use client";

import { useEffect, useState } from "react";

// The mobile shell's camera hands the page a photo as a "shell:photo" event (base64 JPEG). The page
// owns what happens next: it posts the photo to the store vertical's search and opens the store on
// the matches. The shell knows the event, not the endpoint.
export function PhotoSearch() {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    async function onPhoto(event: Event) {
      setStatus("Looking at your photo...");
      const r = await fetch("/store/api/photo-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photo: (event as CustomEvent<string>).detail }),
      }).catch(() => null);
      if (!r?.ok) {
        setStatus(r?.status === 401 ? "Sign in to search with a photo." : "Photo search did not work. Try again.");
        setTimeout(() => setStatus(null), 4000);
        return;
      }
      const { ids } = (await r.json()) as { ids: string[] };
      location.assign(`/store?match=${ids.join(",")}`);
    }
    addEventListener("shell:photo", onPhoto);
    return () => removeEventListener("shell:photo", onPhoto);
  }, []);

  if (!status) return null;
  return (
    <p
      role="status"
      className="fixed inset-x-4 top-4 z-10 rounded-md bg-neutral-900 px-4 py-3 text-sm text-white dark:bg-white dark:text-neutral-900"
    >
      {status}
    </p>
  );
}
