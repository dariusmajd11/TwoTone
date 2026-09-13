/**
 * The Cognito pool enforces the real policy, but the pool only answers once a
 * request reaches AWS — and the local fallback provider has no policy at all.
 * Keeping the rule here lets the form, the route, and both auth backends agree
 * on one answer, so a rejected password reads the same wherever it is caught.
 *
 * Mirrors the password policy set on the Cognito pool. Change both together.
 */
export const PASSWORD_MIN_LENGTH = 12;

export const PASSWORD_RULE =
  "Password must be at least 12 characters and include an uppercase letter, a lowercase letter, and a number.";

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return PASSWORD_RULE;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return PASSWORD_RULE;
  }
  return null;
}
