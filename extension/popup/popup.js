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

<<<<<<< HEAD
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

  let currentJsonData = null;

  if (inspectBtn) {
    inspectBtn.addEventListener("click", async () => {
      showStatus("Analyzing webpage DOM & page text...", "info");
      inspectBtn.disabled = true;
=======
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
  let lastOCRResults = null;
  let lastPageStateRaw = null;

  // ── Gate Mode Toggle ──
  modeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      modeBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.getAttribute("data-mode");
      PrivacyConfig.setMode(mode);
      showStatus(`Privacy Gate mode: ${mode.toUpperCase()}`, "info");
    });
  });

  // ── Audit Log Toggle ──
  toggleAuditBtn.addEventListener("click", () => {
    const isHidden = auditLogContainer.classList.contains("hidden");
    auditLogContainer.classList.toggle("hidden");
    toggleAuditBtn.textContent = isHidden ? "View Audit Log ▾" : "View Audit Log ▸";

    if (isHidden) {
      const log = PrivacyGate.getAuditLog();
      auditLogOutput.textContent = log.length > 0
        ? JSON.stringify(log, null, 2)
        : "// No audit entries yet. Run a scan first.";
    }
  });

  // ── Inspect DOM (with Privacy Gate) ──
  inspectBtn.addEventListener("click", async () => {
    showStatus("Analyzing webpage DOM...", "info");
    inspectBtn.disabled = true;
>>>>>>> ef4731b (feat(privacy): add local Privacy Gate engine with multi-strategy OCR & DOM PII redaction)

      try {
        const response = await chrome.runtime.sendMessage({ action: "INSPECT_PAGE" });

        if (response && response.status === "success" && response.pageState) {
          lastPageStateRaw = response.pageState;

          // ── PRIVACY GATE ──
          if (typeof PrivacyGate !== "undefined") {
            const gateResult = PrivacyGate.sanitize({ pageState: lastPageStateRaw });
            currentJsonData = gateResult.sanitizedPageState;
            renderPageState(currentJsonData);
            if (typeof renderPrivacyReport === "function") {
              renderPrivacyReport(gateResult.privacyReport, gateResult.auditLog);
            }

            const verdict = gateResult.privacyReport.gateVerdict;
            if (verdict === "BLOCKED") {
              showStatus(`Privacy Gate: BLOCKED — ${gateResult.privacyReport.totalPIIFound} PII items detected (Critical PII found)`, "error");
            } else if (verdict === "WARNING") {
              showStatus(`Privacy Gate: WARNING — ${gateResult.privacyReport.totalPIIFound} PII items redacted. Review before sending.`, "warning");
            } else {
              showStatus(`Privacy Gate: PASS — ${gateResult.privacyReport.totalPIIFound} PII items redacted. Context is safe.`, "info");
            }
          } else {
            currentJsonData = response.pageState;
            renderPageState(currentJsonData);

            if (typeof DOMDetector !== "undefined") {
              const structuralDetections = DOMDetector.detect(response.pageState);
              console.log("=== STRUCTURAL DOM PII ===", structuralDetections);
              if (typeof renderPIIDebug === "function") renderPIIDebug(structuralDetections);
            }

            if (response.domTextData) {
              if (typeof renderDOMTextDebug === "function") renderDOMTextDebug(response.domTextData);
              showStatus(`DOM analysis complete! ${response.domTextData.textRegions.length} text regions, ${response.domTextData.detections.length} page text PII.`, "info");
            } else {
              showStatus("DOM analysis complete!", "info");
            }
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
            if (typeof renderCanvasDebug === "function") renderCanvasDebug(stats);
          }

          if (canvasDim) canvasDim.textContent = `${width} × ${height} px`;
          if (canvasContainer) canvasContainer.classList.remove("hidden");
          if (ocrBtn) ocrBtn.disabled = false;
          showStatus(`Canvas ready! Screenshot rendered. Click 'Run Local OCR'.`, "info");
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

      if (!lastPageStateRaw) {
        try {
          const resp = await chrome.runtime.sendMessage({ action: "INSPECT_PAGE" });
          if (resp && resp.status === "success" && resp.pageState) {
            lastPageStateRaw = resp.pageState;
          }
        } catch (e) {
          console.warn("[OCR] Optional DOM fetch skipped:", e);
        }
      }

      showStatus("Initializing Tesseract.js OCR engine...", "info");
      ocrBtn.disabled = true;

      try {
        const ocrResults = await OCREngine.recognize(canvasPreview, (progress) => {
          const pct = Math.round(progress * 100);
          showStatus(`Running OCR: ${pct}% complete...`, "info");
        });

        console.log("[OCR Raw Results]", ocrResults);

        // ── PRIVACY GATE (Synthesize DOM pageState + OCR results together) ──
        if (typeof PrivacyGate !== "undefined") {
          const gateResult = PrivacyGate.sanitize({
            pageState: lastPageStateRaw,
            ocrResults: ocrResults || []
          });

          lastOCRResults = gateResult.sanitizedOCR || [];
          currentJsonData = {
            pageState: gateResult.sanitizedPageState,
            ocr: lastOCRResults
          };
          if (outputTitle) outputTitle.textContent = `Sanitized Context (${lastOCRResults.length} OCR regions, ${gateResult.privacyReport.totalPIIFound} total PII)`;
          if (jsonOutput) jsonOutput.textContent = JSON.stringify(currentJsonData, null, 2);
          if (typeof renderPrivacyReport === "function") {
            renderPrivacyReport(gateResult.privacyReport, gateResult.auditLog);
          }

          const piiCount = gateResult.privacyReport.totalPIIFound;
          const statusType = piiCount > 0 ? (gateResult.privacyReport.gateVerdict === "BLOCKED" ? "error" : "warning") : "info";
          showStatus(`Scan complete! DOM + OCR combined: ${piiCount} PII detected (${gateResult.privacyReport.gateVerdict}).`, statusType);
        } else {
          // Fallback if PrivacyGate not exposed
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

          currentJsonData = {
            debugSummary: `OCR RESULTS: ${ocrResults.length} | OCR PII DETECTIONS: ${ocrPiiDetections.length}`,
            ocrResultsCount: ocrResults.length,
            ocrPiiDetectionsCount: ocrPiiDetections.length,
            ocrPiiDetections: ocrPiiDetections,
            ocrResults: ocrResults
          };
          if (outputTitle) outputTitle.textContent = `OCR Results & PII (OCR RESULTS: ${ocrResults.length}, OCR PII DETECTIONS: ${ocrPiiDetections.length})`;
          if (jsonOutput) jsonOutput.textContent = JSON.stringify(currentJsonData, null, 2);
          showStatus(`OCR complete! ${ocrResults.length} regions, ${ocrPiiDetections.length} PII detected.`, "info");
        }

        if (copyBtn) copyBtn.disabled = false;
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

        showStatus("[Experiment 1/3] Testing Input A: HTMLCanvasElement...", "info");
        console.log("[Experiment 1/3] Testing Input A: HTMLCanvasElement...");
        const resA = await OCREngine.recognize(testCanvas);
        experimentResults.Input_A_HTMLCanvasElement = {
          inputType: "HTMLCanvasElement",
          resultsCount: resA.length,
          results: resA
        };

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
<<<<<<< HEAD
    if (dbgPercent) dbgPercent.textContent = `${stats.nonZeroPercent}% (${stats.nonZeroPixels.toLocaleString()} px)`;
  }
=======
  });

  // ── OCR (with Privacy Gate) ──
  ocrBtn.addEventListener("click", async () => {
    if (!canvasPreview || canvasPreview.width === 0) {
      showStatus("Please capture canvas first.", "error");
      return;
    }

    showStatus("Initializing Tesseract.js OCR engine...", "info");
    ocrBtn.disabled = true;

    try {
      // If pageState wasn't fetched yet, attempt fetch so DOM + OCR combine
      if (!lastPageStateRaw) {
        try {
          const resp = await chrome.runtime.sendMessage({ action: "INSPECT_PAGE" });
          if (resp && resp.status === "success" && resp.pageState) {
            lastPageStateRaw = resp.pageState;
          }
        } catch (e) {
          console.warn("[OCR] Optional DOM fetch skipped:", e);
        }
      }

      const ocrResults = await OCREngine.recognize(canvasPreview, (progress) => {
        const pct = Math.round(progress * 100);
        showStatus(`Running OCR: ${pct}% complete...`, "info");
      });

      console.log("[OCR Raw Results]", ocrResults);

      // ── PRIVACY GATE (Synthesize DOM pageState + OCR results together) ──
      const gateResult = PrivacyGate.sanitize({
        pageState: lastPageStateRaw,
        ocrResults: ocrResults || []
      });

      lastOCRResults = gateResult.sanitizedOCR || [];
      currentJsonData = {
        pageState: gateResult.sanitizedPageState,
        ocr: lastOCRResults
      };
      outputTitle.textContent = `Sanitized Context (${lastOCRResults.length} OCR regions, ${gateResult.privacyReport.totalPIIFound} total PII)`;
      jsonOutput.textContent = JSON.stringify(currentJsonData, null, 2);
      renderPrivacyReport(gateResult.privacyReport, gateResult.auditLog);
      copyBtn.disabled = false;

      const piiCount = gateResult.privacyReport.totalPIIFound;
      const statusType = piiCount > 0 ? (gateResult.privacyReport.gateVerdict === "BLOCKED" ? "error" : "warning") : "info";
      showStatus(`Scan complete! DOM + OCR combined: ${piiCount} PII detected (${gateResult.privacyReport.gateVerdict}).`, statusType);
    } catch (err) {
      console.error("[OCR Error Raw]", err);
      const displayErr = err?.message || (typeof err === "object" ? JSON.stringify(err) : String(err));
      showStatus("OCR Error: " + displayErr, "error");
    } finally {
      ocrBtn.disabled = false;
    }
  });

  // ── Copy JSON ──
  copyBtn.addEventListener("click", () => {
    if (!currentJsonData) return;
    navigator.clipboard.writeText(JSON.stringify(currentJsonData, null, 2))
      .then(() => showStatus("Copied sanitized JSON to clipboard!", "info"))
      .catch((err) => showStatus("Copy failed: " + (err?.message || String(err)), "error"));
  });
>>>>>>> ef4731b (feat(privacy): add local Privacy Gate engine with multi-strategy OCR & DOM PII redaction)

  // ── Render PageState ──
  function renderPageState(pageState) {
    if (metaObsId) metaObsId.textContent = pageState.metadata.observationId;
    if (metaTitle) metaTitle.textContent = pageState.metadata.title;
    if (metaElements) metaElements.textContent = pageState.metadata.elementCount;
    if (metaUrl) metaUrl.textContent = pageState.metadata.url;
    if (metaContainer) metaContainer.classList.remove("hidden");

<<<<<<< HEAD
    if (outputTitle) outputTitle.textContent = "PageState JSON";
    if (jsonOutput) jsonOutput.textContent = JSON.stringify(pageState, null, 2);
=======
    outputTitle.textContent = "Sanitized PageState JSON";
    jsonOutput.textContent = JSON.stringify(pageState, null, 2);
>>>>>>> ef4731b (feat(privacy): add local Privacy Gate engine with multi-strategy OCR & DOM PII redaction)
  }

  // ── Render Privacy Report ──
  function renderPrivacyReport(report, auditEntries) {
    privacyReport.classList.remove("hidden");

    // Verdict badge
    gateVerdict.textContent = report.gateVerdict;
    gateVerdict.className = "verdict-badge";
    if (report.gateVerdict === "PASS") {
      gateVerdict.classList.add("verdict-pass");
    } else if (report.gateVerdict === "WARNING") {
      gateVerdict.classList.add("verdict-warning");
    } else if (report.gateVerdict === "BLOCKED") {
      gateVerdict.classList.add("verdict-blocked");
    }

    // Stat numbers
    statTotalPII.textContent = report.totalPIIFound;
    statRedacted.textContent = report.redactedCount;
    statCritical.textContent = report.bySeverity.CRITICAL || 0;
    statHigh.textContent = report.bySeverity.HIGH || 0;

    // PII breakdown by type
    const typeEntries = Object.entries(report.byType);
    if (typeEntries.length > 0) {
      piiBreakdown.classList.remove("hidden");
      piiBreakdownList.innerHTML = "";
      for (const [type, count] of typeEntries) {
        const pill = document.createElement("div");
        pill.className = "breakdown-pill";
        pill.innerHTML = `<span class="pill-type">${formatTypeName(type)}</span><span class="pill-count">${count}</span>`;
        piiBreakdownList.appendChild(pill);
      }
    } else {
      piiBreakdown.classList.add("hidden");
    }

    // Update audit log if visible
    if (!auditLogContainer.classList.contains("hidden")) {
      const fullLog = PrivacyGate.getAuditLog();
      auditLogOutput.textContent = fullLog.length > 0
        ? JSON.stringify(fullLog, null, 2)
        : "// No audit entries.";
    }
  }

  // ── Helpers ──
  function showStatus(msg, type) {
    if (statusMessage) statusMessage.textContent = msg;
    if (statusContainer) {
      statusContainer.className = `status-container ${type}`;
      statusContainer.classList.remove("hidden");
    }
  }

  function formatTypeName(type) {
    const nameMap = {
      AADHAAR: "Aadhaar",
      PAN: "PAN",
      CREDIT_CARD: "Card",
      INDIAN_MOBILE: "Phone",
      EMAIL: "Email",
      UPI_ID: "UPI",
      IFSC: "IFSC",
      INDIAN_PASSPORT: "Passport",
      IP_ADDRESS: "IP",
      DATE_OF_BIRTH: "DOB"
    };
    return nameMap[type] || type;
  }
});
