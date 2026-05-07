import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin Turbopack's workspace root to this folder; otherwise Next.js 15.5
  // tries to infer it and fails because there's no parent package.json.
  turbopack: { root: __dirname },
};

export default nextConfig;
