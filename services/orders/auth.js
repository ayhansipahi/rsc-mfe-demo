// Token propagation: the app forwards the user's Cognito access token in x-user-token (Authorization carries
// the SigV4 signature, which Lambda strips). This service verifies the token against the pool and scopes
// every query to its sub. Services share no code, so each carries these lines. With NODE_ENV=development
// and DEV_SESSION set, "dev" is the stub an app running standalone sends (see @rsc-mfe/shell's getUser).
// Opt-in, not "not production": Lambda does not set NODE_ENV.
import { CognitoJwtVerifier } from "aws-jwt-verify";

let verifier;
const getVerifier = () =>
  (verifier ??= CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID,
    tokenUse: "access",
  }));

// Takes the x-user-token header's value: the raw access token.
export async function verifyUserToken(token) {
  if (!token) return null;
  if (process.env.NODE_ENV === "development" && process.env.DEV_SESSION && token === "dev") return { sub: "dev" };
  try {
    const payload = await getVerifier().verify(token);
    return { sub: payload.sub };
  } catch {
    return null;
  }
}
