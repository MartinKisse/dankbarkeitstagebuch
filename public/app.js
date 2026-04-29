import { supabase, supabaseAnonKey, supabaseUrl } from "./supabaseClient.js";
const statusText = document.querySelector("#status");
const greetingEl = document.querySelector("#personal-greeting");
const streakSummaryEl = document.querySelector("#streak-summary");
const authBar = document.querySelector(".auth-bar");
const tabButtons = document.querySelectorAll(".tab-button");
const entriesView = document.querySelector("#entries-view");
const calendarView = document.querySelector("#calendar-view");
const trashView = document.querySelector("#trash-view");
const calendarGrid = document.querySelector("#calendar-grid");
const calendarMonthLabel = document.querySelector("#calendar-month-label");
const calendarDayEntries = document.querySelector("#calendar-day-entries");
const calendarPrevButton = document.querySelector("#calendar-prev");
const calendarNextButton = document.querySelector("#calendar-next");
const calendarTodayButton = document.querySelector("#calendar-today");
const trashEntriesContainer = document.querySelector("#trash-entries");
const trashBackButton = document.querySelector("#trash-back-button");
const entriesContainer = document.querySelector("#entries");
const refreshButton = document.querySelector("#refresh-button");
const recordButton = document.querySelector("#record-button");
const recordingVisualizer = document.querySelector("#recording-visualizer");
const visualizerCanvas = document.querySelector("#visualizer-canvas");
const visualizerContext = visualizerCanvas.getContext("2d");
const recordingPreview = document.querySelector("#recording-preview");
const recordingAudio = document.querySelector("#recording-audio");
const discardRecordingButton = document.querySelector("#discard-recording-button");
const transcribeRecordingButton = document.querySelector("#transcribe-recording-button");
const entryDateInput = document.querySelector("#entry-date");
const entryDateTodayButton = document.querySelector("#entry-date-today");
const entryDateYesterdayButton = document.querySelector("#entry-date-yesterday");
const draftEditor = document.querySelector("#draft-editor");
const draftBullets = document.querySelector("#draft-bullets");
const draftOriginalText = document.querySelector("#draft-original-text");
const draftOriginalDetails = document.querySelector("#draft-original-details");
const discardDraftButton = document.querySelector("#discard-draft-button");
const saveDraftButton = document.querySelector("#save-draft-button");
const recordingControls = document.querySelector(".recording-controls");
const helpButton = document.querySelector("#help-button");
const helpModal = document.querySelector("#help-modal");
const helpCloseButton = document.querySelector("#help-close-button");
const manualEntryButton = document.createElement("button");

let mediaRecorder = null;
let recordedChunks = [];
let recordingStream = null;
let isRecording = false;
let audioContext = null;
let analyser = null;
let mediaSourceNode = null;
let visualizerFrameId = null;
let smoothedVolume = 0;
let silentSince = null;
let waveformHistory = [];
let lastWaveformSampleAt = 0;
let recordedBlob = null;
let recordedAudioUrl = null;
let recordedAudioFile = null;
let currentDraft = null;
let savedDraftFingerprint = "";
let currentSession = null;
let currentUser = null;
let currentView = "entries";
let calendarMonth = new Date();
let calendarEntriesByDay = new Map();
let selectedCalendarDay = getDayKey(new Date());
let minCalendarMonth = null;
let returnToCalendarDayAfterSave = null;
let helpReturnFocusElement = null;

const MODE_KEY = "gratitude_mode";
const LEGACY_DEMO_MODE_KEY = "gratitude_demo_mode";
const DEMO_ENTRIES_KEY = "gratitude_demo_entries";
const DEMO_MODE_VALUE = "demo";

const SPEAKING_THRESHOLD = 0.035;
const VOLUME_SMOOTHING_FACTOR = 0.9;
const SILENCE_TIMEOUT_MS = 60_000;
const WAVEFORM_HISTORY_SIZE = 160;
const WAVEFORM_SAMPLE_INTERVAL_MS = 80;
const WAVEFORM_MIN_LEVEL = 0.08;

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeStyle: "short",
});

const dayFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const entryDateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const calendarMonthFormatter = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});

const deletedAtFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

manualEntryButton.id = "manual-entry-button";
manualEntryButton.className = "secondary-button";
manualEntryButton.type = "button";
manualEntryButton.textContent = "\u270d\ufe0f Selbst schreiben";
recordButton.textContent = "\ud83c\udfa4 Eintrag sprechen";
recordingControls?.append(manualEntryButton);

async function loginWithGoogle() {
  try {
    disableDemoMode();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error(error);
    setStatus("Login fehlgeschlagen.", "error");
  }
}

window.loginWithGoogle = loginWithGoogle;

function isDemoModeActive() {
  return localStorage.getItem(MODE_KEY) === DEMO_MODE_VALUE;
}

function hasAuthCallback() {
  return (
    window.location.hash.includes("access_token=") ||
    window.location.hash.includes("refresh_token=") ||
    window.location.hash.includes("error=")
  );
}

function enableDemoMode() {
  localStorage.setItem(MODE_KEY, DEMO_MODE_VALUE);
  localStorage.removeItem(LEGACY_DEMO_MODE_KEY);
}

function ensureDefaultDemoMode() {
  if (localStorage.getItem(LEGACY_DEMO_MODE_KEY) === "true") {
    enableDemoMode();
    return;
  }

  if (!localStorage.getItem(MODE_KEY) && !hasAuthCallback()) {
    enableDemoMode();
  }
}

function hasJournalAccess() {
  return isDemoModeActive() || Boolean(currentUser && currentSession?.access_token);
}

function readDemoRows() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEMO_ENTRIES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Demo-Eintraege konnten nicht gelesen werden.", error);
    return [];
  }
}

function writeDemoRows(rows) {
  localStorage.setItem(DEMO_ENTRIES_KEY, JSON.stringify(rows));
}

function createLocalId() {
  return globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function disableDemoMode() {
  localStorage.removeItem(MODE_KEY);
  localStorage.removeItem(LEGACY_DEMO_MODE_KEY);
}

async function startDemoMode() {
  enableDemoMode();
  currentSession = null;
  currentUser = null;
  cleanAuthHashFromUrl();
  await applySession(null);
  setStatus("Testmodus aktiv.", "success");
}

async function useRealAccount() {
  disableDemoMode();
  await loginWithGoogle();
}

async function clearDemoEntries() {
  if (!confirm("Lokale Testdaten wirklich l\u00f6schen?")) {
    return;
  }

  localStorage.removeItem(DEMO_ENTRIES_KEY);
  await refreshJournalViews();
  setStatus("Lokale Testdaten gel\u00f6scht.", "success");
}

function cleanAuthHashFromUrl() {
  if (
    window.location.hash.includes("access_token=") ||
    window.location.hash.includes("refresh_token=") ||
    window.location.hash.includes("error=")
  ) {
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname,
    );
  }
}

async function logout() {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    cleanAuthHashFromUrl();
    enableDemoMode();
    await applySession(null);
    setStatus("Ausgeloggt. Testmodus aktiv.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Logout fehlgeschlagen.", "error");
  }
}

function renderDemoBanner() {
  document.querySelector(".demo-mode-banner")?.remove();

  if (!isDemoModeActive()) {
    return;
  }

  const banner = document.createElement("div");
  banner.className = "demo-mode-banner";

  const message = document.createElement("p");
  message.innerHTML = "⚠️ Du nutzt gerade die Testversion. Deine Einträge können verloren gehen. <br> Wenn du deine Einträge behalten möchtest, melde dich bitte an.";

  const actions = document.createElement("div");
  actions.className = "demo-mode-banner-actions";

  const accountButton = document.createElement("button");
  accountButton.type = "button";
  accountButton.textContent = "Mit Google anmelden";
  accountButton.addEventListener("click", useRealAccount);

  actions.append(accountButton);
  banner.append(message, actions);
  document.body.prepend(banner);
}

