import type { NextConfig } from 'next';
const nextConfig: NextConfig = { output: 'export', images: { unoptimized: true }, outputFileTracingRoot: process.cwd() };
export default nextConfig;
