// popup.js
// Popup controller -- Video Controller Pro
// Sleep timer functionality completely removed

let currentTabId = null;

// Init
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id ?? null;

  await loadSettings();
  refreshVideoInfo();

  setupListeners();

  // Keep video info live
  setInterval(refreshVideoInfo, 2000);
});

// Event wiring
function setupListeners() {
  // Speed
  $('speedUp').addEventListener('click',   () => adjustSpeed(+0.25));
  $('speedDown').addEventListener('click', () => adjustSpeed(-0.25));
  $('resetSpeed').addEventListener('click',() => setSpeed(1.0));
  $('speedSlider').addEventListener('input', e => setSpeed(+e.target.value));

  // Presets
  document.querySelectorAll('.preset').forEach(btn => {
    btn.addEventListener('click', () => setSpeed(+btn.dataset.speed));
  });

  // Skip
  $('skipBack30').addEventListener('click',    () => sendCmd('skip_time', { seconds: -30 }));
  $('skipBack10').addEventListener('click',    () => sendCmd('skip_time', { seconds: -10 }));
  $('skipForward10').addEventListener('click', () => sendCmd('skip_time', { seconds:  10 }));
  $('skipForward30').addEventListener('click', () => sendCmd('skip_time', { seconds:  30 }));

  // Toggles
  $('skipSilenceToggle').addEventListener('change', e => {
    chrome.storage.local.set({ silenceSkip: e.target.checked });
    sendCmd('skip_silence');
  });

  $('autoSkipSponsors').addEventListener('change', e => {
    chrome.storage.local.set({ autoSkipSponsors: e.target.checked });
    sendCmd('toggle_sponsor_block', { enabled: e.target.checked });
  });

  // PiP
  $('togglePip').addEventListener('click', () => sendCmd('toggle_pip'));
}

// Speed helpers
function adjustSpeed(delta) {
  const current = parseFloat($('currentSpeed').textContent);
  setSpeed(Math.max(0.1, Math.min(16, +(current + delta).toFixed(2))));
}

function setSpeed(speed) {
  speed = Math.max(0.1, Math.min(16, +speed.toFixed(2)));
  $('currentSpeed').textContent = speed.toFixed(2) + 'x';
  $('speedSlider').value = speed;

  // Highlight active preset
  document.querySelectorAll('.preset').forEach(btn => {
    btn.classList.toggle('active', +btn.dataset.speed === speed);
  });

  sendCmd('set_speed', { speed });
  chrome.storage.local.set({ savedSpeed: speed });
}

// Video info
async function refreshVideoInfo() {
  let info = null;
  try {
    info = await chrome.runtime.sendMessage({ action: 'getVideoInfo', tabId: currentTabId });
  } catch (_) {}

  const infoEl  = $('videoInfo');
  const statusEl = $('videoStatus');

  if (info?.currentTime !== undefined) {
    const state  = info.isPlaying ? 'Playing' : 'Paused';
    const time   = `${fmt(info.currentTime)} / ${fmt(info.duration)}`;
    const res    = info.videoWidth ? `${info.videoWidth}x${info.videoHeight}` : '';
    const pip    = info.pip ? ' · <strong>PiP active</strong>' : '';

    infoEl.innerHTML =
      `<strong>${state}</strong> · ${time}<br>` +
      `Speed: <strong>${info.currentSpeed?.toFixed(2)}x</strong>` +
      (res ? ` · ${res}` : '') + pip;

    statusEl.textContent = 'Live';
    statusEl.className   = 'badge badge--on';

    // Sync speed display (in case a keyboard shortcut changed it)
    const spd = +(info.currentSpeed?.toFixed(2));
    if (spd && Math.abs(spd - parseFloat($('currentSpeed').textContent)) > 0.02) {
      $('currentSpeed').textContent = spd.toFixed(2) + 'x';
      $('speedSlider').value = spd;
    }
  } else {
    infoEl.textContent   = 'No video detected on this page';
    statusEl.textContent = 'No video';
    statusEl.className   = 'badge badge--off';
  }
}

// Settings persistence
async function loadSettings() {
  const s = await chrome.storage.local.get(['savedSpeed', 'autoSkipSponsors', 'silenceSkip']);

  if (s.savedSpeed) setSpeed(s.savedSpeed);

  if (s.autoSkipSponsors) {
    $('autoSkipSponsors').checked = true;
    sendCmd('toggle_sponsor_block', { enabled: true });
  }

  if (s.silenceSkip) {
    $('skipSilenceToggle').checked = true;
    // Content script restores its own silenceSkipEnabled from storage on init
  }
}

// Messaging
async function sendCmd(action, extra = {}) {
  if (!currentTabId) return;
  try {
    await chrome.tabs.sendMessage(currentTabId, { action, ...extra });
  } catch (e) {
    console.warn('[popup] sendCmd failed:', action, e.message);
  }
}

// Tiny helpers
const $ = id => document.getElementById(id);

function fmt(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }