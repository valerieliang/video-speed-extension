# Video Speed Controller

Universal video control extension for Chrome. Works on any site with HTML5 video.

## Features

- **Speed control** – 0.1× to 16×, persists across tabs
- **Keyboard shortcuts** – See popup for full list
- **Picture-in-Picture** – Detachable video player
- **SponsorBlock integration** – Auto-skips sponsors, intros, outros on YouTube
- **Silence skip** – Jumps over intro/outro dead zones (configurable)
- **Video info** – Current speed, time, play/pause status

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the extension folder

## Usage

### Popup controls

- **+ / – / slider** – Adjust playback speed
- **Preset buttons** – Quick speed selection (0.5×, 1×, 1.5×, 2×, 2.5×, 3×)
- **Skip buttons** – Jump ±10s or ±30s
- **Toggle PiP** – Enter/exit picture-in-picture

### Keyboard shortcuts

| Action | Default |
|--------|---------|
| Speed up | `Shift + ↑` |
| Speed down | `Shift + ↓` |
| Reset speed | `Shift + R` |
| Skip forward 10s | `Shift + →` |
| Skip back 10s | `Shift + ←` |
| Toggle PiP | `Shift + P` |
| Toggle play/pause | `Shift + Space` |

*Shortcuts can be customized at `chrome://extensions/shortcuts`*

## Notes

- Some sites (Netflix, YouTube) may fight speed changes – the extension automatically re-applies your speed
- PiP works on most sites but some may block it intentionally

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config & permissions |
| `background.js` | Service worker, relays messages |
| `content.js` | Injected script that controls videos |
| `popup.html/css/js` | UI controls |

## Permissions explained

- `activeTab` – Access currently open tab
- `storage` – Save your speed preference
- `scripting` – Inject controller into pages
- `tabs` – Communicate with content script
- `<all_urls>` – Work on every site with video