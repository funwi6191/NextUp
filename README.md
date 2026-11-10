# Next Up

A lightweight, offline-first student planner built with **HTML, CSS and vanilla JavaScript**. The planner needs no frontend libraries. An optional local Node.js server powers the OpenAI study assistant without exposing its API key to the browser.

## Files

- `index.html` — semantic app structure and forms
- `styles.css` — responsive styling, accessibility modes and print layout
- `app.js` — tasks, calendar, catch-up packs, storage, reminders and study tools
- `server.js` — local static server and server-side OpenAI Responses API proxy
- `sw.js` — offline cache
- `manifest.json` — install metadata

## Run locally

1. Download and extract the project folder.
2. Open a terminal in that folder.
3. Configure your OpenAI key in the server environment and start the app:

   ```bash
   $env:OPENAI_API_KEY="your-private-api-key"
   node server.js
   ```

   The server listens only on `127.0.0.1:8000` and requires Node.js 18 or newer. You can optionally set `OPENAI_MODEL` and `PORT`.

4. Visit `http://localhost:8000` in your browser. The planner works without the AI key, but assistant requests need a configured key and an internet connection.

Do not put the OpenAI key in `app.js`, HTML, or any file served to the browser. The sign-in and registration screens are explicitly **local demo UI only**: account records stay in this browser, and they do not protect planner data from someone with access to the device or browser tools. Do not use real or reused passwords; use a real authentication backend before deploying for multiple users.

Voice input uses the browser's Speech Recognition API when available. Depending on the browser, speech recognition may use its own remote service. Recognized messages and selected task titles/deadlines are sent to OpenAI through the local server.

For a frontend-only preview, a static server may still be used, but the AI endpoint will not be available. Service workers and PWA installation require `localhost` or HTTPS.

## Install as a PWA

1. Host the files on an HTTPS site or run them on `localhost`.
2. Open the site in a supported browser.
3. Use the browser's Install / Add to Home Screen option. Some browsers show an in-app **Install app** button.
4. Open Next Up once while online so the service worker can cache the app shell. Then test by switching to airplane mode.

The app uses a lightweight local SVG icon listed in `manifest.json`.

## Free hosting with GitHub Pages

1. Create a GitHub repository (for example, `next-up`).
2. Upload the static app files (`index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.json` and `icon.svg`) to the repository root. Do not upload `server.js`; GitHub Pages cannot run it.
3. Open **Settings → Pages**.
4. Under Build and deployment, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
5. Wait for the published HTTPS URL and open it on your phone.

GitHub Pages serves static files only. The planner can be hosted there, but the AI assistant requires a separately deployed backend; never publish the API key with the static files. Do not use `file://` when testing offline/PWA features.

## Data and backups

- App data is stored locally in IndexedDB, with localStorage as a fallback.
- Use **Export my backup** regularly. Keep the downloaded JSON somewhere safe.
- Import a backup to replace the current device data, or import a teacher pack to add its tasks and classes.
- Planner data remains in this browser unless exported/shared. Assistant messages, the current timer, and selected task titles/deadlines are sent to OpenAI through the local server. Clearing browser site data can erase local data; exports are the backup.

## Features included

- Prioritized task feed (top three or all), task status, subject labels, milestone checklists
- Weekly class/deadline calendar and print stylesheet
- Missed-class catch-up packs, buddy notes, checklists and related-subject deadline extensions
- In-app deadline notices and optional browser notifications with quiet hours
- Pomodoro timer, study plan, weekly summary and wellbeing check-in
- Responsive YouTube study-video player that accepts valid YouTube links and loads playback on request
- Local support-contact fields, WhatsApp sharing, teacher assignment/class creation and JSON export/import
- Text size, high contrast, dark mode, low-data and dyslexia-friendly system-font options
- Text-to-speech and optional speech-to-text where browser APIs are available
- Local demo sign-in/registration and an OpenAI study assistant with browser voice input and simple voice commands
- English, isiZulu and Afrikaans starter translation strings

## Limitations and future upgrades

- **Notifications:** browser notifications are best-effort and run when the app is opened; browsers do not guarantee scheduled background delivery. Real SMS, email, push reminders and reliable background scheduling need a backend or push service.
- **Accounts:** the sign-in/registration UI is a local demo gate only, not authentication or data protection. Real accounts, syncing and shared class data need a secure backend.
- **AI assistant:** requires a Node.js server, an OpenAI API key configured server-side, internet access and an OpenAI account. The assistant receives the user's message and selected task details.
- **YouTube player:** requires an internet connection and an embeddable YouTube video. Playback uses YouTube's privacy-enhanced embed; YouTube may receive data when playback starts.
- **Catch-up content:** summaries, links and notes are entered by the student/teacher; the app does not automatically retrieve school LMS content.
- **Speech:** Web Speech API support and language quality vary by browser and device. Manual typing remains available.
- **WhatsApp:** sharing opens a `wa.me` link; the student chooses a contact and sends the message.
- **Accessibility:** the app includes keyboard support, semantic structure, focus indicators, responsive layout and user preferences, but WCAG 2.2 AA conformance requires formal testing with screen readers, contrast analyzers and real users with disabilities.
- **Offline:** the app shell is cached after a successful first visit. Browser storage can be evicted by the operating system, especially on low-storage phones, so regular JSON backups are important.
- **Calendar:** the weekly view displays the current week and the tasks/classes stored on this device; it is not connected to Google Calendar.

## Security and privacy

Planner content is stored locally. Assistant messages and selected task details are sent to OpenAI when using the assistant. The local demo login does not secure planner data. Text is escaped before being inserted into the DOM, imported JSON is parsed and validated at a basic format level, and no analytics or tracking is included. Do not put highly sensitive personal information into notes or assistant prompts.
