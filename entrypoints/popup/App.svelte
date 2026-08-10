<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';

  let status = 'Checking the current tab…';

  onMount(() => {
    void togglePanel();
  });

  async function togglePanel() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('https://photos.google.com/') || tab.id === undefined) {
      status = 'Try this in Google Photos.';
      return;
    }

    try {
      await browser.tabs.sendMessage(tab.id, { type: 'photos-sponge:toggle-panel' });
      window.close();
    } catch {
      status = 'Reload Google Photos, then click the extension icon again.';
    }
  }
</script>

<main>
  <h1>Photos Sponge</h1>
  <p>{status}</p>
</main>

<style>
  :global(body) {
    width: 280px;
    margin: 0;
    background: #fbfcfd;
    color: #172026;
    font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  main {
    padding: 16px;
  }

  h1 {
    margin: 0 0 8px;
    font-size: 16px;
  }

  p {
    margin: 0;
    color: #52616b;
  }
</style>
