// privacy/pii-detector/test-pii-detector.js
// Isolated Test Suite for DOM PII Detector & Text/Regex Detector

if (typeof require !== "undefined") {
  const fs = require("fs");
  const path = require("path");

  global.window = global;
  global.self = global;

  eval(fs.readFileSync(path.join(__dirname, "pii-types.js"), "utf8"));
  eval(fs.readFileSync(path.join(__dirname, "text-detector.js"), "utf8"));
  eval(fs.readFileSync(path.join(__dirname, "dom-detector.js"), "utf8"));
}

console.log("==========================================");
console.log(" RUNNING PII DETECTOR CHUNK 1 TEST SUITE ");
console.log("==========================================\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failed++;
  }
}

// ----------------------------------------------------
// TEST SET 1: DOM DETECTOR TESTS
// ----------------------------------------------------
console.log("--- TEST SET 1: DOM Detector ---");

const fakePageStateElements = [
  {
    id: "e1",
    tag: "input",
    type: "password",
    name: "user_pass",
    placeholder: "Enter password",
    text: "",
    bbox: { x: 10, y: 10, width: 200, height: 30 }
  },
  {
    id: "e2",
    tag: "input",
    type: "email",
    name: "user_email",
    placeholder: "Email address",
    text: "",
    bbox: { x: 10, y: 50, width: 200, height: 30 }
  },
  {
    id: "e3",
    tag: "input",
    type: "tel",
    name: "mobile",
    placeholder: "Phone number",
    text: "",
    bbox: { x: 10, y: 90, width: 200, height: 30 }
  },
  {
    id: "e4",
    tag: "input",
    type: "text",
    name: "username",
    placeholder: "Enter your username",
    text: "",
    bbox: { x: 10, y: 130, width: 200, height: 30 }
  },
  {
    id: "e5",
    tag: "input",
    type: "text",
    autocomplete: "current-password",
    name: "pass_field",
    text: "",
    bbox: { x: 10, y: 170, width: 200, height: 30 }
  },
  {
    id: "e6",
    tag: "input",
    type: "text",
    autocomplete: "email",
    name: "email_field",
    text: "",
    bbox: { x: 10, y: 210, width: 200, height: 30 }
  }
];

const domDetections = DOMDetector.detect(fakePageStateElements);

assert(
  domDetections.some(d => d.elementId === "e1" && d.type === "PASSWORD" && d.confidence === 1.0),
  "Detects input[type=password] as PASSWORD (confidence 1.0)"
);

assert(
  domDetections.some(d => d.elementId === "e2" && d.type === "EMAIL" && d.confidence === 1.0),
  "Detects input[type=email] as EMAIL (confidence 1.0)"
);

assert(
  domDetections.some(d => d.elementId === "e3" && d.type === "PHONE" && d.confidence === 1.0),
  "Detects input[type=tel] as PHONE (confidence 1.0)"
);

assert(
  !domDetections.some(d => d.elementId === "e4"),
  "Normal text input produces NO false positive PII detection"
);

assert(
  domDetections.some(d => d.elementId === "e5" && d.type === "PASSWORD" && d.reason.includes("autocomplete")),
  "Detects autocomplete='current-password' as PASSWORD"
);

assert(
  domDetections.some(d => d.elementId === "e6" && d.type === "EMAIL" && d.reason.includes("autocomplete")),
  "Detects autocomplete='email' as EMAIL"
);

assert(
  domDetections.every(d => d.type !== "PASSWORD" || d.text === null),
  "SECURITY CHECK: PASSWORD fields NEVER expose text/input values"
);

// ----------------------------------------------------
// TEST SET 2: REUSABLE TEXT/REGEX DETECTOR TESTS
// ----------------------------------------------------
console.log("\n--- TEST SET 2: Text/Regex Detector ---");

// Test 2.1: Email Detection
const emailSample = "Contact john@example.com or support@company.org for help.";
const emailMatches = TextDetector.detect(emailSample);
assert(emailMatches.length === 2, "Detects multiple email occurrences in text string");
assert(emailMatches[0].type === "EMAIL" && emailMatches[0].text === "john@example.com", "Extracts exact email 1 string");
assert(emailMatches[1].type === "EMAIL" && emailMatches[1].text === "support@company.org", "Extracts exact email 2 string");

// Test 2.2: Phone Detection (Indian Formats)
const phoneSample = "Call +91 9876543210 or 9876543210 or +91-9876543210 today";
const phoneMatches = TextDetector.detect(phoneSample);
assert(phoneMatches.length >= 3, "Detects Indian mobile phone number variations (+91, hyphens, spaces, 10-digit)");
assert(phoneMatches.every(p => p.type === "PHONE" && p.confidence === 0.95), "Phone detections have 0.95 confidence rating");

// Test 2.3: Credit Card Luhn Detection
const validVisaCard = "Card: 4111 1111 1111 1111"; // Valid Visa test card (Luhn sum = 60 % 10 == 0)
const invalidCard = "Card: 4111 1111 1111 1112"; // Invalid card (Luhn fails)

const validCardMatches = TextDetector.detect(validVisaCard);
const invalidCardMatches = TextDetector.detect(invalidCard);

assert(validCardMatches.length === 1 && validCardMatches[0].type === "CARD", "Detects valid Visa card passing Luhn check");
assert(invalidCardMatches.length === 0, "Rejects card-like number sequence failing Luhn check");

// Test 2.4: Normal Safe Text
const safeText = "Nothing sensitive here. Searching for RTX 4050 laptops under 60000 INR.";
const safeMatches = TextDetector.detect(safeText);
assert(safeMatches.length === 0, "Normal text produces zero false PII detections");

console.log("\n==========================================");
console.log(` SUMMARY: ${passed} Passed, ${failed} Failed `);
console.log("==========================================");

if (failed > 0) {
  process.exit(1);
}
