import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cf.shopee.vn",
        pathname: "/file/**",
      },
    ],
  },
};

export default nextConfig;