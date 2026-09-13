// popup.js

const $ = (id) => document.getElementById(id);

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $(tab.dataset.tab).classList.add("active");
  });
});

// ---------- Load saved state ----------
chrome.storage.local.get(
  [
    "cvText",
    "provider",
    "anthropicKey",
    "anthropicModel",
    "openaiKey",
    "openaiModel",
    "groqKey",
    "groqModel"
  ],
  (data) => {
    if (data.cvText) $("cvText").value = data.cvText;
    if (data.anthropicKey) $("anthropicKey").value = data.anthropicKey;
    if (data.anthropicModel) $("anthropicModel").value = data.anthropicModel;
    if (data.openaiKey) $("openaiKey").value = data.openaiKey;
    if (data.openaiModel) $("openaiModel").value = data.openaiModel;
    if (data.groqKey) $("groqKey").value = data.groqKey;
    if (data.groqModel) $("groqModel").value = data.groqModel;
    const provider = data.provider || "anthropic";
    $("provider").value = provider;
    toggleProviderFields(provider);
  }
);

function toggleProviderFields(provider) {
  $("anthropicFields").style.display = provider === "anthropic" ? "block" : "none";
  $("openaiFields").style.display = provider === "openai" ? "block" : "none";
  $("groqFields").style.display = provider === "groq" ? "block" : "none";
}

$("provider").addEventListener("change", (e) => toggleProviderFields(e.target.value));

// ---------- Save CV ----------
$("cvFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $("cvText").value = reader.result;
  };
  reader.readAsText(file);
});

$("saveCvBtn").addEventListener("click", () => {
  const cvText = $("cvText").value.trim();
  const statusEl = $("cvStatus");
  if (!cvText) {
    statusEl.textContent = "Please paste or upload your CV text first.";
    statusEl.className = "status error";
    return;
  }
  chrome.storage.local.set({ cvText }, () => {
    statusEl.textContent = "CV saved. You only need to do this once.";
    statusEl.className = "status ok";
  });
});

// ---------- Save settings ----------
$("saveSettingsBtn").addEventListener("click", () => {
  const provider = $("provider").value;
  const statusEl = $("settingsStatus");

  const anthropicKey = $("anthropicKey").value.trim();
  const anthropicModel = $("anthropicModel").value;
  const openaiKey = $("openaiKey").value.trim();
  const openaiModel = $("openaiModel").value;
  const groqKey = $("groqKey").value.trim();
  const groqModel = $("groqModel").value;

  if (provider === "anthropic" && !anthropicKey) {
    statusEl.textContent = "Please enter your Anthropic API key.";
    statusEl.className = "status error";
    return;
  }
  if (provider === "openai" && !openaiKey) {
    statusEl.textContent = "Please enter your OpenAI API key.";
    statusEl.className = "status error";
    return;
  }
  if (provider === "groq" && !groqKey) {
    statusEl.textContent = "Please enter your Groq API key.";
    statusEl.className = "status error";
    return;
  }

  chrome.storage.local.set(
    { provider, anthropicKey, anthropicModel, openaiKey, openaiModel, groqKey, groqModel },
    () => {
      statusEl.textContent = "Settings saved.";
      statusEl.className = "status ok";
    }
  );
});

// ---------- Check match ----------
// ---------- Check match ----------
let matchInProgress = false;
let pendingMatch = null;

$("checkBtn").addEventListener("click", () => runMatchCheck());

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "JOB_CHANGED" || !sender.tab?.id) return;

  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab?.id === sender.tab.id) runMatchCheck(sender.tab.id, message.job);
  });
});

runMatchCheck();

