export function buildPasswordResetRedirect(origin: string): string {
  return `${new URL(origin).origin}/reset-password`;
}
