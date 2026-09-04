// perception/screenshot-capture.js
// Modular Screenshot Capture module

class ScreenshotCapture {
  /**
   * Captures the visible area of the currently active tab.
   * @param {Object} options - Options for capture ({ format: 'png' | 'jpeg', quality: 0-100 })
   * @returns {Promise<string>} Data URL string of the captured image
   */
  static async captureCurrentTab(options = { format: "png", quality: 90 }) {
    const currentWindow = await chrome.windows.getCurrent();
    if (!currentWindow || currentWindow.id === undefined) {
      throw new Error("Unable to determine current browser window.");
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(currentWindow.id, {
      format: options.format || "png",
      quality: options.quality || 90
    });

    if (!dataUrl) {
      throw new Error("Screenshot capture returned empty result.");
    }

    return dataUrl;
  }
}

// Global exposure for service worker / worker scope
if (typeof self !== "undefined") {
  self.ScreenshotCapture = ScreenshotCapture;
}
