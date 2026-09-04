document.addEventListener("DOMContentLoaded", () => {
  const inspectBtn = document.getElementById("inspect-btn");
  const captureBtn = document.getElementById("capture-btn");
  const ocrBtn = document.getElementById("ocr-btn");
  const copyBtn = document.getElementById("copy-btn");
  const statusContainer = document.getElementById("status-container");
  const statusMessage = document.getElementById("status-message");
  const metaContainer = document.getElementById("meta-container");
  const metaObsId = document.getElementById("meta-obs-id");
  const metaTitle = document.getElementById("meta-title");
  const metaElements = document.getElementById("meta-elements");
  const metaUrl = document.getElementById("meta-url");
  const jsonOutput = document.getElementById("json-output");
  const outputTitle = document.getElementById("output-title");

  const canvasContainer = document.getElementById("canvas-container");
  const canvasPreview = document.getElementById("canvas-preview");
  const canvasDim = document.getElementById("canvas-dim");

  let currentJsonData = null;

  inspectBtn.addEventListener("click", async () => {
    showStatus("Analyzing webpage DOM...", "info");
    inspectBtn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ action: "INSPECT_PAGE" });

      if (response && response.status === "success" && response.pageState) {
        currentJsonData = response.pageState;
        renderPageState(currentJsonData);
        showStatus("DOM analysis complete!", "info");
        copyBtn.disabled = false;
      } else {
        const errorMsg = response?.message || "Failed to inspect page.";
        showStatus(errorMsg, "error");
      }
    } catch (err) {
      console.error("[Popup Error]", err);
      showStatus("Error: " + (err?.message || String(err)), "error");
    } finally {
      inspectBtn.disabled = false;
    }
  });

  captureBtn.addEventListener("click", async () => {
    showStatus("Capturing tab screenshot...", "info");
    captureBtn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        action: "CAPTURE_SCREENSHOT",
        options: { format: "png", quality: 90 }
      });

      if (response && response.status === "success" && response.dataUrl) {
        showStatus("Rendering image into Canvas...", "info");
        const { width, height } = await CanvasProcessor.loadToCanvas(response.dataUrl, canvasPreview);

        canvasDim.textContent = `${width} × ${height} px`;
        canvasContainer.classList.remove("hidden");
        ocrBtn.disabled = false;
        showStatus("Screenshot rendered to Canvas! Click 'Run Local OCR'.", "info");
      } else {
        const errorMsg = response?.message || "Failed to capture screenshot.";
        showStatus(errorMsg, "error");
      }
    } catch (err) {
      console.error("[Canvas Load Error]", err);
      showStatus("Error: " + (err?.message || String(err)), "error");
    } finally {
      captureBtn.disabled = false;
    }
  });

  ocrBtn.addEventListener("click", async () => {
    if (!canvasPreview || canvasPreview.width === 0) {
      showStatus("Please capture canvas first.", "error");
      return;
    }

    showStatus("Initializing Tesseract.js OCR engine...", "info");
    ocrBtn.disabled = true;

    try {
      const ocrResults = await OCREngine.recognize(canvasPreview, (progress) => {
        const pct = Math.round(progress * 100);
        showStatus(`Running OCR: ${pct}% complete...`, "info");
      });

      currentJsonData = ocrResults;
      outputTitle.textContent = `OCR Results (${ocrResults.length} text regions detected)`;
      jsonOutput.textContent = JSON.stringify(ocrResults, null, 2);
      copyBtn.disabled = false;
      showStatus(`OCR complete! Found ${ocrResults.length} text regions.`, "info");
    } catch (err) {
      console.error("[OCR Error Raw]", err);
      const displayErr = err?.message || (typeof err === "object" ? JSON.stringify(err) : String(err));
      showStatus("OCR Error: " + displayErr, "error");
    } finally {
      ocrBtn.disabled = false;
    }
  });

  copyBtn.addEventListener("click", () => {
    if (!currentJsonData) return;
    navigator.clipboard.writeText(JSON.stringify(currentJsonData, null, 2))
      .then(() => showStatus("Copied JSON to clipboard!", "info"))
      .catch((err) => showStatus("Copy failed: " + (err?.message || String(err)), "error"));
  });

  function renderPageState(pageState) {
    metaObsId.textContent = pageState.metadata.observationId;
    metaTitle.textContent = pageState.metadata.title;
    metaElements.textContent = pageState.metadata.elementCount;
    metaUrl.textContent = pageState.metadata.url;
    metaContainer.classList.remove("hidden");

    outputTitle.textContent = "PageState JSON";
    jsonOutput.textContent = JSON.stringify(pageState, null, 2);
  }

  function showStatus(msg, type) {
    statusMessage.textContent = msg;
    statusContainer.className = `status-container ${type}`;
    statusContainer.classList.remove("hidden");
  }
});