function renderAuthState(user) {
  authBar.innerHTML = "";
  renderDemoBanner();

  if (isDemoModeActive()) {
    return;
  }

  if (!user) {
    const loginButton = document.createElement("button");
    loginButton.type = "button";
    loginButton.textContent = "Mit Google anmelden";
    loginButton.addEventListener("click", loginWithGoogle);

    const demoButton = document.createElement("button");
    demoButton.className = "secondary-button";
    demoButton.type = "button";
    demoButton.textContent = "Ohne Login testen";
    demoButton.addEventListener("click", startDemoMode);

    const demoHint = document.createElement("p");
    demoHint.className = "demo-mode-hint";
    demoHint.textContent = "Im Testmodus werden deine Eintr\u00e4ge nur in diesem Browser gespeichert. Es wird kein Konto erstellt und nichts in der Datenbank gespeichert.";

    const legalHint = document.createElement("p");
    legalHint.className = "legal-hint";
    legalHint.append("Mit dem Login akzeptierst du unsere ");

    const legalLink = document.createElement("a");
    legalLink.href = "/legal.html";
    legalLink.textContent = "Datenschutzbestimmungen";
    legalHint.append(legalLink, ".");

    authBar.append(loginButton, demoButton, demoHint, legalHint);
    return;
  }

  const userLabel = document.createElement("span");
  userLabel.textContent = `Eingeloggt als ${user.email}`;

  const logoutButton = document.createElement("button");
  logoutButton.type = "button";
  logoutButton.textContent = "Logout";
  logoutButton.addEventListener("click", logout);

  authBar.append(userLabel, logoutButton);
}

function getFirstName(user) {
  return (
    user?.user_metadata?.given_name ||
    user?.user_metadata?.full_name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    ""
  );
}

function renderGreeting(user) {
  if (user) {
    const firstName = getFirstName(user);
    greetingEl.innerHTML = `Hallo ${firstName}.<br>Wof\u00fcr bist du heute dankbar?`;
  } else {
    greetingEl.innerHTML = "Hallo!<br>Wof\u00fcr bist du heute dankbar?";
  }
}

async function applySession(session) {
  const hadAccess = hasJournalAccess();
  currentSession = session;
  currentUser = session?.user ?? null;
  renderAuthState(currentUser);
  renderGreeting(currentUser);

  if (hasJournalAccess() && statusText.textContent === "Bitte melde dich zuerst an.") {
    setStatus("");
  }

  await loadEntries();
  await loadCalendarBounds();
  await loadEntriesForMonth();
  await loadTrashEntries();

  if (hasJournalAccess() && !hadAccess) {
    switchView("entries");
  } else if (!hasJournalAccess()) {
    switchView("entries");
    renderCalendar();
    renderDayEntries(selectedCalendarDay);
    renderTrashEntries([]);
  }
}

async function initializeAuth() {
  ensureDefaultDemoMode();

  if (isDemoModeActive()) {
    await applySession(null);
    cleanAuthHashFromUrl();
    return;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error(error);
    await applySession(null);
    setStatus("Session konnte nicht gelesen werden.", "error");
    return;
  }

  if (data.session) {
    disableDemoMode();
  }

  await applySession(data.session);
  cleanAuthHashFromUrl();
}

function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = `status ${type}`.trim();
}

function getHelpFocusableElements() {
  return [...helpModal.querySelectorAll("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])")]
    .filter((element) => !element.disabled && element.offsetParent !== null);
}

function openHelpModal() {
  helpReturnFocusElement = document.activeElement;
  helpModal.hidden = false;
  document.body.classList.add("has-modal-open");
  helpCloseButton.focus();
}

function closeHelpModal() {
  helpModal.hidden = true;
  document.body.classList.remove("has-modal-open");

  if (helpReturnFocusElement) {
    helpReturnFocusElement.focus();
    helpReturnFocusElement = null;
  }
}

