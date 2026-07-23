import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Photos Sponge',
    description: 'Keyboard-first monthly photo triage for Google Photos.',
    permissions: ['storage'],
    host_permissions: ['https://photos.google.com/*'],
    action: {
      default_title: 'Photos Sponge',
    },
  },
});
