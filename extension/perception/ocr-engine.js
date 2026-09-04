// perception/ocr-engine.js
// Modular OCR Engine using Tesseract.js with 100% offline local worker assets

class OCREngine {
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
      const corePath = chrome.runtime.getURL("lib");
      const langPath = chrome.runtime.getURL("lib/lang");

      console.log("[OCREngine] Initializing local Tesseract worker with paths:", {
        workerPath,
        corePath,
        langPath
      });

      worker = await Tesseract.createWorker("eng", 1, {
        workerPath: workerPath,
        corePath: corePath,
        langPath: langPath,
        workerBlobURL: false,
        logger: (m) => {
          if (m && m.status === "recognizing text" && onProgress && typeof m.progress === "number") {
            onProgress(m.progress);
          }
        }
      });

      const ret = await worker.recognize(imageInput);
      const results = [];

      if (ret && ret.data && ret.data.words) {
        for (const word of ret.data.words) {
          const text = word.text ? word.text.trim() : "";
          if (!text) continue;

          const rawConf = typeof word.confidence === "number" ? word.confidence : 0;
          const confidence = Math.round((rawConf > 1 ? rawConf / 100 : rawConf) * 100) / 100;

          const bbox = {
            x: Math.round(word.bbox.x0),
            y: Math.round(word.bbox.y0),
            width: Math.round(word.bbox.x1 - word.bbox.x0),
            height: Math.round(word.bbox.y1 - word.bbox.y0)
          };

          results.push({
            text: text,
            confidence: confidence,
            bbox: bbox
          });
        }
      }

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
