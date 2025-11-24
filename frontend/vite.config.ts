import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// resolve to the frontend copy of react/react-dom to avoid duplicate React instances
const resolveReactAliases = () => {
  const root = __dirname;
  return {
    react: path.resolve(root, "node_modules/react"),
    "react/jsx-runtime": path.resolve(root, "node_modules/react/jsx-runtime"),
    "react-dom": path.resolve(root, "node_modules/react-dom"),
    "react-dom/client": path.resolve(root, "node_modules/react-dom/client"),
  };
};

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Forward all /api calls from Vite (8080) to FastAPI (8000)
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
      // If you later want to hit the Node service via a relative path,
      // uncomment the block below and call /node/... from the frontend.
      // "/node": {
      //   target: "http://localhost:3000",
      //   changeOrigin: true,
      //   secure: false,
      // },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      ...resolveReactAliases(),
    },
  },
}));
