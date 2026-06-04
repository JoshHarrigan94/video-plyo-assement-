const APP_INFO = {
  name: "Video Plyo Assessment Engine",
  version: "0.1.0",
  build: "bootstrap-pass-2-diagnostics",
  startedAt: new Date().toISOString()
};

window.PLYO_APP = {
  info: APP_INFO,
  boot: {
    status: "starting",
    checks: {},
    errors: [],
    warnings: [],
    diagnostics: []
  }
};

installGlobalErrorHandlers();
runBootstrap();

async function runBootstrap() {
  logBoot("info", "bootstrap", "Bootstrap started.");

  const checks = runCapabilityChecks();
  window.PLYO_APP.boot.checks = checks;

  if (checks.blockers.length) {
    failBoot("Browser capability check failed.", checks.blockers);
    return;
  }

  renderBootStatus("Loading application...");

  try {
    const appModule = await import("./main.js");

    if (typeof appModule.startApp === "function") {
      await appModule.startApp({
        appInfo: APP_INFO,
        checks
      });
    } else {
      logBoot(
        "warn",
        "bootstrap",
        "main.js does not export startApp(). Using fallback import-only boot."
      );
    }

    window.PLYO_APP.boot.status = "ready";
    renderBootStatus("Ready.");

    logBoot("info", "bootstrap", "Application boot complete.");
  } catch (error) {
    const diagnostics = buildErrorDiagnostics(error, {
      phase: "dynamic_import",
      attemptedImport: "./main.js"
    });

    failBoot("Application module failed to load.", diagnostics.displayLines);

    console.error("[PLYO BOOT IMPORT ERROR]", diagnostics);
  }
}

function runCapabilityChecks() {
  const checks = {
    browser: navigator.userAgent,
    pageUrl: window.location.href,
    secureContext: window.isSecureContext,
    supportsModules: true,
    supportsFileApi: Boolean(window.File && window.FileReader && window.Blob),
    supportsVideo: Boolean(document.createElement("video").canPlayType),
    supportsCanvas: Boolean(document.createElement("canvas").getContext),
    supportsAudioContext: Boolean(window.AudioContext || window.webkitAudioContext),
    supportsPerformanceApi: Boolean(window.performance),
    supportsUrlObjects: Boolean(window.URL && window.URL.createObjectURL),
    supportsMediaPipeGlobal: Boolean(window.MediaPipeVision),
    blockers: [],
    warnings: []
  };

  if (!checks.supportsFileApi) checks.blockers.push("File API is not supported.");
  if (!checks.supportsVideo) checks.blockers.push("HTML video is not supported.");
  if (!checks.supportsCanvas) checks.blockers.push("Canvas is not supported.");
  if (!checks.supportsUrlObjects) checks.blockers.push("Object URLs are not supported.");

  if (!checks.secureContext) {
    checks.warnings.push(
      "Page is not running in a secure context. Some browser APIs may be limited."
    );
  }

  if (!checks.supportsAudioContext) {
    checks.warnings.push(
      "Web Audio API is not available. Audio impact detection may fail."
    );
  }

  if (!checks.supportsMediaPipeGlobal) {
    checks.warnings.push(
      "MediaPipe global is not available at bootstrap. Pose detection may fail if the CDN script did not load."
    );
  }

  for (const warning of checks.warnings) {
    logBoot("warn", "capability", warning);
  }

  return checks;
}

