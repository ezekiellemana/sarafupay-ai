import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node-only packages that should not be bundled by Next.
  serverExternalPackages: ["@electric-sql/pglite", "@paypal/agent-toolkit", "postgres"],
};

export default nextConfig;