function handleHelpModalKeydown(event) {
  if (helpModal.hidden) {
    return;
  }

  if (event.key === "Escape") {
    closeHelpModal();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = getHelpFocusableElements();
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (!firstElement || !lastElement) {
    return;
  }

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

function switchView(viewName) {
  currentView = viewName;
  entriesView.hidden = viewName !== "entries";
  calendarView.hidden = viewName !== "calendar";
  trashView.hidden = viewName !== "trash";

  for (const button of tabButtons) {
    const isActive = button.dataset.view === viewName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  if (viewName === "calendar") {
    renderCalendar();
    renderDayEntries(selectedCalendarDay);
  }

  if (viewName === "trash") {
    loadTrashEntries().catch((error) => {
      console.error(error);
      setStatus(error.message || "Papierkorb konnte nicht geladen werden.", "error");
    });
  }
}

function getDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getEntryDayKey(entry) {
  if (typeof entry.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    return entry.date;
  }

  return getDayKey(new Date(entry.date));
}

function getDateInputValue(date) {
  return getDayKey(date);
}

function getTodayInputValue() {
  return getDateInputValue(new Date());
}

function getLocalDateFromDayKey(dayKey) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDaysToDayKey(dayKey, days) {
  const date = getLocalDateFromDayKey(dayKey);
  date.setDate(date.getDate() + days);
  return getDayKey(date);
}

function getCreatedAtDayKey(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : getDayKey(date);
}

function getMonthBounds(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start,
    end,
    startKey: getDayKey(start),
    endKey: getDayKey(end),
  };
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthKey(date) {
  return getDayKey(getMonthStart(date));
}

function isSameMonth(date, otherDate) {
  return date.getFullYear() === otherDate.getFullYear() && date.getMonth() === otherDate.getMonth();
}

function getMaxCalendarMonth() {
  return getMonthStart(new Date());
}

function getMinCalendarMonth() {
  return minCalendarMonth || getMaxCalendarMonth();
}

function clampCalendarMonth() {
  const minMonth = getMinCalendarMonth();
  const maxMonth = getMaxCalendarMonth();

  if (getMonthKey(calendarMonth) < getMonthKey(minMonth)) {
    calendarMonth = new Date(minMonth);
  }

  if (getMonthKey(calendarMonth) > getMonthKey(maxMonth)) {
    calendarMonth = new Date(maxMonth);
  }
}

function canGoToPreviousMonth() {
  return hasJournalAccess() && getMonthKey(calendarMonth) > getMonthKey(getMinCalendarMonth());
}

function canGoToNextMonth() {
  return hasJournalAccess() && getMonthKey(calendarMonth) < getMonthKey(getMaxCalendarMonth());
}

function getCalendarDayEntries(dayKey) {
  return calendarEntriesByDay.get(dayKey) || [];
}

function groupCalendarEntries(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const entry = mapJournalRowToEntry(row);
    const dayKey = getEntryDayKey(entry);
    if (!grouped.has(dayKey)) {
      grouped.set(dayKey, []);
    }
    grouped.get(dayKey).push(entry);
  }

  for (const entries of grouped.values()) {
    entries.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  return grouped;
}

function syncEntryDateLimit() {
  entryDateInput.max = getTodayInputValue();
}

function setEntryDateFromOffset(dayOffset) {
  syncEntryDateLimit();
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  entryDateInput.value = getDateInputValue(date);
}

function isFutureEntryDate(value) {
  return Boolean(value) && value > getTodayInputValue();
}

function getCreatedDayKey(entry) {
  return entry.createdAt ? getDayKey(new Date(entry.createdAt)) : getEntryDayKey(entry);
}

function isBackfilledEntry(entry) {
  return getEntryDayKey(entry) < getCreatedDayKey(entry);
}

function getStreakEntryDayKey(entry) {
  const value = entry.entry_date || entry.date;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : getDayKey(date);
}

function isEntryStreakEligible(entry) {
  if (entry.deleted_at || entry.deletedAt) {
    return false;
  }

  const entryDay = getStreakEntryDayKey(entry);
  const createdDay = getCreatedAtDayKey(entry.created_at || entry.createdAt);

  if (!entryDay || !createdDay) {
    return false;
  }

  return createdDay >= entryDay && createdDay <= addDaysToDayKey(entryDay, 2);
}

function getEligibleEntryDates(entries) {
  return new Set(entries.filter(isEntryStreakEligible).map(getStreakEntryDayKey));
}

function calculateCurrentStreak(entryDates) {
  const todayKey = getTodayInputValue();
  const yesterdayKey = addDaysToDayKey(todayKey, -1);
  const dateSet = entryDates instanceof Set ? entryDates : new Set(entryDates);

  let cursor = "";
  let todayOpen = false;

  if (dateSet.has(todayKey)) {
    cursor = todayKey;
  } else if (dateSet.has(yesterdayKey)) {
    cursor = yesterdayKey;
    todayOpen = true;
  } else {
    return { days: 0, todayOpen: false };
  }

  let days = 0;
  while (dateSet.has(cursor)) {
    days += 1;
    cursor = addDaysToDayKey(cursor, -1);
  }

  return { days, todayOpen };
}

function calculateLongestStreak(entryDates) {
  const sortedDates = [...entryDates].sort();
  let longest = 0;
  let current = 0;
  let previous = "";

  for (const dayKey of sortedDates) {
    current = previous && addDaysToDayKey(previous, 1) === dayKey ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = dayKey;
  }

  return longest;
}

function getStreakInfo(entries) {
  const eligibleDates = getEligibleEntryDates(entries);
  const current = calculateCurrentStreak(eligibleDates);
  return {
    currentDays: current.days,
    todayOpen: current.todayOpen,
    longestDays: calculateLongestStreak(eligibleDates),
  };
}

function renderStreakSummary(streakInfo) {
  streakSummaryEl.innerHTML = "";

  if (!currentUser || isDemoModeActive()) {
    streakSummaryEl.hidden = true;
    return;
  }

  streakSummaryEl.hidden = false;

  const infoButton = document.createElement("button");
  infoButton.className = "streak-info-button";
  infoButton.type = "button";
  infoButton.setAttribute("aria-label", "Dein Streak z\u00e4hlt Tage mit rechtzeitig erstellten Eintr\u00e4gen. Nachtr\u00e4ge z\u00e4hlen bis zu 2 Tage r\u00fcckwirkend.");
  infoButton.textContent = "\u24d8";

  const tooltip = document.createElement("span");
  tooltip.className = "streak-tooltip";
  tooltip.textContent = "Dein Streak z\u00e4hlt Tage mit rechtzeitig erstellten Eintr\u00e4gen. Nachtr\u00e4ge z\u00e4hlen bis zu 2 Tage r\u00fcckwirkend.";

  const text = document.createElement("span");
  if (!streakInfo.currentDays) {
    text.textContent = "Noch kein Streak - dein erster rechtzeitiger Eintrag startet ihn.";
    streakSummaryEl.append(text, infoButton, tooltip);
    return;
  }

  text.textContent = `\ud83c\udf31 ${streakInfo.currentDays} ${streakInfo.currentDays === 1 ? "Tag" : "Tage"} in Folge${streakInfo.todayOpen ? " - heute noch offen" : ""}`;
  streakSummaryEl.append(text, infoButton, tooltip);

  if (streakInfo.longestDays > streakInfo.currentDays) {
    const longest = document.createElement("small");
    longest.textContent = `L\u00e4ngster Streak: ${streakInfo.longestDays} Tage`;
    streakSummaryEl.append(longest);
  }
}

function formatDayHeading(dayKey) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dayKey === getDayKey(today)) {
    return "Heute";
  }

  if (dayKey === getDayKey(yesterday)) {
    return "Gestern";
  }

  return dayFormatter.format(date);
}

function groupEntriesByDay(entries) {
  const sortedEntries = [...entries].sort((a, b) => {
    const dateComparison = new Date(b.date) - new Date(a.date);
    if (dateComparison) {
      return dateComparison;
    }

    return new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date);
  });
  const groups = new Map();

  for (const entry of sortedEntries) {
    const dayKey = getEntryDayKey(entry);
    if (!groups.has(dayKey)) {
      groups.set(dayKey, []);
    }
    groups.get(dayKey).push(entry);
  }

  return [...groups.entries()];
}

function createEntryElement(entry) {
  const article = document.createElement("article");
  article.className = "entry";
  article.dataset.entryId = entry.id;

  const header = document.createElement("div");
  header.className = "entry-header";

  const meta = document.createElement("div");
  meta.className = "entry-meta";

  const time = document.createElement("time");
  time.dateTime = entry.date;
  time.textContent = entryDateFormatter.format(new Date(`${getEntryDayKey(entry)}T00:00:00`));

  meta.append(time);

  if (isBackfilledEntry(entry)) {
    const backfilledLabel = document.createElement("span");
    backfilledLabel.className = "entry-backfilled-label";
    const createdDate = new Date(entry.createdAt || entry.date);
    const createdLabel = new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
    }).format(createdDate);
    backfilledLabel.textContent = `Nachgetragen am ${createdLabel}`;
    meta.append(backfilledLabel);
  }

  const actions = document.createElement("div");
  actions.className = "entry-actions";

  const editButton = document.createElement("button");
  editButton.className = "text-button";
  editButton.type = "button";
  editButton.textContent = "Bearbeiten";
  editButton.addEventListener("click", () => showEditMode(article, entry));

  const deleteButton = document.createElement("button");
  deleteButton.className = "danger-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Löschen";
  deleteButton.addEventListener("click", () => deleteEntry(entry.id));

  actions.append(editButton, deleteButton);
  header.append(meta, actions);

  const list = document.createElement("ul");
  list.className = "entry-bullets";
  for (const bullet of entry.bullets || []) {
    const item = document.createElement("li");
    item.textContent = bullet;
    list.append(item);
  }

  article.append(header, list);

  if (entry.originalText) {
    const original = document.createElement("details");
    original.className = "entry-original";

    const summary = document.createElement("summary");
    summary.textContent = "Originaltext anzeigen";

    const originalText = document.createElement("p");
    originalText.className = "original-text";
    originalText.textContent = entry.originalText;

    original.append(summary, originalText);
    article.append(original);
  }

  return article;
}

function renderEntries(entries) {
  entriesContainer.innerHTML = "";

  const groupedEntries = groupEntriesByDay(entries);

  if (!groupedEntries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Noch keine Einträge vorhanden.";
    entriesContainer.append(empty);
    return;
  }

  for (const [dayKey, dayEntries] of groupedEntries) {
    const group = document.createElement("section");
    group.className = "day-group";

    const heading = document.createElement("h3");
    heading.className = "day-heading";
    heading.textContent = formatDayHeading(dayKey);

    const stack = document.createElement("div");
    stack.className = "day-entries";

    for (const entry of dayEntries) {
      stack.append(createEntryElement(entry));
    }

    group.append(heading, stack);
    entriesContainer.append(group);
  }
}

function mapJournalRowToEntry(row) {
  return {
    id: row.id,
    date: row.entry_date || row.created_at,
    createdAt: row.created_at,
    bullets: String(row.content || "").split("\n").filter(Boolean),
    originalText: row.transcript || "",
  };
}

