import { defineConfig } from "vite";
import path from "node:path";

const root = path.resolve(__dirname);

export default defineConfig({
  root,
  server: { host: "127.0.0.1", strictPort: true },
  resolve: {
    alias: {
      "@0xsarwagya/agnostic-web-ble": path.resolve(root, "../../../src/index.ts"),
      "@0xsarwagya/agnostic-web-ble/adapters/native": path.resolve(
        root,
        "../../../src/adapters/native.ts",
      ),
      "@0xsarwagya/agnostic-web-ble/adapters/mock": path.resolve(
        root,
        "../../../src/adapters/mock.ts",
      ),
    },
  },
  build: { target: "esnext" },
});
