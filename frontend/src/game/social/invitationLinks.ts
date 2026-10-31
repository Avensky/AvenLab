/** Invite links carry only the world code; passwords and profile keys never
 * enter a URL. Remove unrelated query/fragment state before sharing a link. */
export function inviteCodeFromUrl(href: string): string | null {
  try {
    const code = new URL(href).searchParams.get("world_invite");
    return code && /^[a-f0-9]{32}$/i.test(code) ? code.toLowerCase() : null;
  } catch {
    return null;
  }
}
export function worldInviteUrl(href: string, code: string): string {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("world_invite", code);
  return url.toString();
}
