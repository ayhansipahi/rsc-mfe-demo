// An app's call to its team's service. In a deployed stage the service's endpoint uses IAM auth, so the
// request is SigV4-signed with the calling function's own credentials (service "lambda"); Lambda checks
// the signature against lambda:InvokeWebFunctionEndpoint and strips Authorization before forwarding.
// The user's Cognito token therefore travels in its own header, x-user-token, and the service still
// verifies it. Locally there is no IAM: a localhost URL or DEV_SESSION sends the request unsigned.
import { createHash, createHmac } from "node:crypto";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { SignatureV4 } from "@smithy/signature-v4";
import type { SessionUser } from "./session.server.ts";

export const USER_TOKEN_HEADER = "x-user-token";

// SignatureV4 wants a hash constructor: `new H(secret)` is an HMAC, `new H()` a plain digest.
class Sha256 {
  private secret?: string | ArrayBuffer | ArrayBufferView;
  private h: ReturnType<typeof createHash> | ReturnType<typeof createHmac>;
  constructor(secret?: string | ArrayBuffer | ArrayBufferView) {
    this.secret = secret;
    this.h = this.make();
  }
  private make() {
    return this.secret ? createHmac("sha256", this.secret as Buffer) : createHash("sha256");
  }
  update(data: string | ArrayBuffer | ArrayBufferView) {
    this.h.update(
      typeof data === "string" ? data : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : Buffer.from(data),
    );
  }
  async digest() {
    return new Uint8Array(this.h.digest());
  }
  reset() {
    this.h = this.make();
  }
}

let signer: SignatureV4 | undefined;
const getSigner = () =>
  (signer ??= new SignatureV4({
    service: "lambda",
    region: process.env.AWS_REGION!,
    credentials: defaultProvider(),
    sha256: Sha256,
    // Requests carry no body here; the header below is set by hand and UNSIGNED-PAYLOAD is allowed.
    applyChecksum: false,
  }));

export function isLocalService(url: URL): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".localhost");
}

/** Headers for a service call: the user's token and the flow id, so the service's log line carries the page's id. */
export function serviceHeaders(user: Pick<SessionUser, "token" | "flow">): Record<string, string> {
  return { [USER_TOKEN_HEADER]: user.token, ...(user.flow && { "x-flow-id": user.flow }) };
}

/** fetch() to a service with the user's token, SigV4-signed unless the service is local or DEV_SESSION is set. */
export async function serviceFetch(
  url: string,
  init: { method?: string; signal?: AbortSignal },
  user: Pick<SessionUser, "token" | "flow">,
): Promise<Response> {
  const target = new URL(url);
  const method = init.method ?? "GET";
  const headers = serviceHeaders(user);
  if (isLocalService(target) || process.env.DEV_SESSION) return fetch(url, { ...init, method, headers });

  headers["x-amz-content-sha256"] = "UNSIGNED-PAYLOAD";
  const signed = await getSigner().sign({
    method,
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port ? Number(target.port) : undefined,
    path: target.pathname,
    query: Object.fromEntries(target.searchParams),
    headers: { host: target.host, ...headers },
  });
  return fetch(url, { ...init, method, headers: signed.headers });
}