function installGlobalErrorHandlers() {
  window.addEventListener("error", event => {
    const payload = {
      time: new Date().toISOString(),
      type: "window_error",
      message: event.message,
      source: normaliseUrl(event.filename),
      line: event.lineno || null,
      column: event.colno || null,
      stack: event.error?.stack || null
    };

    const diagnostics = buildErrorDiagnostics(event.error || payload, {
      phase: "runtime_error",
      eventPayload: payload
    });

    window.PLYO_APP.boot.errors.push(payload);
    window.PLYO_APP.boot.diagnostics.push(diagnostics);

    console.error("[PLYO GLOBAL ERROR]", diagnostics);

    renderBootError(
      "Runtime error",
      formatDiagnosticHeadline(diagnostics)
    );
  });

  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;

    const payload = {
      time: new Date().toISOString(),
      type: "unhandled_promise_rejection",
      message: reason?.message || String(reason),
      stack: reason?.stack || null
    };

    const diagnostics = buildErrorDiagnostics(reason || payload, {
      phase: "unhandled_promise_rejection",
      eventPayload: payload
    });

    window.PLYO_APP.boot.errors.push(payload);
    window.PLYO_APP.boot.diagnostics.push(diagnostics);

    console.error("[PLYO PROMISE ERROR]", diagnostics);

    renderBootError(
      "Unhandled async error",
      formatDiagnosticHeadline(diagnostics)
    );
  });
}

function buildErrorDiagnostics(error, context = {}) {
  const message =
    error?.message ||
    error?.reason ||
    String(error) ||
    "Unknown error";

  const stack =
    error?.stack ||
    context?.eventPayload?.stack ||
    null;

  const parsedStack = parseStack(stack);

  const primaryFrame =
    parsedStack.find(frame => isProjectFrame(frame.file)) ||
    parsedStack[0] ||
    null;

  const source =
    context?.eventPayload?.source ||
    primaryFrame?.file ||
    null;

  const line =
    context?.eventPayload?.line ||
    primaryFrame?.line ||
    null;

  const column =
    context?.eventPayload?.column ||
    primaryFrame?.column ||
    null;

  const hint = buildErrorHint({
    message,
    source,
    line,
    column,
    context
  });

  const diagnostics = {
    time: new Date().toISOString(),
    message,
    phase: context.phase || "unknown",
    attemptedImport: context.attemptedImport || null,
    source: normaliseUrl(source),
    line,
    column,
    stack,
    parsedStack,
    hint,
    displayLines: []
  };

  diagnostics.displayLines = buildDisplayLines(diagnostics);

  window.PLYO_APP.boot.diagnostics.push(diagnostics);

  return diagnostics;
}

function buildDisplayLines(diagnostics) {
  const lines = [];

  lines.push(diagnostics.message);

  if (diagnostics.source) {
    lines.push(
      `File: ${diagnostics.source}${diagnostics.line ? `:${diagnostics.line}` : ""}${diagnostics.column ? `:${diagnostics.column}` : ""}`
    );
  }

  if (diagnostics.attemptedImport) {
    lines.push(`Attempted import: ${diagnostics.attemptedImport}`);
  }

  if (diagnostics.hint) {
    lines.push(`Hint: ${diagnostics.hint}`);
  }

  if (!diagnostics.source) {
    lines.push(
      "Note: Some browsers hide the exact module file for import failures. Open DevTools Console for the full failed module URL."
    );
  }

  return lines;
}

function buildErrorHint({ message, source }) {
  const text = String(message || "").toLowerCase();

  if (text.includes("unexpected identifier")) {
    return "Likely missing comma, missing brace, or invalid object literal near the named identifier.";
  }

  if (text.includes("unexpected token")) {
    return "Likely syntax error: extra/missing brace, comma, parenthesis, or misplaced import/export.";
  }

  if (
    text.includes("importing a module script failed") ||
    text.includes("failed to fetch dynamically imported module") ||
    text.includes("load failed")
  ) {
    return "Likely missing file, wrong filename, wrong folder path, or case-sensitive import mismatch.";
  }

  if (text.includes("does not provide an export named")) {
    return "The file loaded, but the named export does not match the import statement.";
  }

  if (text.includes("cannot find variable") || text.includes("is not defined")) {
    return "A variable/function is referenced before it exists or outside its scope.";
  }

  if (source && source.includes("movementDetectors")) {
    return "Check movement detector filename, export name, and registry import path.";
  }

  return "Check the file and line shown above, then inspect surrounding commas/braces/imports.";
}

