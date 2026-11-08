<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { PhotoItem } from '../../src/photos/types';

  export let photo: PhotoItem;
  export let active: boolean;

  let state: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  let video: HTMLVideoElement | undefined;
  let timeout: number | undefined;

  function release() {
    window.clearTimeout(timeout);
    const current = video;
    video = undefined;
    if (current) {
      current.pause();
      current.removeAttribute('src');
      current.load();
    }
  }

  function reset() {
    release();
    state = 'idle';
  }

  function fail(current: HTMLVideoElement) {
    if (video !== current) return;
    release();
    state = 'error';
  }

  async function play(event: MouseEvent) {
    if (event.currentTarget instanceof HTMLElement) event.currentTarget.blur();
    if (!active || photo.kind !== 'video' || !photo.videoUrl) return;
    state = 'loading';
    await tick();
    const current = video;
    if (!current || !active) return;
    timeout = window.setTimeout(() => fail(current), 20000);
    try {
      await current.play();
      if (video === current) {
        window.clearTimeout(timeout);
        state = 'ready';
      }
    } catch {
      fail(current);
    }
  }

  $: if (!active) reset();
  onDestroy(release);
</script>

<div class="media-preview">
  {#if photo.kind === 'video' && photo.videoUrl && (state === 'loading' || state === 'ready')}
    <!-- svelte-ignore a11y_media_has_caption (Library videos do not expose caption tracks.) -->
    <video
      bind:this={video}
      src={photo.videoUrl}
      poster={photo.thumbUrl}
      controls
      playsinline
      preload="none"
      aria-label={photo.label}
      onerror={(event) => { if (event.currentTarget instanceof HTMLVideoElement) fail(event.currentTarget); }}
    ></video>
    {#if state === 'loading'}<div class="playback-status" role="status">Loading video...</div>{/if}
  {:else}
    {#if photo.thumbUrl}
      <img src={photo.thumbUrl} alt={photo.label} />
    {:else}
      <div class="empty">Preview unavailable. The current item is visible in Google Photos.</div>
    {/if}
    {#if photo.kind === 'video'}
      {#if photo.videoUrl}
        <button class="play-video" type="button" onclick={play} disabled={!active}>
          <span aria-hidden="true">▶</span> {state === 'error' ? 'Retry video' : 'Play video'}
        </button>
        {#if state === 'error'}
          <div class="playback-status" role="status">Could not play this video. Try again or open it in Google Photos.</div>
        {/if}
      {:else}
        <div class="playback-status" role="status">Video playback unavailable. Open it in Google Photos.</div>
      {/if}
    {/if}
  {/if}
</div>
