// popup.js
// Popup controller -- Video Controller Pro

let currentTabId = null;

// Init
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id ?? null;

  if (!currentTabId) {
    console.error('No active tab found');
    updateUIForError();
    return;
  }

  await loadSettings();
  
  // Initial refresh
  await refreshVideoInfo();
  
  setupListeners();

  // Keep video info live
  setInterval(refreshVideoInfo, 2000);
});

function updateUIForError() {
  const infoEl = document.getElementById('videoInfo');
  const statusEl = document.getElementById('videoStatus');
  if (infoEl) infoEl.textContent = 'Unable to access current tab';
  if (statusEl) {
    statusEl.textContent = 'Error';
    statusEl.className = 'badge badge--off';
  }
}

// Event wiring
function setupListeners() {
  // Speed
  const speedUp = document.getElementById('speedUp');
  const speedDown = document.getElementById('speedDown');
  const resetSpeed = document.getElementById('resetSpeed');
  const speedSlider = document.getElementById('speedSlider');
  
  if (speedUp) speedUp.addEventListener('click', () => adjustSpeed(+0.25));
  if (speedDown) speedDown.addEventListener('click', () => adjustSpeed(-0.25));
  if (resetSpeed) resetSpeed.addEventListener('click', () => setSpeed(1.0));
  if (speedSlider) speedSlider.addEventListener('input', e => setSpeed(+e.target.value));

  // Presets
  document.querySelectorAll('.preset').forEach(btn => {
    btn.addEventListener('click', () => setSpeed(+btn.dataset.speed));
  });

  // Skip
  const skipBack30 = document.getElementById('skipBack30');
  const skipBack10 = document.getElementById('skipBack10');
  const skipForward10 = document.getElementById('skipForward10');
  const skipForward30 = document.getElementById('skipForward30');
  
  if (skipBack30) skipBack30.addEventListener('click', () => sendCommand('skip_time', { seconds: -30 }));
  if (skipBack10) skipBack10.addEventListener('click', () => sendCommand('skip_time', { seconds: -10 }));
  if (skipForward10) skipForward10.addEventListener('click', () => sendCommand('skip_time', { seconds: 10 }));
  if (skipForward30) skipForward30.addEventListener('click', () => sendCommand('skip_time', { seconds: 30 }));

  // Toggles
  const skipSilenceToggle = document.getElementById('skipSilenceToggle');
  const autoSkipSponsors = document.getElementById('autoSkipSponsors');
  
  if (skipSilenceToggle) {
    skipSilenceToggle.addEventListener('change', async e => {
      await chrome.storage.local.set({ silenceSkip: e.target.checked });
      await sendCommand('skip_silence');
    });
  }

  if (autoSkipSponsors) {
    autoSkipSponsors.addEventListener('change', async e => {
      await chrome.storage.local.set({ autoSkipSponsors: e.target.checked });
      await sendCommand('toggle_sponsor_block', { enabled: e.target.checked });
    });
  }

  // PiP
  const togglePip = document.getElementById('togglePip');
  if (togglePip) togglePip.addEventListener('click', () => sendCommand('toggle_pip'));
}

// Speed helpers
function adjustSpeed(delta) {
  const currentSpeedSpan = document.getElementById('currentSpeed');
  if (!currentSpeedSpan) return;
  const current = parseFloat(currentSpeedSpan.textContent);
  setSpeed(Math.max(0.1, Math.min(16, +(current + delta).toFixed(2))));
}

async function setSpeed(speed) {
  speed = Math.max(0.1, Math.min(16, +speed.toFixed(2)));
  const currentSpeedSpan = document.getElementById('currentSpeed');
  const speedSlider = document.getElementById('speedSlider');
  
  if (currentSpeedSpan) currentSpeedSpan.textContent = speed.toFixed(2) + 'x';
  if (speedSlider) speedSlider.value = speed;

  // Highlight active preset
  document.querySelectorAll('.preset').forEach(btn => {
    const btnSpeed = parseFloat(btn.dataset.speed);
    btn.classList.toggle('active', Math.abs(btnSpeed - speed) < 0.01);
  });

  await sendCommand('set_speed', { speed });
  await chrome.storage.local.set({ savedSpeed: speed });
}

