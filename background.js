// background.js
// Background service worker
// Handles: video info relay

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getVideoInfo':
      getVideoInfo(request.tabId, sendResponse);
      return true;

    default:
      sendResponse({ error: 'Unknown action' });
  }
});

// Video info (injected script)
function getVideoInfo(tabId, callback) {
  chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
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
    const info = results?.map(r => r.result).find(Boolean) || null;
    callback(info);
  }).catch(() => callback(null));
}