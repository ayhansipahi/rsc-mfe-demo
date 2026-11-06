// Session = the Cognito access token in an HttpOnly cookie, verified against the pool's JWKS
// on every request. No session store: the web function stays stateless.
import { CognitoJwtVerifier } from "aws-jwt-verify";

const COOKIE = "session";
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;
// Lazy: the build imports this module to prerender "/", where no pool is configured.
const getVerifier = () =>
  (verifier ??= CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID!,
    clientId: process.env.COGNITO_CLIENT_ID!,
    tokenUse: "access",
  }));

export interface SessionUser {
  sub: string;
  username: string;
  token: string;
}

function readCookie(request: Request): string | undefined {
  return request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1];
}

// Platform contract + local stub: a vertical running on its own has no account app to sign in
// with, so outside production DEV_SESSION names the user. Production builds never read it.
export async function getUser(request: Request): Promise<SessionUser | null> {
  if (process.env.NODE_ENV !== "production" && process.env.DEV_SESSION) {
    return { sub: "dev", username: process.env.DEV_SESSION, token: "dev" };
  }
  const token = readCookie(request);
  if (!token) return null;
  try {
    const payload = await getVerifier().verify(token);
    return { sub: payload.sub, username: String(payload.username), token };
  } catch {
    return null;
  }
}

// ponytail: no refresh token; the cookie dies with the access token (1 h). Add refresh when the demo
// needs sessions longer than that.
export const sessionCookie = (token: string) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`;
export const clearedCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// The email of the last account signed in on this device, kept past sign-out and session expiry so the
// login page can offer "Continue as" with a passkey: Cognito's passkey sign-in starts from a username.
// Only /login receives it, and it holds no credential.
const LAST = "last_email";
export function readLastEmail(request: Request): string | null {
  const raw = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${LAST}=([^;]+)`))?.[1];
  try {
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    return null;
  }
}

// Every sign-in sets both cookies.
export function signInCookies(token: string, email: string, headers = new Headers()) {
  headers.append("Set-Cookie", sessionCookie(token));
  headers.append("Set-Cookie", `${LAST}=${encodeURIComponent(email)}; Path=/login; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);
  return headers;
}
