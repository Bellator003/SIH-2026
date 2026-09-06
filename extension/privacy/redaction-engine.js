// privacy/redaction-engine.js
// Redaction Engine — replaces PII with semantic labels, fuses confidence scores

const RedactionEngine = (() => {

  /**
   * Redact PII from a plain text string using provided findings.
   * @param {string} text - Original text
   * @param {Array} findings - PII findings from PIIDetector
   * @returns {{ redacted: string, appliedRedactions: Array }}
   */
  function redactText(text, findings) {
    if (!text || !findings || findings.length === 0) {
      return { redacted: text || "", appliedRedactions: [] };
    }

    // Sort findings by start position descending so we can replace from end to start
    // without offset issues
    const sorted = [...findings]
      .filter(f => f.start >= 0 && f.end > f.start)
      .sort((a, b) => b.start - a.start);

    let redacted = text;
    const appliedRedactions = [];

    for (const finding of sorted) {
      if (finding.confidence < PrivacyConfig.CONFIDENCE.GATE_MIN_THRESHOLD) continue;

      const before = redacted.substring(0, finding.start);
      const after = redacted.substring(finding.end);
      redacted = before + finding.label + after;

      appliedRedactions.push({
        type: finding.type,
        original: finding.match,
        replacement: finding.label,
        confidence: finding.confidence,
        severity: finding.severity
      });
    }

    return { redacted, appliedRedactions };
  }

  /**
   * Redact the entire pageState object from DOM analyzer.
   * Walks metadata and every element, redacting text fields in-place on a deep clone.
   * @param {Object} pageState - Raw pageState from dom-analyzer
   * @returns {{ sanitizedPageState: Object, allFindings: Array, redactionSummary: Object }}
   */
  function redactPageState(pageState) {
    if (!pageState) {
      return { sanitizedPageState: null, allFindings: [], redactionSummary: {} };
    }

    // Deep clone to avoid mutating original
    const sanitized = JSON.parse(JSON.stringify(pageState));
    const allFindings = [];
    const redactionCounts = {};

    // ── Redact metadata.url ──
    if (sanitized.metadata && sanitized.metadata.url) {
      const urlFindings = PIIDetector.scanURL(sanitized.metadata.url);
      if (urlFindings.length > 0) {
        const result = redactText(sanitized.metadata.url, urlFindings);
        sanitized.metadata.url = result.redacted;
        trackFindings(allFindings, redactionCounts, urlFindings, "metadata.url");
      }
    }

    // ── Redact metadata.title ──
    if (sanitized.metadata && sanitized.metadata.title) {
      const titleFindings = PIIDetector.scanText(sanitized.metadata.title);
      if (titleFindings.length > 0) {
        const result = redactText(sanitized.metadata.title, titleFindings);
        sanitized.metadata.title = result.redacted;
        trackFindings(allFindings, redactionCounts, titleFindings, "metadata.title");
      }
    }

    // ── Redact each element ──
    if (sanitized.elements && Array.isArray(sanitized.elements)) {
      for (const el of sanitized.elements) {
        const elementContext = {
          name: el.name,
          role: el.role,
          placeholder: el.placeholder,
          accessibleName: el.accessibleName,
          type: el.type,
          tag: el.tag,
          hasValue: el.hasValue,
          editable: el.editable
        };

        // Fields to scan and redact
        const textFields = ["accessibleName", "text", "placeholder", "selected"];

        for (const field of textFields) {
          if (el[field] && typeof el[field] === "string" && el[field].trim()) {
            const findings = PIIDetector.scanWithContext(el[field], elementContext);
            if (findings.length > 0) {
              const fusedFindings = fuseConfidence(findings);
              const result = redactText(el[field], fusedFindings);
              el[field] = result.redacted;
              trackFindings(allFindings, redactionCounts, fusedFindings, `element.${el.id}.${field}`);
            }
          }
        }

        // Mark elements that have hidden values in PII-sensitive fields
        const contextualFindings = PIIDetector.scanWithContext("", elementContext);
        const inferredFindings = contextualFindings.filter(f => f.inferredFromField);
        if (inferredFindings.length > 0) {
          el.privacyFlag = inferredFindings.map(f => ({
            type: f.type,
            severity: f.severity,
            note: "Input field likely contains PII based on context"
          }));
          trackFindings(allFindings, redactionCounts, inferredFindings, `element.${el.id}.value_inferred`);
        }
      }
    }

    return {
      sanitizedPageState: sanitized,
      allFindings: allFindings,
      redactionSummary: redactionCounts
    };
  }

  /**
   * Clean OCR text for better PII detection.
   * OCR engines often produce noise: stray characters, misread symbols, etc.
   * @param {string} text - Raw OCR word text
   * @returns {string} Cleaned text
   */
  /**
   * Clean/Normalize OCR text for PII detection while strictly preserving character count.
   * Replaces common OCR misreads for digits in-place so character indices remain 1:1.
   * @param {string} text - Raw OCR word text
   * @returns {string} Cleaned text with identical length
   */
  function cleanOCRText(text) {
    if (!text) return "";
    let cleaned = text;
    // Replace common OCR misreads for digits: o/O → 0
    cleaned = cleaned.replace(/[oO]/g, (m, offset, str) => {
      const before = str[offset - 1];
      const after = str[offset + 1];
      if ((before && /\d/.test(before)) || (after && /\d/.test(after))) {
        return "0";
      }
      return m;
    });
    // Replace common OCR misreads: l/I → 1
    cleaned = cleaned.replace(/[lI|]/g, (m, offset, str) => {
      const before = str[offset - 1];
      const after = str[offset + 1];
      if ((before && /\d/.test(before)) || (after && /\d/.test(after))) {
        return "1";
      }
      return m;
    });
    return cleaned;
  }

  /**
   * Group OCR words into coherent lines based on vertical bounding box alignment (bbox.y).
   * Words on the same horizontal line form continuous text spans.
   * @param {Array} words - OCR word objects with bbox { x, y, width, height }
   * @returns {Array<Array<{index: number, word: Object}>>} Groups of word items per line
   */
  function groupWordsIntoLines(words) {
    if (!words || words.length === 0) return [];

    const indexed = words.map((w, i) => ({ index: i, word: w }));
    const lines = [];

    for (const item of indexed) {
      const y = item.word.bbox ? item.word.bbox.y : 0;
      const h = item.word.bbox ? item.word.bbox.height : 15;
      const centerY = y + h / 2;

      let added = false;
      for (const line of lines) {
        if (Math.abs(centerY - line.centerY) <= Math.max(15, h / 2)) {
          line.items.push(item);
          const totalY = line.items.reduce((sum, it) => sum + (it.word.bbox ? it.word.bbox.y + (it.word.bbox.height / 2) : 0), 0);
          line.centerY = totalY / line.items.length;
          added = true;
          break;
        }
      }

      if (!added) {
        lines.push({ centerY, items: [item] });
      }
    }

    // Sort lines top to bottom
    lines.sort((a, b) => a.centerY - b.centerY);

    // Sort words within each line left to right
    return lines.map(line => {
      line.items.sort((a, b) => {
        const ax = a.word.bbox ? a.word.bbox.x : 0;
        const bx = b.word.bbox ? b.word.bbox.x : 0;
        return ax - bx;
      });
      return line.items;
    });
  }

  /**
   * Redact OCR results from the OCR engine.
   * Uses multi-strategy scanning across words, lines, and full text.
   * @param {Array} ocrResults - Array of { text, confidence, bbox }
   * @returns {{ sanitizedOCR: Array, allFindings: Array, redactionSummary: Object }}
   */
  function redactOCRResults(ocrResults) {
    if (!ocrResults || !Array.isArray(ocrResults) || ocrResults.length === 0) {
      return { sanitizedOCR: [], allFindings: [], redactionSummary: {} };
    }

    const sanitized = JSON.parse(JSON.stringify(ocrResults));
    const allFindings = [];
    const redactionCounts = {};

    console.log("[RedactionEngine] OCR input words:", sanitized.length);
    console.log("[RedactionEngine] OCR raw texts:", sanitized.map(w => w.text).join(" | "));

    // ── Strategy 1: Normalized words ──
    const cleanedWords = sanitized.map(w => cleanOCRText(w.text || ""));

    // ── Strategy 2: Line-level scanning ──
    const lines = groupWordsIntoLines(sanitized);
    console.log("[RedactionEngine] OCR grouped into", lines.length, "lines");

    for (const line of lines) {
      const rawLineText = line.map(item => item.word.text || "").join(" ");
      const normLineText = line.map(item => cleanOCRText(item.word.text || "")).join(" ");

      const rawFindings = PIIDetector.scanText(rawLineText);
      const normFindings = PIIDetector.scanText(normLineText);

      // Merge line findings
      const lineFindings = [...rawFindings];
      for (const nf of normFindings) {
        const isDuplicate = lineFindings.some(rf =>
          rf.type === nf.type && Math.abs(rf.start - nf.start) < 5
        );
        if (!isDuplicate) {
          lineFindings.push(nf);
        }
      }

      if (lineFindings.length > 0) {
        console.log(`[RedactionEngine] Line PII found: "${rawLineText}" → ${lineFindings.length} findings`);

        let charOffset = 0;
        for (const item of line) {
          const wordText = item.word.text || "";
          const wordStart = charOffset;
          const wordEnd = charOffset + wordText.length;

          for (const finding of lineFindings) {
            if (finding.start < wordEnd && finding.end > wordStart) {
              const wordObj = sanitized[item.index];
              if (!wordObj.piiDetected) {
                wordObj.piiDetected = true;
                wordObj.piiType = finding.type;
                wordObj.piiSeverity = finding.severity;
                wordObj.originalText = wordObj.text;
                wordObj.text = finding.label;
              }
            }
          }

          charOffset = wordEnd + 1;
        }

        trackFindings(allFindings, redactionCounts, lineFindings, "ocr.line");
      }
    }

    // ── Strategy 3: Full-text scan ──
    const fullRawText = sanitized.map(w => w.originalText || w.text || "").join(" ");
    const fullNormText = cleanedWords.join(" ");

    const fullRawFindings = PIIDetector.scanText(fullRawText);
    const fullNormFindings = PIIDetector.scanText(fullNormText);

    const fullFindings = [...fullRawFindings];
    for (const nf of fullNormFindings) {
      const isDuplicate = fullFindings.some(rf =>
        rf.type === nf.type && Math.abs(rf.start - nf.start) < 5
      );
      if (!isDuplicate) {
        fullFindings.push(nf);
      }
    }

    if (fullFindings.length > 0) {
      let charOffset = 0;
      for (let i = 0; i < sanitized.length; i++) {
        const wordText = sanitized[i].originalText || sanitized[i].text || "";
        const wordStart = charOffset;
        const wordEnd = charOffset + wordText.length;

        for (const finding of fullFindings) {
          if (finding.start < wordEnd && finding.end > wordStart) {
            if (!sanitized[i].piiDetected) {
              sanitized[i].piiDetected = true;
              sanitized[i].piiType = finding.type;
              sanitized[i].piiSeverity = finding.severity;
              sanitized[i].originalText = sanitized[i].originalText || sanitized[i].text;
              sanitized[i].text = finding.label;
            }
          }
        }

        charOffset = wordEnd + 1;
      }

      const newFullFindings = fullFindings.filter(ff =>
        !allFindings.some(af => af.type === ff.type && Math.abs(af.start - ff.start) < 5)
      );
      if (newFullFindings.length > 0) {
        trackFindings(allFindings, redactionCounts, newFullFindings, "ocr.fulltext");
      }
    }

    // ── Strategy 4: Individual word scan ──
    for (let i = 0; i < sanitized.length; i++) {
      const word = sanitized[i];
      if (word.piiDetected) continue;

      const rawText = word.text || "";
      const normText = cleanedWords[i] || rawText;

      let wordFindings = PIIDetector.scanText(rawText);
      if (wordFindings.length === 0 && normText !== rawText) {
        wordFindings = PIIDetector.scanText(normText);
      }

      if (wordFindings.length > 0) {
        const result = redactText(word.text, wordFindings);
        word.originalText = word.text;
        word.text = result.redacted;
        word.piiDetected = true;
        word.piiType = wordFindings[0].type;
        word.piiSeverity = wordFindings[0].severity;
        trackFindings(allFindings, redactionCounts, wordFindings, `ocr.word[${i}]`);
      }
    }

    console.log("[RedactionEngine] OCR total PII findings:", allFindings.length);

    return {
      sanitizedOCR: sanitized,
      allFindings: allFindings,
      redactionSummary: redactionCounts
    };
  }

  /**
   * Confidence Fusion — Noisy-OR combination.
   * When multiple detection methods flag the same region, fuse scores:
   *   fused = 1 - ∏(1 - cᵢ)
   * @param {Array} findings - Findings potentially overlapping
   * @returns {Array} De-duplicated findings with fused confidence
   */
  function fuseConfidence(findings) {
    if (!findings || findings.length <= 1) return findings || [];

    // Group by overlapping regions
    const groups = [];
    const sorted = [...findings].sort((a, b) => a.start - b.start);

    let currentGroup = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = currentGroup[currentGroup.length - 1];
      if (sorted[i].start < prev.end) {
        // Overlapping
        currentGroup.push(sorted[i]);
      } else {
        groups.push(currentGroup);
        currentGroup = [sorted[i]];
      }
    }
    groups.push(currentGroup);

    // Fuse each group
    const fused = [];
    for (const group of groups) {
      if (group.length === 1) {
        fused.push(group[0]);
        continue;
      }

      // Noisy-OR fusion: 1 - ∏(1 - cᵢ)
      let product = 1;
      for (const f of group) {
        product *= (1 - f.confidence);
      }
      const fusedConfidence = Math.round((1 - product) * 100) / 100;

      // Take the highest-severity finding as the representative
      group.sort((a, b) => {
        const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4);
      });

      const representative = { ...group[0] };
      representative.confidence = fusedConfidence;
      representative.fusedFrom = group.length;
      fused.push(representative);
    }

    return fused;
  }

  // ── Helpers ──

  function trackFindings(allFindings, redactionCounts, findings, sourceField) {
    for (const f of findings) {
      allFindings.push({
        ...f,
        sourceField: f.sourceField || sourceField,
        action: "REDACTED",
        timestamp: new Date().toISOString()
      });
      redactionCounts[f.type] = (redactionCounts[f.type] || 0) + 1;
    }
  }

  // ── Public API ──
  return Object.freeze({
    redactText,
    redactPageState,
    redactOCRResults,
    fuseConfidence
  });

})();

// Global exposure
if (typeof self !== "undefined") {
  self.RedactionEngine = RedactionEngine;
}
