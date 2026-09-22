import type { NextConfig } from "next";

const config: NextConfig = {
  // Bundles the server and only the dependencies it actually uses, so the image
  // does not carry node_modules around.
  output: "standalone",
};

export default config;
