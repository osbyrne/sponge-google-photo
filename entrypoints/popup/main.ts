const status = document.querySelector<HTMLParagraphElement>('#status');

async function handleActionClick() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const isGooglePhotos = tab?.url?.startsWith('https://photos.google.com/');

  if (!isGooglePhotos || tab.id === undefined) {
    setStatus('Try this in Google Photos.');
    return;
  }

  try {
    await browser.tabs.sendMessage(tab.id, { type: 'photos-sponge:toggle-panel' });
    window.close();
  } catch {
    setStatus('Reload Google Photos, then click the extension icon again.');
  }
}

function setStatus(message: string) {
  if (status) status.textContent = message;
}

void handleActionClick();
