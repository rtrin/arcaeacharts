export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/records";
  }
  return value;
}

export function authCallbackUrl(returnTo?: string): string {
  const path = safeReturnTo(returnTo);
  return `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(path)}`;
}