async function runMatchCheck(tabId, knownJob) {
  if (matchInProgress) {
    pendingMatch = { tabId, knownJob };
    return;
  }

  matchInProgress = true;
  const statusEl = $("checkStatus");
  const resultEl = $("result");
  resultEl.style.display = "none";
  statusEl.className = "status";

  try {
    const settings = await chrome.storage.local.get([
      "cvText",
      "provider",
      "anthropicKey",
      "anthropicModel",
      "openaiKey",
      "openaiModel",
      "groqKey",
      "groqModel"
    ]);
    const { cvText } = settings;
    const provider = settings.provider || "anthropic";

    if (!cvText) {
      statusEl.textContent = 'No CV saved yet. Go to the "My CV" tab first.';
      statusEl.className = "status error";
      return;
    }
    const apiKey =
      provider === "openai" ? settings.openaiKey : provider === "groq" ? settings.groqKey : settings.anthropicKey;
    if (!apiKey) {
      statusEl.textContent = 'No API key saved yet. Go to the "Settings" tab first.';
      statusEl.className = "status error";
      return;
    }

    statusEl.textContent = knownJob ? "Job changed. Checking match..." : "Reading job posting from the page...";

    let tab;
    if (tabId) {
      tab = await chrome.tabs.get(tabId);
    } else {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    }
    if (!tab || !tab.url || !tab.url.includes("linkedin.com")) {
      statusEl.textContent = "Open a LinkedIn job posting tab first.";
      statusEl.className = "status error";
      return;
    }

    let job = knownJob;
    try {
      if (!job) job = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_JOB" });
    } catch (err) {
      // Content script probably isn't injected yet (e.g. the tab was open
      // before the extension was installed/reloaded). Inject it now and retry.
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });
        job = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_JOB" });
      } catch (err2) {
        statusEl.textContent = "Couldn't read this page. Reload the LinkedIn tab and try again.";
        statusEl.className = "status error";
        return;
      }
    }

    if (!job || !job.ok || !job.description) {
      statusEl.textContent = "Couldn't find a job description on this page. Open a specific job posting.";
      statusEl.className = "status error";
      return;
    }

    const providerLabel = provider === "openai" ? "ChatGPT" : provider === "groq" ? "Groq" : "Claude";
    statusEl.textContent = `Asking ${providerLabel} to compare your CV to this job...`;

    let analysis;
    if (provider === "openai") {
      analysis = await getMatchFromChatGPT({
        apiKey,
        model: settings.openaiModel || "gpt-5.4-mini",
        cvText,
        job
      });
    } else if (provider === "groq") {
      analysis = await getMatchFromGroqWithFallback({
        apiKey,
        selectedModel: settings.groqModel || "auto",
        cvText,
        job,
        onRetry: (model) => {
          statusEl.textContent = `Groq model unavailable. Trying ${model}...`;
        }
      });
    } else {
      analysis = await getMatchFromClaude({
        apiKey,
        model: settings.anthropicModel || "claude-sonnet-5",
        cvText,
        job
      });
    }
    renderResult(job, analysis);
    statusEl.textContent = "Done.";
    statusEl.className = "status ok";
  } catch (err) {
    statusEl.textContent = "Error: " + err.message;
    statusEl.className = "status error";
  } finally {
    matchInProgress = false;
    if (pendingMatch) {
      const nextMatch = pendingMatch;
      pendingMatch = null;
      setTimeout(() => runMatchCheck(nextMatch.tabId, nextMatch.knownJob), 0);
    }
  }
}

const SYSTEM_PROMPT = `You are an expert technical recruiter. Compare the candidate's CV to the job posting.
Respond with ONLY a raw JSON object (no markdown fences, no preamble) matching exactly this shape:
{"percentage": <integer 0-100>, "summary": "<2-3 sentence explanation>", "requiredExperienceYears": <number or null>, "experienceSuitability": "suitable" or "not suitable", "strengths": ["...", "..."], "gaps": ["...", "..."]}
"percentage" reflects how well the candidate's experience, skills, and background fit the role's requirements.
Be honest and specific rather than generous. List at most 5 items in each of "strengths" and "gaps".
For "requiredExperienceYears", identify the highest minimum number of years of experience explicitly required by the job posting. Use null when no minimum years requirement is stated.
Set "experienceSuitability" to "suitable" only when requiredExperienceYears is null or less than or equal to 3. Set it to "not suitable" when requiredExperienceYears is greater than 3. Always include both experience fields.`;