function getVisibleDemoRows() {
  return readDemoRows()
    .filter((row) => row && typeof row === "object")
    .filter((row) => !row.deleted_at)
    .filter((row) => row.entry_date || row.created_at)
    .sort((a, b) => {
      const dateComparison = new Date(b.entry_date || b.created_at) - new Date(a.entry_date || a.created_at);
      if (dateComparison) {
        return dateComparison;
      }

      return new Date(b.created_at) - new Date(a.created_at);
    });
}

function getDeletedDemoRows() {
  return readDemoRows()
    .filter((row) => row && typeof row === "object")
    .filter((row) => row.deleted_at)
    .sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
}

function getDemoRowsForMonth() {
  const { startKey, endKey } = getMonthBounds(calendarMonth);
  return getVisibleDemoRows()
    .filter((row) => row.entry_date >= startKey && row.entry_date <= endKey)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

async function createEntry(entry) {
  if (isDemoModeActive()) {
    const now = new Date().toISOString();
    const row = {
      id: createLocalId(),
      entry_date: entry.entry_date,
      created_at: now,
      content: entry.content,
      transcript: entry.transcript || "",
      deleted_at: null,
    };
    writeDemoRows([row, ...readDemoRows()]);
    return row;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/journal_entries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseAnonKey,
      "Authorization": `Bearer ${currentSession.access_token}`,
      "Prefer": "return=representation",
    },
    body: JSON.stringify({
      user_id: currentUser.id,
      ...entry,
    }),
  });

  const responseText = await response.text();
  console.log("DIRECT INSERT RESPONSE", response.status, responseText);

  if (!response.ok) {
    throw new Error(responseText || "Eintrag konnte nicht gespeichert werden.");
  }

  return responseText ? JSON.parse(responseText)[0] : null;
}

async function updateEntry(id, patch) {
  if (isDemoModeActive()) {
    const rows = readDemoRows();
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) {
      throw new Error("Eintrag wurde nicht gefunden.");
    }

    rows[index] = {
      ...rows[index],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    writeDemoRows(rows);
    return rows[index];
  }

  const { error } = await supabase
    .from("journal_entries")
    .update(patch)
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    throw error;
  }

  return null;
}

async function softDeleteEntry(id) {
  return updateEntry(id, { deleted_at: new Date().toISOString() });
}

async function restoreEntryData(id) {
  return updateEntry(id, { deleted_at: null });
}

