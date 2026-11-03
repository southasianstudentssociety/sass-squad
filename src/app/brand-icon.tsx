import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The SASS mark for browser tabs and home screens: a white "S" in the brand
// font (Berkshire Swash, as in the header wordmark) on SASS red. The full
// "SASS" wordmark is unreadable at 16-32 px, so the icon uses the initial.
const font = readFile(join(process.cwd(), "assets/berkshire-swash.woff"));

export async function brandIcon(px: number, radius: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ae4547",
          borderRadius: radius,
          color: "#ffffff",
          fontFamily: "Berkshire Swash",
          fontSize: px * 1.05,
          lineHeight: 1,
          paddingBottom: px * 0.1,
        }}
      >
        S
      </div>
    ),
    { width: px, height: px, fonts: [{ name: "Berkshire Swash", data: await font, style: "normal", weight: 400 }] },
  );
}
