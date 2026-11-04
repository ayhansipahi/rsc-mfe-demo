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

export async function getUser(request: Request): Promise<SessionUser | null> {
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
