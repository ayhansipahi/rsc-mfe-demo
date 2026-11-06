// The only code that talks to Cognito. The browser never does: the ceremony's options and
// results travel through /auth/passkey. The app client is confidential: every sign-in call, public
// or Admin*, needs a SECRET_HASH, and the secret lives only in this function's environment. The
// Admin* operations used here also require IAM credentials, a second layer on top of the secret.
import { createHmac } from "node:crypto";
import {
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  CognitoIdentityProviderClient,
  CompleteWebAuthnRegistrationCommand,
  ConfirmSignUpCommand,
  ListWebAuthnCredentialsCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
  StartWebAuthnRegistrationCommand,
} from "@aws-sdk/client-cognito-identity-provider";

let cached: CognitoIdentityProviderClient | undefined;
const client = () => (cached ??= new CognitoIdentityProviderClient({ region: process.env.COGNITO_USER_POOL_ID!.split("_")[0] }));
const UserPoolId = () => process.env.COGNITO_USER_POOL_ID!;
const ClientId = () => process.env.COGNITO_CLIENT_ID!;
// Cognito's proof that the caller holds the client secret: HMAC-SHA256(username + clientId, secret).
const secretHash = (username: string) =>
  createHmac("sha256", process.env.COGNITO_CLIENT_SECRET!).update(username + ClientId()).digest("base64");

const tokenOf = (r: { AuthenticationResult?: { AccessToken?: string } }) => {
  const token = r.AuthenticationResult?.AccessToken;
  if (!token) throw new Error("no access token in response");
  return token;
};

export async function passwordSignIn(username: string, password: string) {
  const r = await client().send(
    new AdminInitiateAuthCommand({
      UserPoolId: UserPoolId(),
      ClientId: ClientId(),
      AuthFlow: "USER_AUTH",
      AuthParameters: { USERNAME: username, PREFERRED_CHALLENGE: "PASSWORD", PASSWORD: password, SECRET_HASH: secretHash(username) },
    }),
  );
  return tokenOf(r);
}

export async function passkeySignInStart(username: string) {
  const r = await client().send(
    new AdminInitiateAuthCommand({
      UserPoolId: UserPoolId(),
      ClientId: ClientId(),
      AuthFlow: "USER_AUTH",
      AuthParameters: { USERNAME: username, PREFERRED_CHALLENGE: "WEB_AUTHN", SECRET_HASH: secretHash(username) },
    }),
  );
  if (r.ChallengeName !== "WEB_AUTHN" || !r.Session) throw new Error(`unexpected challenge ${r.ChallengeName}`);
  return { session: r.Session, options: JSON.parse(r.ChallengeParameters!.CREDENTIAL_REQUEST_OPTIONS!) };
}

export async function passkeySignInFinish(username: string, session: string, credential: unknown) {
  const r = await client().send(
    new AdminRespondToAuthChallengeCommand({
      UserPoolId: UserPoolId(),
      ClientId: ClientId(),
      ChallengeName: "WEB_AUTHN",
      Session: session,
      ChallengeResponses: { USERNAME: username, CREDENTIAL: JSON.stringify(credential), SECRET_HASH: secretHash(username) },
    }),
  );
  return tokenOf(r);
}

// Sign-up is the one write anyone can start. The account stays unconfirmed until the code Cognito
// emails comes back, and Cognito's own sender caps the pool at 50 emails a day.
export async function signUp(email: string, password: string) {
  const r = await client().send(
    new SignUpCommand({
      ClientId: ClientId(),
      SecretHash: secretHash(email),
      Username: email,
      Password: password,
      UserAttributes: [{ Name: "email", Value: email }],
    }),
  );
  return r.Session;
}

export async function confirmSignUp(email: string, code: string, session?: string) {
  const r = await client().send(
    new ConfirmSignUpCommand({ ClientId: ClientId(), SecretHash: secretHash(email), Username: email, ConfirmationCode: code, Session: session }),
  );
  return r.Session;
}

export async function resendCode(email: string) {
  await client().send(new ResendConfirmationCodeCommand({ ClientId: ClientId(), SecretHash: secretHash(email), Username: email }));
}

// The emailed code already proved the address: ConfirmSignUp's session signs the user in without
// asking for the password again. Valid once, within the client's auth session duration (15 min).
export async function signInAfterSignUp(email: string, session: string) {
  const r = await client().send(
    new AdminInitiateAuthCommand({
      UserPoolId: UserPoolId(),
      ClientId: ClientId(),
      AuthFlow: "USER_AUTH",
      AuthParameters: { USERNAME: email, SECRET_HASH: secretHash(email) },
      Session: session,
    }),
  );
  return tokenOf(r);
}

// Registration is authorized by the signed-in user's access token, which never leaves the server.
export async function passkeyRegisterStart(accessToken: string) {
  const r = await client().send(new StartWebAuthnRegistrationCommand({ AccessToken: accessToken }));
  return r.CredentialCreationOptions;
}

export async function passkeyRegisterFinish(accessToken: string, credential: unknown) {
  await client().send(new CompleteWebAuthnRegistrationCommand({ AccessToken: accessToken, Credential: credential as never }));
}

// The account's passkeys for this site. Cognito keeps one list per user across devices, and a
// browser never tells a site which device holds a passkey, so "has a passkey" is per account.
// Only this relying party's credentials count: a passkey made for another domain cannot sign in here.
// ponytail: first page only (Cognito's default page size); paginate if accounts carry many passkeys.
export async function listPasskeys(accessToken: string) {
  const r = await client().send(new ListWebAuthnCredentialsCommand({ AccessToken: accessToken }));
  const rp = process.env.PUBLIC_HOST;
  return (r.Credentials ?? []).filter((c) => !rp || c.RelyingPartyId === rp);
}
