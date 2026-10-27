import type { NextConfig } from "next";

// Get base path from environment variable or use default for GitHub Pages
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  output: 'export',
  
  // For GitHub Pages deployment
  // The base path is set via environment variable in GitHub Actions
  basePath: basePath,
  assetPrefix: basePath,
  
  // Disable image optimization for static export
  images: {
    unoptimized: true,
    // Allow loading images from the base path
    remotePatterns: [],
  },
  
  // Handle trailing slashes
  trailingSlash: true,
  // NOTE: Next 16 removed the `eslint` key from NextConfig (and no longer runs
  // ESLint during `next build`), so the old `eslint.ignoreDuringBuilds` block was
  // dropped — under Next 16 it was a type error that broke the production build.
};

export default nextConfig;
