// Background Service Worker for Privacy Vision Agent

importScripts("../perception/screenshot-capture.js");

console.log("[Service Worker] Initialized.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "INSPECT_PAGE") {
    handleInspectPage()
      .then((pageState) => sendResponse({ status: "success", pageState }))
      .catch((error) => sendResponse({ status: "error", message: error.message }));
    return true; // Async response
  }

  if (request.action === "CAPTURE_SCREENSHOT") {
    handleCaptureScreenshot(request.options)
      .then((dataUrl) => sendResponse({ status: "success", dataUrl }))
      .catch((error) => sendResponse({ status: "error", message: error.message }));
    return true; // Async response
  }
});

async function handleInspectPage() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !activeTab.id) {
    throw new Error("No active tab found.");
  }

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, { action: "ANALYZE_DOM" });
    if (response && response.pageState) {
      console.log("[Service Worker] PageState captured successfully:", response.pageState);
      return response.pageState;
    }
    throw new Error("Empty response from content script.");
  } catch (err) {
    console.warn("[Service Worker] Direct message failed, attempting dynamic injection...", err.message);
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ["content/dom-analyzer.js"]
    });

    const response = await chrome.tabs.sendMessage(activeTab.id, { action: "ANALYZE_DOM" });
    if (response && response.pageState) {
      console.log("[Service Worker] PageState captured via injection:", response.pageState);
      return response.pageState;
    }
    throw new Error("Failed to receive PageState after script injection.");
  }
}

async function handleCaptureScreenshot(options) {
  console.log("[Service Worker] Capturing tab screenshot...");
  const dataUrl = await ScreenshotCapture.captureCurrentTab(options);
  console.log("[Service Worker] Screenshot captured. Data URL length:", dataUrl.length);
  return dataUrl;
}
