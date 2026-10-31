import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  output: "export",
  // In dev, forward API calls to the FastAPI backend. In production the backend serves the export itself.
  ...(isDev && {
    rewrites: async () => [
      { source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" },
    ],
  }),
};

export default nextConfig;
