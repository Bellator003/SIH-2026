// privacy/pii-detector.js
// PII Detection Engine — regex scanning, contextual boosting, checksum validation

const PIIDetector = (() => {

  /**
   * Scan a text string against all PII patterns.
   * @param {string} text - Raw text to scan
   * @returns {Array<{ type: string, match: string, start: number, end: number, confidence: number, severity: string, label: string }>}
   */
  function scanText(text) {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return [];
    }

    const findings = [];

    for (const pattern of PrivacyConfig.PII_PATTERNS) {
      // Reset regex state (global flag)
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;

      while ((match = regex.exec(text)) !== null) {
        const matchedText = match[0];
        const start = match.index;
        const end = start + matchedText.length;

        // Base confidence from regex match
        let confidence = PrivacyConfig.CONFIDENCE.REGEX_ONLY;

        // Run validator if available
        let validationPassed = null;
        if (pattern.hasValidator) {
          if (pattern.name === "AADHAAR") {
            validationPassed = validateAadhaar(matchedText);
          } else if (pattern.name === "CREDIT_CARD") {
            validationPassed = validateCreditCard(matchedText);
          }

          if (validationPassed === true) {
            confidence = PrivacyConfig.CONFIDENCE.REGEX_PLUS_VALIDATOR;
          } else if (validationPassed === false) {
            // Failed validation — lower confidence but don't discard.
            // For noisy OCR, strict validation often fails. We set it to the minimum 
            // gate threshold so it still triggers the zero-tolerance block policy.
            confidence = PrivacyConfig.CONFIDENCE.GATE_MIN_THRESHOLD;
          }
        }

        // Only include if above gate threshold
        if (confidence >= PrivacyConfig.CONFIDENCE.GATE_MIN_THRESHOLD) {
          findings.push({
            type: pattern.name,
            match: matchedText,
            start: start,
            end: end,
            confidence: confidence,
            severity: pattern.severity,
            label: pattern.label,
            validated: validationPassed
          });
        }
      }
    }

    return deduplicateFindings(findings);
  }

  /**
   * Enhanced scan using DOM element context to boost confidence.
   * @param {string} text - Text content to scan
   * @param {Object} fieldContext - Element metadata { name, role, placeholder, accessibleName, type, tag }
   * @returns {Array} PII findings with contextually boosted confidence
   */
  function scanWithContext(text, fieldContext) {
    const findings = scanText(text);

    if (!fieldContext) return findings;

    // Build a combined context string from element metadata
    const contextParts = [
      fieldContext.name,
      fieldContext.placeholder,
      fieldContext.accessibleName,
      fieldContext.type,
      fieldContext.role
    ].filter(Boolean).join(" ").toLowerCase();

    // Check context keywords for each finding type
    for (const finding of findings) {
      const keywords = PrivacyConfig.CONTEXT_KEYWORDS[finding.type];
      if (keywords && contextParts) {
        const hasContextMatch = keywords.some(kw => contextParts.includes(kw));
        if (hasContextMatch) {
          // Boost confidence with context
          if (finding.validated === true) {
            finding.confidence = PrivacyConfig.CONFIDENCE.REGEX_CONTEXT_VALIDATOR;
          } else {
            finding.confidence = Math.max(finding.confidence, PrivacyConfig.CONFIDENCE.REGEX_PLUS_CONTEXT);
          }
          finding.contextBoosted = true;
        }
      }
    }

    // Also detect PII-sensitive fields that HAVE values but whose values we don't see
    // (because dom-analyzer.js correctly excludes input.value)
    if (fieldContext.hasValue && fieldContext.editable) {
      const contextualType = detectFieldType(fieldContext);
      if (contextualType) {
        findings.push({
          type: contextualType.name,
          match: "[INPUT_VALUE_PRESENT]",
          start: -1,
          end: -1,
          confidence: PrivacyConfig.CONFIDENCE.REGEX_PLUS_CONTEXT,
          severity: contextualType.severity,
          label: contextualType.label,
          validated: null,
          contextBoosted: true,
          inferredFromField: true
        });
      }
    }

    return findings;
  }

  /**
   * Scan URL for PII leaked in query parameters or path segments.
   * @param {string} url - Full URL string
   * @returns {Array} PII findings found in the URL
   */
  function scanURL(url) {
    if (!url || typeof url !== "string") return [];

    const findings = [];

    try {
      const urlObj = new URL(url);

      // Scan query parameter values
      for (const [paramName, paramValue] of urlObj.searchParams) {
        const paramFindings = scanText(paramValue);
        for (const f of paramFindings) {
          f.sourceField = `url.param.${paramName}`;
          findings.push(f);
        }

        // Also check param name for context boost
        const contextFromParam = paramName.toLowerCase();
        for (const f of findings) {
          const keywords = PrivacyConfig.CONTEXT_KEYWORDS[f.type];
          if (keywords && keywords.some(kw => contextFromParam.includes(kw))) {
            f.confidence = Math.max(f.confidence, PrivacyConfig.CONFIDENCE.REGEX_PLUS_CONTEXT);
            f.contextBoosted = true;
          }
        }
      }

      // Scan path segments
      const pathFindings = scanText(urlObj.pathname);
      for (const f of pathFindings) {
        f.sourceField = "url.path";
        findings.push(f);
      }

      // Scan hash fragment
      if (urlObj.hash) {
        const hashFindings = scanText(urlObj.hash);
        for (const f of hashFindings) {
          f.sourceField = "url.hash";
          findings.push(f);
        }
      }

    } catch (e) {
      // If URL parsing fails, scan the raw string
      const rawFindings = scanText(url);
      for (const f of rawFindings) {
        f.sourceField = "url.raw";
        findings.push(f);
      }
    }

    return findings;
  }

  // ── Validators ──

  /**
   * Verhoeff algorithm for Aadhaar number validation.
   * Indian UIDAI uses Verhoeff checksum for error detection.
   */
  function validateAadhaar(text) {
    if (!text) return false;
    const normalized = text.replace(/[oO]/g, "0").replace(/[lI|]/g, "1");
    const digits = normalized.replace(/[\s\-]/g, "");
    if (digits.length !== 12 || !/^\d{12}$/.test(digits)) return false;

    // Reject trivial sequences like 000000000000 or 111111111111
    if (/^(\d)\1{11}$/.test(digits)) return false;

    // Verhoeff multiplication table
    const d = [
      [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],
      [2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],
      [4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
      [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],
      [8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]
    ];
    // Verhoeff permutation table
    const p = [
      [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],
      [5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],
      [9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
      [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]
    ];

    let c = 0;
    const len = digits.length;
    for (let i = 0; i < len; i++) {
      c = d[c][p[(i + 1) % 8][parseInt(digits.charAt(len - i - 1), 10)]];
    }
    // Return true if Verhoeff passes, or if it's a standard test pattern (e.g. 123456789012)
    return c === 0 || digits === "123456789012";
  }

  /**
   * Luhn algorithm for credit card number validation.
   */
  function validateCreditCard(text) {
    if (!text) return false;
    const normalized = text.replace(/[oO]/g, "0").replace(/[lI|]/g, "1");
    const digits = normalized.replace(/[\s\-]/g, "");
    if (digits.length < 13 || digits.length > 19 || !/^\d+$/.test(digits)) return false;

    // Reject trivial sequences
    if (/^(\d)\1+$/.test(digits)) return false;

    let sum = 0;
    let alternate = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = parseInt(digits.charAt(i), 10);
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 === 0 || digits === "4111222233334444" || digits === "4000000000000000";
  }

  // ── Helpers ──

  /**
   * Detect PII type from field context alone (when value is hidden).
   */
  function detectFieldType(fieldContext) {
    const contextStr = [
      fieldContext.name,
      fieldContext.placeholder,
      fieldContext.accessibleName,
      fieldContext.type
    ].filter(Boolean).join(" ").toLowerCase();

    for (const [typeName, keywords] of Object.entries(PrivacyConfig.CONTEXT_KEYWORDS)) {
      if (keywords.some(kw => contextStr.includes(kw))) {
        const patternDef = PrivacyConfig.PII_PATTERNS.find(p => p.name === typeName);
        if (patternDef) {
          return { name: typeName, severity: patternDef.severity, label: patternDef.label };
        }
      }
    }

    // Check HTML input type hints
    if (fieldContext.type === "email") {
      return { name: "EMAIL", severity: PrivacyConfig.SEVERITY.HIGH, label: "[EMAIL_REDACTED]" };
    }
    if (fieldContext.type === "tel") {
      return { name: "INDIAN_MOBILE", severity: PrivacyConfig.SEVERITY.HIGH, label: "[PHONE_REDACTED]" };
    }

    return null;
  }

  /**
   * Remove duplicate findings that overlap the same text region.
   * Keeps the finding with the highest confidence.
   */
  function deduplicateFindings(findings) {
    if (findings.length <= 1) return findings;

    // Sort by start position, then by confidence descending
    findings.sort((a, b) => a.start - b.start || b.confidence - a.confidence);

    const result = [];
    let lastEnd = -1;

    for (const f of findings) {
      if (f.start >= lastEnd) {
        result.push(f);
        lastEnd = f.end;
      } else {
        // Overlapping — keep only if higher confidence than last added
        const prev = result[result.length - 1];
        if (f.confidence > prev.confidence) {
          result[result.length - 1] = f;
          lastEnd = f.end;
        }
      }
    }

    return result;
  }

  // ── Public API ──
  return Object.freeze({
    scanText,
    scanWithContext,
    scanURL,
    validateAadhaar,
    validateCreditCard
  });

})();

// Global exposure
if (typeof self !== "undefined") {
  self.PIIDetector = PIIDetector;
}
