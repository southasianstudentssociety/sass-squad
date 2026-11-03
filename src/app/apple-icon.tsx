import { brandIcon } from "./brand-icon";

// iOS rounds the corners itself, so this one is a full square.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return brandIcon(180, 0);
}
