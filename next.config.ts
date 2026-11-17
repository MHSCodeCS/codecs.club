import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  /**
   * Cross-origin isolation lets the Python worker share memory with the page,
   * which Stop (interrupt buffer) and input() need. It is set site-wide because
   * client-side navigation keeps the first document's headers. `credentialless`
   * still loads cross-origin images (lesson covers) without credentials; slide
   * links open in new tabs, which isolation doesn't affect.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
      {
        // Versioned folders never change, so Chromebooks download Python once.
        source: "/pyodide/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // The worker keeps one URL across deploys; revalidate it each load.
        source: "/python/:path*",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
