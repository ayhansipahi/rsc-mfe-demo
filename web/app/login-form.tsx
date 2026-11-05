"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { useState } from "react";
import { usePasskeySupport } from "./passkey-support";
import { buttonClass, inputClass } from "./styles";

async function post(body: unknown) {
  const r = await fetch("/auth/passkey", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.status === 204 ? null : r.json();
}

export function LoginForm({ error, next }: { error: string | null; next: string }) {
  const [status, setStatus] = useState<string | null>(error === "password" ? "Wrong email or password." : null);
  const [busy, setBusy] = useState(false);
  const passkeys = usePasskeySupport();

  async function passkey(form: HTMLFormElement) {
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    if (!email) return setStatus("Enter your email first.");
    setBusy(true);
    setStatus("Waiting for your passkey...");
    try {
      const start = await post({ intent: "signin-start", email });
      const credential = await startAuthentication({ optionsJSON: start.options });
      await post({ intent: "signin-finish", email, session: start.session, credential });
      // Full navigation so the new cookie is on the next document request.
      window.location.assign(next);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form method="post" className="max-w-sm space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Email</span>
        <input name="email" type="email" autoComplete="username webauthn" required className={inputClass} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Password</span>
        <input name="password" type="password" autoComplete="current-password" className={inputClass} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={buttonClass}>
          Sign in with password
        </button>
        {passkeys !== false && (
          <button type="button" disabled={busy} onClick={(e) => passkey(e.currentTarget.form!)} className={buttonClass}>
            Sign in with passkey
          </button>
        )}
      </div>
      {passkeys === false && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Passkeys are not available in this app on this device. Sign in with your password.
        </p>
      )}
      {status && <p className="text-sm text-neutral-600 dark:text-neutral-400">{status}</p>}
    </form>
  );
}
