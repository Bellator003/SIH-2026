// privacy/pii-detector/dom-detector.js
// DOM PII Detector inspecting PageState elements and metadata

class DOMDetector {
  /**
   * Inspects a PageState object or array of elements to detect PII from DOM metadata & static text.
   * @param {Object|Array} pageStateOrElements - Complete PageState object or elements array
   * @returns {Array<Object>} Array of PIIDetection objects
   */
  static detect(pageStateOrElements) {
    if (!pageStateOrElements) return [];

    const elements = Array.isArray(pageStateOrElements)
      ? pageStateOrElements
      : pageStateOrElements.elements || [];

    const detections = [];

    for (const el of elements) {
      if (!el || typeof el !== "object") continue;

      const elementDetections = DOMDetector.detectElement(el);
      detections.push(...elementDetections);
    }

    return detections;
  }

  /**
   * Inspects a single element for structural and text PII.
   * @param {Object} el - Element object from PageState
   * @returns {Array<Object>} Detections for this element
   */
  static detectElement(el) {
    const detections = [];
    const tag = (el.tag || "").toLowerCase();
    const type = (el.type || "").toLowerCase();
    const name = (el.name || "").toLowerCase();
    const role = (el.role || "").toLowerCase();
    const placeholder = (el.placeholder || "").toLowerCase();
    const accessibleName = (el.accessibleName || "").toLowerCase();
    const autocomplete = (el.autocomplete || "").toLowerCase();

    let matchedType = null;
    let confidence = 0;
    let reason = null;

    // 1. Explicit HTML Input Types (Deterministic 1.0 Confidence)
    if (tag === "input") {
      if (type === "password") {
        matchedType = typeof PIIType !== "undefined" ? PIIType.PASSWORD : "PASSWORD";
        confidence = 1.0;
        reason = "input[type=password]";
      } else if (type === "email") {
        matchedType = typeof PIIType !== "undefined" ? PIIType.EMAIL : "EMAIL";
        confidence = 1.0;
        reason = "input[type=email]";
      } else if (type === "tel") {
        matchedType = typeof PIIType !== "undefined" ? PIIType.PHONE : "PHONE";
        confidence = 1.0;
        reason = "input[type=tel]";
      }
    }

    // 2. Autocomplete Attribute Rules (1.0 Confidence)
    if (!matchedType && autocomplete) {
      if (autocomplete.includes("password")) {
        matchedType = typeof PIIType !== "undefined" ? PIIType.PASSWORD : "PASSWORD";
        confidence = 1.0;
        reason = `autocomplete=${autocomplete}`;
      } else if (autocomplete === "email") {
        matchedType = typeof PIIType !== "undefined" ? PIIType.EMAIL : "EMAIL";
        confidence = 1.0;
        reason = "autocomplete=email";
      } else if (autocomplete.startsWith("tel")) {
        matchedType = typeof PIIType !== "undefined" ? PIIType.PHONE : "PHONE";
        confidence = 1.0;
        reason = `autocomplete=${autocomplete}`;
      } else if (autocomplete === "cc-number" || autocomplete === "cc-csc") {
        matchedType = typeof PIIType !== "undefined" ? PIIType.CARD : "CARD";
        confidence = 1.0;
        reason = `autocomplete=${autocomplete}`;
      }
    }

    // 3. Structural Metadata Patterns (name, placeholder, aria-label, role)
    if (!matchedType) {
      const combinedMeta = `${name} ${placeholder} ${accessibleName}`;

      if (/\b(?:password|passcode|secret|pin)\b/i.test(combinedMeta)) {
        matchedType = typeof PIIType !== "undefined" ? PIIType.PASSWORD : "PASSWORD";
        confidence = 0.95;
        reason = "metadata-password-keyword";
      } else if (/\b(?:card[-_]?number|credit[-_]?card|cc[-_]?num|cardnum)\b/i.test(combinedMeta)) {
        matchedType = typeof PIIType !== "undefined" ? PIIType.CARD : "CARD";
        confidence = 0.95;
        reason = "metadata-card-keyword";
      }
    }

    // If structural DOM detection matched, create detection record (text is ALWAYS null for security)
    if (matchedType) {
      detections.push(
        createPIIDetection({
          type: matchedType,
          source: typeof PIISource !== "undefined" ? PIISource.DOM : "DOM",
          elementId: el.id,
          text: null, // SECURITY REQUIREMENT: Never include input value
          confidence: confidence,
          reason: reason,
          bbox: el.bbox || null
        })
      );
    }

    // 4. Text/Regex Detection on static display text (button innerText, label text, accessibleName)
    // Note: getDisplayText in dom-analyzer guarantees input.value is NEVER in el.text
    if (typeof TextDetector !== "undefined") {
      if (el.text && typeof el.text === "string" && el.text.trim()) {
        const textDetections = TextDetector.detect(el.text, {
          source: typeof PIISource !== "undefined" ? PIISource.DOM_TEXT : "DOM_TEXT",
          elementId: el.id,
          bbox: el.bbox || null
        });
        detections.push(...textDetections);
      }

      if (el.accessibleName && typeof el.accessibleName === "string" && el.accessibleName.trim()) {
        const accDetections = TextDetector.detect(el.accessibleName, {
          source: typeof PIISource !== "undefined" ? PIISource.DOM_TEXT : "DOM_TEXT",
          elementId: el.id,
          bbox: el.bbox || null
        });
        // Avoid duplicate detections if text and accessibleName are identical
        for (const det of accDetections) {
          const isDuplicate = detections.some(d => d.type === det.type && d.text === det.text && d.elementId === det.elementId);
          if (!isDuplicate) {
            detections.push(det);
          }
        }
      }
    }

    return detections;
  }
}

if (typeof self !== "undefined") {
  self.DOMDetector = DOMDetector;
}