async function permanentlyDeleteEntryData(id) {
  if (isDemoModeActive()) {
    writeDemoRows(readDemoRows().filter((row) => row.id !== id || !row.deleted_at));
    return;
  }

  const { error } = await supabase
    .from("journal_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id)
    .not("deleted_at", "is", null);

  if (error) {
    throw error;
  }
}

async function loadEntries() {
  if (isDemoModeActive()) {
    const entries = getVisibleDemoRows().map(mapJournalRowToEntry);
    renderEntries(entries);
    renderStreakSummary(getStreakInfo(entries));
    return;
  }

  if (!currentUser || !currentSession?.access_token) {
    renderEntries([]);
    renderStreakSummary(getStreakInfo([]));
    return;
  }

  const query = new URLSearchParams({
    select: "*",
    deleted_at: "is.null",
    order: "entry_date.desc.nullslast,created_at.desc",
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/journal_entries?${query.toString()}`, {
    headers: {
      "apikey": supabaseAnonKey,
      "Authorization": `Bearer ${currentSession.access_token}`,
    },
  });

  const responseText = await response.text();
  console.log("LOAD ENTRIES RESPONSE", response.status, responseText);

  if (!response.ok) {
    throw new Error("Einträge konnten nicht geladen werden.");
  }

  const data = responseText ? JSON.parse(responseText) : [];
  const entries = data.map(mapJournalRowToEntry);
  renderEntries(entries);
  renderStreakSummary(getStreakInfo(entries));
}

async function loadCalendarBounds() {
  if (isDemoModeActive()) {
    const rows = getVisibleDemoRows().sort((a, b) => new Date(a.entry_date || a.created_at) - new Date(b.entry_date || b.created_at));
    if (!rows.length) {
      minCalendarMonth = getMaxCalendarMonth();
      calendarMonth = getMaxCalendarMonth();
      selectedCalendarDay = getTodayInputValue();
      return;
    }

    minCalendarMonth = getMonthStart(getLocalDateFromDayKey(rows[0].entry_date || getDayKey(new Date(rows[0].created_at))));
    clampCalendarMonth();
    return;
  }

  if (!currentUser || !currentSession?.access_token) {
    minCalendarMonth = null;
    calendarMonth = getMaxCalendarMonth();
    selectedCalendarDay = getTodayInputValue();
    return;
  }

  const query = new URLSearchParams({
    select: "entry_date,created_at",
    deleted_at: "is.null",
    order: "entry_date.asc.nullslast,created_at.asc",
    limit: "1",
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/journal_entries?${query.toString()}`, {
    headers: {
      "apikey": supabaseAnonKey,
      "Authorization": `Bearer ${currentSession.access_token}`,
    },
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error("Kalendergrenzen konnten nicht geladen werden.");
  }

  const data = responseText ? JSON.parse(responseText) : [];
  if (!data.length) {
    minCalendarMonth = getMaxCalendarMonth();
    calendarMonth = getMaxCalendarMonth();
    selectedCalendarDay = getTodayInputValue();
    return;
  }

  const firstEntryDate = data[0].entry_date
    ? getLocalDateFromDayKey(data[0].entry_date)
    : new Date(data[0].created_at);
  minCalendarMonth = getMonthStart(firstEntryDate);
  clampCalendarMonth();
}

async function loadEntriesForMonth() {
  if (isDemoModeActive()) {
    clampCalendarMonth();
    calendarEntriesByDay = groupCalendarEntries(getDemoRowsForMonth());
    renderCalendar();
    renderDayEntries(selectedCalendarDay);
    return;
  }

  if (!currentUser || !currentSession?.access_token) {
    calendarEntriesByDay = new Map();
    renderCalendar();
    renderDayEntries(selectedCalendarDay);
    return;
  }

  clampCalendarMonth();
  const { startKey, endKey } = getMonthBounds(calendarMonth);
  const query = new URLSearchParams({
    select: "*",
    entry_date: `gte.${startKey}`,
    deleted_at: "is.null",
    order: "created_at.asc",
  });
  query.append("entry_date", `lte.${endKey}`);

  const response = await fetch(`${supabaseUrl}/rest/v1/journal_entries?${query.toString()}`, {
    headers: {
      "apikey": supabaseAnonKey,
      "Authorization": `Bearer ${currentSession.access_token}`,
    },
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error("Kalendereinträge konnten nicht geladen werden.");
  }

  const data = responseText ? JSON.parse(responseText) : [];
  calendarEntriesByDay = groupCalendarEntries(data);
  renderCalendar();
  renderDayEntries(selectedCalendarDay);
}

function renderCalendar() {
  calendarGrid.innerHTML = "";
  clampCalendarMonth();
  calendarMonthLabel.textContent = calendarMonthFormatter.format(calendarMonth);
  calendarPrevButton.disabled = !canGoToPreviousMonth();
  calendarNextButton.disabled = !canGoToNextMonth();
  calendarTodayButton.disabled = !hasJournalAccess() || (isSameMonth(calendarMonth, new Date()) && selectedCalendarDay === getTodayInputValue());

  const { start, end } = getMonthBounds(calendarMonth);
  const firstWeekday = (start.getDay() + 6) % 7;
  const daysInMonth = end.getDate();
  const todayKey = getTodayInputValue();

  for (let index = 0; index < firstWeekday; index++) {
    const emptyDay = document.createElement("div");
    emptyDay.className = "calendar-day is-outside";
    calendarGrid.append(emptyDay);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    const dayKey = getDayKey(date);
    const dayEntries = getCalendarDayEntries(dayKey);
    const isFutureDay = dayKey > todayKey;
    const dayButton = document.createElement("button");
    dayButton.className = "calendar-day";
    dayButton.type = "button";
    dayButton.dataset.day = dayKey;
    dayButton.setAttribute("aria-label", `${entryDateFormatter.format(date)}, ${dayEntries.length} Einträge`);
    dayButton.disabled = isFutureDay || !hasJournalAccess();

    if (dayEntries.length) {
      dayButton.classList.add("has-entries");
    }

    if (isFutureDay) {
      dayButton.classList.add("is-disabled");
    }

    if (dayKey === todayKey) {
      dayButton.classList.add("is-today");
    }

    if (dayKey === selectedCalendarDay) {
      dayButton.classList.add("is-selected");
    }

    const dayNumber = document.createElement("span");
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = String(day);
    dayButton.append(dayNumber);

    if (dayEntries.length) {
      const count = document.createElement("span");
      count.className = "calendar-entry-count";
      count.textContent = String(dayEntries.length);
      dayButton.append(count);
    }

    dayButton.addEventListener("click", () => handleDayClick(dayKey));
    calendarGrid.append(dayButton);
  }
}

function handleDayClick(dayKey) {
  if (dayKey > getTodayInputValue()) {
    return;
  }

  selectedCalendarDay = dayKey;
  renderCalendar();
  renderDayEntries(dayKey);
}

function setNewEntryDate(dayKey) {
  syncEntryDateLimit();
  entryDateInput.value = dayKey;
}

function createCalendarEntryActions(dayKey) {
  const actions = document.createElement("div");
  actions.className = "calendar-new-entry-actions";

  const voiceButton = document.createElement("button");
  voiceButton.type = "button";
  voiceButton.textContent = "\ud83c\udfa4 Eintrag f\u00fcr diesen Tag sprechen";
  voiceButton.addEventListener("click", () => startCalendarVoiceEntry(dayKey));

  const writeButton = document.createElement("button");
  writeButton.className = "secondary-button";
  writeButton.type = "button";
  writeButton.textContent = "\u270d\ufe0f Selbst schreiben";
  writeButton.addEventListener("click", () => startCalendarManualEntry(dayKey));

  actions.append(voiceButton, writeButton);
  return actions;
}

function renderDayEntries(dayKey) {
  calendarDayEntries.innerHTML = "";

  const date = getLocalDateFromDayKey(dayKey);
  const heading = document.createElement("h3");
  heading.textContent = entryDateFormatter.format(date);
  calendarDayEntries.append(heading);

  const entries = getCalendarDayEntries(dayKey);
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Für diesen Tag gibt es noch keinen Eintrag.";
    calendarDayEntries.append(empty);
    calendarDayEntries.append(createCalendarEntryActions(dayKey));
    return;
  }

  const list = document.createElement("div");
  list.className = "calendar-entry-list";

  for (const entry of entries) {
    list.append(createEntryElement(entry));
  }

  calendarDayEntries.append(list);
  calendarDayEntries.append(createCalendarEntryActions(dayKey));
}

function renderTrashEntries(entries) {
  trashEntriesContainer.innerHTML = "";

  if (!hasJournalAccess()) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Bitte melde dich an, um den Papierkorb zu sehen.";
    trashEntriesContainer.append(empty);
    return;
  }

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Dein Papierkorb ist leer.";
    trashEntriesContainer.append(empty);
    return;
  }

  for (const entry of entries) {
    const article = document.createElement("article");
    article.className = "trash-entry";

    const header = document.createElement("div");
    header.className = "entry-header";

    const meta = document.createElement("div");
    meta.className = "entry-meta";

    const entryDate = document.createElement("time");
    entryDate.dateTime = entry.entry_date || entry.created_at;
    entryDate.textContent = entryDateFormatter.format(getLocalDateFromDayKey(entry.entry_date || getDayKey(new Date(entry.created_at))));
    meta.append(entryDate);

    if (entry.deleted_at) {
      const deletedLabel = document.createElement("span");
      deletedLabel.className = "entry-backfilled-label";
      deletedLabel.textContent = `Gelöscht am ${deletedAtFormatter.format(new Date(entry.deleted_at))}`;
      meta.append(deletedLabel);
    }

    const actions = document.createElement("div");
    actions.className = "entry-actions";

    const restoreButton = document.createElement("button");
    restoreButton.className = "secondary-button";
    restoreButton.type = "button";
    restoreButton.textContent = "Wiederherstellen";
    restoreButton.addEventListener("click", () => restoreEntry(entry.id));

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Endgültig löschen";
    deleteButton.addEventListener("click", () => permanentlyDeleteEntry(entry.id));

    actions.append(restoreButton, deleteButton);
    header.append(meta, actions);

    const list = document.createElement("ul");
    list.className = "entry-bullets";
    for (const bullet of String(entry.content || "").split("\n").filter(Boolean)) {
      const item = document.createElement("li");
      item.textContent = bullet;
      list.append(item);
    }

    if (!list.children.length) {
      const emptyContent = document.createElement("p");
      emptyContent.className = "original-text";
      emptyContent.textContent = "Kein Inhalt vorhanden.";
      article.append(header, emptyContent);
    } else {
      article.append(header, list);
    }

    trashEntriesContainer.append(article);
  }
}

async function loadTrashEntries() {
  if (isDemoModeActive()) {
    renderTrashEntries(getDeletedDemoRows());
    return;
  }

  if (!currentUser || !currentSession?.access_token) {
    renderTrashEntries([]);
    return;
  }

  const { data, error } = await supabase
    .from("journal_entries")
    .select("id,entry_date,created_at,content,deleted_at")
    .eq("user_id", currentUser.id)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    console.error(error);
    throw new Error("Papierkorb konnte nicht geladen werden.");
  }

  renderTrashEntries(data || []);
}

async function refreshJournalViews() {
  await loadEntries();
  await loadCalendarBounds();
  await loadEntriesForMonth();
  await loadTrashEntries();
}

async function restoreEntry(id) {
  if (!hasJournalAccess()) {
    setStatus("Bitte melde dich zuerst an.", "error");
    return;
  }

  try {
    await restoreEntryData(id);
    setStatus("Eintrag wiederhergestellt.", "success");
    await refreshJournalViews();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Eintrag konnte nicht wiederhergestellt werden.", "error");
  }
}

async function permanentlyDeleteEntry(id) {
  if (!hasJournalAccess()) {
    setStatus("Bitte melde dich zuerst an.", "error");
    return;
  }

  if (!confirm("Diesen Eintrag endgültig löschen? Das kann nicht rückgängig gemacht werden.")) {
    return;
  }

  try {
    await permanentlyDeleteEntryData(id);
    setStatus("Eintrag endgültig gelöscht.", "success");
    await loadTrashEntries();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Eintrag konnte nicht endgültig gelöscht werden.", "error");
  }
}

function setProcessing(isProcessing) {
  manualEntryButton.disabled = isProcessing;
  recordButton.disabled = isProcessing;
  discardRecordingButton.disabled = isProcessing || !recordedAudioFile;
  transcribeRecordingButton.disabled = isProcessing || !recordedAudioFile;
  discardDraftButton.disabled = isProcessing || !currentDraft;
  saveDraftButton.disabled = isProcessing || !currentDraft;
}

function clearDraftEditor() {
  currentDraft = null;
  savedDraftFingerprint = "";
  draftBullets.value = "";
  draftOriginalText.textContent = "";
  draftOriginalDetails.open = false;
  draftEditor.hidden = true;
  discardDraftButton.disabled = true;
  saveDraftButton.disabled = true;
}