const GROQ_FREE_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
  "moonshotai/kimi-k2-instruct"
];

function getGroqModelOrder(selectedModel) {
  if (!selectedModel || selectedModel === "auto") return [...GROQ_FREE_MODELS];
  return [selectedModel, ...GROQ_FREE_MODELS.filter((model) => model !== selectedModel)];
}

function canRetryWithAnotherGroqModel(error) {
  return [400, 404, 408, 429, 500, 502, 503, 504].includes(error.status);
}

async function getMatchFromGroqWithFallback({ apiKey, selectedModel, cvText, job, onRetry }) {
  const models = getGroqModelOrder(selectedModel);
  let lastError;

  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    try {
      return await getMatchFromGroq({ apiKey, model, cvText, job });
    } catch (error) {
      lastError = error;
      const hasNextModel = index < models.length - 1;
      if (!hasNextModel || !canRetryWithAnotherGroqModel(error)) throw error;
      onRetry(models[index + 1]);
    }
  }

  throw lastError;
}

function buildUserPrompt(cvText, job) {
  return `JOB TITLE: ${job.title}
COMPANY: ${job.company}

JOB DESCRIPTION:
${job.description}

CANDIDATE CV:
${cvText}`;
}

async function getMatchFromClaude({ apiKey, model, cvText, job }) {
  const userPrompt = buildUserPrompt(cvText, job);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }]
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API request failed (${response.status}). ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text response from model.");

  return parseModelJson(textBlock.text);
}

async function getMatchFromChatGPT({ apiKey, model, cvText, job }) {
  const userPrompt = buildUserPrompt(cvText, job);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API request failed (${response.status}). ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("No text response from model.");

  return parseModelJson(content);
}

function parseModelJson(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error("Could not parse the model's response.");
  }
}

async function getMatchFromGroq({ apiKey, model, cvText, job }) {
  const userPrompt = buildUserPrompt(cvText, job);

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        // Groq's OpenAI-compatible endpoint doesn't reliably support
        // response_format across all models, so we ask for JSON in the
        // prompt itself and parse defensively instead.
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    const error = new Error(`API request failed (${response.status}). ${errBody.slice(0, 200)}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("No text response from model.");

  return parseModelJson(content);
}

function renderResult(job, analysis) {
  $("jobMeta").textContent = `${job.title} \u2014 ${job.company}`;
  const pct = Math.max(0, Math.min(100, Math.round(analysis.percentage || 0)));
  $("scoreValue").textContent = pct + "%";
  $("barFill").style.width = pct + "%";
  $("summaryText").textContent = analysis.summary || "";

  const requiredYears = Number(analysis.requiredExperienceYears);
  const hasValidRequiredYears = analysis.requiredExperienceYears === null || Number.isFinite(requiredYears);
  const aiSuitability = analysis.experienceSuitability === "suitable";
  const experienceEl = $("experienceSuitability");
  const isSuitable = hasValidRequiredYears && (analysis.requiredExperienceYears === null || requiredYears <= 3) && aiSuitability;
  experienceEl.textContent = isSuitable ? "suitable" : "not suitable";
  experienceEl.className = `experience-value ${isSuitable ? "suitable" : "not-suitable"}`;

  const strengthsList = $("strengthsList");
  strengthsList.innerHTML = "";
  (analysis.strengths || []).forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s;
    strengthsList.appendChild(li);
  });

  const gapsList = $("gapsList");
  gapsList.innerHTML = "";
  (analysis.gaps || []).forEach((g) => {
    const li = document.createElement("li");
    li.textContent = g;
    gapsList.appendChild(li);
  });

  $("result").style.display = "block";
}
