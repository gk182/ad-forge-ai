import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // @ts-ignore - allowedDevOrigins is supported in Next.js dev server but might not be in the strict NextConfig typescript interface
  allowedDevOrigins: ['192.168.100.138', 'localhost:3000'],
};

export default nextConfig;
