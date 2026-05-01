// background.js
// Background service worker
// Handles: keyboard command routing, video info relay
// Sleep timer functionality completely removed

// Keyboard shortcut routing
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  // Forward command to ALL frames (handles iframes like Twitch chat embed, etc.)
  chrome.tabs.sendMessage(tab.id, { action: command }).catch(() => {
    // Tab may not have content script yet -- silently ignore
  });
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getVideoInfo':
      getVideoInfo(request.tabId, sendResponse);
      return true; // async

    default:
      sendResponse({ error: 'Unknown action' });
  }
});

// Video info (injected script)
function getVideoInfo(tabId, callback) {
  chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      // Find best video candidate: largest visible one
      const videos = Array.from(document.querySelectorAll('video'));
      const video = videos
        .filter(v => v.readyState >= 1 && !v.paused || videos.length === 1)
        .sort((a, b) => (b.videoWidth * b.videoHeight) - (a.videoWidth * a.videoHeight))[0]
        || videos[0];

      if (!video) return null;
      return {
        currentSpeed: video.playbackRate,
        isPlaying: !video.paused,
        currentTime: video.currentTime,
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        pip: document.pictureInPictureElement === video
      };
    }
  }).then(results => {
    // Return first non-null result across frames
    const info = results?.map(r => r.result).find(Boolean) || null;
    callback(info);
  }).catch(() => callback(null));
}