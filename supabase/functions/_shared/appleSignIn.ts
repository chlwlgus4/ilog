import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "npm:jose@6.2.10";

const appleAudience = "https://appleid.apple.com";
const appleTokenUrl = `${appleAudience}/auth/token`;
const appleRevokeUrl = `${appleAudience}/auth/revoke`;
const appleJwks = createRemoteJWKSet(new URL(`${appleAudience}/auth/keys`));

type AppleTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  id_token?: unknown;
};

export class AppleOAuthError extends Error {
  constructor(
    readonly operation: "exchange" | "revoke",
    readonly status: number,
    readonly appleCode: string,
  ) {
    super(`Apple ${operation} request failed`);
    this.name = "AppleOAuthError";
  }
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function appleConfig() {
  return {
    teamId: requiredEnv("APPLE_SIGN_IN_TEAM_ID"),
    keyId: requiredEnv("APPLE_SIGN_IN_KEY_ID"),
    clientId: requiredEnv("APPLE_SIGN_IN_CLIENT_ID"),
    privateKey: requiredEnv("APPLE_SIGN_IN_PRIVATE_KEY").replace(/\\n/g, "\n"),
  };
}

async function appleClientSecret() {
  const config = appleConfig();
  const now = Math.floor(Date.now() / 1000);
  const signingKey = await importPKCS8(config.privateKey, "ES256");
  const clientSecret = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId })
    .setIssuer(config.teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + 5 * 60)
    .setAudience(appleAudience)
    .setSubject(config.clientId)
    .sign(signingKey);

  return { clientId: config.clientId, clientSecret };
}

async function appleErrorCode(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof payload?.error === "string" ? payload.error : "unknown_error";
}

export async function exchangeAppleAuthorizationCode(authorizationCode: string) {
  const { clientId, clientSecret } = await appleClientSecret();
  const response = await fetch(appleTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: authorizationCode,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new AppleOAuthError("exchange", response.status, await appleErrorCode(response));
  }

  const payload = await response.json() as AppleTokenResponse;
  if (typeof payload.refresh_token !== "string" || typeof payload.id_token !== "string") {
    throw new AppleOAuthError("exchange", 502, "invalid_token_response");
  }

  return {
    refreshToken: payload.refresh_token,
    idToken: payload.id_token,
  };
}

export async function verifiedAppleSubjectFromIdToken(idToken: string) {
  const { clientId } = appleConfig();
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: appleAudience,
    audience: clientId,
  });
  const subject = payload.sub;
  return typeof subject === "string" && subject.length > 0 ? subject : null;
}

export async function revokeAppleRefreshToken(refreshToken: string) {
  const { clientId, clientSecret } = await appleClientSecret();
  const response = await fetch(appleRevokeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new AppleOAuthError("revoke", response.status, await appleErrorCode(response));
  }
}

export function appleRevocationErrorCode(error: unknown) {
  if (error instanceof AppleOAuthError) {
    return `${error.operation}:${error.status}:${error.appleCode}`;
  }

  if (error instanceof Error && /APPLE_SIGN_IN_[A-Z_]+ is not configured/.test(error.message)) {
    return "configuration_missing";
  }

  return "transient_error";
}
