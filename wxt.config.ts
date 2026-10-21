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
    icons: {
      16: "sponge.png",
      32: "sponge.png",
      48: "sponge.png",
      128: "sponge.png",
    },
    host_permissions: ["https://photos.google.com/*"],
    action: {
      default_title: "Photos Sponge",
      default_icon: "sponge.png",
    },
  },
});
