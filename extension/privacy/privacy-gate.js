// privacy/privacy-gate.js
// Privacy Gate — Final sanitization checkpoint, policy enforcement, audit logging

const PrivacyGate = (() => {

  // Session-level cumulative statistics
  const _sessionStats = {
    totalScans: 0,
    totalPIIFound: 0,
    totalRedacted: 0,
    byType: {},
    bySeverity: {},
    gateVerdicts: { PASS: 0, WARNING: 0, BLOCKED: 0 }
  };

  // Audit log (kept in-memory, never sent to server)
  const _auditLog = [];
  let _auditCounter = 0;

  /**
   * Main entry point — sanitize raw context before it leaves the device.
   * @param {Object} rawContext - { pageState?, ocrResults?, screenshotDataUrl? }
   * @returns {Object} { sanitizedPageState, sanitizedOCR, privacyReport, auditLog }
   */
  function sanitize(rawContext) {
    if (!rawContext) {
      return _emptyResult("No context provided.");
    }

    _sessionStats.totalScans++;
    const allFindings = [];
    const redactionSummary = {};

    let sanitizedPageState = null;
    let sanitizedOCR = null;

    // ── Phase 1: Redact PageState ──
    if (rawContext.pageState) {
      console.log("[PrivacyGate] Phase 1: Scanning PageState for PII...");
      const pageResult = RedactionEngine.redactPageState(rawContext.pageState);
      sanitizedPageState = pageResult.sanitizedPageState;
      mergeFindings(allFindings, pageResult.allFindings);
      mergeRedactionCounts(redactionSummary, pageResult.redactionSummary);
    }

    // ── Phase 2: Redact OCR Results ──
    if (rawContext.ocrResults && rawContext.ocrResults.length > 0) {
      console.log("[PrivacyGate] Phase 2: Scanning OCR results for PII...");
      const ocrResult = RedactionEngine.redactOCRResults(rawContext.ocrResults);
      sanitizedOCR = ocrResult.sanitizedOCR;
      mergeFindings(allFindings, ocrResult.allFindings);
      mergeRedactionCounts(redactionSummary, ocrResult.redactionSummary);
    }

    // ── Phase 3: Build Privacy Report ──
    const bySeverity = {};
    for (const f of allFindings) {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    }

    const privacyReport = {
      totalPIIFound: allFindings.length,
      redactedCount: allFindings.filter(f => f.action === "REDACTED").length,
      byType: { ...redactionSummary },
      bySeverity: bySeverity,
      gateMode: PrivacyConfig.getMode(),
      confidenceThreshold: PrivacyConfig.CONFIDENCE.GATE_MIN_THRESHOLD,
      timestamp: new Date().toISOString()
    };

    // ── Phase 4: Apply Gate Policy ──
    privacyReport.gateVerdict = checkPolicy(privacyReport);

    // ── Phase 5: Generate Audit Log Entries ──
    const newAuditEntries = generateAuditEntries(allFindings);

    // ── Phase 6: Update Session Stats ──
    updateSessionStats(privacyReport);

    console.log(`[PrivacyGate] Scan complete. PII found: ${privacyReport.totalPIIFound}, Verdict: ${privacyReport.gateVerdict}`);

    return {
      sanitizedPageState,
      sanitizedOCR,
      privacyReport,
      auditLog: newAuditEntries
    };
  }

  /**
   * Apply gate policy — ZERO TOLERANCE.
   * If even ONE PII is detected, the payload is BLOCKED from going to server VLM.
   * @param {Object} report - Privacy report
   * @returns {string} "PASS" | "BLOCKED"
   */
  function checkPolicy(report) {
    if (report.totalPIIFound > 0) {
      console.warn(`[PrivacyGate] BLOCKED — ${report.totalPIIFound} PII item(s) detected. Payload will NOT be sent to server.`);
      return "BLOCKED";
    }
    return "PASS";
  }

  /**
   * Generate audit log entries for each finding.
   * These stay on-device and are never transmitted.
   * @param {Array} findings - All findings from this scan
   * @returns {Array} New audit entries
   */
  function generateAuditEntries(findings) {
    const entries = [];

    for (const f of findings) {
      _auditCounter++;
      const entry = {
        id: `audit_${String(_auditCounter).padStart(4, "0")}`,
        type: f.type,
        severity: f.severity,
        confidence: f.confidence,
        sourceField: f.sourceField || "unknown",
        action: f.action || "REDACTED",
        label: f.label,
        validated: f.validated,
        contextBoosted: f.contextBoosted || false,
        fusedFrom: f.fusedFrom || 1,
        timestamp: f.timestamp || new Date().toISOString()
      };

      entries.push(entry);
      _auditLog.push(entry);
    }

    // Keep audit log bounded (last 500 entries)
    while (_auditLog.length > 500) {
      _auditLog.shift();
    }

    return entries;
  }

  /**
   * Get cumulative session statistics.
   * @returns {Object} Session stats
   */
  function getStats() {
    return {
      ..._sessionStats,
      auditLogSize: _auditLog.length
    };
  }

  /**
   * Get the full audit log (on-device only).
   * @returns {Array} Complete audit log
   */
  function getAuditLog() {
    return [..._auditLog];
  }

  /**
   * Reset session statistics and audit log.
   */
  function resetSession() {
    _sessionStats.totalScans = 0;
    _sessionStats.totalPIIFound = 0;
    _sessionStats.totalRedacted = 0;
    _sessionStats.byType = {};
    _sessionStats.bySeverity = {};
    _sessionStats.gateVerdicts = { PASS: 0, WARNING: 0, BLOCKED: 0 };
    _auditLog.length = 0;
    _auditCounter = 0;
    console.log("[PrivacyGate] Session reset.");
  }

  // ── Helpers ──

  function _emptyResult(reason) {
    return {
      sanitizedPageState: null,
      sanitizedOCR: null,
      privacyReport: {
        totalPIIFound: 0,
        redactedCount: 0,
        byType: {},
        bySeverity: {},
        gateMode: PrivacyConfig.getMode(),
        gateVerdict: "PASS",
        confidenceThreshold: PrivacyConfig.CONFIDENCE.GATE_MIN_THRESHOLD,
        timestamp: new Date().toISOString(),
        note: reason
      },
      auditLog: []
    };
  }

  function mergeFindings(target, source) {
    for (const f of source) {
      target.push(f);
    }
  }

  function mergeRedactionCounts(target, source) {
    for (const [type, count] of Object.entries(source)) {
      target[type] = (target[type] || 0) + count;
    }
  }

  function updateSessionStats(report) {
    _sessionStats.totalPIIFound += report.totalPIIFound;
    _sessionStats.totalRedacted += report.redactedCount;

    for (const [type, count] of Object.entries(report.byType)) {
      _sessionStats.byType[type] = (_sessionStats.byType[type] || 0) + count;
    }
    for (const [sev, count] of Object.entries(report.bySeverity)) {
      _sessionStats.bySeverity[sev] = (_sessionStats.bySeverity[sev] || 0) + count;
    }

    const verdict = report.gateVerdict;
    if (_sessionStats.gateVerdicts[verdict] !== undefined) {
      _sessionStats.gateVerdicts[verdict]++;
    }
  }

  // ── Public API ──
  return Object.freeze({
    sanitize,
    checkPolicy,
    getStats,
    getAuditLog,
    resetSession
  });

})();

// Global exposure
if (typeof self !== "undefined") {
  self.PrivacyGate = PrivacyGate;
}