function parseStack(stack) {
  if (!stack) return [];

  return String(stack)
    .split("\n")
    .map(line => line.trim())
    .map(parseStackLine)
    .filter(Boolean);
}

function parseStackLine(line) {
  const patterns = [
    /(?:at\s+.*?)?\(?(.+?):(\d+):(\d+)\)?$/,
    /(.+?)@(.+?):(\d+):(\d+)$/
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);

    if (!match) continue;

    if (match.length === 4) {
      return {
        raw: line,
        file: normaliseUrl(match[1]),
        line: Number(match[2]),
        column: Number(match[3])
      };
    }

    if (match.length === 5) {
      return {
        raw: line,
        functionName: match[1],
        file: normaliseUrl(match[2]),
        line: Number(match[3]),
        column: Number(match[4])
      };
    }
  }

  return {
    raw: line,
    file: null,
    line: null,
    column: null
  };
}

function isProjectFrame(file) {
  if (!file) return false;

  return (
    file.includes("/app/") ||
    file.includes("/engine/") ||
    file.includes("/styles/")
  );
}

function failBoot(message, details = []) {
  window.PLYO_APP.boot.status = "failed";

  const payload = {
    time: new Date().toISOString(),
    type: "boot_failure",
    message,
    details
  };

  window.PLYO_APP.boot.errors.push(payload);

  renderBootFailure(message, details);

  console.error("[PLYO BOOT FAILURE]", payload);
}

function logBoot(level, module, message) {
  const entry = {
    time: new Date().toISOString(),
    level,
    module,
    message
  };

  if (level === "warn") {
    window.PLYO_APP.boot.warnings.push(entry);
  }

  console[level === "warn" ? "warn" : "log"](
    `[PLYO ${level.toUpperCase()}][${module}] ${message}`
  );
}

function renderBootStatus(message) {
  const status = document.getElementById("bootStatus");
  if (!status) return;

  status.textContent = message;
  status.dataset.state = "ready";
}

function renderBootError(title, message) {
  const status = document.getElementById("bootStatus");
  if (!status) return;

  status.dataset.state = "error";
  status.textContent = `${title}: ${message}`;
}

function renderBootFailure(message, details) {
  const root = document.getElementById("bootStatus");

  const diagnosticsJson = escapeHtml(
    JSON.stringify(window.PLYO_APP.boot.diagnostics.at(-1) || {}, null, 2)
  );

  const html = `
    <div class="boot-failure">
      <strong>Boot failed</strong><br />
      ${escapeHtml(message)}

      ${
        details.length
          ? `<ul>${details.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : ""
      }

      <details>
        <summary>Diagnostics</summary>
        <pre>${diagnosticsJson}</pre>
      </details>

      <button type="button" id="copyBootDiagnosticsBtn">
        Copy diagnostics
      </button>
    </div>
  `;

  if (root) {
    root.innerHTML = html;
    root.dataset.state = "error";
  } else {
    document.body.insertAdjacentHTML("afterbegin", html);
  }

  const copyButton = document.getElementById("copyBootDiagnosticsBtn");

  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      const text = JSON.stringify(window.PLYO_APP.boot, null, 2);

      try {
        await navigator.clipboard.writeText(text);
        copyButton.textContent = "Copied";
      } catch {
        copyButton.textContent = "Copy failed";
      }
    });
  }
}

function formatDiagnosticHeadline(diagnostics) {
  if (!diagnostics) return "Unknown error";

  const location = diagnostics.source
    ? ` (${diagnostics.source}${diagnostics.line ? `:${diagnostics.line}` : ""})`
    : "";

  return `${diagnostics.message}${location}`;
}

function normaliseUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value, window.location.href);
    return url.pathname + url.search;
  } catch {
    return String(value);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}