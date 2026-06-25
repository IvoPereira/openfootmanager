import { convertFileSrc } from "@tauri-apps/api/core";

const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function resolveLocalMediaPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed || URI_SCHEME.test(trimmed) || trimmed.startsWith("//")) {
    return null;
  }
  if (trimmed.startsWith("/assets/")) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return convertFileSrc(trimmed);
  }
  return `/${trimmed}`;
}
