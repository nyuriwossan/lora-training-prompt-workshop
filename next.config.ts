import type { NextConfig } from "next";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] || "";
const githubProjectPath = process.env.GITHUB_ACTIONS === "true" && !repository.endsWith(".github.io")
  ? `/${repository}`
  : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: githubProjectPath,
  assetPrefix: githubProjectPath,
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
  experimental: { workerThreads: true, cpus: 1 },
};

export default nextConfig;
