// popup.js
let currentTabId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id ?? null;

  if (!currentTabId) {
    updateUIForError();
    return;
  }

  await loadSettings();
  await refreshVideoInfo();
  setupListeners();

  setInterval(refreshVideoInfo, 2000);
});

function updateUIForError() {
  document.getElementById('videoInfo').textContent = 'Unable to access current tab';
  const statusEl = document.getElementById('videoStatus');
  statusEl.textContent = 'Error';
  statusEl.className = 'badge badge--off';
}

function setupListeners() {
  document.getElementById('speedUp').addEventListener('click', () => adjustSpeed(+0.25));
  document.getElementById('speedDown').addEventListener('click', () => adjustSpeed(-0.25));
  document.getElementById('speedSlider').addEventListener('input', e => setSpeed(+e.target.value));

  document.querySelectorAll('.preset').forEach(btn => {
    btn.addEventListener('click', () => setSpeed(+btn.dataset.speed));
  });

  document.getElementById('skipBack30').addEventListener('click', () => sendCommand('skip_time', { seconds: -30 }));
  document.getElementById('skipBack10').addEventListener('click', () => sendCommand('skip_time', { seconds: -10 }));
  document.getElementById('skipForward10').addEventListener('click', () => sendCommand('skip_time', { seconds: 10 }));
  document.getElementById('skipForward30').addEventListener('click', () => sendCommand('skip_time', { seconds: 30 }));

  document.getElementById('togglePip').addEventListener('click', () => sendCommand('toggle_pip'));
}

function adjustSpeed(delta) {
  const current = parseFloat(document.getElementById('currentSpeed').textContent);
  setSpeed(Math.max(0.1, Math.min(16, +(current + delta).toFixed(2))));
}

async function setSpeed(speed) {
  speed = Math.max(0.1, Math.min(16, +speed.toFixed(2)));

  document.getElementById('currentSpeed').textContent = speed.toFixed(2) + 'x';
  document.getElementById('speedSlider').value = speed;

  document.querySelectorAll('.preset').forEach(btn => {
    btn.classList.toggle('active', Math.abs(+btn.dataset.speed - speed) < 0.01);
  });

  await sendCommand('set_speed', { speed });
  await chrome.storage.local.set({ savedSpeed: speed });
}

async function sendCommand(action, extra = {}) {
  try {
    await chrome.tabs.sendMessage(currentTabId, { action, ...extra });
  } catch (error) {
    console.error(`Failed to send command ${action}:`, error);
  }
}

async function refreshVideoInfo() {
  if (!currentTabId) return;

  try {
    const response = await chrome.tabs.sendMessage(currentTabId, { action: 'get_state' });
    const infoEl = document.getElementById('videoInfo');
    const statusEl = document.getElementById('videoStatus');
    const currentSpeedSpan = document.getElementById('currentSpeed');
    const speedSlider = document.getElementById('speedSlider');

    if (response?.hasVideo) {
      const state = response.isPlaying ? 'Playing' : 'Paused';
      const time = `${formatTime(response.currentTime)} / ${formatTime(response.duration)}`;
      const pip = response.pip ? ' · <strong>PiP active</strong>' : '';

      infoEl.innerHTML = `<strong>${state}</strong> · ${time}<br>Speed: <strong>${response.speed?.toFixed(2)}x</strong>${pip}`;
      statusEl.textContent = 'Video Ready';
      statusEl.className = 'badge badge--on';

      // Sync speed display if it drifted (e.g. site reset it)
      if (response.speed && Math.abs(response.speed - parseFloat(currentSpeedSpan.textContent)) > 0.02) {
        currentSpeedSpan.textContent = response.speed.toFixed(2) + 'x';
        speedSlider.value = response.speed;
        document.querySelectorAll('.preset').forEach(btn => {
          btn.classList.toggle('active', Math.abs(+btn.dataset.speed - response.speed) < 0.01);
        });
      }
    } else {
      infoEl.textContent = 'No video detected on this page';
      statusEl.textContent = 'No video';
      statusEl.className = 'badge badge--off';
    }
  } catch {
    document.getElementById('videoInfo').textContent = 'Unable to connect. Try refreshing the page.';
    const statusEl = document.getElementById('videoStatus');
    statusEl.textContent = 'Error';
    statusEl.className = 'badge badge--off';
  }
}

async function loadSettings() {
  const saved = await chrome.storage.local.get('savedSpeed');
  if (!saved.savedSpeed || saved.savedSpeed === 1.0) return;

  document.getElementById('currentSpeed').textContent = saved.savedSpeed.toFixed(2) + 'x';
  document.getElementById('speedSlider').value = saved.savedSpeed;

  document.querySelectorAll('.preset').forEach(btn => {
    btn.classList.toggle('active', Math.abs(+btn.dataset.speed - saved.savedSpeed) < 0.01);
  });
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds === Infinity) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}