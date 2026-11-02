/** Messages for the `?error=` codes that /auth/callback sends back to the sign-in page. */
const MESSAGES: Record<string, string> = {
  confirm: "That confirmation link has expired or was already used. Sign in, or sign up again.",
  oauth: "Sign-in with Google or GitHub was cancelled or didn't complete. Please try again.",
};

export function authErrorMessage(code: string | undefined): string | null {
  return code ? (MESSAGES[code] ?? MESSAGES.oauth) : null;
}