function showDraftEditor(draft) {
  const normalizedDraft = {
    originalText: String(draft.originalText || "").trim(),
    bullets: (draft.bullets || []).map((bullet) => String(bullet).trim()).filter(Boolean).slice(0, 5),
  };

  currentDraft = normalizedDraft;
  savedDraftFingerprint = JSON.stringify(normalizedDraft);
  draftBullets.value = normalizedDraft.bullets.join("\n");
  draftOriginalText.textContent = normalizedDraft.originalText || "Kein Originaltext vorhanden.";
  draftOriginalDetails.open = false;
  draftEditor.hidden = false;
  discardDraftButton.disabled = false;
  saveDraftButton.disabled = false;
}

function getEditedDraftBullets() {
  return normalizeBulletText(draftBullets.value);
}

function normalizeBulletText(value) {
  return value
    .split("\n")
    .map((bullet) => bullet.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function hasUnsavedDraftChanges() {
  if (!currentDraft) {
    return false;
  }

  return JSON.stringify({
    originalText: currentDraft.originalText,
    bullets: getEditedDraftBullets(),
  }) !== savedDraftFingerprint;
}

function confirmDiscardDraft() {
  if (!currentDraft || !hasUnsavedDraftChanges()) {
    return true;
  }

  return confirm("Es gibt einen ungespeicherten Entwurf. Möchtest du ihn verwerfen?");
}

function startManualEntry() {
  if (!hasJournalAccess()) {
    setStatus("Bitte melde dich zuerst an.", "error");
    return false;
  }

  if (!confirmDiscardDraft()) {
    return false;
  }

  clearRecordingPreview();
  showDraftEditor({ originalText: "", bullets: [] });
  draftBullets.focus();
  setStatus("Schreibe deine Stichpunkte und speichere den Eintrag.", "success");
  return true;
}

function prepareCalendarEntry(dayKey) {
  if (!hasJournalAccess()) {
    setStatus("Bitte melde dich zuerst an.", "error");
    return false;
  }

  if (isFutureEntryDate(dayKey)) {
    setStatus("Bitte w\u00e4hle kein Datum in der Zukunft.", "error");
    return false;
  }

  setNewEntryDate(dayKey);
  returnToCalendarDayAfterSave = dayKey;
  switchView("entries");
  return true;
}

async function startCalendarVoiceEntry(dayKey) {
  if (!prepareCalendarEntry(dayKey)) {
    return;
  }

  const started = await startVoiceRecording();
  if (!started) {
    returnToCalendarDayAfterSave = null;
  }
}

function startCalendarManualEntry(dayKey) {
  if (!prepareCalendarEntry(dayKey)) {
    return;
  }

  if (!startManualEntry()) {
    returnToCalendarDayAfterSave = null;
  }
}

function getRecordingMimeType() {
  const preferredTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function getRecordingFileExtension(mimeType) {
  if (mimeType.includes("mp4")) {
    return "m4a";
  }

  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  return "webm";
}

function clearRecordingPreview() {
  if (recordedAudioUrl) {
    URL.revokeObjectURL(recordedAudioUrl);
  }

  recordedBlob = null;
  recordedAudioUrl = null;
  recordedAudioFile = null;
  recordingAudio.pause();
  recordingAudio.removeAttribute("src");
  recordingAudio.load();
  recordingPreview.hidden = true;
  discardRecordingButton.disabled = true;
  transcribeRecordingButton.disabled = true;
}

function waitForMediaEvent(element, eventName, timeoutMs = 1200) {
  return new Promise((resolve) => {
    let timeoutId = null;

    const cleanup = () => {
      clearTimeout(timeoutId);
      element.removeEventListener(eventName, handleEvent);
    };

    const handleEvent = () => {
      cleanup();
      resolve();
    };

    timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    element.addEventListener(eventName, handleEvent, { once: true });
  });
}

function hasUsableAudioDuration(audioElement) {
  return Number.isFinite(audioElement.duration) && audioElement.duration > 0;
}

async function fixMediaRecorderDuration(audioElement) {
  if (hasUsableAudioDuration(audioElement)) {
    return;
  }

  try {
    audioElement.currentTime = Number.MAX_SAFE_INTEGER;
    await Promise.race([
      waitForMediaEvent(audioElement, "timeupdate", 1200),
      waitForMediaEvent(audioElement, "durationchange", 1200),
    ]);
  } catch {
    // Some browsers reject seeking before metadata is stable. The player still works once playback starts.
  } finally {
    try {
      audioElement.currentTime = 0;
    } catch {
      // Ignore browsers that still consider the MediaRecorder blob unseekable at this point.
    }
  }
}

async function prepareRecordingPreview(audioElement, audioUrl) {
  audioElement.pause();
  audioElement.preload = "metadata";
  audioElement.src = audioUrl;
  audioElement.load();

  await waitForMediaEvent(audioElement, "loadedmetadata");
  await fixMediaRecorderDuration(audioElement);

  try {
    audioElement.currentTime = 0;
  } catch {
    // Keep the preview available even if this browser delays duration calculation until playback.
  }
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) {
    return;
  }

  silentSince = null;
  setStatus("Aufnahme wird beendet ...");
  recordButton.disabled = true;
  mediaRecorder.stop();
}

function getSpeechState(volume) {
  return volume >= SPEAKING_THRESHOLD ? "speaking" : "silent";
}

function getCurrentVolumeLevel() {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);
  let sumSquares = 0;

  for (const value of data) {
    const normalized = (value - 128) / 128;
    sumSquares += normalized * normalized;
  }

  return Math.sqrt(sumSquares / data.length);
}

function fillRoundedRect(context, x, y, width, height, radius) {
  if (typeof context.roundRect === "function") {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fill();
    return;
  }

  context.fillRect(x, y, width, height);
}

function drawWaveformHistory() {
  const { width, height } = visualizerCanvas;
  const centerY = height / 2;
  const step = width / WAVEFORM_HISTORY_SIZE;
  const barWidth = Math.max(1, step * 0.58);

  visualizerContext.clearRect(0, 0, width, height);
  visualizerContext.fillStyle = "#2f7d6d";

  waveformHistory.forEach((level, index) => {
    const age = index / Math.max(1, WAVEFORM_HISTORY_SIZE - 1);
    const opacity = 0.28 + age * 0.72;
    const barHeight = Math.max(5, level * height * 0.86);
    const x = index * step + (step - barWidth) / 2;
    const y = centerY - barHeight / 2;

    visualizerContext.globalAlpha = opacity;
    fillRoundedRect(visualizerContext, x, y, barWidth, barHeight, barWidth / 2);
  });

  visualizerContext.globalAlpha = 1;
}

function drawVisualizer(timestamp = performance.now()) {
  if (!analyser || !isRecording) {
    return;
  }

  const rms = getCurrentVolumeLevel();
  smoothedVolume = VOLUME_SMOOTHING_FACTOR * smoothedVolume + (1 - VOLUME_SMOOTHING_FACTOR) * rms;
  const speechState = getSpeechState(smoothedVolume);
  const visibleLevel = Math.max(WAVEFORM_MIN_LEVEL, Math.min(1, smoothedVolume * 5));

  if (speechState === "silent") {
    silentSince ??= timestamp;
    if (isRecording && timestamp - silentSince >= SILENCE_TIMEOUT_MS) {
      stopRecording();
      return;
    }
  } else {
    silentSince = null;
  }

  if (timestamp - lastWaveformSampleAt >= WAVEFORM_SAMPLE_INTERVAL_MS) {
    waveformHistory.push(visibleLevel);
    waveformHistory = waveformHistory.slice(-WAVEFORM_HISTORY_SIZE);
    lastWaveformSampleAt = timestamp;
  }

  drawWaveformHistory();

  visualizerFrameId = requestAnimationFrame(drawVisualizer);
}

function startVisualizer(stream) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  stopVisualizer();
  audioContext = new AudioContextClass();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  smoothedVolume = 0;
  silentSince = null;
  lastWaveformSampleAt = 0;
  waveformHistory = Array(WAVEFORM_HISTORY_SIZE).fill(WAVEFORM_MIN_LEVEL);

  mediaSourceNode = audioContext.createMediaStreamSource(stream);
  mediaSourceNode.connect(analyser);

  recordingVisualizer.hidden = false;
  drawVisualizer();
}

