export type SocialCommand = (
  action: string,
  fields?: Record<string, unknown>,
  success?: string,
) => Promise<Record<string, unknown> | null>;
