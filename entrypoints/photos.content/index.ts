import { mount, unmount } from "svelte";
import { browser } from "wxt/browser";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { defineContentScript } from "wxt/utils/define-content-script";
import { ReviewController } from "../../src/photos/review-controller";
import App from "./App.svelte";
import "./style.css";

type TogglePanelMessage = { type: "photos-sponge:toggle-panel" };

export default defineContentScript({
  matches: ["https://photos.google.com/*"],
  runAt: "document_idle",
  cssInjectionMode: "ui",

  async main(ctx) {
    const controller = new ReviewController(ctx.signal);
    const ui = await createShadowRootUi(ctx, {
      name: "photos-sponge-ui",
      position: "inline",
      anchor: "body",
      onMount: (container) =>
        mount(App, {
          target: container,
          props: {
            controller,
          },
        }),
      onRemove: (app) => {
        if (app) void unmount(app);
      },
    });

    ui.mount();
    controller.setVisible(true);

    const togglePanel = (message: unknown) => {
      if (!isTogglePanelMessage(message)) return;
      ui.shadowHost.hidden = !ui.shadowHost.hidden;
      controller.setVisible(!ui.shadowHost.hidden);
      return Promise.resolve({ visible: !ui.shadowHost.hidden });
    };
    browser.runtime.onMessage.addListener(togglePanel);
    ctx.onInvalidated(() =>
      browser.runtime.onMessage.removeListener(togglePanel)
    );

    ctx.addEventListener(
      window,
      "keydown",
      (event) => {
        if (!ui.shadowHost.hidden) controller.handleKeydown(event);
      },
      { capture: true },
    );
    ctx.addEventListener(window, "wxt:locationchange", () => controller.pause());
  },
});

function isTogglePanelMessage(message: unknown): message is TogglePanelMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "photos-sponge:toggle-panel"
  );
}
