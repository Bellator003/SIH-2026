# Privacy-Preserving Browser AI Agent (SIH 2026)

On-device visual perception and privacy-preserving browser extension built for **SIH Problem Statement SIH26171**.

It captures webpage structure and visual context locally, runs OCR and privacy redaction on-device, and communicates safely with AI models without exposing sensitive user data.

---

## 🚀 How to Use

### 1. Load Extension in Chrome
1. Open Google Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (toggle in top-right corner).
3. Click **Load unpacked** (top-left button) and select the `extension`   folder.

### 2. Inspect Webpage DOM
1. Navigate to any webpage (e.g. `https://wikipedia.org`).
2. Click the **Privacy Vision Agent** extension icon in Chrome toolbar.
3. Click **Inspect DOM** to view structured page metadata and interactive elements.

### 3. Capture Screen & Run Local OCR
1. Click **Capture Canvas** to take a local screenshot rendered onto an HTML Canvas.
2. Click **Run Local OCR** to run offline Tesseract.js text recognition on-device.