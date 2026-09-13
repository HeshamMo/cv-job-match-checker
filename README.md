# CV ↔ Job Match Checker (Chrome Extension)

Saves your CV once, then gives you an AI-generated match percentage for any job you open on LinkedIn.

## Install (unpacked, ~1 minute)

1. Unzip this folder somewhere permanent (don't delete it after installing — Chrome loads it from here).
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped `cv-job-match` folder.
5. Pin the extension (puzzle-piece icon in the toolbar → pin) so it's easy to reach.

The extension opens in Chrome's Side Panel, which stays open while you browse between tabs. Click the pinned extension icon to show it again if you close the panel. This requires Chrome 116 or newer.

## Set up

1. Click the extension icon → **Settings** tab → choose a provider:
   - **Groq (free tier)**: get a key at https://console.groq.com/keys — genuinely free, no credit card needed, gated only by rate limits (30 requests/min, 250/day at time of writing). Best choice if you don't want to pay anything.
   - **OpenAI (ChatGPT)**: get a key at https://platform.openai.com/api-keys.
   - **Anthropic (Claude)**: get a key at https://console.anthropic.com.
   Paste the key, pick a model, and click **Save settings**. OpenAI and Anthropic are paid-per-use APIs (a check costs a fraction of a cent to a few cents); Groq's listed models are free. **Automatic failover** tries the selected/free model pool in order and switches models when Groq returns a rate-limit or model-availability error.
2. Go to the **My CV** tab → paste your CV text (or upload a `.txt` file) → **Save CV**. You only do this once; it's stored locally in your browser.

You can switch providers anytime in Settings — all three sets of keys/models are saved separately, so switching back and forth doesn't lose anything.

## Use it

1. Open any job posting on LinkedIn (`linkedin.com/jobs/...`).
2. Click the extension icon to open the Side Panel. When LinkedIn finishes loading a different job description, the extension automatically runs the match check.
3. You'll get a percentage, a short explanation, and lists of your strengths vs. gaps for that specific role. You can still click **Check match for this job** manually.

## Notes & limitations

- Your CV and API key are stored only in `chrome.storage.local` on your machine — never sent anywhere except directly to Anthropic's API when you click "Check match."
- LinkedIn periodically changes its page structure; if extraction stops working, the CSS selectors in `content.js` may need updating.
- Works on the job detail view (where a description panel is visible). It won't work on the search results list view.
- If you get "Couldn't find a job description" right after installing or updating the extension, refresh the LinkedIn tab once — content scripts only auto-inject into tabs opened *after* the extension is loaded (the popup now also tries to inject it on the fly automatically).
- If it still fails on a job page you can clearly see, LinkedIn likely changed its markup again — open DevTools (F12) on the job page, right-click the description text → Inspect, and note the surrounding element's class/id so `content.js` can be updated to match it.
- PDF/Word CVs: open the file, select all, copy, and paste the text into the CV tab. There's no built-in file parser for PDF/DOCX.
- Each check makes one API call to whichever provider you selected, using the model you pick in Settings.
   - **Groq**: free, rate-limited rather than credit-limited. The model menu includes the available free-tier pool, and **Automatic failover** can switch between them after a 429 or unavailable-model response. If every model is rate-limited, wait for the limit window to reset and try again.
  - **OpenAI**: gpt-5.4-mini has the most headroom on typical free/trial usage tiers (50 requests/day, 100,000 tokens/minute); gpt-5.5 and gpt-5.5-pro are capped at just 3 requests/minute.
  - **Anthropic**: sonnet-5 is a good default; haiku-4.5 is cheapest/fastest; opus-5 is most thorough. No free tier — requires purchased credits.
