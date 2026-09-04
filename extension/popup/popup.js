document.addEventListener("DOMContentLoaded", () => {
  const inspectBtn = document.getElementById("inspect-btn");
  const captureBtn = document.getElementById("capture-btn");
  const ocrBtn = document.getElementById("ocr-btn");
  const syntheticOcrBtn = document.getElementById("synthetic-ocr-btn");
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

  const dbgWidth = document.getElementById("dbg-width");
  const dbgHeight = document.getElementById("dbg-height");
  const dbgHasData = document.getElementById("dbg-hasdata");
  const dbgPercent = document.getElementById("dbg-percent");

  let currentJsonData = null;

  if (inspectBtn) {
    inspectBtn.addEventListener("click", async () => {
      showStatus("Analyzing webpage DOM...", "info");
      inspectBtn.disabled = true;

      try {
        const response = await chrome.runtime.sendMessage({ action: "INSPECT_PAGE" });

        if (response && response.status === "success" && response.pageState) {
          currentJsonData = response.pageState;
          renderPageState(currentJsonData);
          showStatus("DOM analysis complete!", "info");
          if (copyBtn) copyBtn.disabled = false;
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
  }

  if (captureBtn) {
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

          const stats = CanvasProcessor.inspectCanvas(canvasPreview);
          renderCanvasDebug(stats);

          if (canvasDim) canvasDim.textContent = `${width} × ${height} px`;
          if (canvasContainer) canvasContainer.classList.remove("hidden");
          if (ocrBtn) ocrBtn.disabled = false;
          showStatus(`Canvas ready! ${stats.nonZeroPercent}% non-zero pixels. Click 'Run Local OCR'.`, "info");
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
  }

  if (ocrBtn) {
    ocrBtn.addEventListener("click", async () => {
      if (!canvasPreview || canvasPreview.width === 0) {
        showStatus("Please capture canvas first.", "error");
        return;
      }

      const stats = CanvasProcessor.inspectCanvas(canvasPreview);
      console.log("[OCR Debug] Inspecting screenshot canvas before Tesseract:", stats);

      if (!stats.hasData) {
        showStatus("Warning: Canvas is completely empty/blank (0% pixels).", "error");
        return;
      }

      showStatus(`Initializing Tesseract.js OCR engine (${stats.width}x${stats.height} px, ${stats.nonZeroPercent}% content)...`, "info");
      ocrBtn.disabled = true;

      try {
        const ocrResults = await OCREngine.recognize(canvasPreview, (progress) => {
          const pct = Math.round(progress * 100);
          showStatus(`Running OCR: ${pct}% complete...`, "info");
        });

        currentJsonData = ocrResults;
        if (outputTitle) outputTitle.textContent = `OCR Results (${ocrResults.length} text regions detected)`;
        if (jsonOutput) jsonOutput.textContent = JSON.stringify(ocrResults, null, 2);
        if (copyBtn) copyBtn.disabled = false;
        showStatus(`OCR complete! Found ${ocrResults.length} text regions.`, "info");
      } catch (err) {
        console.error("[OCR Error Raw]", err);
        const displayErr = err?.message || (typeof err === "object" ? JSON.stringify(err) : String(err));
        showStatus("OCR Error: " + displayErr, "error");
      } finally {
        ocrBtn.disabled = false;
      }
    });
  }

  if (syntheticOcrBtn) {
    syntheticOcrBtn.addEventListener("click", async () => {
      showStatus("Starting 3-Input Serialization Experiment...", "info");
      syntheticOcrBtn.disabled = true;

      try {
        // Create synthetic test canvas
        const testCanvas = CanvasProcessor.createSyntheticTestCanvas(800, 400);

        if (canvasPreview) {
          const ctx = canvasPreview.getContext("2d");
          canvasPreview.width = testCanvas.width;
          canvasPreview.height = testCanvas.height;
          ctx.drawImage(testCanvas, 0, 0);

          const stats = CanvasProcessor.inspectCanvas(canvasPreview);
          renderCanvasDebug(stats);
        }

        if (canvasDim) canvasDim.textContent = `800 × 400 px (Synthetic Experiment)`;
        if (canvasContainer) canvasContainer.classList.remove("hidden");

        const experimentResults = {};

        // --- EXPERIMENT INPUT A: HTMLCanvasElement ---
        showStatus("[Experiment 1/3] Testing Input A: HTMLCanvasElement...", "info");
        console.log("[Experiment 1/3] Testing Input A: HTMLCanvasElement...");
        const resA = await OCREngine.recognize(testCanvas);
        experimentResults.Input_A_HTMLCanvasElement = {
          inputType: "HTMLCanvasElement",
          resultsCount: resA.length,
          results: resA
        };

        // --- EXPERIMENT INPUT B: Data URL string ---
        showStatus("[Experiment 2/3] Testing Input B: canvas.toDataURL('image/png')...", "info");
        console.log("[Experiment 2/3] Testing Input B: canvas.toDataURL('image/png')...");
        const dataUrl = testCanvas.toDataURL("image/png");
        const resB = await OCREngine.recognize(dataUrl);
        experimentResults.Input_B_DataURL_String = {
          inputType: "string (data:image/png;base64,...)",
          dataUrlLength: dataUrl.length,
          resultsCount: resB.length,
          results: resB
        };

        // --- EXPERIMENT INPUT C: Uint8Array ---
        showStatus("[Experiment 3/3] Testing Input C: PNG Uint8Array...", "info");
        console.log("[Experiment 3/3] Testing Input C: PNG Uint8Array...");
        const blob = await new Promise(resolve => testCanvas.toBlob(resolve, "image/png"));
        const arrayBuf = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuf);
        const resC = await OCREngine.recognize(uint8Array);
        experimentResults.Input_C_Uint8Array = {
          inputType: "Uint8Array",
          byteLength: uint8Array.byteLength,
          resultsCount: resC.length,
          results: resC
        };

        currentJsonData = experimentResults;
        if (outputTitle) outputTitle.textContent = "Serialization Hypothesis Experiment Results";
        if (jsonOutput) jsonOutput.textContent = JSON.stringify(experimentResults, null, 2);
        if (copyBtn) copyBtn.disabled = false;
        showStatus("Experiment complete! Check JSON window & Console.", "info");

        console.log("=== SERIALIZATION EXPERIMENT COMPARISON ===", experimentResults);
      } catch (err) {
        console.error("[Experiment Error]", err);
        showStatus("Experiment Error: " + (err?.message || String(err)), "error");
      } finally {
        syntheticOcrBtn.disabled = false;
      }
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (!currentJsonData) return;
      navigator.clipboard.writeText(JSON.stringify(currentJsonData, null, 2))
        .then(() => showStatus("Copied JSON to clipboard!", "info"))
        .catch((err) => showStatus("Copy failed: " + (err?.message || String(err)), "error"));
    });
  }

  function renderCanvasDebug(stats) {
    if (dbgWidth) dbgWidth.textContent = `${stats.width}px`;
    if (dbgHeight) dbgHeight.textContent = `${stats.height}px`;
    if (dbgHasData) {
      dbgHasData.textContent = stats.hasData ? "YES (True)" : "NO (Empty)";
      dbgHasData.style.color = stats.hasData ? "#16a34a" : "#dc2626";
    }
    if (dbgPercent) dbgPercent.textContent = `${stats.nonZeroPercent}% (${stats.nonZeroPixels.toLocaleString()} px)`;
  }

  function renderPageState(pageState) {
    if (metaObsId) metaObsId.textContent = pageState.metadata.observationId;
    if (metaTitle) metaTitle.textContent = pageState.metadata.title;
    if (metaElements) metaElements.textContent = pageState.metadata.elementCount;
    if (metaUrl) metaUrl.textContent = pageState.metadata.url;
    if (metaContainer) metaContainer.classList.remove("hidden");

    if (outputTitle) outputTitle.textContent = "PageState JSON";
    if (jsonOutput) jsonOutput.textContent = JSON.stringify(pageState, null, 2);
  }

  function showStatus(msg, type) {
    if (statusMessage) statusMessage.textContent = msg;
    if (statusContainer) {
      statusContainer.className = `status-container ${type}`;
      statusContainer.classList.remove("hidden");
    }
  }
});
