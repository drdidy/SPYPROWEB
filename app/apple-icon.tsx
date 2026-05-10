import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const runtime = "edge";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0b1220",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui",
        }}
      >
        <div
          style={{
            color: "#f4c76b",
            fontSize: 60,
            fontWeight: 800,
            letterSpacing: -3,
            lineHeight: 1,
          }}
        >
          SPY
        </div>
        <div
          style={{
            color: "#94a3b8",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 4,
            marginTop: 8,
          }}
        >
          PROPHET
        </div>
      </div>
    ),
    { ...size }
  );
}
