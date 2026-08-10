<script lang="ts">
  import { onMount } from 'svelte';
  import type { ReviewController } from '../../src/photos/review-controller';
  import type { ReviewSnapshot } from '../../src/photos/types';

  export let controller: ReviewController;
  export let onHide: () => void;

  let snapshot: ReviewSnapshot = controller.snapshot;

  onMount(() => controller.subscribe((next) => (snapshot = next)));

  function selectMonth(event: Event) {
    controller.setMonth((event.currentTarget as HTMLSelectElement).value);
  }
</script>

<section class="panel" aria-label="Photos Sponge">
  <header class="topbar">
    <div class="title">Photos Sponge</div>
    <div class="actions">
      <button type="button" onclick={() => controller.refresh(true)} disabled={snapshot.busy}>Refresh</button>
      <button type="button" onclick={onHide}>Hide</button>
    </div>
  </header>

  <div class="body">
    <div class="picker">
      <select
        aria-label="Month to review"
        value={snapshot.selectedMonth}
        onchange={selectMonth}
        disabled={snapshot.phase !== 'idle' || snapshot.busy}
      >
        {#if snapshot.months.length === 0}
          <option value="">No visible months found</option>
        {:else}
          {#each snapshot.months as month (month.label)}
            <option value={month.label}>{month.label} ({month.count})</option>
          {/each}
        {/if}
      </select>
      <button
        type="button"
        class="primary"
        onclick={() => controller.start()}
        disabled={snapshot.phase !== 'idle' || snapshot.busy || snapshot.months.length === 0}
      >Start</button>
    </div>

    <div class="stage">
      {#if snapshot.phase === 'reviewing' && snapshot.current}
        {#if snapshot.current.thumbUrl}
          <img src={snapshot.current.thumbUrl} alt={snapshot.current.label} />
        {:else}
          <div class="empty">Preview unavailable. Use the highlighted tile in Google Photos.</div>
        {/if}
      {:else if snapshot.phase === 'complete'}
        <div class="complete">
          <strong>Review complete</strong>
          <span>{snapshot.selectedCount} photo{snapshot.selectedCount === 1 ? '' : 's'} selected in Google Photos.</span>
          {#if snapshot.selectedCount > 0}
            <span>Use the Google Photos toolbar to move them to trash.</span>
          {/if}
        </div>
      {:else}
        <div class="empty">Scroll Google Photos to a month, choose it here, then start.</div>
      {/if}
    </div>

    <div class="meta">
      <div class="photo-label">
        {#if snapshot.phase === 'reviewing' && snapshot.current}
          {snapshot.current.label}
        {:else if snapshot.phase === 'complete'}
          Month complete
        {:else}
          No review running
        {/if}
      </div>
      <div class="status">{snapshot.status}</div>
    </div>

    <div class="keys" aria-label="Keyboard shortcuts">
      <span class="key"><kbd>Y</kbd> keep</span>
      <span class="key"><kbd>N</kbd> trash</span>
      <span class="key"><kbd>U</kbd> undo</span>
      <span class="key"><kbd>Esc</kbd> stop</span>
    </div>
  </div>
</section>
