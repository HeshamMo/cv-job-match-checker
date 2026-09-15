// content.js
// Runs on LinkedIn pages. Extracts the currently-open job posting's
// title, company, and description text when asked by the popup.
//
// IMPORTANT: LinkedIn generates its CSS class names automatically
// (e.g. "_2fc5bc11"), and they change unpredictably between page loads
// and deployments — they cannot be relied on at all. Instead this
// targets things LinkedIn keeps stable for accessibility/testing
// purposes: data-testid attributes, semantic heading text, and
// document.title, with legacy class-based selectors kept only as a
// last-resort fallback for older/alternate layouts.

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function cleanText(t) {
  return (t || "").replace(/\u00A0/g, " ").trim();
}

// Strategy 1: data-testid attributes (most stable across redesigns).
function fromTestId(testId, minLength = 0) {
  const el = document.querySelector(`[data-testid="${testId}"]`);
  if (el && isVisible(el)) {
    const t = cleanText(el.innerText);
    if (t.length >= minLength) return t;
  }
  return "";
}

// Strategy 2: find a heading whose text matches one of the given
// patterns (e.g. "about the job"), then read the surrounding block
// that contains both the heading and the body text after it.
function fromHeadingText(patterns, minLength = 100) {
  const headings = document.querySelectorAll("h1, h2, h3, h4, strong, span");
  for (const h of headings) {
    const t = cleanText(h.innerText).toLowerCase();
    if (!t || t.length > 40) continue; // headings are short
    if (patterns.some((p) => t.includes(p))) {
      // Walk up a couple of ancestor levels looking for a container
      // whose total text is meaningfully longer than the heading alone
      // (i.e. it also contains the body text as a sibling/descendant).
      let node = h;
      for (let i = 0; i < 4 && node; i++) {
        node = node.parentElement;
        if (!node) break;
        const full = cleanText(node.innerText);
        if (full.length >= minLength && full.toLowerCase() !== t) {
          return full;
        }
      }
    }
  }
  return "";
}

// Strategy 3: legacy/known class names, kept as a fallback in case
// LinkedIn serves an older layout to some accounts/regions.
function fromLegacySelectors(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && isVisible(el)) {
      const t = cleanText(el.innerText);
      if (t) return t;
    }
  }
  return "";
}

// Strategy 4: the browser tab title, which LinkedIn sets to something
// like "Job Title | Company Name | LinkedIn" — useful as a last resort
// for title/company even when the page body can't be parsed.
function fromDocumentTitle() {
  const raw = cleanText(document.title).replace(/\s*\|\s*LinkedIn\s*$/i, "");
  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
  return parts;
}

function extractOnce() {
  let description = fromTestId("expandable-text-box", 80);

  if (!description) {
    description = fromHeadingText(
      ["about the job", "about this job", "job description", "about the role"],
      100
    );
  }

  if (!description) {
    description = fromLegacySelectors([
      "#job-details",
      ".jobs-description__content",
      ".jobs-box__html-content",
      ".jobs-description-content__text"
    ]);
  }

  let title = fromLegacySelectors(["h1"]);
  let company = fromTestId("job-details-company-name") || "";

  if (!title || !company) {
    const titleParts = fromDocumentTitle();
    if (!title && titleParts[0]) title = titleParts[0];
    if (!company && titleParts[1]) company = titleParts[1];
  }

  return {
    ok: Boolean(description),
    title: title || "Unknown title",
    company: company || "Unknown company",
    description,
    url: window.location.href
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// LinkedIn truncates some descriptions behind a span labelled "more".
// Expand it before reading the posting so both change detection and the
// match request use the complete description.
function expandJobDescription() {
  const moreSpan = [...document.querySelectorAll("span")]
    .find((el) => el.textContent.trim() === "more");
  if (!moreSpan || !isVisible(moreSpan)) return false;

  moreSpan.click();
  return true;
}

// LinkedIn is a single-page app that lazy-renders content, so the
// description panel may not exist in the DOM yet the instant we're
// asked. Poll for a few seconds before giving up.
async function extractJobPosting(maxWaitMs = 5000, intervalMs = 300) {
  const start = Date.now();
  if (expandJobDescription()) await sleep(intervalMs);
  let result = extractOnce();
  while (!result.ok && Date.now() - start < maxWaitMs) {
    await sleep(intervalMs);
    result = extractOnce();
  }
  return result;
}

let lastJobFingerprint = "";
let jobChangeTimer = null;

function getJobFingerprint(job) {
  return [job.title, job.company, job.description, job.url]
    .map((value) => cleanText(value).replace(/\s+/g, " ").toLowerCase())
    .join("\u001f");
}

async function notifyIfJobChanged() {
  // Allow the DOM to render the expanded content after clicking "more".
  if (expandJobDescription()) await sleep(300);

  const job = extractOnce();
  if (!job.ok) return;

  const fingerprint = getJobFingerprint(job);
  if (fingerprint === lastJobFingerprint) return;

  lastJobFingerprint = fingerprint;
  chrome.runtime.sendMessage({ type: "JOB_CHANGED", job }).catch(() => { });
}

function scheduleJobChangeCheck() {
  clearTimeout(jobChangeTimer);
  jobChangeTimer = setTimeout(notifyIfJobChanged, 800);
}

const jobObserver = new MutationObserver(scheduleJobChangeCheck);
jobObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
scheduleJobChangeCheck();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "EXTRACT_JOB") {
    extractJobPosting().then(sendResponse);
    return true; // keep the message channel open for the async response
  }
  return false;
});
