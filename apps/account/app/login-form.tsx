"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { useState } from "react";
import { usePasskeySupport } from "./passkey-support";
import { buttonClass, inputClass } from "@rsc-mfe/shell/styles";

async function post(body: unknown) {
  const r = await fetch("/auth/passkey", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.status === 204 ? null : r.json();
}

const note = "text-sm text-neutral-600 dark:text-neutral-400";

export function LoginForm({ error, next, remembered }: { error: string | null; next: string; remembered: string | null }) {
  const [status, setStatus] = useState<string | null>(
    error === "password" ? "Wrong email or password." : error === "confirmed" ? "Your account is confirmed. Sign in to continue." : null,
  );
  const [busy, setBusy] = useState(false);
  // A password error means the visitor already chose the form; show it again.
  const [other, setOther] = useState(error !== null);
  const passkeys = usePasskeySupport();

  async function passkey(email: string) {
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
      const message = e instanceof Error ? e.message : String(e);
      // Cognito offers another challenge when the account has no passkey: fall back to the form.
      if (message.includes("unexpected challenge")) {
        setOther(true);
        setStatus("This account has no passkey yet. Sign in with your password, then add one on the Account page.");
      } else {
        setStatus(message);
      }
      setBusy(false);
    }
  }

  // One tap for a returning account: the passkey sheet (Face ID or Touch ID on Apple devices) is the sign-in.
  if (remembered && passkeys !== false && !other) {
    return (
      <div className="max-w-sm space-y-3">
        <button type="button" disabled={busy} onClick={() => passkey(remembered)} className={buttonClass}>
          Continue as {remembered}
        </button>
        <p className={note}>
          Signs in with your passkey.{" "}
          <button type="button" onClick={() => setOther(true)} className="underline">
            Use another account
          </button>
        </p>
        {status && <p className={note}>{status}</p>}
      </div>
    );
  }

  return (
    <form method="post" className="max-w-sm space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username webauthn"
          defaultValue={remembered ?? ""}
          required
          className={inputClass}
        />
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
          <button
            type="button"
            disabled={busy}
            onClick={(e) => passkey((e.currentTarget.form!.elements.namedItem("email") as HTMLInputElement).value)}
            className={buttonClass}
          >
            Sign in with passkey
          </button>
        )}
      </div>
      {passkeys === false && <p className={note}>Passkeys are not available in this app on this device. Sign in with your password.</p>}
      {status && <p className={note}>{status}</p>}
    </form>
  );
}