function stopVisualizer() {
  if (visualizerFrameId) {
    cancelAnimationFrame(visualizerFrameId);
    visualizerFrameId = null;
  }

  if (mediaSourceNode) {
    mediaSourceNode.disconnect();
    mediaSourceNode = null;
  }

  analyser = null;
  silentSince = null;
  smoothedVolume = 0;
  lastWaveformSampleAt = 0;
  waveformHistory = [];
  recordingVisualizer.hidden = true;
  visualizerContext.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

async function uploadAudioFile(audioFile) {
  if (!confirmDiscardDraft()) {
    return false;
  }

  const formData = new FormData();
  formData.append("audio", audioFile);

  clearDraftEditor();
  setProcessing(true);
  setStatus("Verarbeite Audio und erstelle Entwurf...");

  try {
    const response = await fetch("/api/drafts", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Upload fehlgeschlagen.");
    }

    showDraftEditor(data);
    setStatus("Entwurf bereit. Du kannst die Stichpunkte bearbeiten und speichern.", "success");
    return true;
  } catch (error) {
    setStatus(error.message || "Beim Verarbeiten ist ein Fehler aufgetreten.", "error");
    return false;
  } finally {
    setProcessing(false);
  }
}

async function deleteEntry(id) {
  if (!confirm("Diesen Eintrag wirklich löschen?")) {
    return;
  }

  if (!hasJournalAccess()) {
    setStatus("Bitte melde dich zuerst an.", "error");
    return;
  }

  try {
    setStatus("Eintrag wird gelöscht ...");
    await softDeleteEntry(id);
    setStatus("Eintrag gelöscht.", "success");
    await refreshJournalViews();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Eintrag konnte nicht gelöscht werden.", "error");
  }
}

function showEditMode(article, entry) {
  article.classList.add("is-editing");
  article.innerHTML = "";

  const dateLabel = document.createElement("label");
  dateLabel.className = "edit-label";
  dateLabel.textContent = "Kalendertag";

  const dateInput = document.createElement("input");
  dateInput.className = "edit-date-input";
  dateInput.type = "date";
  dateInput.max = getTodayInputValue();
  dateInput.value = getEntryDayKey(entry);

  const label = document.createElement("label");
  label.className = "edit-label";
  label.textContent = "Stichpunkte bearbeiten";

  const textarea = document.createElement("textarea");
  textarea.className = "edit-textarea";
  textarea.value = (entry.bullets || []).join("\n");
  textarea.rows = 5;

  const actions = document.createElement("div");
  actions.className = "edit-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Speichern";

  const cancelButton = document.createElement("button");
  cancelButton.className = "secondary-button";
  cancelButton.type = "button";
  cancelButton.textContent = "Abbrechen";
  cancelButton.addEventListener("click", () => {
    article.replaceWith(createEntryElement(entry));
  });

  saveButton.addEventListener("click", async () => {
    const bullets = normalizeBulletText(textarea.value);
    const entryDate = dateInput.value || getTodayInputValue();

    if (!bullets.length) {
      setStatus("Bitte behalte mindestens einen Stichpunkt.", "error");
      return;
    }

    if (isFutureEntryDate(entryDate)) {
      setStatus("Bitte wähle kein Datum in der Zukunft.", "error");
      return;
    }

    saveButton.disabled = true;
    cancelButton.disabled = true;
    dateInput.disabled = true;
    setStatus("Eintrag wird aktualisiert ...");

    try {
      await updateEntry(entry.id, {
        entry_date: entryDate,
        content: bullets.join("\n"),
        transcript: entry.originalText || "",
      });
      setStatus("Eintrag aktualisiert.", "success");
      await refreshJournalViews();
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Eintrag konnte nicht bearbeitet werden.", "error");
      saveButton.disabled = false;
      cancelButton.disabled = false;
      dateInput.disabled = false;
    }
  });

  actions.append(saveButton, cancelButton);
  article.append(dateLabel, dateInput, label, textarea, actions);
  textarea.focus();
}

async function startVoiceRecording() {
  if (!hasJournalAccess()) {
    setStatus("Bitte melde dich zuerst an.", "error");
    return false;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus("Dein Browser unterst\u00fctzt Mikrofonaufnahmen leider nicht.", "error");
    return false;
  }

  if (!confirmDiscardDraft()) {
    return false;
  }

  try {
    clearRecordingPreview();
    clearDraftEditor();
    recordedChunks = [];
    const mimeType = getRecordingMimeType();
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(
      recordingStream,
      mimeType ? { mimeType } : undefined,
    );

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("stop", async () => {
      const type = mediaRecorder.mimeType || mimeType || "audio/webm";
      const extension = getRecordingFileExtension(type);
      recordedBlob = new Blob(recordedChunks, { type });
      recordedAudioFile = new File([recordedBlob], `aufnahme-${Date.now()}.${extension}`, { type });

      stopVisualizer();
      recordingStream?.getTracks().forEach((track) => track.stop());
      recordingStream = null;
      mediaRecorder = null;
      isRecording = false;
      recordButton.textContent = "\ud83c\udfa4 Eintrag sprechen";
      recordButton.disabled = false;

      if (!recordedBlob.size) {
        clearRecordingPreview();
        setStatus("Die Aufnahme war leer. Bitte versuche es noch einmal.", "error");
        return;
      }

      recordedAudioUrl = URL.createObjectURL(recordedBlob);
      await prepareRecordingPreview(recordingAudio, recordedAudioUrl);
      recordingPreview.hidden = false;
      discardRecordingButton.disabled = false;
      transcribeRecordingButton.disabled = false;
      setStatus("Aufnahme bereit. Du kannst sie anh\u00f6ren, verwerfen oder transkribieren.", "success");
    });

    mediaRecorder.start();
    isRecording = true;
    startVisualizer(recordingStream);
    recordButton.textContent = "⏹️ Aufnahme stoppen";
    discardRecordingButton.disabled = true;
    transcribeRecordingButton.disabled = true;
    setStatus("Aufnahme l\u00e4uft ...");
    return true;
  } catch (error) {
    stopVisualizer();
    recordingStream?.getTracks().forEach((track) => track.stop());
    recordingStream = null;

    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      setStatus("Mikrofonzugriff wurde verweigert. Bitte erlaube den Zugriff im Browser.", "error");
      return false;
    }

    setStatus("Mikrofonaufnahme konnte nicht gestartet werden.", "error");
    return false;
  }
}

