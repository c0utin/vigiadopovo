import { sveltekit } from "@sveltejs/kit/vite";
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter({ precompress: true }),
      // Cloudflare serves the site from the root; BASE_PATH is for hosts under a subpath.
      paths: { base: (process.env.BASE_PATH ?? "") as "" | `/${string}` },
      prerender: {
        // Profiles come from the unversioned deputies file; without it the
        // route has no pages. Any other unrendered route still fails.
        handleUnseenRoutes: ({ routes, message }) => {
          if (routes.some((route) => route !== "/deputados/[id]"))
            throw new Error(message);
        },
      },
      preprocess: vitePreprocess(),
    }),
  ],
  server: { allowedHosts: [".onamp.dev"] },
});
