import { ReviewController } from "../../src/photos/review-controller";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  assert(actual === expected, message);
}

function button(label: string) {
  const element = document.createElement("button");
  element.textContent = label;
  return element;
}

function fixture() {
  document.body.innerHTML = `
    <div>
      <a href="/photo/test" aria-label="January 1, 2026" style="display:block;width:120px;height:120px">
        <img alt="January 1, 2026" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" width="120" height="120">
      </a>
      <button role="checkbox" aria-label="January 1, 2026" aria-checked="false">Select</button>
    </div>
    <button aria-label="Move to trash">Trash</button>`;
  const checkbox = document.querySelector('[role="checkbox"]');
  const trash = document.querySelector('[aria-label="Move to trash"]');
  assert(checkbox instanceof HTMLButtonElement, "Missing photo selection control");
  assert(trash instanceof HTMLButtonElement, "Missing trash button");
  const abort = new AbortController();
  const controller = new ReviewController(abort.signal);
  const dialog = document.createElement("div");
  dialog.role = "dialog";
  const cancel = button("Cancel");
  const confirm = button("Move to trash");
  dialog.append(cancel, confirm);
  let clicks = 0;
  let confirmations = 0;
  let failMove = false;

  checkbox.addEventListener("click", () => {
    checkbox.setAttribute("aria-checked", String(checkbox.getAttribute("aria-checked") !== "true"));
  });
  trash.addEventListener("click", () => {
    clicks += 1;
    document.body.append(dialog);
  });
  cancel.addEventListener("click", () => dialog.remove());
  confirm.addEventListener("click", () => {
    confirmations += 1;
    dialog.remove();
    if (!failMove) {
      checkbox.parentElement?.remove();
      trash.remove();
    }
  });
  window.addEventListener("keydown", (event) => controller.handleKeydown(event), {
    capture: true,
    signal: abort.signal,
  });

  return {
    controller, trash, checkbox, dialog, cancel, confirm, abort,
    get clicks() { return clicks; },
    get confirmations() { return confirmations; },
    failMove() { failMove = true; },
    async complete(decision: "keep" | "trash" = "trash") {
      controller.start();
      await controller.decide(decision);
      assert(controller.snapshot.phase === "complete", "Review should be complete");
    },
    press(key = "Enter", target: EventTarget = document.body, options: KeyboardEventInit = {}) {
      const event = new KeyboardEvent("keydown", {
        key, bubbles: true, cancelable: true, composed: true, ...options,
      });
      target.dispatchEvent(event);
      return event;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;
const tick = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));
const cases: [string, (fixture: Fixture) => Promise<void>][] = [
  ["Enter opens confirmation without confirming or clearing the review", async (f) => {
    await f.complete();
    assert(f.press().defaultPrevented, "Enter must not reach Google Photos after opening its dialog");
    assert(f.dialog.isConnected, "Enter should open Google Photos' confirmation");
    assert(f.controller.snapshot.phase === "confirming", "Review should await confirmation");
    assert(f.controller.snapshot.selectedCount === 1, "Selection should be retained");
    assert(f.confirmations === 0, "The extension must never confirm automatically");
  }],
  ["User confirmation and cleared selection reset the review", async (f) => {
    await f.complete();
    f.press();
    f.confirm.click();
    await tick();
    assert(f.controller.snapshot.phase === "idle", "Successful move should reset review");
    assert(f.controller.snapshot.selectedCount === 0, "Successful move should clear review selection");
    assert(f.controller.snapshot.status === "1 photo moved to trash.", "Success should be reported");
  }],
  ["Cancellation keeps selection, supports retry, and preserves undo", async (f) => {
    await f.complete();
    f.press();
    f.cancel.click();
    await tick();
    equal(f.controller.snapshot.phase, "complete", "Cancel should return to complete review");
    equal(f.controller.snapshot.selectedCount, 1, "Cancel should preserve selection");
    f.press();
    assert(f.clicks === 2, "Enter should reopen confirmation after cancellation");
    f.cancel.click();
    await tick();
    await f.controller.undo();
    assert(f.controller.snapshot.phase === "reviewing", "Undo should remain available");
    assert(f.controller.snapshot.selectedCount === 0, "Undo should unselect the photo");
  }],
  ["Held Enter cannot confirm, and fresh Enter/Escape belong to the native dialog", async (f) => {
    await f.complete();
    f.press();
    assert(f.press("Enter", f.confirm, { repeat: true }).defaultPrevented, "Repeated Enter must be blocked");
    assert(!f.press("Enter", f.confirm).defaultPrevented, "A fresh Enter must reach the native dialog");
    assert(!f.press("Escape", f.cancel).defaultPrevented, "Escape must reach the native dialog");
    assert(f.clicks === 1 && f.confirmations === 0, "The shortcut must not retrigger or confirm");
  }],
  ["Enter is inactive before review completion and when nothing is selected", async (f) => {
    f.press();
    f.controller.start();
    f.press();
    await f.controller.decide("keep");
    f.press();
    assert(f.clicks === 0, "Only a complete review with selected photos can open trash");
  }],
  ["Held, modified, and composing Enter presses do not open trash", async (f) => {
    await f.complete();
    for (const options of [
      { repeat: true }, { ctrlKey: true }, { metaKey: true },
      { altKey: true }, { shiftKey: true }, { isComposing: true },
    ]) f.press("Enter", document.body, options);
    assert(f.clicks === 0, "Enter with modifiers, repeats, or composition must be ignored");
  }],
  ["Typing and focused controls, including shadow DOM, retain Enter", async (f) => {
    await f.complete();
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    for (const tag of ["input", "textarea", "select", "button", "div"]) {
      const control = document.createElement(tag);
      if (tag === "div") control.contentEditable = "true";
      shadow.append(control);
      assert(!f.press("Enter", control).defaultPrevented, `${tag} must retain Enter`);
    }
    assert(f.clicks === 0, "Typing in a shadow root must not open trash");
  }],
  ["Existing Google Photos dialogs retain their keys", async (f) => {
    await f.complete();
    const dialog = document.createElement("div");
    dialog.role = "alertdialog";
    dialog.textContent = "Another Google Photos dialog";
    document.body.append(dialog);
    assert(!f.press().defaultPrevented, "Existing dialog should retain Enter");
    assert(!f.press("Escape").defaultPrevented, "Existing dialog should retain Escape");
    assert(f.clicks === 0, "Existing dialog should block extension actions");
  }],
  ["French trash controls open the native confirmation", async (f) => {
    await f.complete();
    f.trash.setAttribute("aria-label", "Supprimer");
    f.confirm.textContent = "Placer dans la corbeille";
    f.press();
    assert(f.dialog.isConnected, "French trash action should open");
    f.confirm.click();
    await tick();
    assert(f.controller.snapshot.phase === "idle", "French confirmation should be recognized");
  }],
  ["Missing and ambiguous trash controls preserve the review", async (f) => {
    await f.complete();
    const duplicate = button("Move to trash");
    document.body.append(duplicate);
    f.press();
    await tick();
    assert(f.clicks === 0, "Ambiguous trash controls must not be clicked");
    duplicate.remove();
    f.trash.remove();
    f.press();
    await tick();
    assert(f.controller.snapshot.selectedCount === 1, "Unavailable trash must preserve review selection");
    assert(f.controller.snapshot.status.includes("toolbar"), "Unavailable action should explain recovery");
  }],
  ["Disabled, hidden, and permanent-delete controls are never clicked", async (f) => {
    await f.complete();
    f.trash.disabled = true;
    f.press();
    await tick();
    f.trash.disabled = false;
    f.trash.style.visibility = "hidden";
    f.press();
    await tick();
    f.trash.style.visibility = "visible";
    f.trash.setAttribute("aria-label", "Delete permanently");
    f.press();
    await tick();
    assert(f.clicks === 0, "Only an available Move to trash action can be clicked");
  }],
  ["Unrecognized confirmation times out without clearing the review", async (f) => {
    await f.complete();
    f.confirm.textContent = "Delete permanently";
    f.press();
    await new Promise((resolve) => window.setTimeout(resolve, 3100));
    assert(f.controller.snapshot.phase === "complete", "Unknown dialog must not block the extension forever");
    assert(f.controller.snapshot.selectedCount === 1 && f.confirmations === 0, "Unknown dialog must preserve selection");
    assert(f.controller.snapshot.status.includes("Could not verify"), "Unknown dialog must not report success");
  }],
  ["Failed moves retain the review and report that completion is unverified", async (f) => {
    await f.complete();
    f.failMove();
    f.press();
    f.confirm.click();
    await new Promise((resolve) => window.setTimeout(resolve, 10100));
    assert(f.controller.snapshot.phase === "complete", "Failed move should allow recovery");
    assert(f.controller.snapshot.selectedCount === 1, "Failed move must retain review selection");
    assert(f.controller.snapshot.status.includes("Could not verify"), "Failed move must not report success");
  }],
  ["Disposing the extension stops watching a pending confirmation", async (f) => {
    await f.complete();
    f.press();
    let updates = 0;
    f.controller.subscribe(() => { updates += 1; });
    f.abort.abort();
    f.confirm.click();
    await tick();
    assert(updates === 1, "An invalidated extension must not update after confirmation");
  }],
];

async function run() {
  const results: { name: string; error?: string }[] = [];
  for (const [name, test] of cases) {
    const f = fixture();
    try {
      await test(f);
      results.push({ name });
    } catch (error) {
      results.push({ name, error: String(error) });
    } finally {
      f.abort.abort();
    }
  }
  const output = document.createElement("pre");
  output.dataset.testResults = btoa(JSON.stringify(results));
  document.body.append(output);
}

void run();
