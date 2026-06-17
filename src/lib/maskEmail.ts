/**
 * Masks an email for privacy-by-default display in admin UIs.
 * "edoardo.rossi@example.com" -> "e****i@e****e.com"
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "-";
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const maskPart = (s: string) => {
    if (s.length <= 2) return s[0] + "•";
    return s[0] + "•".repeat(Math.max(1, Math.min(4, s.length - 2))) + s[s.length - 1];
  };
  const [host, ...tldRest] = domain.split(".");
  const tld = tldRest.join(".");
  return `${maskPart(local)}@${maskPart(host)}${tld ? "." + tld : ""}`;
}
