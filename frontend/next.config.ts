import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PWA-Vorbereitung (Manifest/Service-Worker) folgt in einem späteren Sprint;
  // die App bleibt dafür strukturell offen (siehe docs/ARCHITECTURE.md).
};

export default nextConfig;