recordButton.addEventListener("click", async () => {
  returnToCalendarDayAfterSave = null;

  if (isRecording && mediaRecorder) {
    stopRecording();
    return;
  }

  await startVoiceRecording();
  return;

  if (!hasJournalAccess()) {
    setStatus("Bitte melde dich zuerst an.", "error");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus("Dein Browser unterstützt Mikrofonaufnahmen leider nicht.", "error");
    return;
  }

  if (!confirmDiscardDraft()) {
    return;
  }

  try {
    clearRecordingPreview();
    clearDraftEditor();
    recordedChunks = [];
    const mimeType = getRecordingMimeType();
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(
      recordingStream,
      mimeType ? { mimeType } : undefined,
    );

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("stop", async () => {
      const type = mediaRecorder.mimeType || mimeType || "audio/webm";
      const extension = getRecordingFileExtension(type);
      recordedBlob = new Blob(recordedChunks, { type });
      recordedAudioFile = new File([recordedBlob], `aufnahme-${Date.now()}.${extension}`, { type });

      stopVisualizer();
      recordingStream?.getTracks().forEach((track) => track.stop());
      recordingStream = null;
      mediaRecorder = null;
      isRecording = false;
      recordButton.textContent = "\ud83c\udfa4 Eintrag sprechen";
      recordButton.disabled = false;

      if (!recordedBlob.size) {
        clearRecordingPreview();
        setStatus("Die Aufnahme war leer. Bitte versuche es noch einmal.", "error");
        return;
      }

      recordedAudioUrl = URL.createObjectURL(recordedBlob);
      await prepareRecordingPreview(recordingAudio, recordedAudioUrl);
      recordingPreview.hidden = false;
      discardRecordingButton.disabled = false;
      transcribeRecordingButton.disabled = false;
      setStatus("Aufnahme bereit. Du kannst sie anhören, verwerfen oder transkribieren.", "success");
    });

    mediaRecorder.start();
    isRecording = true;
    startVisualizer(recordingStream);
    recordButton.textContent = "Aufnahme stoppen";
    discardRecordingButton.disabled = true;
    transcribeRecordingButton.disabled = true;
    setStatus("Aufnahme läuft ...");
  } catch (error) {
    stopVisualizer();
    recordingStream?.getTracks().forEach((track) => track.stop());
    recordingStream = null;

    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      setStatus("Mikrofonzugriff wurde verweigert. Bitte erlaube den Zugriff im Browser.", "error");
      return;
    }

    setStatus("Mikrofonaufnahme konnte nicht gestartet werden.", "error");
  }
});

discardRecordingButton.addEventListener("click", () => {
  returnToCalendarDayAfterSave = null;
  clearRecordingPreview();
  setStatus("Aufnahme verworfen.");
});

discardDraftButton.addEventListener("click", () => {
  returnToCalendarDayAfterSave = null;
  clearDraftEditor();
  setStatus("Entwurf verworfen.");
});

entryDateTodayButton.addEventListener("click", () => {
  setEntryDateFromOffset(0);
});

entryDateYesterdayButton.addEventListener("click", () => {
  setEntryDateFromOffset(-1);
});

manualEntryButton.addEventListener("click", () => {
  returnToCalendarDayAfterSave = null;
  startManualEntry();
});

helpButton.addEventListener("click", openHelpModal);
helpCloseButton.addEventListener("click", closeHelpModal);
helpModal.addEventListener("click", (event) => {
  if (event.target === helpModal) {
    closeHelpModal();
  }
});
document.addEventListener("keydown", handleHelpModalKeydown);

saveDraftButton.addEventListener("click", async () => {
  console.log("SAVE CLICKED");

  if (!currentDraft || saveDraftButton.disabled) {
    return;
  }

  const bullets = getEditedDraftBullets();
  if (!bullets.length) {
    setStatus("Bitte behalte mindestens einen Stichpunkt.", "error");
    return;
  }

  syncEntryDateLimit();
  const entryDate = entryDateInput.value || getTodayInputValue();
  if (isFutureEntryDate(entryDate)) {
    setStatus("Bitte wähle kein Datum in der Zukunft.", "error");
    return;
  }

  setProcessing(true);
  setStatus("Eintrag wird gespeichert ...");

  try {
    console.log("BEFORE AUTH CHECK");
    console.log("AUTH RESULT", currentUser, null);

    if (!hasJournalAccess()) {
      setStatus("Bitte melde dich zuerst an.", "error");
      setProcessing(false);
      return;
    }

    const payload = {
      entry_date: entryDate,
      content: bullets.join("\n"),
      transcript: currentDraft.originalText || "",
    };

    console.log("BEFORE INSERT", payload);
    const savedEntry = await createEntry(payload);

    const calendarReturnDay = returnToCalendarDayAfterSave;
    returnToCalendarDayAfterSave = null;
    clearDraftEditor();
    const streakEligible = savedEntry ? isEntryStreakEligible(mapJournalRowToEntry(savedEntry)) : true;
    setStatus(
      streakEligible
        ? "Eintrag gespeichert."
        : "Eintrag gespeichert. Er z\u00e4hlt aber nicht mehr f\u00fcr deinen Streak.",
      streakEligible ? "success" : "",
    );

    if (calendarReturnDay) {
      selectedCalendarDay = calendarReturnDay;
      calendarMonth = getMonthStart(getLocalDateFromDayKey(calendarReturnDay));
      setNewEntryDate(calendarReturnDay);
      await refreshJournalViews();
      switchView("calendar");
      return;
    }

    setEntryDateFromOffset(0);
    await refreshJournalViews();
  } catch (error) {
    console.error("SAVE ERROR:", error);
    setStatus(error.message || "Eintrag konnte nicht gespeichert werden.", "error");
    saveDraftButton.disabled = false;
    discardDraftButton.disabled = false;
  } finally {
    setProcessing(false);
  }
});

transcribeRecordingButton.addEventListener("click", async () => {
  if (transcribeRecordingButton.disabled) {
    return;
  }

  if (!hasJournalAccess()) {
    setStatus("Bitte melde dich zuerst an.", "error");
    return;
  }

  if (!recordedAudioFile) {
    setStatus("Keine Aufnahme zum Transkribieren vorhanden.", "error");
    return;
  }

  transcribeRecordingButton.disabled = true;
  discardRecordingButton.disabled = true;
  let success = false;

  try {
    success = await uploadAudioFile(recordedAudioFile);
    if (success) {
      clearRecordingPreview();
    }
  } finally {
    if (!success && recordedAudioFile) {
      transcribeRecordingButton.disabled = false;
      discardRecordingButton.disabled = false;
    }
  }
});

refreshButton.addEventListener("click", async () => {
  try {
    setStatus("Einträge werden aktualisiert ...");
    await refreshJournalViews();
    setStatus("");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    switchView(button.dataset.view);
  });
}

trashBackButton.addEventListener("click", () => {
  switchView("entries");
});

calendarPrevButton.addEventListener("click", async () => {
  if (!canGoToPreviousMonth()) {
    return;
  }

  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  selectedCalendarDay = getDayKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1));

  try {
    await loadEntriesForMonth();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

calendarNextButton.addEventListener("click", async () => {
  if (!canGoToNextMonth()) {
    return;
  }

  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  selectedCalendarDay = isSameMonth(calendarMonth, new Date())
    ? getTodayInputValue()
    : getDayKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1));

  try {
    await loadEntriesForMonth();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

calendarTodayButton.addEventListener("click", async () => {
  calendarMonth = getMaxCalendarMonth();
  selectedCalendarDay = getTodayInputValue();

  try {
    await loadEntriesForMonth();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

clearRecordingPreview();
clearDraftEditor();
syncEntryDateLimit();
setEntryDateFromOffset(0);

async function handleAuthStateChange(_event, session) {
  cleanAuthHashFromUrl();

  try {
    if (session) {
      disableDemoMode();
    }

    await applySession(session);
  } catch (error) {
    setStatus(error.message, "error");
  }
}

initializeAuth()
  .catch((error) => {
    console.error(error);
    setStatus(error.message || "Session konnte nicht gelesen werden.", "error");
  })
  .finally(() => {
    if (!isDemoModeActive()) {
      supabase.auth.onAuthStateChange(handleAuthStateChange);
    }
  });
