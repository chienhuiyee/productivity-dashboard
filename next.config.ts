import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to serve /_next/* (client JS + HMR) to these non-localhost
  // origins. Required when reaching `next dev` over Tailscale HTTPS; otherwise the
  // page renders but never hydrates (buttons dead, effects never run). Dev-only.
  allowedDevOrigins: ["yees-mac-mini.tailadb6b3.ts.net"],
};

export default nextConfig;
