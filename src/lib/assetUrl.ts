/** Resolve bundled/public resources within the Vite deployment base. */
export const appBase = import.meta.env?.BASE_URL ?? '/';
export function assetUrl(path: string): string {
  return `${appBase}${path.replace(/^\/+/, '')}`;
}