// Send command to content script
async function sendCommand(action, extra = {}) {
  if (!currentTabId) {
    console.error('No tab ID available');
    return false;
  }
  
  try {
    const response = await chrome.tabs.sendMessage(currentTabId, { action, ...extra });
    console.log(`Command ${action} sent successfully`, response);
    return true;
  } catch (error) {
    console.error(`Failed to send command ${action}:`, error);
    
    // Try to inject content script if not present
    if (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist')) {
      console.log('Content script not responding, trying to inject...');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: currentTabId },
          files: ['content.js']
        });
        // Wait a bit for injection to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        const response = await chrome.tabs.sendMessage(currentTabId, { action, ...extra });
        return true;
      } catch (injectError) {
        console.error('Failed to inject content script:', injectError);
      }
    }
    return false;
  }
}

// Video info
async function refreshVideoInfo() {
  if (!currentTabId) return;
  
  try {
    // Get state from content script
    const response = await chrome.tabs.sendMessage(currentTabId, { action: 'get_state' });
    
    const infoEl = document.getElementById('videoInfo');
    const statusEl = document.getElementById('videoStatus');
    const currentSpeedSpan = document.getElementById('currentSpeed');
    const speedSlider = document.getElementById('speedSlider');

    if (response && response.hasVideo) {
      const state = response.isPlaying ? 'Playing' : 'Paused';
      const time = `${formatTime(response.currentTime)} / ${formatTime(response.duration)}`;
      const pip = response.pip ? ' · <strong>PiP active</strong>' : '';

      if (infoEl) {
        infoEl.innerHTML = `
          <strong>${state}</strong> · ${time}<br>
          Speed: <strong>${response.speed?.toFixed(2)}x</strong>${pip}
        `;
      }
      
      if (statusEl) {
        statusEl.textContent = 'Video Ready';
        statusEl.className = 'badge badge--on';
      }

      // Sync speed display
      if (response.speed && currentSpeedSpan && speedSlider) {
        const currentSpeed = parseFloat(currentSpeedSpan.textContent);
        if (Math.abs(response.speed - currentSpeed) > 0.02) {
          currentSpeedSpan.textContent = response.speed.toFixed(2) + 'x';
          speedSlider.value = response.speed;
          
          // Update preset highlighting
          document.querySelectorAll('.preset').forEach(btn => {
            const btnSpeed = parseFloat(btn.dataset.speed);
            btn.classList.toggle('active', Math.abs(btnSpeed - response.speed) < 0.01);
          });
        }
      }
    } else if (infoEl) {
      infoEl.textContent = 'No video detected on this page';
      if (statusEl) {
        statusEl.textContent = 'No video';
        statusEl.className = 'badge badge--off';
      }
    }
  } catch (error) {
    console.error('Failed to refresh video info:', error);
    const infoEl = document.getElementById('videoInfo');
    const statusEl = document.getElementById('videoStatus');
    if (infoEl) infoEl.textContent = 'Unable to connect to video controller. Try refreshing the page.';
    if (statusEl) {
      statusEl.textContent = 'Error';
      statusEl.className = 'badge badge--off';
    }
  }
}

// Settings persistence
async function loadSettings() {
  const saved = await chrome.storage.local.get(['savedSpeed', 'autoSkipSponsors', 'silenceSkip']);

  if (saved.savedSpeed && saved.savedSpeed !== 1.0) {
    const currentSpeedSpan = document.getElementById('currentSpeed');
    const speedSlider = document.getElementById('speedSlider');
    if (currentSpeedSpan) currentSpeedSpan.textContent = saved.savedSpeed.toFixed(2) + 'x';
    if (speedSlider) speedSlider.value = saved.savedSpeed;
    
    // Highlight active preset
    document.querySelectorAll('.preset').forEach(btn => {
      const btnSpeed = parseFloat(btn.dataset.speed);
      btn.classList.toggle('active', Math.abs(btnSpeed - saved.savedSpeed) < 0.01);
    });
  }

  const autoSkipSponsors = document.getElementById('autoSkipSponsors');
  const skipSilenceToggle = document.getElementById('skipSilenceToggle');
  
  if (autoSkipSponsors && saved.autoSkipSponsors) {
    autoSkipSponsors.checked = true;
  }

  if (skipSilenceToggle && saved.silenceSkip) {
    skipSilenceToggle.checked = true;
  }
}

// Helper functions
function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds === Infinity) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${minutes}:${pad(secs)}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}