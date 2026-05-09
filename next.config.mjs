/** @type {import('next').NextConfig} */
//
// Security posture for SPY Prophet.
//
// Headers below target a securityheaders.com grade A. The CSP is the
// most likely thing to need tuning per release — when a third-party
// script is added (Plausible / Turnstile / etc), append the origin to
// the relevant directive instead of broadening the policy.
//
// CSP note: a fully strict CSP (no 'unsafe-inline' in style-src) needs
// per-render nonces for the inline <style> tags Next emits. That
// requires middleware to inject the nonce. Until that lands, style-src
// allows 'unsafe-inline' — flagged below. Scripts are 'self' + the
// explicit third-party origins we actually load, with 'unsafe-eval'
// kept off.

const HSTS = "max-age=31536000; includeSubDomains; preload";
const PERMISSIONS = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "interest-cohort=()",
  "browsing-topics=()",
  "payment=()",
  "usb=()",
].join(", ");

// Origins we actually hit. Keep this list tight — every entry below
// loosens CSP. If a vendor isn't loaded today, don't pre-allow it.
const CONNECT_SRC = [
  "'self'",
  "https://challenges.cloudflare.com", // Turnstile siteverify (g4)
];
const SCRIPT_SRC = [
  "'self'",
  "'unsafe-inline'", // Next inline RSC payload. TODO(csp): nonces via middleware.
  "https://challenges.cloudflare.com", // Turnstile widget
];
const STYLE_SRC = [
  "'self'",
  "'unsafe-inline'", // Next inline <style>. TODO(csp): move to nonces.
];
const FONT_SRC = ["'self'", "data:"];
const IMG_SRC = ["'self'", "data:", "blob:"];
const FRAME_SRC = ["https://challenges.cloudflare.com"]; // Turnstile iframe

const CSP = [
  "default-src 'self'",
  `script-src ${SCRIPT_SRC.join(" ")}`,
  `style-src ${STYLE_SRC.join(" ")}`,
  `img-src ${IMG_SRC.join(" ")}`,
  `font-src ${FONT_SRC.join(" ")}`,
  `connect-src ${CONNECT_SRC.join(" ")}`,
  `frame-src ${FRAME_SRC.join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: HSTS },
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: PERMISSIONS },
  { key: "X-Frame-Options", value: "DENY" },
  // X-DNS-Prefetch-Control: avoid prefetching DNS for off-origin URLs
  // we don't intentionally hit.
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig = {
  reactStrictMode: true,
  // No source maps in production — keep proprietary code paths from
  // shipping to the browser.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
