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

  // Original PII Debug Containers (from commit 3bcc776)
  const piiDebugContainer = document.getElementById("pii-debug-container");
  const piiCount = document.getElementById("pii-count");
  const piiJsonOutput = document.getElementById("pii-json-output");

  const domTextDebugContainer = document.getElementById("dom-text-debug-container");
  const domTextRegionCount = document.getElementById("dom-text-region-count");
  const domTextPiiCount = document.getElementById("dom-text-pii-count");
  const domTextJsonOutput = document.getElementById("dom-text-json-output");

  const ocrPiiDebugContainer = document.getElementById("ocr-pii-debug-container");
  const ocrResultsCount = document.getElementById("ocr-results-count");
  const ocrPiiCount = document.getElementById("ocr-pii-count");
  const ocrPiiJsonOutput = document.getElementById("ocr-pii-json-output");

  const dbgWidth = document.getElementById("dbg-width");
  const dbgHeight = document.getElementById("dbg-height");
  const dbgHasData = document.getElementById("dbg-hasdata");
  const dbgPercent = document.getElementById("dbg-percent");

  // Privacy Report elements
  const privacyReport = document.getElementById("privacy-report");
  const gateVerdict = document.getElementById("gate-verdict");
  const statTotalPII = document.getElementById("stat-total-pii");
  const statRedacted = document.getElementById("stat-redacted");
  const statCritical = document.getElementById("stat-critical");
  const statHigh = document.getElementById("stat-high");
  const piiBreakdown = document.getElementById("pii-breakdown");
  const piiBreakdownList = document.getElementById("pii-breakdown-list");
  const toggleAuditBtn = document.getElementById("toggle-audit-btn");
  const auditLogContainer = document.getElementById("audit-log-container");
  const auditLogOutput = document.getElementById("audit-log-output");

  // Gate mode buttons
  const modeBtns = document.querySelectorAll(".mode-btn");

  let currentJsonData = null;
  let lastPageStateRaw = null;
  let lastOCRResults = null;

  // ── Gate Mode Toggle ──
  if (modeBtns) {
    modeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        modeBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const mode = btn.getAttribute("data-mode");
        if (typeof PrivacyConfig !== "undefined") {
          PrivacyConfig.setMode(mode);
        }
        showStatus(`Privacy Gate mode: ${mode.toUpperCase()}`, "info");
      });
    });
  }

  // ── Audit Log Toggle ──
  if (toggleAuditBtn) {
    toggleAuditBtn.addEventListener("click", () => {
      if (!auditLogContainer) return;
      const isHidden = auditLogContainer.classList.contains("hidden");
      auditLogContainer.classList.toggle("hidden");
      toggleAuditBtn.textContent = isHidden ? "View Audit Log ▾" : "View Audit Log ▸";

      if (isHidden && typeof PrivacyGate !== "undefined") {
        const log = PrivacyGate.getAuditLog();
        if (auditLogOutput) {
          auditLogOutput.textContent = log.length > 0
            ? JSON.stringify(log, null, 2)
            : "// No audit entries yet. Run a scan first.";
        }
      }
    });
  }

  // ── Inspect DOM (with Debug Panels + Privacy Gate) ──
  if (inspectBtn) {
    inspectBtn.addEventListener("click", async () => {
      showStatus("Analyzing webpage DOM & page text...", "info");
      inspectBtn.disabled = true;

      try {
        const response = await chrome.runtime.sendMessage({ action: "INSPECT_PAGE" });

        if (response && response.status === "success" && response.pageState) {
          lastPageStateRaw = response.pageState;
          currentJsonData = response.pageState;
          renderPageState(currentJsonData);

          // 1. STRUCTURAL DOM PII (From Form Inputs)
          let structuralCount = 0;
          if (typeof DOMDetector !== "undefined") {
            const structuralDetections = DOMDetector.detect(response.pageState);
            console.log("=== STRUCTURAL DOM PII ===", structuralDetections);
            renderPIIDebug(structuralDetections);
            structuralCount = structuralDetections.length;
          }

          // 2. PAGE TEXT PII & DOM TEXT REGIONS (From Whole-Page Text Extraction)
          let pageTextPiiCount = 0;
          if (response.domTextData) {
            console.log("=== DOM TEXT REGIONS ===", response.domTextData.textRegions);
            console.log("=== PAGE TEXT PII DETECTIONS ===", response.domTextData.detections);
            renderDOMTextDebug(response.domTextData);
            pageTextPiiCount = response.domTextData.detections.length;
          }

          // 3. PRIVACY GATE INTEGRATION
          if (typeof PrivacyGate !== "undefined") {
            const gateResult = PrivacyGate.sanitize({ pageState: lastPageStateRaw });
            renderPrivacyReport(gateResult.privacyReport, gateResult.auditLog);

            const verdict = gateResult.privacyReport.gateVerdict;
            if (verdict === "BLOCKED") {
              showStatus(`Privacy Gate: BLOCKED — ${gateResult.privacyReport.totalPIIFound} PII detected.`, "error");
            } else if (verdict === "WARNING") {
              showStatus(`Privacy Gate: WARNING — ${gateResult.privacyReport.totalPIIFound} PII redacted.`, "warning");
            } else {
              showStatus(`DOM analysis complete! ${gateResult.privacyReport.totalPIIFound} PII found.`, "info");
            }
          } else {
            showStatus(`DOM analysis complete! ${structuralCount + pageTextPiiCount} total PII detected.`, "info");
          }

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

  // ── Capture Canvas ──
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

          if (typeof CanvasProcessor.inspectCanvas === "function") {
            const stats = CanvasProcessor.inspectCanvas(canvasPreview);
            renderCanvasDebug(stats);
            if (dbgPercent) dbgPercent.textContent = `${stats.nonZeroPercent}% (${stats.nonZeroPixels.toLocaleString()} px)`;
            showStatus(`Canvas ready! ${stats.nonZeroPercent}% non-zero pixels. Click 'Run Local OCR'.`, "info");
          } else {
            showStatus("Screenshot rendered to Canvas! Click 'Run Local OCR'.", "info");
          }

          if (canvasDim) canvasDim.textContent = `${width} × ${height} px`;
          if (canvasContainer) canvasContainer.classList.remove("hidden");
          if (ocrBtn) ocrBtn.disabled = false;
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

  // ── OCR (with TextDetector + Privacy Gate) ──
  if (ocrBtn) {
    ocrBtn.addEventListener("click", async () => {
      if (!canvasPreview || canvasPreview.width === 0) {
        showStatus("Please capture canvas first.", "error");
        return;
      }

      if (typeof CanvasProcessor.inspectCanvas === "function") {
        const stats = CanvasProcessor.inspectCanvas(canvasPreview);
        console.log("[OCR Debug] Inspecting screenshot canvas before Tesseract:", stats);
        if (!stats.hasData) {
          showStatus("Warning: Canvas is completely empty/blank (0% pixels).", "error");
          return;
        }
      }

      showStatus("Initializing Tesseract.js OCR engine...", "info");
      ocrBtn.disabled = true;

      try {
        const ocrResults = await OCREngine.recognize(canvasPreview, (progress) => {
          const pct = Math.round(progress * 100);
          showStatus(`Running OCR: ${pct}% complete...`, "info");
        });

        console.log(`[OCR] Extracted ${ocrResults.length} text regions:`, ocrResults);

        // 1. Pass each OCR text region through TextDetector (commit 3bcc776 logic)
        const ocrPiiDetections = [];
        for (const region of ocrResults) {
          if (typeof TextDetector !== "undefined") {
            const detections = TextDetector.detect(region.text, {
              source: typeof PIISource !== "undefined" ? PIISource.OCR : "OCR",
              elementId: null,
              bbox: region.bbox
            });
            ocrPiiDetections.push(...detections);
          }
        }

        console.log(`OCR RESULTS: ${ocrResults.length}`);
        console.log(`OCR PII DETECTIONS: ${ocrPiiDetections.length}`);
        console.log("=== OCR PII DETECTIONS ===", ocrPiiDetections);

        renderOCRPIIDebug(ocrResults.length, ocrPiiDetections);

        // 2. PRIVACY GATE SANITIZATION & REPORT
        if (typeof PrivacyGate !== "undefined") {
          const gateResult = PrivacyGate.sanitize({
            pageState: lastPageStateRaw,
            ocrResults: ocrResults || []
          });

          lastOCRResults = gateResult.sanitizedOCR || [];
          renderPrivacyReport(gateResult.privacyReport, gateResult.auditLog);
        }

        currentJsonData = {
          debugSummary: `OCR RESULTS: ${ocrResults.length} | OCR PII DETECTIONS: ${ocrPiiDetections.length}`,
          ocrResultsCount: ocrResults.length,
          ocrPiiDetectionsCount: ocrPiiDetections.length,
          ocrPiiDetections: ocrPiiDetections,
          ocrResults: ocrResults
        };

        if (outputTitle) outputTitle.textContent = `OCR Results & PII (OCR RESULTS: ${ocrResults.length}, OCR PII DETECTIONS: ${ocrPiiDetections.length})`;
        if (jsonOutput) jsonOutput.textContent = JSON.stringify(currentJsonData, null, 2);
        if (copyBtn) copyBtn.disabled = false;

        showStatus(`OCR complete! ${ocrResults.length} text regions, ${ocrPiiDetections.length} PII detections.`, "info");
      } catch (err) {
        console.error("[OCR Error Raw]", err);
        const displayErr = err?.message || (typeof err === "object" ? JSON.stringify(err) : String(err));
        showStatus("OCR Error: " + displayErr, "error");
      } finally {
        ocrBtn.disabled = false;
      }
    });
  }

  // ── Synthetic OCR Experiment ──
  if (syntheticOcrBtn) {
    syntheticOcrBtn.addEventListener("click", async () => {
      showStatus("Starting 3-Input Serialization Experiment...", "info");
      syntheticOcrBtn.disabled = true;

      try {
        const testCanvas = CanvasProcessor.createSyntheticTestCanvas(800, 400);

        if (canvasPreview) {
          const ctx = canvasPreview.getContext("2d");
          canvasPreview.width = testCanvas.width;
          canvasPreview.height = testCanvas.height;
          ctx.drawImage(testCanvas, 0, 0);

          if (typeof CanvasProcessor.inspectCanvas === "function") {
            const stats = CanvasProcessor.inspectCanvas(canvasPreview);
            renderCanvasDebug(stats);
          }
        }

        if (canvasDim) canvasDim.textContent = `800 × 400 px (Synthetic Experiment)`;
        if (canvasContainer) canvasContainer.classList.remove("hidden");

        const experimentResults = {};

        showStatus("[Experiment 1/3] Testing Input A: HTMLCanvasElement...", "info");
        const resA = await OCREngine.recognize(testCanvas);
        experimentResults.Input_A_HTMLCanvasElement = {
          inputType: "HTMLCanvasElement",
          resultsCount: resA.length,
          results: resA
        };

        showStatus("[Experiment 2/3] Testing Input B: canvas.toDataURL('image/png')...", "info");
        const dataUrl = testCanvas.toDataURL("image/png");
        const resB = await OCREngine.recognize(dataUrl);
        experimentResults.Input_B_DataURL_String = {
          inputType: "string (data:image/png;base64,...)",
          dataUrlLength: dataUrl.length,
          resultsCount: resB.length,
          results: resB
        };

        showStatus("[Experiment 3/3] Testing Input C: PNG Uint8Array...", "info");
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
      } catch (err) {
        console.error("[Experiment Error]", err);
        showStatus("Experiment Error: " + (err?.message || String(err)), "error");
      } finally {
        syntheticOcrBtn.disabled = false;
      }
    });
  }

  // ── Copy JSON ──
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (!currentJsonData) return;
      navigator.clipboard.writeText(JSON.stringify(currentJsonData, null, 2))
        .then(() => showStatus("Copied JSON to clipboard!", "info"))
        .catch((err) => showStatus("Copy failed: " + (err?.message || String(err)), "error"));
    });
  }

  // ── Render Functions ──
  function renderPIIDebug(piiDetections) {
    if (piiCount) piiCount.textContent = piiDetections.length;
    if (piiJsonOutput) piiJsonOutput.textContent = JSON.stringify(piiDetections, null, 2);
    if (piiDebugContainer) piiDebugContainer.classList.remove("hidden");
  }

  function renderDOMTextDebug(domTextData) {
    if (domTextRegionCount) domTextRegionCount.textContent = domTextData.textRegions.length;
    if (domTextPiiCount) domTextPiiCount.textContent = domTextData.detections.length;
    if (domTextJsonOutput) domTextJsonOutput.textContent = JSON.stringify(domTextData, null, 2);
    if (domTextDebugContainer) domTextDebugContainer.classList.remove("hidden");
  }

  function renderOCRPIIDebug(resultsCount, piiDetections) {
    if (ocrResultsCount) ocrResultsCount.textContent = resultsCount;
    if (ocrPiiCount) ocrPiiCount.textContent = piiDetections.length;
    if (ocrPiiJsonOutput) ocrPiiJsonOutput.textContent = JSON.stringify(piiDetections, null, 2);
    if (ocrPiiDebugContainer) ocrPiiDebugContainer.classList.remove("hidden");
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

  function renderPrivacyReport(report, auditEntries) {
    if (!privacyReport) return;
    privacyReport.classList.remove("hidden");

    if (gateVerdict) {
      gateVerdict.textContent = report.gateVerdict;
      gateVerdict.className = "verdict-badge";
      if (report.gateVerdict === "PASS") {
        gateVerdict.classList.add("verdict-pass");
      } else if (report.gateVerdict === "WARNING") {
        gateVerdict.classList.add("verdict-warning");
      } else if (report.gateVerdict === "BLOCKED") {
        gateVerdict.classList.add("verdict-blocked");
      }
    }

    if (statTotalPII) statTotalPII.textContent = report.totalPIIFound;
    if (statRedacted) statRedacted.textContent = report.redactedCount;
    if (statCritical) statCritical.textContent = report.bySeverity.CRITICAL || 0;
    if (statHigh) statHigh.textContent = report.bySeverity.HIGH || 0;

    if (piiBreakdown && piiBreakdownList) {
      const typeEntries = Object.entries(report.byType);
      if (typeEntries.length > 0) {
        piiBreakdown.classList.remove("hidden");
        piiBreakdownList.innerHTML = "";
        for (const [type, count] of typeEntries) {
          const pill = document.createElement("div");
          pill.className = "breakdown-pill";
          pill.innerHTML = `<span class="pill-type">${type}</span><span class="pill-count">${count}</span>`;
          piiBreakdownList.appendChild(pill);
        }
      } else {
        piiBreakdown.classList.add("hidden");
      }
    }

    if (auditLogContainer && !auditLogContainer.classList.contains("hidden") && typeof PrivacyGate !== "undefined") {
      const fullLog = PrivacyGate.getAuditLog();
      if (auditLogOutput) {
        auditLogOutput.textContent = fullLog.length > 0
          ? JSON.stringify(fullLog, null, 2)
          : "// No audit entries.";
      }
    }
  }

  function showStatus(msg, type) {
    if (statusMessage) statusMessage.textContent = msg;
    if (statusContainer) {
      statusContainer.className = `status-container ${type}`;
      statusContainer.classList.remove("hidden");
    }
  }
});
