import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-svelte"],
  webExt: {
    disabled: true,
    startUrls: ["https://photos.google.com/"],
  },
  manifest: {
    name: "Photos Sponge",
    description: "Easy photo triage for Google Photos.",
    permissions: ["storage", "activeTab"],
    host_permissions: ["https://photos.google.com/*"],
    action: {
      default_title: "Photos Sponge",
    },
  },
});
