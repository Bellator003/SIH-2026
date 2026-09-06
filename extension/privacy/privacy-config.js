// privacy/privacy-config.js
// Centralized configuration for Privacy Gate — patterns, thresholds, policies

const PrivacyConfig = (() => {

  // ── Severity Levels ──
  const SEVERITY = Object.freeze({
    CRITICAL: "CRITICAL",   // Aadhaar, PAN, Credit Card
    HIGH: "HIGH",           // Phone, Email
    MEDIUM: "MEDIUM",       // DOB, IP Address, Passport
    LOW: "LOW"              // Generic names via context
  });

  // ── Gate Policy Modes ──
  const GATE_MODE = Object.freeze({
    STRICT: "strict",       // Block if any CRITICAL PII found
    BALANCED: "balanced",   // Redact and pass; warn if heavy PII
    PERMISSIVE: "permissive" // Always pass, log only
  });

  // ── PII Pattern Definitions ──
  // Each pattern: { name, regex, severity, label, validator? }
  const PII_PATTERNS = [
    {
      name: "AADHAAR",
      regex: /\b([0-9oOlI|]{4})[\s\-]?([0-9oOlI|]{4})[\s\-]?([0-9oOlI|]{4})\b/gi,
      severity: SEVERITY.CRITICAL,
      label: "[AADHAAR_REDACTED]",
      hasValidator: true
    },
    {
      name: "PAN",
      regex: /\b[A-Z]{5}[\s\-]?[0-9oOlI|]{4}[\s\-]?[A-Z]\b/gi,
      severity: SEVERITY.CRITICAL,
      label: "[PAN_REDACTED]",
      hasValidator: false
    },
    {
      name: "CREDIT_CARD",
      regex: /\b([0-9oOlI|]{4})[\s\-]?([0-9oOlI|]{4,6})[\s\-]?([0-9oOlI|]{4,5})(?:[\s\-]?([0-9oOlI|]{3,4}))?\b/gi,
      severity: SEVERITY.CRITICAL,
      label: "[CARD_REDACTED]",
      hasValidator: true
    },
    {
      name: "INDIAN_MOBILE",
      regex: /(?:\+91[\s\-]?)?\b[6-9](?:[\s\-]*[0-9oOlI|]){9}\b/gi,
      severity: SEVERITY.HIGH,
      label: "[PHONE_REDACTED]",
      hasValidator: false
    },
    {
      name: "EMAIL",
      regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/gi,
      severity: SEVERITY.HIGH,
      label: "[EMAIL_REDACTED]",
      hasValidator: false
    },
    {
      name: "UPI_ID",
      regex: /\b[a-zA-Z0-9._\-]+@(?:okaxis|oksbi|okhdfcbank|okicici|ybl|paytm|ibl|upi|axl|sbi|icici|hdfc|apl|barodampay|unionbankofindia|federal|indus|kotak|citi|rbl|idbi|dbs|[a-zA-Z]{2,})\b/gi,
      severity: SEVERITY.HIGH,
      label: "[UPI_REDACTED]",
      hasValidator: false
    },
    {
      name: "IFSC",
      regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi,
      severity: SEVERITY.MEDIUM,
      label: "[IFSC_REDACTED]",
      hasValidator: false
    },
    {
      name: "INDIAN_PASSPORT",
      regex: /\b[A-PR-WY-Z][1-9]\d\s?\d{4}[1-9]\b/gi,
      severity: SEVERITY.MEDIUM,
      label: "[PASSPORT_REDACTED]",
      hasValidator: false
    },
    {
      name: "IP_ADDRESS",
      regex: /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}\b/gi,
      severity: SEVERITY.MEDIUM,
      label: "[IP_REDACTED]",
      hasValidator: false
    },
    {
      name: "DATE_OF_BIRTH",
      regex: /\b(?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:19|20)\d{2}\b/gi,
      severity: SEVERITY.MEDIUM,
      label: "[DOB_REDACTED]",
      hasValidator: false
    }
  ];

  // ── Context Hints ──
  // Field name / label keywords that boost detection confidence
  const CONTEXT_KEYWORDS = {
    AADHAAR: ["aadhaar", "aadhar", "uid", "uidai", "unique id"],
    PAN: ["pan", "permanent account", "pancard"],
    CREDIT_CARD: ["card number", "credit card", "debit card", "card no"],
    INDIAN_MOBILE: ["mobile", "phone", "contact", "cell", "tel", "whatsapp"],
    EMAIL: ["email", "e-mail", "mail", "email address"],
    UPI_ID: ["upi", "vpa", "upi id"],
    IFSC: ["ifsc", "bank code", "branch code"],
    INDIAN_PASSPORT: ["passport", "travel document"],
    IP_ADDRESS: ["ip address", "ip addr"],
    DATE_OF_BIRTH: ["dob", "date of birth", "birthday", "birth date"]
  };

  // ── Confidence Thresholds ──
  const CONFIDENCE = Object.freeze({
    REGEX_ONLY: 0.70,
    REGEX_PLUS_CONTEXT: 0.90,
    REGEX_PLUS_VALIDATOR: 0.95,
    REGEX_CONTEXT_VALIDATOR: 0.99,
    GATE_MIN_THRESHOLD: 0.60       // Minimum confidence to trigger redaction
  });

  // ── Default Gate Settings ──
  let _currentMode = GATE_MODE.BALANCED;

  function setMode(mode) {
    if (Object.values(GATE_MODE).includes(mode)) {
      _currentMode = mode;
      console.log(`[PrivacyConfig] Gate mode set to: ${mode}`);
    }
  }

  function getMode() {
    return _currentMode;
  }

  // ── Public API ──
  return Object.freeze({
    SEVERITY,
    GATE_MODE,
    PII_PATTERNS,
    CONTEXT_KEYWORDS,
    CONFIDENCE,
    setMode,
    getMode
  });

})();

// Global exposure
if (typeof self !== "undefined") {
  self.PrivacyConfig = PrivacyConfig;
}
