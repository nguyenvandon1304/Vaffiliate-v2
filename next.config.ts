import type { NextConfig } from "next";
import {
  SHOPEE_PRODUCT_IMAGE_HOST_ALLOWLIST,
} from "./src/lib/shopee/product-metadata/image-hosts";

const nextConfig: NextConfig = {
  reactCompiler: true,

  images: {
    remotePatterns: SHOPEE_PRODUCT_IMAGE_HOST_ALLOWLIST.map(
      (hostname) => ({
        protocol: "https",
        hostname,
        pathname: "/**",
      }),
    ),
  },
};

export default nextConfig;
