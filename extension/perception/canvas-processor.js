// perception/canvas-processor.js
// Modular Canvas Processor module

class CanvasProcessor {
  /**
   * Loads a Data URL or Image Source into an HTMLCanvasElement while preserving dimensions/aspect ratio.
   * @param {string|HTMLImageElement} imageInput - Data URL string or Image element
   * @param {HTMLCanvasElement} [existingCanvas] - Optional existing canvas to render into
   * @returns {Promise<{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, width: number, height: number }>}
   */
  static async loadToCanvas(imageInput, existingCanvas = null) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = existingCanvas || document.createElement("canvas");
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        resolve({
          canvas: canvas,
          ctx: ctx,
          width: width,
          height: height
        });
      };
      img.onerror = (err) => reject(new Error("Failed to load image into Canvas: " + err));

      if (typeof imageInput === "string") {
        img.src = imageInput;
      } else if (imageInput instanceof HTMLImageElement) {
        img.src = imageInput.src;
      } else {
        reject(new Error("Invalid image input type for CanvasProcessor."));
      }
    });
  }

  /**
   * Extracts raw ImageData from a canvas context for downstream processing (OCR / Vision).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   * @returns {ImageData}
   */
  static getImageData(ctx, width, height) {
    return ctx.getImageData(0, 0, width, height);
  }
}

// Global exposure for scripts
if (typeof self !== "undefined") {
  self.CanvasProcessor = CanvasProcessor;
}
