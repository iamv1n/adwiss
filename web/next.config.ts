import type { NextConfig } from "next";

const API_URL = (process.env.API_URL ?? "http://localhost:8080").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Lets the dev server be used through an HTTPS tunnel (Meta requires HTTPS OAuth callbacks).
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.dev"],
  async rewrites() {
    return [
      {
        // Same-origin proxy to the Go API so the HttpOnly session cookie works.
        source: "/api/:path*",
        destination: `${API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
