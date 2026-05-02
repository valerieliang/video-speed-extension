// content.js
// Works on any site with an HTML5 <video> element

const VC = (() => {
  // State
  let video = null;
  let desiredSpeed = 1.0;        // User's chosen speed -- we enforce this
  let sponsorSegments = [];
  let autoSkipSponsors = false;
  let silenceSkipEnabled = false;
  let lastUrl = location.href;
  let hudTimeout = null;
  let hudEl = null;
  let rateChangeGuard = false;   // Prevents re-entrancy when we set playbackRate

  // Video discovery
  function collectVideos(root) {
    const found = Array.from(root.querySelectorAll('video'));
    root.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) found.push(...collectVideos(el.shadowRoot));
    });
    return found;
  }

  function findBestVideo() {
    const videos = collectVideos(document);
    if (!videos.length) return null;

    // Prefer: playing > largest > first
    return (
      videos.find(v => !v.paused && v.readyState >= 3) ||
      [...videos].sort((a, b) =>
        (b.videoWidth * b.videoHeight) - (a.videoWidth * a.videoHeight)
      )[0]
    );
  }

  function attachToVideo(v) {
    if (!v || v === video) return;

    // Detach old listeners if switching videos
    if (video) detachListeners(video);

    video = v;
    applySpeed(desiredSpeed, true); // Apply immediately, silent
    attachListeners(video);
    fetchSponsorSegments();
  }

  // Event listeners
  function attachListeners(v) {
    v.__vc_timeupdate = () => handleTimeUpdate();
    v.__vc_ratechange = () => handleRateChange();
    v.__vc_enterpip   = () => handlePiPEnter();
    v.__vc_leavepip   = () => handlePiPLeave();

    v.addEventListener('timeupdate',              v.__vc_timeupdate);
    v.addEventListener('ratechange',              v.__vc_ratechange);
    v.addEventListener('enterpictureinpicture',   v.__vc_enterpip);
    v.addEventListener('leavepictureinpicture',   v.__vc_leavepip);
  }

  function detachListeners(v) {
    if (!v) return;
    v.removeEventListener('timeupdate',             v.__vc_timeupdate);
    v.removeEventListener('ratechange',             v.__vc_ratechange);
    v.removeEventListener('enterpictureinpicture',  v.__vc_enterpip);
    v.removeEventListener('leavepictureinpicture',  v.__vc_leavepip);
  }

  // Speed enforcement
  // Sites like Netflix reset playbackRate. We catch the ratechange
  // event and re-apply the user's desired speed if the site fights us.
  function handleRateChange() {
    if (rateChangeGuard) return;
    if (!video) return;
    if (Math.abs(video.playbackRate - desiredSpeed) > 0.01) {
      applySpeed(desiredSpeed, true); // re-enforce silently
    }
  }

  function applySpeed(speed, silent = false) {
    desiredSpeed = speed;
    if (!video) return;

    rateChangeGuard = true;
    video.playbackRate = speed;
    rateChangeGuard = false;

    chrome.storage.local.set({ savedSpeed: speed });
    if (!silent) showHUD(`${speed.toFixed(2)}x`);
  }

  // Time-based features
  function handleTimeUpdate() {
    if (!video) return;
    const t = video.currentTime;

    if (autoSkipSponsors && sponsorSegments.length) {
      for (const seg of sponsorSegments) {
        if (t >= seg.start && t < seg.end) {
          video.currentTime = seg.end;
          showHUD('Sponsor skipped');
          break;
        }
      }
    }

    if (silenceSkipEnabled) {
      trySkipSilence(t);
    }
  }

  // Simple heuristic: skip known dead zones (intro / outro)
  function trySkipSilence(t) {
    if (!video || !video.duration) return;
    const dur = video.duration;
    if (dur < 120) return; // Skip feature for videos < 2 min

    // Skip 10-30s intro window
    if (t > 8 && t < 28) {
      video.currentTime = 30;
      showHUD('Intro skipped');
      return;
    }
    // Skip outro (last 25 seconds)
    if (dur > 300 && t > dur - 28 && t < dur - 3) {
      video.currentTime = dur - 2;
      showHUD('Outro skipped');
    }
  }

  // PiP
  function handlePiPEnter() {
    showHUD('Picture-in-Picture');
  }

  function handlePiPLeave() {
    // Re-apply speed in case the PiP window reset it
    if (video) applySpeed(desiredSpeed, true);
  }

  async function togglePiP() {
    if (!video) { showHUD('No video found'); return; }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        if (!document.pictureInPictureEnabled) {
          showHUD('PiP not supported here');
          return;
        }
        await video.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('PiP error:', e);
      showHUD('PiP unavailable');
    }
  }

  // SponsorBlock
  async function fetchSponsorSegments() {
    const videoId = extractYouTubeId(location.href);
    if (!videoId) return; // SponsorBlock only covers YouTube

    try {
      const url = `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=["sponsor","intro","outro","selfpromo"]`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        sponsorSegments = data.map(s => ({ start: s.segment[0], end: s.segment[1] }));
        console.log(`[VC] Loaded ${sponsorSegments.length} SponsorBlock segment(s)`);
      }
    } catch (e) {
      console.warn('[VC] SponsorBlock fetch failed:', e);
    }
  }

  function extractYouTubeId(url) {
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?#]+)/);
    return m ? m[1] : null;
  }

  // HUD overlay
  function showHUD(text) {
    ensureStyles();

    if (!hudEl) {
      hudEl = document.createElement('div');
      hudEl.id = '__vc_hud';
      document.body.appendChild(hudEl);
    }

    hudEl.textContent = text;
    hudEl.classList.remove('__vc_hud_fade');
    void hudEl.offsetWidth; // reflow to restart animation
    hudEl.classList.add('__vc_hud_fade');

    clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => {
      if (hudEl) hudEl.textContent = '';
    }, 1800);
  }

  function ensureStyles() {
    if (document.getElementById('__vc_styles')) return;
    const s = document.createElement('style');
    s.id = '__vc_styles';
    s.textContent = `
      #__vc_hud {
        position: fixed;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.75);
        color: #fff;
        padding: 6px 18px;
        border-radius: 20px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0.02em;
        z-index: 2147483647;
        pointer-events: none;
        opacity: 0;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        transition: opacity 0.15s ease;
      }
      #__vc_hud.__vc_hud_fade {
        animation: __vc_fadeout 1.8s forwards;
      }
      @keyframes __vc_fadeout {
        0%   { opacity: 1; }
        60%  { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(s);
  }

  // SPA / navigation detection
  function checkUrlChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      sponsorSegments = [];

      // Clear video reference if it's no longer connected, unless reused (e.g., YouTube).
      if (video && !video.isConnected) {
        detachListeners(video);
        video = null;
      }

      // Fetch sponsor segments for the new URL.
      fetchSponsorSegments();

      // Schedule progressive scan attempts; the new <video> may appear at
      // different points depending on the site's rendering pipeline.
      [200, 600, 1200].forEach(delay => setTimeout(scan, delay));
    }
  }

  // MutationObserver -- universal video scanner
  function scan() {
    const best = findBestVideo();
    if (best) attachToVideo(best);
  }

  const observer = new MutationObserver(() => {
    scan();
    checkUrlChange();
  });

  // Commands from popup / background
  const handlers = {
    speed_up:   () => applySpeed(Math.min(16, +(desiredSpeed + 0.25).toFixed(2))),
    speed_down: () => applySpeed(Math.max(0.1, +(desiredSpeed - 0.25).toFixed(2))),
    reset_speed:() => applySpeed(1.0),

    set_speed: ({ speed }) => applySpeed(parseFloat(speed)),

    skip_time: ({ seconds }) => {
      if (!video) return;
      video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds));
      showHUD(`${seconds > 0 ? '+' : ''}${seconds}s`);
    },

    skip_silence: () => {
      silenceSkipEnabled = !silenceSkipEnabled;
      chrome.storage.local.set({ silenceSkip: silenceSkipEnabled });
      showHUD(`Silence skip ${silenceSkipEnabled ? 'ON' : 'OFF'}`);
    },

    toggle_pip: () => togglePiP(),

    toggle_play_pause: () => {
      if (!video) return;
      if (video.paused) { video.play(); showHUD('Play'); }
      else              { video.pause(); showHUD('Pause'); }
    },

    toggle_sponsor_block: ({ enabled }) => {
      autoSkipSponsors = !!enabled;
      if (autoSkipSponsors && !sponsorSegments.length) fetchSponsorSegments();
      chrome.storage.local.set({ autoSkipSponsors: autoSkipSponsors });
      showHUD(`SponsorBlock ${autoSkipSponsors ? 'ON' : 'OFF'}`);
    },

    // BUG FIX: get_state was calling sendResponse via a separate param but
    // the message listener below was also calling sendResponse({ success: true })
    // afterwards, causing a double-response error. Handler now returns the data
    // object and the listener handles calling sendResponse once.
    get_state: () => ({
      speed: desiredSpeed,
      isPlaying: video ? !video.paused : false,
      currentTime: video?.currentTime ?? 0,
      duration: video?.duration ?? 0,
      pip: document.pictureInPictureElement === video,
      hasVideo: !!video,
      silenceSkip: silenceSkipEnabled,
      sponsorBlock: autoSkipSponsors
    })
  };

  // Message listener
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const handler = handlers[msg.action];
    if (!handler) {
      sendResponse({ error: 'unknown command' });
      return false;
    }

    const result = handler(msg);

    if (msg.action === 'get_state') {
      // get_state returns a plain object synchronously
      sendResponse(result);
    } else {
      sendResponse({ success: true });
    }

    return false; // No async needed; all handlers are synchronous
  });

  // Init
  async function init() {
    const saved = await chrome.storage.local.get(['savedSpeed', 'autoSkipSponsors', 'silenceSkip']);
    if (saved.savedSpeed && saved.savedSpeed !== 1.0) {
      desiredSpeed = saved.savedSpeed;
    }
    autoSkipSponsors = !!saved.autoSkipSponsors;
    silenceSkipEnabled = !!saved.silenceSkip;

    scan();

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[Video Controller Pro] loaded on', location.hostname);
})();