// Password policy used on the reset / set-password screens.
export function pwIssue(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Add at least one capital letter";
  if (!/[a-z]/.test(pw)) return "Add at least one small letter";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Add at least one special character";
  return null;
}
export const PW_HINT = "8+ characters with a capital, a small letter and a special character.";
