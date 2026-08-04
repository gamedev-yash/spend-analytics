import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  /**
   * `mssql` is an optional runtime dependency: lib/server/sql-client loads it
   * only when a connection string is configured, and falls back to the bundled
   * sample data otherwise. Marking it external keeps the bundler from trying to
   * resolve it at build time — it is a plain runtime require inside a try/catch.
   *
   * This is also correct once the driver *is* installed: tedious resolves parts
   * of itself dynamically and does not bundle cleanly.
   */
  serverExternalPackages: ["mssql"],
  outputFileTracingIncludes: {
    "/api/generate-dashboard": ["./lib/ai/skills/**/*"],
  },
};

export default nextConfig;
