import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";

// Some hosts ship a WebView without WebAuthn: an iPhone app running on an Apple silicon Mac is one
// of them, and `PublicKeyCredential` is simply absent there. The server renders the passkey actions;
// after hydration they are hidden where the host cannot run them, so the password path stays usable.
// null until the check runs, so server and first client render agree.
export function usePasskeySupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  return supported;
}
