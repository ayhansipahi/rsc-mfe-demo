// Token propagation: the app forwards the user's Cognito access token as a bearer; this service
// verifies it against the pool and scopes every query to the token's sub. Services share no code,
// so each carries these lines. With NODE_ENV=development and DEV_SESSION set, "Bearer dev" is the
// stub an app running standalone sends (see @rsc-mfe/shell's getUser). Opt-in, not "not production":
// these endpoints are public, and Lambda does not set NODE_ENV.
import { CognitoJwtVerifier } from "aws-jwt-verify";

let verifier;
const getVerifier = () =>
  (verifier ??= CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID,
    tokenUse: "access",
  }));

// Takes the Authorization header's value.
export async function verifyBearer(authorization) {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  if (process.env.NODE_ENV === "development" && process.env.DEV_SESSION && token === "dev") return { sub: "dev" };
  try {
    const payload = await getVerifier().verify(token);
    return { sub: payload.sub };
  } catch {
    return null;
  }
}
