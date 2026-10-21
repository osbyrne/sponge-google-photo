import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

const togglePanelMessage = { type: "photos-sponge:toggle-panel" };

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined || !tab.url?.startsWith("https://photos.google.com/")) {
      return;
    }

    void browser.tabs.sendMessage(tab.id, togglePanelMessage).catch(() => undefined);
  });
});
