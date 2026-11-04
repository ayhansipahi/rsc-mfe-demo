// The only code that talks to Cognito. The browser never does: the ceremony's options and
// results travel through /auth/passkey, so the pool and client IDs stay on the server.
import {
  CognitoIdentityProviderClient,
  CompleteWebAuthnRegistrationCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  StartWebAuthnRegistrationCommand,
} from "@aws-sdk/client-cognito-identity-provider";

let cached: CognitoIdentityProviderClient | undefined;
const client = () => (cached ??= new CognitoIdentityProviderClient({ region: process.env.COGNITO_USER_POOL_ID!.split("_")[0] }));
const ClientId = () => process.env.COGNITO_CLIENT_ID!;

const tokenOf = (r: { AuthenticationResult?: { AccessToken?: string } }) => {
  const token = r.AuthenticationResult?.AccessToken;
  if (!token) throw new Error("no access token in response");
  return token;
};

export async function passwordSignIn(username: string, password: string) {
  const r = await client().send(
    new InitiateAuthCommand({
      ClientId: ClientId(),
      AuthFlow: "USER_AUTH",
      AuthParameters: { USERNAME: username, PREFERRED_CHALLENGE: "PASSWORD", PASSWORD: password },
    }),
  );
  return tokenOf(r);
}

export async function passkeySignInStart(username: string) {
  const r = await client().send(
    new InitiateAuthCommand({
      ClientId: ClientId(),
      AuthFlow: "USER_AUTH",
      AuthParameters: { USERNAME: username, PREFERRED_CHALLENGE: "WEB_AUTHN" },
    }),
  );
  if (r.ChallengeName !== "WEB_AUTHN" || !r.Session) throw new Error(`unexpected challenge ${r.ChallengeName}`);
  return { session: r.Session, options: JSON.parse(r.ChallengeParameters!.CREDENTIAL_REQUEST_OPTIONS!) };
}

export async function passkeySignInFinish(username: string, session: string, credential: unknown) {
  const r = await client().send(
    new RespondToAuthChallengeCommand({
      ClientId: ClientId(),
      ChallengeName: "WEB_AUTHN",
      Session: session,
      ChallengeResponses: { USERNAME: username, CREDENTIAL: JSON.stringify(credential) },
    }),
  );
  return tokenOf(r);
}

export async function passkeyRegisterStart(accessToken: string) {
  const r = await client().send(new StartWebAuthnRegistrationCommand({ AccessToken: accessToken }));
  return r.CredentialCreationOptions;
}

export async function passkeyRegisterFinish(accessToken: string, credential: unknown) {
  await client().send(new CompleteWebAuthnRegistrationCommand({ AccessToken: accessToken, Credential: credential as never }));
}
