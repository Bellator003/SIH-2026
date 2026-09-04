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
   * Generates a synthetic high-contrast test canvas for diagnostic OCR verification.
   * @param {number} [width=800]
   * @param {number} [height=400]
   * @returns {HTMLCanvasElement}
   */
  static createSyntheticTestCanvas(width = 800, height = 400) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Pure white background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    // Large high-contrast black text
    ctx.fillStyle = "#000000";
    ctx.font = "bold 36px Arial, sans-serif";
    ctx.fillText("HELLO WORLD", 50, 100);
    ctx.fillText("THIS IS OCR TEST", 50, 180);
    ctx.fillText("123456789", 50, 260);

    return canvas;
  }

  /**
   * Performs a diagnostic pixel check on the provided HTMLCanvasElement.
   * @param {HTMLCanvasElement} canvas
   * @returns {{ width: number, height: number, hasData: boolean, nonZeroPercent: number, nonZeroPixels: number, totalPixels: number }}
   */
  static inspectCanvas(canvas) {
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      return {
        width: 0,
        height: 0,
        hasData: false,
        nonZeroPercent: 0,
        nonZeroPixels: 0,
        totalPixels: 0
      };
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let nonZeroCount = 0;
    const totalPixels = width * height;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a > 0 && (r > 0 || g > 0 || b > 0)) {
        nonZeroCount++;
      }
    }

    const nonZeroPercent = Math.round((nonZeroCount / totalPixels) * 10000) / 100;

    return {
      width: width,
      height: height,
      hasData: nonZeroCount > 0,
      nonZeroPercent: nonZeroPercent,
      nonZeroPixels: nonZeroCount,
      totalPixels: totalPixels
    };
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
