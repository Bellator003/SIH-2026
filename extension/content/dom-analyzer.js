// DOM Analyzer Content Script for Privacy Vision Agent

(function () {
  if (window.__DOM_ANALYZER_INITIALIZED__) return;
  window.__DOM_ANALYZER_INITIALIZED__ = true;

  console.log("[DOM Analyzer] Content script loaded.");

  // Global registry for observation element mappings: observationId -> Map(elementId -> HTMLElement)
  window.__OBSERVATION_REGISTRY__ = window.__OBSERVATION_REGISTRY__ || new Map();
  window.__CURRENT_OBSERVATION_ID__ = null;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ANALYZE_DOM") {
      try {
        const pageState = extractPageState();
        console.log("[DOM Analyzer] PageState generated:", pageState);
        sendResponse({ pageState });
      } catch (err) {
        console.error("[DOM Analyzer] Error during DOM analysis:", err);
        sendResponse({ error: err.message });
      }
    }
    return true;
  });

  function extractPageState() {
    const observationId = `obs_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const elementMap = new Map();

    const elements = extractInteractiveElements(elementMap);

    // Register observation map locally for future action execution
    window.__OBSERVATION_REGISTRY__.set(observationId, elementMap);
    window.__CURRENT_OBSERVATION_ID__ = observationId;

    // Keep registry memory lightweight (keep last 5 observations only)
    if (window.__OBSERVATION_REGISTRY__.size > 5) {
      const oldestKey = window.__OBSERVATION_REGISTRY__.keys().next().value;
      window.__OBSERVATION_REGISTRY__.delete(oldestKey);
    }

    const pageState = {
      metadata: {
        observationId: observationId,
        url: window.location.href,
        title: document.title || "Untitled Page",
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: Math.round(window.scrollX),
          scrollY: Math.round(window.scrollY),
          devicePixelRatio: window.devicePixelRatio || 1
        },
        timestamp: new Date().toISOString(),
        elementCount: elements.length
      },
      elements: elements
    };

    return pageState;
  }

  function extractInteractiveElements(elementMap) {
    const selector = [
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[role='link']",
      "[role='textbox']",
      "[role='checkbox']",
      "[role='radio']",
      "[role='searchbox']",
      "[role='combobox']",
      "[tabindex]:not([tabindex='-1'])"
    ].join(", ");

    const rawElements = Array.from(document.querySelectorAll(selector));
    const results = [];
    let counter = 1;

    for (const el of rawElements) {
      if (!isElementRendered(el)) continue;

      const elementId = `e${counter++}`;
      elementMap.set(elementId, el);

      const rect = el.getBoundingClientRect();
      const inViewport = isInViewport(rect);
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute("type") || (tag === "input" ? "text" : null);
      const role = el.getAttribute("role") || getImplicitRole(tag, type);
      const placeholder = el.getAttribute("placeholder") || null;
      const name = el.getAttribute("name") || null;

      // Extract accessible name and text separately (NEVER include raw input.value)
      const accessibleName = getAccessibleName(el);
      const text = getDisplayText(el);

      // Interaction properties
      const isEditable = tag === "textarea" ||
        (tag === "input" && !["button", "submit", "checkbox", "radio", "reset", "file", "image"].includes(type)) ||
        el.isContentEditable;

      const hasValue = (tag === "input" || tag === "textarea") ? Boolean(el.value && el.value.length > 0) : false;

      let checked = null;
      if (type === "checkbox" || type === "radio" || role === "checkbox" || role === "radio") {
        checked = el.checked !== undefined ? el.checked : el.getAttribute("aria-checked") === "true";
      }

      let selected = null;
      if (tag === "select") {
        const selectedOption = el.options[el.selectedIndex];
        selected = selectedOption ? selectedOption.text.trim() : null;
      }

      results.push({
        id: elementId,
        tag: tag,
        type: type,
        name: name,
        role: role,
        accessibleName: accessibleName,
        text: text,
        placeholder: placeholder,
        hasValue: hasValue,
        enabled: !el.disabled,
        editable: isEditable,
        checked: checked,
        selected: selected,
        visible: true,
        inViewport: inViewport,
        bbox: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      });
    }

    return results;
  }

  function isElementRendered(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    return true;
  }

  function isInViewport(rect) {
    return (
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      rect.right > 0 &&
      rect.left < window.innerWidth
    );
  }

  function getAccessibleName(el) {
    // 1. aria-label
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim().substring(0, 100);

    // 2. aria-labelledby
    const ariaLabelledBy = el.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      const labels = ariaLabelledBy.split(/\s+/).map(id => document.getElementById(id)).filter(Boolean);
      const labelText = labels.map(l => l.innerText).join(" ").trim();
      if (labelText) return labelText.substring(0, 100);
    }

    // 3. Associated <label> element
    if (el.id) {
      const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelEl && labelEl.innerText.trim()) {
        return labelEl.innerText.trim().substring(0, 100);
      }
    }
    const parentLabel = el.closest("label");
    if (parentLabel) {
      const labelText = parentLabel.innerText.trim();
      if (labelText) return labelText.substring(0, 100);
    }

    // 4. alt attribute
    const alt = el.getAttribute("alt");
    if (alt && alt.trim()) return alt.trim().substring(0, 100);

    // 5. title attribute
    const title = el.getAttribute("title");
    if (title && title.trim()) return title.trim().substring(0, 100);

    return "";
  }

  function getDisplayText(el) {
    const tag = el.tagName.toLowerCase();

    // STRICT RULE: Never extract input.value or textarea.value into text field!
    if (tag === "input" || tag === "textarea") {
      return "";
    }

    const innerText = el.innerText;
    if (innerText) return innerText.trim().replace(/\s+/g, " ").substring(0, 100);

    return "";
  }

  function getImplicitRole(tag, type) {
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "textarea") return "textbox";
    if (tag === "select") return "combobox";
    if (tag === "input") {
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "submit" || type === "button") return "button";
      return "textbox";
    }
    return "element";
  }
})();
