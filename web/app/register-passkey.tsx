"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useState } from "react";
import { usePasskeySupport } from "./passkey-support";
import { buttonClass } from "./styles";

async function post(body: unknown) {
  const r = await fetch("/auth/passkey", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.status === 204 ? null : r.json();
}

export function RegisterPasskey() {
  const [status, setStatus] = useState<string | null>(null);
  const passkeys = usePasskeySupport();

  async function register() {
    setStatus("Creating a passkey...");
    try {
      const start = await post({ intent: "register-start" });
      const credential = await startRegistration({ optionsJSON: start.options });
      await post({ intent: "register-finish", credential });
      setStatus("Passkey saved. Sign out and sign in with it.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
      {passkeys === false ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Passkeys are not available in this app on this device.</p>
      ) : (
        <button type="button" onClick={register} className={buttonClass}>
          Add a passkey for this device
        </button>
      )}
      {status && <p className="text-sm text-neutral-600 dark:text-neutral-400">{status}</p>}
    </div>
  );
}
