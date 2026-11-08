<script lang="ts">
  import { onMount } from 'svelte';
  import type { ReviewController } from '../../src/photos/review-controller';
  import type { ReviewSnapshot } from '../../src/photos/types';
  import MediaPreview from './MediaPreview.svelte';

  export let controller: ReviewController;
  let snapshot: ReviewSnapshot = controller.snapshot;
  onMount(() => controller.subscribe((next) => (snapshot = next)));

  function selectStart(event: Event) {
    if (!(event.currentTarget instanceof HTMLSelectElement)) return;
    const value = event.currentTarget.value;
    event.currentTarget.blur();
    void controller.start(value);
  }

</script>

<section class="panel" aria-label="Photo review" hidden={snapshot.phase === 'confirming'}>
  <div class="body">
    <label class="picker">
      <span>Start from</span>
      <select
        aria-label="Start from"
        value={snapshot.startFrom}
        onchange={selectStart}
        disabled={snapshot.busy || snapshot.selectedCount > 0}
        title={snapshot.selectedCount > 0 ? 'Move marked photos to trash or undo them before choosing a new starting point.' : 'Choose a starting date, then continue backwards through your library.'}
      >
        {#each snapshot.starts as start (start.value)}
          <option value={start.value}>{start.label}</option>
        {/each}
      </select>
    </label>

    <div class="stage" aria-busy={snapshot.phase === 'loading'}>
      {#if snapshot.current}
        {#key snapshot.current.id}
          <MediaPreview photo={snapshot.current} active={snapshot.phase === 'reviewing'} />
        {/key}
      {:else if snapshot.phase === 'complete'}
        <div class="complete">
          <strong>End of the timeline</strong>
          <span>{snapshot.reviewedCount} photo{snapshot.reviewedCount === 1 ? '' : 's'} reviewed.</span>
        </div>
      {:else}
        <div class="empty">{snapshot.phase === 'loading' ? 'Loading your photos...' : snapshot.phase === 'confirming' ? 'Confirm in Google Photos' : 'Ready when you are.'}</div>
      {/if}
    </div>

    <div class="meta">
      {#if snapshot.current}<div class="photo-label">{snapshot.current.label}</div>{/if}
      <div class="counts">{snapshot.reviewedCount} reviewed · {snapshot.keptCount} kept · {snapshot.selectedCount} marked for trash</div>
      <div class="status" role="status">{snapshot.status}</div>
    </div>

    <div class="keys" aria-label="Keyboard shortcuts">
      <span class="key"><kbd>Y</kbd> keep</span>
      <span class="key"><kbd>N</kbd> trash</span>
      {#if snapshot.canUndo}<span class="key"><kbd>U</kbd> undo</span>{/if}
      {#if snapshot.selectedCount > 0 && snapshot.phase !== 'confirming'}
        <span class="key"><kbd>Enter</kbd> move marked photos to trash</span>
      {/if}
    </div>
  </div>
</section>
