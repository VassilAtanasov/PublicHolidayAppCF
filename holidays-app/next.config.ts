import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

initOpenNextCloudflareForDev({
  experimental: {
    remoteBindings: true
  }
});

export default nextConfig;
