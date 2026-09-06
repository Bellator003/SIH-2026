// perception/ocr-engine.js
// Modular OCR Engine using Tesseract.js with 100% offline local worker assets

class OCREngine {
  /**
   * Preprocesses canvas input with 2x scaling and contrast enhancement for optimal Tesseract OCR accuracy.
   */
  static async prepareOptimizedCanvas(imageInput, scale = 2.0) {
    let sourceCanvas = null;

    if (typeof HTMLCanvasElement !== "undefined" && imageInput instanceof HTMLCanvasElement) {
      sourceCanvas = imageInput;
    } else if (typeof CanvasProcessor !== "undefined") {
      const res = await CanvasProcessor.loadToCanvas(imageInput);
      sourceCanvas = res.canvas;
    }

    if (!sourceCanvas) {
      return { scaledCanvas: imageInput, scale: 1.0 };
    }

    const origWidth = sourceCanvas.width;
    const origHeight = sourceCanvas.height;

    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width = Math.round(origWidth * scale);
    scaledCanvas.height = Math.round(origHeight * scale);

    const ctx = scaledCanvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sourceCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);

    return { scaledCanvas, scale };
  }

  /**
   * Performs OCR on a Canvas, Image element, or Data URL and extracts text regions with bounding boxes.
   * @param {HTMLCanvasElement|HTMLImageElement|string} imageInput - Canvas, Image, or Data URL
   * @param {Function} [onProgress] - Optional progress callback function (0.0 to 1.0)
   * @returns {Promise<Array<{ text: string, confidence: number, bbox: { x: number, y: number, width: number, height: number } }>>}
   */
  static async recognize(imageInput, onProgress = null) {
    if (typeof Tesseract === "undefined") {
      throw new Error("Tesseract.js library is not loaded.");
    }

    let worker = null;

    try {
      const workerPath = chrome.runtime.getURL("lib/worker.min.js");
      const corePath = chrome.runtime.getURL("lib") + "/";
      const langPath = chrome.runtime.getURL("lib/lang") + "/";

      // Ensure fresh load from local extension assets without stale IndexedDB cache
      try {
        if (typeof indexedDB !== "undefined") {
          indexedDB.deleteDatabase("keyval-store");
        }
      } catch (e) {
        console.warn("[OCREngine] Cache clear notice:", e);
      }

      console.log("[OCREngine Diagnostic] Initializing local Tesseract worker with options:", {
        workerPath,
        corePath,
        langPath
      });

      worker = await Tesseract.createWorker("eng", 1, {
        workerPath: workerPath,
        corePath: corePath,
        langPath: langPath,
        workerBlobURL: false,
        cacheMethod: "none",
        logger: (m) => {
          console.log("[OCREngine Logger Status]:", m.status, m.progress);
          if (m && m.status === "recognizing text" && onProgress && typeof m.progress === "number") {
            onProgress(m.progress);
          }
        }
      });

      console.log("[OCREngine] Initializing local Tesseract worker with options:", {
        workerPath,
        corePath,
        langPath
      });

      // ── Step 1: Preprocess canvas with 2x resolution scaling for high-DPI OCR recognition ──
      const { scaledCanvas, scale } = await OCREngine.prepareOptimizedCanvas(imageInput, 2.0);

      // ── Step 2: Run Tesseract recognition ──
      const ret = await worker.recognize(scaledCanvas);
      const results = [];

      console.log("[OCREngine] Raw Tesseract ret:", ret);

      // ── Step 3: Extract words ──
      if (ret && ret.data && Array.isArray(ret.data.words) && ret.data.words.length > 0) {
        for (const word of ret.data.words) {
          const text = word.text ? word.text.trim() : "";
          if (!text) continue;

          const rawConf = typeof word.confidence === "number" ? word.confidence : 0;
          const confidence = Math.round((rawConf > 1 ? rawConf / 100 : rawConf) * 100) / 100;

          const bbox = word.bbox ? {
            x: Math.round(word.bbox.x0 / scale),
            y: Math.round(word.bbox.y0 / scale),
            width: Math.round((word.bbox.x1 - word.bbox.x0) / scale),
            height: Math.round((word.bbox.y1 - word.bbox.y0) / scale)
          } : { x: 0, y: 0, width: 0, height: 0 };

          results.push({
            text: text,
            confidence: confidence,
            bbox: bbox
          });
        }
      }

      // ── Step 4: Fallback line parsing (if words array was empty) ──
      if (results.length === 0 && ret && ret.data && Array.isArray(ret.data.lines)) {
        console.log("[OCREngine] Words array was empty, using lines fallback...");
        for (const line of ret.data.lines) {
          const lineText = line.text ? line.text.trim() : "";
          if (!lineText) continue;

          const wordsInLine = lineText.split(/\s+/);
          const rawConf = typeof line.confidence === "number" ? line.confidence : 0;
          const confidence = Math.round((rawConf > 1 ? rawConf / 100 : rawConf) * 100) / 100;

          const lineX = line.bbox ? Math.round(line.bbox.x0 / scale) : 0;
          const lineY = line.bbox ? Math.round(line.bbox.y0 / scale) : 0;
          const lineW = line.bbox ? Math.round((line.bbox.x1 - line.bbox.x0) / scale) : 100;
          const lineH = line.bbox ? Math.round((line.bbox.y1 - line.bbox.y0) / scale) : 20;

          const estWordW = Math.max(10, Math.round(lineW / Math.max(1, wordsInLine.length)));

          wordsInLine.forEach((wText, idx) => {
            if (!wText) return;
            results.push({
              text: wText,
              confidence: confidence,
              bbox: {
                x: lineX + (idx * estWordW),
                y: lineY,
                width: estWordW,
                height: lineH
              }
            });
          });
        }
      }

      console.log("[OCREngine] Processed results:", results.length, "words/tokens");
      return results;
    } catch (err) {
      console.error("[OCREngine Error]", err);
      const errMsg = (err && err.message) ? err.message : (typeof err === "string" ? err : JSON.stringify(err));
      throw new Error(errMsg || "Tesseract OCR processing failed.");
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (e) {
          console.warn("[OCREngine] Worker termination notice:", e);
        }
      }
    }
  }
}

// Global exposure for scripts
if (typeof self !== "undefined") {
  self.OCREngine = OCREngine;
}
