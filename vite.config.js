import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves this repo at https://<user>.github.io/second-brain-app/
// so the app must know it lives under the "/second-brain-app/" sub-path.
export default defineConfig({
  base: "/second-brain-app/",
  plugins: [react()],
  // 3d-force-graph and our custom node objects must share ONE copy of three,
  // or the custom glowing spheres won't render. Force a single instance.
  resolve: { dedupe: ["three"] },
});
