const publicPaths = new Set([
  "/",
  "/login",
  "/signup",
  "/family",
  "/invite",
  "/forgot-password",
  "/auth/callback",
  "/auth/email-confirmed",
  "/auth/reset-password",
  "/app-info",
  "/terms",
  "/privacy-policy",
  "/support",
  "/delete-account",
  "/open-source-licenses",
]);

const sessionEntryPaths = new Set([
  "/login",
  "/signup",
  "/family",
  "/auth/callback",
  "/auth/email-confirmed",
]);

export function isRootPath(pathname: string) {
  return pathname === "/" || pathname === "";
}

export function isProtectedPath(pathname: string) {
  return !publicPaths.has(pathname);
}

export function isSessionEntryPath(pathname: string) {
  return sessionEntryPaths.has(pathname);
}

function isSessionRecoveryPath(pathname: string) {
  return isRootPath(pathname) || isProtectedPath(pathname);
}

export function resolveSessionRecoveryPolicy({
  pathname,
  isBooting,
  sessionRecoveryRequired,
}: {
  pathname: string;
  isBooting: boolean;
  sessionRecoveryRequired: boolean;
}) {
  return {
    showRecovery:
      !isBooting
      && sessionRecoveryRequired
      && isSessionRecoveryPath(pathname),
    allowSessionRedirects: !isBooting && !sessionRecoveryRequired,
  };
}
