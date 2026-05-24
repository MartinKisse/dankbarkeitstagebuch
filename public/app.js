import { supabase, supabaseAnonKey, supabaseUrl } from "./supabaseClient.js";
import {
  createLocalEntry,
  clearAllEntries,
  getAllEntriesIncludingDeleted,
  getLocalEntries,
  bulkImportEntries,
  getLastLocalDbStep,
  updateLocalEntry,
  softDeleteLocalEntry,
  restoreLocalEntry,
  permanentlyDeleteLocalEntry,
  permanentlyDeleteLocalTrashEntries,
} from "./localDb.js?v=2026-05-25-cloud-upsert-fallback-v4";
const statusText = document.querySelector("#status");
const greetingEl = document.querySelector("#personal-greeting");
const streakSummaryEl = document.querySelector("#streak-summary");
const authBar = document.querySelector(".auth-bar");
const tabButtons = document.querySelectorAll(".tab-button");
const entriesView = document.querySelector("#entries-view");
const calendarView = document.querySelector("#calendar-view");
const trashView = document.querySelector("#trash-view");
const dataView = document.querySelector("#data-view");
const calendarGrid = document.querySelector("#calendar-grid");
const calendarMonthLabel = document.querySelector("#calendar-month-label");
const calendarDayEntries = document.querySelector("#calendar-day-entries");
const calendarPrevButton = document.querySelector("#calendar-prev");
const calendarNextButton = document.querySelector("#calendar-next");
const calendarTodayButton = document.querySelector("#calendar-today");
const trashEntriesContainer = document.querySelector("#trash-entries");
const emptyTrashButton = document.querySelector("#empty-trash-button");
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
const backupExportButton = document.querySelector("#backup-export-button");
const backupImportButton = document.querySelector("#backup-import-button");
const backupFileInput = document.querySelector("#backup-file-input");
const backupFeedback = document.querySelector("#backup-feedback");
const manualEntryButton = document.createElement("button");
const localMergePrompt = document.createElement("section");
const appVersionBadge = document.createElement("small");

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
let isEntryActionProcessing = false;
let currentSession = null;
let currentUser = null;
let activeTab = "entries";
let calendarMonth = new Date();
let calendarEntriesByDay = new Map();
let selectedCalendarDay = getDayKey(new Date());
let minCalendarMonth = null;
let returnToCalendarDayAfterSave = null;
let helpReturnFocusElement = null;
let hasCompletedInitialAuthLoad = false;
let storageMode = "local";
let localMergeDismissedForSession = false;
let lastLocalMergeFingerprint = "";

const MODE_KEY = "gratitude_mode";
const LEGACY_DEMO_MODE_KEY = "gratitude_demo_mode";
const DEMO_ENTRIES_KEY = "gratitude_demo_entries";
const DEMO_MODE_VALUE = "demo";
const LOCAL_MODE_VALUE = "local";
const BACKUP_APP_ID = "gratitude_journal";
const BACKUP_VERSION = 1;
const LOCAL_MERGE_DONE_KEY_PREFIX = "gratitude_local_merge_done";
const CONTROL_DEBUG_KEY = "gratitude_debug_controls";
const MONTH_ARCHIVE_STATE_KEY = "gratitude_month_archive_state";
const MONTH_ARCHIVE_DEBUG_KEY = "gratitude_debug_months";
const APP_DEBUG_VERSION = "2026-05-25-cloud-upsert-fallback-v4";
const BACKUP_IMPORT_TIMEOUT_MS = 30_000;

let lastBackupImportStep = "";
let pendingCloudSyncEntries = [];
let expandedEntryMonths = new Set();
let hasLoadedEntryMonthState = false;
let lastRenderedEntries = [];

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

console.log(`[app-version] ${APP_DEBUG_VERSION}`);
appVersionBadge.id = "app-debug-version";
appVersionBadge.textContent = APP_DEBUG_VERSION;
appVersionBadge.style.display = "block";
appVersionBadge.style.margin = "1rem auto";
appVersionBadge.style.maxWidth = "min(100%, 920px)";
appVersionBadge.style.padding = "0 1rem";
appVersionBadge.style.color = "#7a746b";
appVersionBadge.style.fontSize = "0.75rem";
appVersionBadge.style.textAlign = "center";
document.body.append(appVersionBadge);

localMergePrompt.id = "local-merge-prompt";
localMergePrompt.className = "local-merge-prompt";
localMergePrompt.setAttribute("aria-live", "polite");
localMergePrompt.hidden = true;
dataView.after(localMergePrompt);

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

function isLocalModeActive() {
  return storageMode === LOCAL_MODE_VALUE || isDemoModeActive();
}

function hasAuthCallback() {
  return (
    window.location.hash.includes("access_token=") ||
    window.location.hash.includes("refresh_token=") ||
    window.location.hash.includes("error=")
  );
}

function enableDemoMode() {
  localStorage.setItem(MODE_KEY, LOCAL_MODE_VALUE);
  localStorage.removeItem(LEGACY_DEMO_MODE_KEY);
  storageMode = LOCAL_MODE_VALUE;
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
  return isLocalModeActive() || Boolean(currentUser && currentSession?.access_token);
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
  storageMode = "cloud";
}

async function startDemoMode() {
  enableDemoMode();
  currentSession = null;
  currentUser = null;
  cleanAuthHashFromUrl();
  await applySession(null);
  setStatus("Lokaler Modus aktiv.", "success");
}

async function useRealAccount() {
  disableDemoMode();
  await loginWithGoogle();
}

async function clearDemoEntries() {
  if (!confirm("Lokale Eintr\u00e4ge wirklich l\u00f6schen?")) {
    return;
  }

  localStorage.removeItem(DEMO_ENTRIES_KEY);
  await refreshJournalViews();
  setStatus("Lokale Eintr\u00e4ge gel\u00f6scht.", "success");
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
    setStatus("Ausgeloggt. Lokaler Modus aktiv.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Logout fehlgeschlagen.", "error");
  }
}

function renderDemoBanner() {
  document.querySelector(".test-banner")?.remove();
  document.querySelector(".demo-mode-banner")?.remove();

  if (!isLocalModeActive()) {
    document.body.classList.remove("has-test-banner");
    return;
  }

  document.body.classList.add("has-test-banner");
  const banner = document.createElement("div");
  banner.className = "test-banner";

  const messageGroup = document.createElement("div");
  messageGroup.className = "test-banner-message";

  const message = document.createElement("p");
  message.textContent = "Lokaler Modus: Deine Eintr\u00e4ge werden nur in diesem Browser gespeichert. Erstelle regelm\u00e4\u00dfig ein Backup, damit nichts verloren geht.";

  const helpGroup = document.createElement("span");
  helpGroup.className = "test-banner-help-group";

  const helpButton = document.createElement("button");
  helpButton.className = "test-banner-help-button";
  helpButton.type = "button";
  helpButton.setAttribute("aria-label", "Lokalen Modus erkl\u00e4ren");
  helpButton.setAttribute("aria-expanded", "false");
  helpButton.setAttribute("aria-controls", "local-mode-help");
  helpButton.textContent = "?";

  const helpPopover = document.createElement("span");
  helpPopover.id = "local-mode-help";
  helpPopover.className = "test-banner-help-popover";
  helpPopover.setAttribute("role", "status");
  helpPopover.hidden = true;
  helpPopover.textContent = "Im lokalen Modus werden deine Eintr\u00e4ge nur in diesem Browser auf diesem Ger\u00e4t gespeichert. Wenn du Browserdaten l\u00f6schst, einen anderen Browser nutzt oder das Ger\u00e4t wechselst, sind sie dort nicht verf\u00fcgbar. Mit einem Backup kannst du sie sp\u00e4ter wieder importieren.";

  helpButton.addEventListener("click", () => {
    const isOpen = !helpPopover.hidden;
    helpPopover.hidden = isOpen;
    helpButton.setAttribute("aria-expanded", String(!isOpen));
  });

  const actions = document.createElement("div");
  actions.className = "test-banner-actions";

  const accountButton = document.createElement("button");
  accountButton.type = "button";
  accountButton.textContent = "Mit Google anmelden";
  accountButton.addEventListener("click", useRealAccount);

  helpGroup.append(helpButton, helpPopover);
  messageGroup.append(message, helpGroup);
  actions.append(accountButton);
  banner.append(messageGroup, actions);
  document.querySelector(".app-shell")?.prepend(banner);
}

function closeLocalModeHelp() {
  const helpPopover = document.querySelector("#local-mode-help");
  const helpButton = document.querySelector(".test-banner-help-button");

  if (!helpPopover || helpPopover.hidden) {
    return;
  }

  helpPopover.hidden = true;
  helpButton?.setAttribute("aria-expanded", "false");
}

function renderAuthState(user) {
  authBar.innerHTML = "";
  renderDemoBanner();

  if (isLocalModeActive()) {
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
    demoButton.textContent = "Ohne Login nutzen";
    demoButton.addEventListener("click", startDemoMode);

    const demoHint = document.createElement("p");
    demoHint.className = "demo-mode-hint";
    demoHint.textContent = "Lokaler Modus: Deine Eintr\u00e4ge werden nur auf diesem Ger\u00e4t gespeichert.";

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
  await checkLocalMergeOffer();

  if (hasJournalAccess() && !hadAccess) {
    switchView("entries");
  } else if (!hasJournalAccess()) {
    switchView("entries");
    renderCalendar();
    renderDayEntries(selectedCalendarDay);
    renderTrashEntries([]);
  }
}

function renderLoadingState() {
  authBar.innerHTML = "";
  const loadingLabel = document.createElement("span");
  loadingLabel.textContent = "Lade...";
  authBar.append(loadingLabel);
  setStatus("Lade...");
}

async function initApp() {
  renderLoadingState();
  const { data, error } = await supabase.auth.getSession();
  const session = data?.session ?? null;
  console.log("Session on load:", session);

  if (error) {
    console.error(error);
    ensureDefaultDemoMode();
    await applySession(null);
    setStatus("Session konnte nicht gelesen werden.", "error");
    hasCompletedInitialAuthLoad = true;
    return;
  }

  if (session) {
    disableDemoMode();
  } else {
    ensureDefaultDemoMode();
  }

  await applySession(session);
  cleanAuthHashFromUrl();

  if (statusText.textContent === "Lade...") {
    setStatus("");
  }

  hasCompletedInitialAuthLoad = true;
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

const appViews = {
  entries: entriesView,
  calendar: calendarView,
  trash: trashView,
  data: dataView,
};

function renderActiveView() {
  for (const [viewName, view] of Object.entries(appViews)) {
    view.hidden = viewName !== activeTab;
  }

  for (const button of tabButtons) {
    const isActive = button.dataset.view === activeTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }
}

function switchView(viewName) {
  if (!appViews[viewName]) {
    return;
  }

  activeTab = viewName;
  renderActiveView();

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

function scrollElementIntoStableView(element, behavior = "auto") {
  if (!element) {
    window.scrollTo({ top: 0, behavior });
    return;
  }

  const targetTop = Math.max(0, window.scrollY + element.getBoundingClientRect().top - 12);
  window.scrollTo({ top: targetTop, behavior });
}

function scrollCalendarAfterSave() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollElementIntoStableView(calendarView);
    });
  });
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

function getEntryMonthKey(entry) {
  const dayKey = getEntryDayKey(entry);
  return dayKey ? `${dayKey.slice(0, 7)}-01` : "";
}

function formatMonthLabel(monthKey) {
  return calendarMonthFormatter.format(getLocalDateFromDayKey(monthKey));
}

function isMonthArchiveDebugEnabled() {
  return localStorage.getItem(MONTH_ARCHIVE_DEBUG_KEY) === "true";
}

function debugMonthArchive(message, details = {}) {
  if (isMonthArchiveDebugEnabled()) {
    console.debug(`[month-archive] ${message}`, details);
  }
}

function getDefaultOpenMonthKey(monthGroups) {
  const currentMonthKey = getMonthKey(new Date());
  return monthGroups.some(([monthKey]) => monthKey === currentMonthKey) ? currentMonthKey : monthGroups[0]?.[0] || "";
}

function readStoredExpandedEntryMonths() {
  const rawState = localStorage.getItem(MONTH_ARCHIVE_STATE_KEY);
  if (!rawState) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawState);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((monthKey) => typeof monthKey === "string"));
    }

    if (parsed && typeof parsed === "object") {
      return new Set(Object.entries(parsed)
        .filter(([, isOpen]) => Boolean(isOpen))
        .map(([monthKey]) => monthKey));
    }
  } catch (error) {
    console.warn("[month-archive] state could not be read", error);
  }

  return null;
}

function saveExpandedEntryMonthsToStorage() {
  try {
    localStorage.setItem(MONTH_ARCHIVE_STATE_KEY, JSON.stringify([...expandedEntryMonths]));
  } catch (error) {
    console.warn("[month-archive] state could not be saved", error);
  }
}

function loadExpandedEntryMonthsFromStorage(monthGroups) {
  if (hasLoadedEntryMonthState) {
    return;
  }

  const storedState = readStoredExpandedEntryMonths();
  if (storedState) {
    expandedEntryMonths = storedState;
  } else {
    const defaultOpenMonthKey = getDefaultOpenMonthKey(monthGroups);
    expandedEntryMonths = defaultOpenMonthKey ? new Set([defaultOpenMonthKey]) : new Set();
  }

  hasLoadedEntryMonthState = true;
  debugMonthArchive("loaded state", {
    renderedMonthKeys: monthGroups.map(([monthKey]) => monthKey),
    expandedEntryMonths: [...expandedEntryMonths],
  });
}

function toggleEntryMonth(monthKey) {
  debugMonthArchive("clicked month", { monthKey, before: [...expandedEntryMonths] });

  if (expandedEntryMonths.has(monthKey)) {
    expandedEntryMonths.delete(monthKey);
  } else {
    expandedEntryMonths.add(monthKey);
  }

  saveExpandedEntryMonthsToStorage();
  debugMonthArchive("saved state after click", { monthKey, after: [...expandedEntryMonths] });
  renderEntries();
}

function groupEntriesByMonth(entries) {
  const groups = new Map();

  for (const entry of entries) {
    const monthKey = getEntryMonthKey(entry);
    if (!monthKey) {
      continue;
    }

    if (!groups.has(monthKey)) {
      groups.set(monthKey, []);
    }
    groups.get(monthKey).push(entry);
  }

  return [...groups.entries()].sort(([monthKeyA], [monthKeyB]) => monthKeyB.localeCompare(monthKeyA));
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

function isEntryStreakEligible(entry, todayKey = getTodayInputValue()) {
  if (entry.deleted_at || entry.deletedAt) {
    // Soft Delete ist eine bewusste Ablage im Papierkorb und zählt deshalb nicht für den Streak.
    return false;
  }

  const entryDay = getStreakEntryDayKey(entry);

  if (!entryDay) {
    return false;
  }

  // Reflexion statt Disziplin: Für den Streak zählt der Kalendertag, nicht der genaue Erstellzeitpunkt.
  return entryDay <= todayKey;
}

function getEligibleEntryDates(entries, todayKey = getTodayInputValue()) {
  // Mehrere Einträge am selben Kalendertag werden dedupliziert, weil ein Tag nur einmal zur Folge zählt.
  return new Set(
    entries
      .filter((entry) => isEntryStreakEligible(entry, todayKey))
      .map(getStreakEntryDayKey)
      .filter(Boolean),
  );
}

function calculateConsecutiveDaysEndingAt(entryDates, startDayKey) {
  const dateSet = entryDates instanceof Set ? entryDates : new Set(entryDates);
  let cursor = startDayKey;
  let days = 0;

  while (dateSet.has(cursor)) {
    days += 1;
    cursor = addDaysToDayKey(cursor, -1);
  }

  return days;
}

function getStreakStatus(entryDates, todayKey = getTodayInputValue()) {
  const yesterdayKey = addDaysToDayKey(todayKey, -1);
  const dateSet = entryDates instanceof Set ? entryDates : new Set(entryDates);

  if (dateSet.has(todayKey)) {
    return {
      anchorDay: todayKey,
      status: "active",
      message: "Heute bereits reflektiert",
      todayOpen: false,
    };
  }

  if (dateSet.has(yesterdayKey)) {
    return {
      anchorDay: yesterdayKey,
      status: "today-open",
      message: "Heute noch offen",
      todayOpen: true,
    };
  }

  return {
    anchorDay: "",
    status: "open",
    message: "",
    todayOpen: false,
  };
}

function calculateSoftStreak(entries, todayKey = getTodayInputValue()) {
  const eligibleDates = getEligibleEntryDates(entries, todayKey);
  // Rückdatierte Dankbarkeitseinträge sind erlaubt und können eine ruhige, ehrliche Serie ergänzen.
  const statusInfo = getStreakStatus(eligibleDates, todayKey);
  const currentDays = statusInfo.anchorDay
    ? calculateConsecutiveDaysEndingAt(eligibleDates, statusInfo.anchorDay)
    : 0;

  return {
    currentDays,
    status: statusInfo.status,
    statusText: statusInfo.message,
    todayOpen: statusInfo.todayOpen,
    longestDays: calculateLongestStreak(eligibleDates),
  };
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
  return calculateSoftStreak(entries);
}

function renderStreakSummary(streakInfo) {
  streakSummaryEl.innerHTML = "";

  if (!hasJournalAccess()) {
    streakSummaryEl.hidden = true;
    return;
  }

  streakSummaryEl.hidden = false;

  const infoButton = document.createElement("button");
  infoButton.className = "streak-info-button";
  infoButton.type = "button";
  infoButton.setAttribute("aria-label", "Dein Streak z\u00e4hlt Kalendertage mit mindestens einem nicht gel\u00f6schten Eintrag. R\u00fcckdatierte Dankbarkeitseintr\u00e4ge d\u00fcrfen deine Serie jederzeit erg\u00e4nzen.");
  infoButton.textContent = "\u24d8";

  const tooltip = document.createElement("span");
  tooltip.className = "streak-tooltip";
  tooltip.textContent = "Dein Streak z\u00e4hlt Kalendertage mit mindestens einem nicht gel\u00f6schten Eintrag. R\u00fcckdatierte Dankbarkeitseintr\u00e4ge d\u00fcrfen deine Serie jederzeit erg\u00e4nzen.";

  const text = document.createElement("span");
  text.className = "streak-text";
  if (!streakInfo.currentDays) {
    text.textContent = "Noch kein Streak - dein n\u00e4chster Eintrag kann ihn starten.";
    streakSummaryEl.append(text, infoButton, tooltip);
    return;
  }

  const icon = document.createElement("span");
  icon.className = "streak-icon";
  icon.textContent = "\ud83c\udf31";
  text.innerHTML = `${streakInfo.currentDays} ${streakInfo.currentDays === 1 ? "Tag" : "Tage"} in Folge${streakInfo.statusText ? `<br>${streakInfo.statusText}` : ""}`;
  streakSummaryEl.append(icon, text, infoButton, tooltip);

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

function renderEntries(entries = lastRenderedEntries) {
  lastRenderedEntries = entries;
  entriesContainer.innerHTML = "";

  const groupedMonths = groupEntriesByMonth(entries);

  if (!groupedMonths.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Noch keine Eintr\u00e4ge vorhanden.";
    entriesContainer.append(empty);
    return;
  }

  loadExpandedEntryMonthsFromStorage(groupedMonths);
  const defaultOpenMonthKey = getDefaultOpenMonthKey(groupedMonths);
  const renderedMonthKeys = groupedMonths.map(([monthKey]) => monthKey);
  const areAllMonthsOpen = groupedMonths.every(([monthKey]) => expandedEntryMonths.has(monthKey));

  debugMonthArchive("render", {
    renderedMonthKeys,
    expandedEntryMonths: [...expandedEntryMonths],
  });

  const archiveActions = document.createElement("div");
  archiveActions.className = "month-archive-actions";

  const toggleAllButton = document.createElement("button");
  toggleAllButton.className = "month-archive-toggle";
  toggleAllButton.type = "button";
  toggleAllButton.textContent = areAllMonthsOpen ? "Alle Monate einklappen" : "Alle Monate anzeigen";
  toggleAllButton.addEventListener("click", () => {
    if (areAllMonthsOpen) {
      expandedEntryMonths = new Set();
    } else {
      expandedEntryMonths = new Set(renderedMonthKeys);
    }
    saveExpandedEntryMonthsToStorage();
    debugMonthArchive("toggle all", {
      action: areAllMonthsOpen ? "collapse all months" : "expand all months",
      defaultOpenMonthKey,
      expandedEntryMonths: [...expandedEntryMonths],
    });
    renderEntries();
  });

  archiveActions.append(toggleAllButton);
  entriesContainer.append(archiveActions);

  for (const [monthKey, monthEntries] of groupedMonths) {
    const monthGroup = document.createElement("section");
    monthGroup.className = "month-group";

    const isOpen = expandedEntryMonths.has(monthKey);
    debugMonthArchive("render month", { monthKey, isOpen });

    const monthHeader = document.createElement("button");
    monthHeader.className = "month-heading";
    monthHeader.type = "button";
    monthHeader.setAttribute("aria-expanded", String(isOpen));

    const monthTitle = document.createElement("span");
    monthTitle.textContent = formatMonthLabel(monthKey);

    const monthMeta = document.createElement("span");
    monthMeta.className = "month-heading-meta";
    monthMeta.textContent = `${monthEntries.length} ${monthEntries.length === 1 ? "Eintrag" : "Eintr\u00e4ge"} ${isOpen ? "\u25be" : "\u25b8"}`;

    monthHeader.append(monthTitle, monthMeta);
    monthHeader.addEventListener("click", () => {
      toggleEntryMonth(monthKey);
    });

    monthGroup.append(monthHeader);

    if (isOpen) {
      const monthBody = document.createElement("div");
      monthBody.className = "month-entries";

      for (const [dayKey, dayEntries] of groupEntriesByDay(monthEntries)) {
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
        monthBody.append(group);
      }

      monthGroup.append(monthBody);
    }

    entriesContainer.append(monthGroup);
  }
}

function mapJournalRowToEntry(row) {
  return {
    id: row.id,
    entry_date: row.entry_date,
    date: row.entry_date || row.created_at,
    created_at: row.created_at,
    createdAt: row.created_at,
    deleted_at: row.deleted_at,
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

async function getVisibleLocalRows() {
  return (await getLocalEntries())
    .filter((row) => !row.deleted_at)
    .filter((row) => row.entry_date || row.created_at);
}

async function getDeletedLocalRows() {
  return (await getLocalEntries())
    .filter((row) => row.deleted_at)
    .sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
}

async function getLocalRowsForMonth() {
  const { startKey, endKey } = getMonthBounds(calendarMonth);
  return (await getVisibleLocalRows())
    .filter((row) => row.entry_date >= startKey && row.entry_date <= endKey)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

async function createEntry(entry) {
  if (isLocalModeActive()) {
    return createLocalEntry(entry);
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
  if (isLocalModeActive()) {
    return updateLocalEntry(id, patch);
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
  if (isLocalModeActive()) {
    return softDeleteLocalEntry(id);
  }

  return updateEntry(id, { deleted_at: new Date().toISOString() });
}

async function restoreEntryData(id) {
  if (isLocalModeActive()) {
    return restoreLocalEntry(id);
  }

  return updateEntry(id, { deleted_at: null });
}

async function permanentlyDeleteEntryData(id) {
  if (isLocalModeActive()) {
    await permanentlyDeleteLocalEntry(id);
    return null;
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

async function permanentlyDeleteTrashEntriesData() {
  if (isLocalModeActive()) {
    await permanentlyDeleteLocalTrashEntries();
    return null;
  }

  const { error } = await supabase
    .from("journal_entries")
    .delete()
    .eq("user_id", currentUser.id)
    .not("deleted_at", "is", null);

  if (error) {
    throw error;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeBackupText(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n");
}

function getBackupEntryContent(entry) {
  if (typeof entry.content === "string") {
    return entry.content;
  }

  if (Array.isArray(entry.bullets)) {
    return entry.bullets.map((bullet) => String(bullet || "").trim()).filter(Boolean).join("\n");
  }

  if (typeof entry.text === "string") {
    return entry.text;
  }

  return "";
}

function normalizeBackupDay(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : getDayKey(date);
}

function normalizeBackupTimestamp(value, fallback) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function buildEntrySignature(entry) {
  const dayKey = normalizeBackupDay(entry.entry_date || entry.date || entry.created_at || entry.createdAt);
  const content = normalizeBackupText(getBackupEntryContent(entry)).toLocaleLowerCase("de-DE");
  return dayKey && content ? `${dayKey}|${content}` : "";
}

function getBackupSignature(entry) {
  return buildEntrySignature(entry);
}

function normalizeImportedEntry(entry, { preserveId }) {
  if (!isPlainObject(entry)) {
    return null;
  }

  const content = normalizeBackupText(getBackupEntryContent(entry));
  const entryDate = normalizeBackupDay(entry.entry_date || entry.date || entry.created_at || entry.createdAt);

  if (!content || !entryDate) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = normalizeBackupTimestamp(entry.created_at || entry.createdAt, now);
  const updatedAt = normalizeBackupTimestamp(entry.updated_at || entry.updatedAt, createdAt);
  const deletedAt = entry.deleted_at || entry.deletedAt
    ? normalizeBackupTimestamp(entry.deleted_at || entry.deletedAt, null)
    : null;
  const row = {
    entry_date: entryDate,
    content,
    transcript: typeof entry.transcript === "string"
      ? entry.transcript
      : String(entry.originalText || ""),
    created_at: createdAt,
    updated_at: updatedAt,
    deleted_at: deletedAt,
  };

  if (preserveId && entry.id) {
    row.id = String(entry.id);
  }

  return row;
}

function sortBackupEntries(entries) {
  return [...entries].sort((a, b) => {
    const leftDate = a.entry_date || a.date || a.created_at || "";
    const rightDate = b.entry_date || b.date || b.created_at || "";

    if (leftDate !== rightDate) {
      return String(leftDate).localeCompare(String(rightDate));
    }

    const leftCreated = a.created_at || a.createdAt || "";
    const rightCreated = b.created_at || b.createdAt || "";

    if (leftCreated !== rightCreated) {
      return String(leftCreated).localeCompare(String(rightCreated));
    }

    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

function detectDuplicateEntry(entry, existingIds, existingSignatures) {
  const id = isPlainObject(entry) && entry.id ? String(entry.id) : "";
  const signature = isPlainObject(entry) ? buildEntrySignature(entry) : "";

  return {
    id,
    signature,
    isDuplicate: Boolean((id && existingIds.has(id)) || (signature && existingSignatures.has(signature))),
  };
}

function mergeEntries(sourceEntries, existingEntries, { preserveId = false } = {}) {
  const existingIds = new Set(existingEntries.map((entry) => String(entry.id || "")).filter(Boolean));
  const existingSignatures = new Set(existingEntries.map(buildEntrySignature).filter(Boolean));
  const entriesToInsert = [];
  let validCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  for (const [index, entry] of sourceEntries.entries()) {
    const duplicateInfo = detectDuplicateEntry(entry, existingIds, existingSignatures);
    const normalizedEntry = normalizeImportedEntry(entry, { preserveId });
    const entryId = isPlainObject(entry) && entry.id ? String(entry.id) : "";

    if (!normalizedEntry || !duplicateInfo.signature) {
      console.warn("[backup-import] invalid entry skipped", {
        index,
        id: entryId || "unknown",
        hasNormalizedEntry: Boolean(normalizedEntry),
        hasSignature: Boolean(duplicateInfo.signature),
      });
      invalidCount += 1;
      continue;
    }

    validCount += 1;

    if (duplicateInfo.isDuplicate) {
      console.log("[backup-import] duplicate entry skipped", {
        index,
        id: duplicateInfo.id || "unknown",
      });
      duplicateCount += 1;
      continue;
    }

    entriesToInsert.push(normalizedEntry);

    if (duplicateInfo.id) {
      existingIds.add(duplicateInfo.id);
    }
    if (normalizedEntry.id) {
      existingIds.add(String(normalizedEntry.id));
    }
    existingSignatures.add(duplicateInfo.signature);
  }

  return {
    foundCount: sourceEntries.length,
    validCount,
    importedCount: entriesToInsert.length,
    duplicateCount,
    invalidCount,
    entriesToInsert,
  };
}

async function getAllCloudEntriesIncludingDeleted() {
  if (!currentUser || !currentSession?.access_token) {
    return [];
  }

  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Cloud-Eintr\u00e4ge konnten nicht geladen werden.");
  }

  return data || [];
}

async function getAllEntriesForBackup() {
  if (isLocalModeActive()) {
    return getAllEntriesIncludingDeleted();
  }

  return getAllCloudEntriesIncludingDeleted();
}

async function insertImportedCloudEntries(entries) {
  if (!entries.length) {
    return [];
  }

  if (!currentUser || !currentSession?.access_token) {
    throw new Error("Bitte melde dich zuerst an.");
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const rows = entries.map((entry) => ({
    ...(entry.id && uuidPattern.test(String(entry.id)) ? { id: String(entry.id) } : {}),
    user_id: currentUser.id,
    entry_date: entry.entry_date,
    content: entry.content,
    transcript: entry.transcript,
    created_at: entry.created_at,
    deleted_at: entry.deleted_at,
  }));

  console.log("[backup-import] Cloud-Upsert starten", {
    count: rows.length,
    rowsWithIds: rows.filter((row) => row.id).length,
  });

  const { data, error } = await supabase
    .from("journal_entries")
    .upsert(rows, { onConflict: "id" })
    .select();

  if (error) {
    const message = formatSupabaseInsertError(error) || "Backup konnte nicht in die Cloud importiert werden.";
    throw new Error(message);
  }

  console.log("[backup-import] Cloud-Upsert abgeschlossen", {
    count: data?.length || 0,
  });

  return data || [];
}

function buildCloudImportRow(entry) {
  const row = {
    user_id: currentUser.id,
    entry_date: entry.entry_date,
    content: entry.content,
    transcript: entry.transcript,
  };

  if (entry.deleted_at) {
    row.deleted_at = entry.deleted_at;
  }

  return row;
}

function formatSupabaseInsertError(error) {
  if (!error) {
    return "Unbekannter Supabase-Fehler";
  }

  const parts = [
    error.message,
    error.details,
    error.hint,
    error.code ? `Code: ${error.code}` : "",
  ].filter(Boolean);

  return parts.join(" ");
}

async function parseSupabaseInsertResponse(response) {
  const responseText = await response.text();

  if (response.ok) {
    return responseText ? JSON.parse(responseText) : [];
  }

  try {
    const parsed = JSON.parse(responseText);
    return {
      error: formatSupabaseInsertError(parsed),
    };
  } catch {
    return {
      error: responseText || `HTTP ${response.status}`,
    };
  }
}

async function insertLocalMergeCloudEntries(entries) {
  if (!entries.length) {
    return {
      insertedEntries: [],
      failedEntries: [],
      errors: [],
    };
  }

  if (!currentUser || !currentSession?.access_token) {
    throw new Error("Bitte melde dich zuerst an.");
  }

  const insertedEntries = [];
  const failedEntries = [];
  const errors = [];

  for (const entry of entries) {
    const row = buildCloudImportRow(entry);

    if (!row.entry_date || !row.content) {
      failedEntries.push(entry);
      errors.push("Ein lokaler Eintrag hat kein g\u00fcltiges Datum oder keinen Inhalt.");
      continue;
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/journal_entries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseAnonKey,
        "Authorization": `Bearer ${currentSession.access_token}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(row),
    });
    const result = await parseSupabaseInsertResponse(response);

    if (result.error) {
      const message = `Supabase INSERT failed: ${result.error}`;
      console.error("merge upload failed", result.error, { row, status: response.status });
      failedEntries.push(entry);
      errors.push(message);
      continue;
    }

    if (Array.isArray(result)) {
      insertedEntries.push(...result);
    }
  }

  return {
    insertedEntries,
    failedEntries,
    errors,
  };
}

async function insertImportedEntries(entries) {
  if (isLocalModeActive()) {
    return bulkImportEntries(entries);
  }

  return insertImportedCloudEntries(entries);
}

function downloadBackupFile(payload) {
  const dateKey = getTodayInputValue();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gratitude-backup-${dateKey}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportBackup() {
  if (!hasJournalAccess()) {
    setStatus("Bitte melde dich zuerst an.", "error");
    return;
  }

  backupExportButton.disabled = true;
  setStatus("Backup wird erstellt ...");

  try {
    const entries = sortBackupEntries(await getAllEntriesForBackup());
    const payload = {
      app: BACKUP_APP_ID,
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      storage_mode: isLocalModeActive() ? "local" : "cloud",
      entries,
    };

    downloadBackupFile(payload);
    setStatus(`Backup mit ${entries.length} Eintr\u00e4gen heruntergeladen.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Backup konnte nicht erstellt werden.", "error");
  } finally {
    backupExportButton.disabled = false;
  }
}

function validateBackupPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new Error("Falsches Backup-Format: Die Datei enth\u00e4lt kein g\u00fcltiges Backup-Objekt.");
  }

  if (payload.app !== BACKUP_APP_ID) {
    throw new Error("Falsches Backup-Format: Diese Datei geh\u00f6rt nicht zu diesem Dankbarkeitstagebuch.");
  }

  if (!Array.isArray(payload.entries)) {
    throw new Error("Die Backup-Datei ist ung\u00fcltig: entries fehlt oder ist kein Array.");
  }
}

function renderBackupFeedback({ type = "", title = "", items = [], message = "" } = {}) {
  backupFeedback.replaceChildren();
  backupFeedback.className = `backup-feedback backup-import-result${type ? ` is-${type}` : ""}`;

  if (!title && !message && !items.length) {
    backupFeedback.hidden = true;
    return;
  }

  if (title) {
    const heading = document.createElement("h3");
    heading.className = "backup-import-title";
    heading.textContent = title;
    backupFeedback.append(heading);
  }

  if (message) {
    const paragraph = document.createElement("p");
    paragraph.className = "backup-import-message";
    paragraph.textContent = message;
    backupFeedback.append(paragraph);
  }

  if (items.length) {
    const list = document.createElement("ul");
    list.className = "backup-import-list";

    for (const itemText of items) {
      const item = document.createElement("li");
      item.textContent = itemText;
      list.append(item);
    }

    backupFeedback.append(list);
  }

  backupFeedback.hidden = false;
}

function clearBackupFeedback() {
  renderBackupFeedback();
}

function renderBackupImportProgress() {
  renderBackupFeedback({
    type: "loading",
    title: "Backup wird gepr\u00fcft und importiert ...",
  });
}

function renderBackupImportSuccess({
  foundCount,
  validCount,
  importedCount,
  duplicateCount,
  invalidCount,
  type = "success",
  usedDirectLocalUpsertFallback = false,
  usedDirectCloudUpsertFallback = false,
  usedLocalCloudFallback = false,
  skippedRefresh = false,
}) {
  const items = [
    `${foundCount} Eintr\u00e4ge gefunden`,
    `${validCount} g\u00fcltige Eintr\u00e4ge`,
    `${importedCount} neue Eintr\u00e4ge importiert`,
    `${duplicateCount} Duplikate \u00fcbersprungen`,
    `${invalidCount} ung\u00fcltige Eintr\u00e4ge`,
  ];

  if (usedDirectLocalUpsertFallback) {
    items.push("Lokaler Direct-Upsert-Fallback verwendet");
    items.push("Ansicht wurde nicht automatisch aktualisiert, weil das lokale Lesen h\u00e4ngt");
  }

  if (usedDirectCloudUpsertFallback) {
    items.push("Cloud Direct-Upsert-Fallback verwendet");
  }

  if (usedLocalCloudFallback) {
    items.push("Backup wurde lokal importiert. Cloud-Synchronisierung konnte nicht abgeschlossen werden.");
  }

  if (skippedRefresh) {
    items.push("Ansicht konnte nicht automatisch aktualisiert werden. Bitte App neu laden.");
  }

  renderBackupFeedback({
    type,
    title: type === "warning" ? "Import teilweise abgeschlossen" : "Import abgeschlossen",
    items,
  });

  if (usedLocalCloudFallback) {
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "secondary-button";
    retryButton.textContent = "Cloud-Sync erneut versuchen";
    retryButton.addEventListener("click", retryPendingCloudSync);
    backupFeedback.append(retryButton);
  }
}

function renderBackupImportError(message, { step = "", details = "" } = {}) {
  const items = [
    step ? `Schritt: ${step}` : "",
    details ? `Details: ${details}` : "",
  ].filter(Boolean);

  renderBackupFeedback({
    type: "error",
    title: "Import fehlgeschlagen",
    message,
    items,
  });
}

function showToast(message, type = "") {
  setStatus(message, type);
}

function createImportTimeoutError() {
  const error = new Error(`Import konnte nicht abgeschlossen werden. Schritt: ${lastBackupImportStep || "unbekannt"}.`);
  error.step = lastBackupImportStep || "unbekannt";
  error.details = `Globaler Timeout nach ${BACKUP_IMPORT_TIMEOUT_MS} ms`;
  return error;
}

function createStepTimeoutError(step, details = `Timeout nach ${BACKUP_IMPORT_TIMEOUT_MS} ms`) {
  const localDbStep = step.startsWith("Bestehende lokale") ? getLastLocalDbStep?.() : "";
  const finalStep = localDbStep || step;
  const error = new Error(`Import konnte nicht abgeschlossen werden. Schritt: ${finalStep}.`);
  error.step = finalStep;
  error.details = localDbStep
    ? `${details}. Letzter IndexedDB-Schritt: ${localDbStep}`
    : details;
  return error;
}

function annotateImportError(error, step, fallbackDetails = "") {
  const annotatedError = error instanceof Error ? error : new Error(String(error || fallbackDetails || "Unbekannter Fehler"));
  annotatedError.step = annotatedError.step || step;
  annotatedError.details = annotatedError.details || annotatedError.message || fallbackDetails;
  return annotatedError;
}

function getImportErrorInfo(error) {
  const localDbStep = getLastLocalDbStep?.();
  return {
    message: error?.message || "Import technisch fehlgeschlagen. Backup konnte nicht importiert werden.",
    step: error?.step || localDbStep || lastBackupImportStep || "unbekannt",
    details: error?.details || error?.message || "Keine technischen Details vorhanden.",
  };
}

function withTimeout(promise, timeoutMs, createError = createImportTimeoutError) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(createError()), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise])
    .finally(() => {
      clearTimeout(timeoutId);
    });
}

async function runImportStep(stepNumber, step, task, timeoutMs = BACKUP_IMPORT_TIMEOUT_MS) {
  lastBackupImportStep = step;
  console.log(`[backup-import] step ${stepNumber}: ${step} started`);

  try {
    const taskPromise = Promise.resolve().then(task);
    const result = timeoutMs
      ? await withTimeout(
        taskPromise,
        timeoutMs,
        () => createStepTimeoutError(step, `Timeout nach ${timeoutMs} ms`),
      )
      : await taskPromise;
    console.log(`[backup-import] step ${stepNumber}: ${step} completed`);
    return result;
  } catch (error) {
    throw annotateImportError(error, step);
  }
}

function readBackupFileText(file, step = "Datei lesen") {
  return withTimeout(new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Es wurde keine Backup-Datei ausgew\u00e4hlt."));
      return;
    }

    const reader = new FileReader();
    console.log("[backup-import] step 2: file read started");

    reader.addEventListener("load", () => {
      console.log("[backup-import] step 3: file read completed");
      resolve(String(reader.result || ""));
    }, { once: true });

    reader.addEventListener("error", () => {
      reject(annotateImportError(reader.error || new Error("Backup-Datei konnte nicht gelesen werden."), step, "FileReader error"));
    }, { once: true });

    reader.addEventListener("abort", () => {
      reject(annotateImportError(new Error("Backup-Datei wurde nicht vollst\u00e4ndig gelesen."), step, "FileReader abort"));
    }, { once: true });

    try {
      reader.readAsText(file, "utf-8");
    } catch (error) {
      reject(annotateImportError(error, step));
    }
  }), BACKUP_IMPORT_TIMEOUT_MS, () => createStepTimeoutError(step, `FileReader Timeout nach ${BACKUP_IMPORT_TIMEOUT_MS} ms`));
}

async function parseBackupFile(file) {
  const text = await runImportStep(2, "Datei lesen", () => readBackupFileText(file));

  return runImportStep(4, "JSON parsen", () => {
    try {
      const payload = JSON.parse(text);
      console.log("[backup-import] step 4: json parsed");
      return payload;
    } catch (error) {
      const parseError = new Error("Die Datei ist kein g\u00fcltiges JSON.");
      parseError.step = "JSON parsen";
      parseError.details = error.message || "JSON.parse fehlgeschlagen";
      throw parseError;
    }
  });
}

async function runBackupImport(file) {
  const payload = await parseBackupFile(file);
  await runImportStep(5, "Backup validieren", () => {
    validateBackupPayload(payload);
    console.log("[backup-import] step 5: validation completed", {
      entries: payload.entries.length,
    });
  });

  const foundCount = payload.entries.length;
  let usedDirectLocalUpsertFallback = false;
  let usedDirectCloudUpsertFallback = false;
  let usedLocalCloudFallback = false;
  let skippedRefresh = false;
  let importedCountOverride = null;
  let existingEntries = [];

  if (isLocalModeActive()) {
    try {
      existingEntries = await runImportStep(6, "Bestehende lokale Eintr\u00e4ge lesen", () => getAllEntriesForBackup(), BACKUP_IMPORT_TIMEOUT_MS);
    } catch (error) {
      usedDirectLocalUpsertFallback = true;
      console.warn("[backup-import] existing local entries could not be read; using direct upsert fallback", {
        step: error.step || getLastLocalDbStep() || "Bestehende Eintr\u00e4ge lesen",
        details: error.details || error.message,
      });
      renderBackupFeedback({
        type: "warning",
        title: "Lokaler Fallback aktiv",
        message: "Bestehende lokale Eintr\u00e4ge konnten nicht gelesen werden. Das Backup wird direkt gespeichert.",
        items: [
          `Schritt: ${error.step || getLastLocalDbStep() || "Bestehende Eintr\u00e4ge lesen"}`,
          `Details: ${error.details || error.message}`,
        ],
      });
    }
  } else {
    try {
      existingEntries = await runImportStep(6, "Bestehende Cloud-Eintr\u00e4ge lesen", () => getAllEntriesForBackup());
    } catch (error) {
      usedDirectCloudUpsertFallback = true;
      console.warn("[backup-import] existing cloud entries could not be read; using direct cloud upsert fallback", {
        step: error.step || "Bestehende Cloud-Eintr\u00e4ge lesen",
        details: error.details || error.message,
      });
      renderBackupFeedback({
        type: "warning",
        title: "Cloud-Fallback aktiv",
        message: "Bestehende Cloud-Eintr\u00e4ge konnten nicht gelesen werden. Das Backup wird direkt per Upsert gespeichert.",
        items: [
          `Schritt: ${error.step || "Bestehende Cloud-Eintr\u00e4ge lesen"}`,
          `Details: ${error.details || error.message}`,
        ],
      });
    }
  }

  const mergeResult = await runImportStep(7, "Eintr\u00e4ge vorbereiten", () => {
    const result = mergeEntries(payload.entries, existingEntries, { preserveId: isLocalModeActive() || usedDirectCloudUpsertFallback });
    console.log("[backup-import] entries prepared", {
      foundCount,
      directLocalUpsertFallback: usedDirectLocalUpsertFallback,
      directCloudUpsertFallback: usedDirectCloudUpsertFallback,
      validCount: result.validCount,
      importedCount: result.importedCount,
      duplicateCount: result.duplicateCount,
      invalidCount: result.invalidCount,
    });
    return result;
  });

  const importWriteStep = isLocalModeActive() ? "Lokale Daten speichern" : "Cloud-Upsert";
  try {
    const writeResult = await runImportStep(8, importWriteStep, () => {
      console.log("[backup-import] step 8: import writes started", {
        count: mergeResult.entriesToInsert.length,
        mode: isLocalModeActive() ? "local" : "cloud",
        directCloudUpsertFallback: usedDirectCloudUpsertFallback,
      });
      return insertImportedEntries(mergeResult.entriesToInsert);
    }, isLocalModeActive() ? BACKUP_IMPORT_TIMEOUT_MS + 1_000 : BACKUP_IMPORT_TIMEOUT_MS);
    importedCountOverride = Array.isArray(writeResult) ? writeResult.length : mergeResult.importedCount;
  } catch (error) {
    if (usedDirectCloudUpsertFallback) {
      console.error("[backup-import] cloud direct upsert failed; importing backup locally", error);
      usedLocalCloudFallback = true;
      pendingCloudSyncEntries = mergeResult.entriesToInsert;
      const localRows = await runImportStep(8, "Lokal speichern nach Cloud-Fehler", () => bulkImportEntries(mergeResult.entriesToInsert), BACKUP_IMPORT_TIMEOUT_MS + 1_000);
      importedCountOverride = Array.isArray(localRows) ? localRows.length : mergeResult.importedCount;
    } else {
      throw error;
    }
  }
  console.log("[backup-import] step 8: import writes completed");

  if (usedDirectLocalUpsertFallback || usedLocalCloudFallback) {
    skippedRefresh = true;
    console.warn("[backup-import] refresh skipped after fallback because automatic refresh depends on the path that already failed");
  } else {
    try {
      await runImportStep(9, isLocalModeActive() ? "Ansicht aktualisieren" : "Cloud-Refresh", async () => {
        console.log("[backup-import] step 9: refresh started");
        await refreshJournalViews();
        console.log("[backup-import] step 9: refresh completed");
      });
    } catch (error) {
      skippedRefresh = true;
      console.warn("[backup-import] import saved, but refresh failed", {
        step: error.step || "Ansicht aktualisieren",
        details: error.details || error.message,
      });
    }
  }
  console.log("[backup-import] import completed");

  return {
    foundCount,
    validCount: mergeResult.validCount,
    importedCount: importedCountOverride ?? mergeResult.importedCount,
    duplicateCount: mergeResult.duplicateCount,
    invalidCount: mergeResult.invalidCount,
    usedDirectLocalUpsertFallback,
    usedDirectCloudUpsertFallback,
    usedLocalCloudFallback,
    skippedRefresh,
  };
}

async function retryPendingCloudSync() {
  if (!pendingCloudSyncEntries.length) {
    setStatus("Keine offenen Cloud-Sync-Eintr\u00e4ge vorhanden.", "error");
    return;
  }

  if (!currentUser || !currentSession?.access_token) {
    setStatus("Bitte melde dich an, um den Cloud-Sync erneut zu versuchen.", "error");
    return;
  }

  setStatus("Cloud-Sync wird erneut versucht ...");

  try {
    await runImportStep(11, "Cloud-Sync erneut versuchen", () => insertImportedCloudEntries(pendingCloudSyncEntries), BACKUP_IMPORT_TIMEOUT_MS);
    pendingCloudSyncEntries = [];
    renderBackupFeedback({
      type: "success",
      title: "Cloud-Sync abgeschlossen",
      message: "Die lokal importierten Backup-Eintr\u00e4ge wurden in die Cloud synchronisiert.",
    });
    setStatus("Cloud-Sync abgeschlossen.", "success");

    try {
      await runImportStep(12, "Cloud-Refresh", () => refreshJournalViews());
    } catch (error) {
      console.warn("[backup-import] cloud sync succeeded, refresh failed", error);
      setStatus("Cloud-Sync abgeschlossen. Ansicht konnte nicht automatisch aktualisiert werden.", "success");
    }
  } catch (error) {
    const { message, step, details } = getImportErrorInfo(error);
    renderBackupImportError(message, { step, details });
    setStatus(message, "error");
  }
}

function getLocalMergeDoneKey() {
  return `${LOCAL_MERGE_DONE_KEY_PREFIX}:${currentUser?.id || "anonymous"}`;
}

function getLocalEntriesFingerprint(entries) {
  return sortBackupEntries(entries)
    .map((entry) => [
      String(entry.id || ""),
      buildEntrySignature(entry),
      normalizeBackupTimestamp(entry.deleted_at || entry.deletedAt, "") || "",
    ].join("|"))
    .join("||");
}

function hasMergedLocalEntries(fingerprint) {
  return Boolean(fingerprint && localStorage.getItem(getLocalMergeDoneKey()) === fingerprint);
}

function rememberMergedLocalEntries(fingerprint) {
  if (fingerprint) {
    localStorage.setItem(getLocalMergeDoneKey(), fingerprint);
  }
}

function hideLocalMergePrompt() {
  localMergePrompt.replaceChildren();
  localMergePrompt.hidden = true;
}

function renderLocalMergeFeedback({ type = "success", title = "", items = [], message = "", actions = [] } = {}) {
  localMergePrompt.replaceChildren();
  localMergePrompt.className = `local-merge-prompt backup-import-result is-${type}`;

  if (title) {
    const heading = document.createElement("h3");
    heading.className = "backup-import-title";
    heading.textContent = title;
    localMergePrompt.append(heading);
  }

  if (message) {
    const paragraph = document.createElement("p");
    paragraph.className = "backup-import-message";
    paragraph.textContent = message;
    localMergePrompt.append(paragraph);
  }

  if (items.length) {
    const list = document.createElement("ul");
    list.className = "backup-import-list";

    for (const itemText of items) {
      const item = document.createElement("li");
      item.textContent = itemText;
      list.append(item);
    }

    localMergePrompt.append(list);
  }

  if (actions.length) {
    const actionRow = document.createElement("div");
    actionRow.className = "local-merge-actions";

    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      if (action.secondary) {
        button.className = "secondary-button";
      }
      button.addEventListener("click", action.onClick);
      actionRow.append(button);
    }

    localMergePrompt.append(actionRow);
  }

  localMergePrompt.hidden = false;
}

function renderLocalMergePrompt(localCount) {
  localMergePrompt.replaceChildren();
  localMergePrompt.className = "local-merge-prompt backup-import-result is-warning";

  const heading = document.createElement("h3");
  heading.className = "backup-import-title";
  heading.textContent = "Lokale Eintr\u00e4ge gefunden";

  const message = document.createElement("p");
  message.className = "backup-import-message";
  message.textContent = `Du hast ${localCount} lokale Eintr\u00e4ge auf diesem Ger\u00e4t. M\u00f6chtest du sie in dein Konto \u00fcbernehmen?`;

  const actions = document.createElement("div");
  actions.className = "local-merge-actions";

  const mergeButton = document.createElement("button");
  mergeButton.type = "button";
  mergeButton.textContent = "Ins Konto \u00fcbernehmen";
  mergeButton.addEventListener("click", mergeLocalEntriesIntoAccount);

  const laterButton = document.createElement("button");
  laterButton.className = "secondary-button";
  laterButton.type = "button";
  laterButton.textContent = "Sp\u00e4ter";
  laterButton.addEventListener("click", () => {
    localMergeDismissedForSession = true;
    hideLocalMergePrompt();
  });

  actions.append(mergeButton, laterButton);
  localMergePrompt.append(heading, message, actions);
  localMergePrompt.hidden = false;
}

function renderLocalMergeResult(mergeResult, uploadErrors = []) {
  const title = mergeResult.importedCount > 0
    ? "Lokale Eintr\u00e4ge \u00fcbernommen"
    : "Lokale Eintr\u00e4ge \u00fcberpr\u00fcft";
  const hasUploadErrors = uploadErrors.length > 0;
  const items = [
    `${mergeResult.foundCount} lokale Eintr\u00e4ge gefunden`,
    `${mergeResult.importedCount} neue Eintr\u00e4ge \u00fcbernommen`,
    `${mergeResult.duplicateCount} Duplikate \u00fcbersprungen`,
    `${mergeResult.invalidCount} ung\u00fcltige Eintr\u00e4ge \u00fcbersprungen`,
  ];

  if (hasUploadErrors) {
    items.push(`Technischer Fehler: ${uploadErrors[0]}`);
  }

  renderLocalMergeFeedback({
    type: mergeResult.invalidCount > 0 || hasUploadErrors ? "warning" : "success",
    title,
    message: hasUploadErrors
      ? "Einige lokale Eintr\u00e4ge konnten nicht \u00fcbernommen werden. M\u00f6chtest du die lokale Kopie auf diesem Ger\u00e4t behalten?"
      : "Die lokalen Eintr\u00e4ge wurden erfolgreich in dein Konto \u00fcbernommen. M\u00f6chtest du die lokale Kopie auf diesem Ger\u00e4t behalten?",
    items,
    actions: [
      {
        label: "Lokale Kopie behalten",
        secondary: true,
        onClick: () => {
          hideLocalMergePrompt();
          setStatus("Lokale Kopie bleibt auf diesem Ger\u00e4t erhalten.", "success");
        },
      },
      {
        label: "Lokale Kopie l\u00f6schen",
        onClick: clearMergedLocalCopy,
      },
    ],
  });
}

async function checkLocalMergeOffer() {
  if (isLocalModeActive() || !currentUser || !currentSession?.access_token) {
    hideLocalMergePrompt();
    return;
  }

  if (localMergeDismissedForSession) {
    return;
  }

  try {
    const localEntries = await getAllEntriesIncludingDeleted();
    const usableLocalEntries = localEntries.filter((entry) => isPlainObject(entry));

    if (!usableLocalEntries.length) {
      hideLocalMergePrompt();
      return;
    }

    const fingerprint = getLocalEntriesFingerprint(usableLocalEntries);
    lastLocalMergeFingerprint = fingerprint;

    if (hasMergedLocalEntries(fingerprint)) {
      hideLocalMergePrompt();
      return;
    }

    renderLocalMergePrompt(usableLocalEntries.length);
  } catch (error) {
    console.error(error);
    renderLocalMergeFeedback({
      type: "error",
      title: "Lokale Eintr\u00e4ge konnten nicht gepr\u00fcft werden",
      message: error.message || "IndexedDB konnte nicht gelesen werden.",
    });
  }
}

async function mergeLocalEntriesIntoAccount() {
  if (!currentUser || !currentSession?.access_token || isLocalModeActive()) {
    setStatus("Bitte melde dich zuerst an.", "error");
    return;
  }

  renderLocalMergeFeedback({
    type: "loading",
    title: "Lokale Eintr\u00e4ge werden gepr\u00fcft ...",
  });

  try {
    const localEntries = (await getAllEntriesIncludingDeleted()).filter((entry) => isPlainObject(entry));
    const existingEntries = await getAllCloudEntriesIncludingDeleted();
    const mergeResult = mergeEntries(localEntries, existingEntries, { preserveId: false });
    const uploadResult = await insertLocalMergeCloudEntries(mergeResult.entriesToInsert);

    mergeResult.importedCount = uploadResult.insertedEntries.length;
    mergeResult.invalidCount += uploadResult.failedEntries.length;
    await refreshJournalViews();

    lastLocalMergeFingerprint = getLocalEntriesFingerprint(localEntries);
    if (!uploadResult.failedEntries.length) {
      rememberMergedLocalEntries(lastLocalMergeFingerprint);
    }
    localMergeDismissedForSession = false;
    renderLocalMergeResult(mergeResult, uploadResult.errors);
    setStatus(
      uploadResult.failedEntries.length
        ? "Lokale Eintr\u00e4ge teilweise \u00fcbernommen."
        : "Lokale Eintr\u00e4ge gepr\u00fcft.",
      uploadResult.failedEntries.length ? "warning" : "success",
    );
  } catch (error) {
    console.error(error);
    renderLocalMergeFeedback({
      type: "error",
      title: "Lokale Eintr\u00e4ge konnten nicht \u00fcbernommen werden",
      message: error.message || "Merge technisch fehlgeschlagen.",
    });
    setStatus(error.message || "Lokale Eintr\u00e4ge konnten nicht \u00fcbernommen werden.", "error");
  }
}

async function clearMergedLocalCopy() {
  try {
    await clearAllEntries();
    rememberMergedLocalEntries(lastLocalMergeFingerprint);
    await refreshJournalViews();
    renderLocalMergeFeedback({
      type: "success",
      title: "Lokale Kopie gel\u00f6scht",
      message: "Die lokale Kopie auf diesem Ger\u00e4t wurde gel\u00f6scht.",
    });
    setStatus("Lokale Kopie gel\u00f6scht.", "success");
  } catch (error) {
    console.error(error);
    renderLocalMergeFeedback({
      type: "error",
      title: "Lokale Kopie konnte nicht gel\u00f6scht werden",
      message: error.message || "IndexedDB konnte nicht geleert werden.",
    });
    setStatus(error.message || "Lokale Kopie konnte nicht gel\u00f6scht werden.", "error");
  }
}

async function importBackupFile(file) {
  lastBackupImportStep = "Datei ausw\u00e4hlen";
  console.log("[backup-import] import started");
  console.log("[backup-import] step 1: file selected", file || null);

  try {
    if (!file) {
      const message = "Es wurde keine Backup-Datei ausgew\u00e4hlt.";
      renderBackupImportError(message, {
        step: "Datei ausw\u00e4hlen",
        details: "input.files[0] war leer.",
      });
      showToast(message, "error");
      return;
    }

    if (!hasJournalAccess()) {
      const message = "Bitte melde dich zuerst an, bevor du ein Backup importierst.";
      renderBackupImportError(message);
      showToast(message, "error");
      return;
    }

    backupImportButton.disabled = true;
    backupExportButton.disabled = true;
    backupFileInput.disabled = true;
    renderBackupImportProgress();
    showToast("Backup wird gepr\u00fcft und importiert ...");

    const result = await runBackupImport(file);

    await runImportStep(10, "UI aktualisieren", () => {
      renderBackupImportSuccess({
        ...result,
        type: result.invalidCount > 0
          || result.usedDirectLocalUpsertFallback
          || result.usedDirectCloudUpsertFallback
          || result.usedLocalCloudFallback
          || result.skippedRefresh
          ? "warning"
          : "success",
      });
    });
    showToast("Import abgeschlossen.", "success");
  } catch (error) {
    console.error("Backup-Import Fehler:", error);
    const { message, step, details } = getImportErrorInfo(error);
    renderBackupImportError(message, { step, details });
    showToast(message, "error");
  } finally {
    backupImportButton.disabled = false;
    backupExportButton.disabled = false;
    backupFileInput.disabled = false;

    try {
      backupFileInput.value = "";
    } catch (error) {
      console.warn("Backup-Dateiauswahl konnte nicht zur\u00fcckgesetzt werden.", error);
    }
  }
}

async function loadEntries() {
  if (isLocalModeActive()) {
    const entries = (await getVisibleLocalRows()).map(mapJournalRowToEntry);
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
  if (isLocalModeActive()) {
    const rows = (await getVisibleLocalRows()).sort((a, b) => new Date(a.entry_date || a.created_at) - new Date(b.entry_date || b.created_at));
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
  if (isLocalModeActive()) {
    clampCalendarMonth();
    calendarEntriesByDay = groupCalendarEntries(await getLocalRowsForMonth());
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
  emptyTrashButton.hidden = !hasJournalAccess() || !entries.length;

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
  if (isLocalModeActive()) {
    renderTrashEntries(await getDeletedLocalRows());
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

async function emptyTrash() {
  if (!hasJournalAccess()) {
    setStatus("Bitte melde dich zuerst an.", "error");
    return;
  }

  if (!confirm("Möchtest du wirklich alle Einträge im Papierkorb endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) {
    return;
  }

  try {
    await permanentlyDeleteTrashEntriesData();
    setStatus("Papierkorb geleert.", "success");
    await refreshJournalViews();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Papierkorb konnte nicht geleert werden.", "error");
  }
}

function setProcessing(isProcessing) {
  isEntryActionProcessing = Boolean(isProcessing);
  const hasRecordedAudio = Boolean(recordedAudioFile);
  const hasDraft = Boolean(currentDraft);

  manualEntryButton.disabled = isEntryActionProcessing;
  recordButton.disabled = isEntryActionProcessing;
  discardRecordingButton.disabled = isEntryActionProcessing || !hasRecordedAudio;
  transcribeRecordingButton.disabled = isEntryActionProcessing || !hasRecordedAudio;
  discardDraftButton.disabled = isEntryActionProcessing || !hasDraft;
  saveDraftButton.disabled = isEntryActionProcessing || !hasDraft;

  if (localStorage.getItem(CONTROL_DEBUG_KEY) === "true") {
    console.debug("entry controls", {
      disabledReason: isEntryActionProcessing ? "processing" : "",
      selectedEntryDate: entryDateInput.value,
      hasRecordedAudio,
      hasDraft,
      isRecording,
      manualEntryDisabled: manualEntryButton.disabled,
      recordDisabled: recordButton.disabled,
    });
  }
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

function startManualEntry({ focusEditor = true } = {}) {
  if (!hasJournalAccess()) {
    setStatus("Bitte melde dich zuerst an.", "error");
    return false;
  }

  if (!confirmDiscardDraft()) {
    return false;
  }

  clearRecordingPreview();
  showDraftEditor({ originalText: "", bullets: [] });
  if (focusEditor) {
    draftBullets.focus({ preventScroll: true });
  }
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

  if (!startManualEntry({ focusEditor: false })) {
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
document.addEventListener("click", (event) => {
  if (!event.target.closest(".test-banner-help-group")) {
    closeLocalModeHelp();
  }
});
backupExportButton.addEventListener("click", exportBackup);
backupImportButton.addEventListener("click", () => {
  try {
    backupFileInput.value = "";
  } catch (error) {
    console.warn("Backup-Dateiauswahl konnte vor dem Import nicht zur\u00fcckgesetzt werden.", error);
  }

  backupFileInput.click();
});
backupFileInput.addEventListener("change", async () => {
  const file = backupFileInput.files?.[0] || null;
  console.log("Backup-Dateiauswahl ge\u00e4ndert", {
    fileCount: backupFileInput.files?.length || 0,
    hasFile: Boolean(file),
    name: file?.name || "",
    size: file?.size || 0,
    type: file?.type || "",
  });
  await importBackupFile(file);
});

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
    // Keine aggressive Streak-Bestrafung: Speichern bleibt ruhig, die zentrale Streak-Logik berechnet danach neu.
    setStatus("Eintrag gespeichert.", "success");

    if (calendarReturnDay) {
      if (draftEditor.contains(document.activeElement)) {
        document.activeElement.blur();
      }

      selectedCalendarDay = calendarReturnDay;
      calendarMonth = getMonthStart(getLocalDateFromDayKey(calendarReturnDay));
      setNewEntryDate(calendarReturnDay);
      await refreshJournalViews();
      switchView("calendar");
      scrollCalendarAfterSave();
      return;
    }

    setNewEntryDate(entryDate);
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

emptyTrashButton.addEventListener("click", emptyTrash);

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
  if (!hasCompletedInitialAuthLoad || _event === "INITIAL_SESSION") {
    return;
  }

  cleanAuthHashFromUrl();

  try {
    if (session) {
      disableDemoMode();
    } else {
      enableDemoMode();
    }

    await applySession(session);
  } catch (error) {
    setStatus(error.message, "error");
  }
}

initApp()
  .catch((error) => {
    console.error(error);
    hasCompletedInitialAuthLoad = true;
    setStatus(error.message || "Session konnte nicht gelesen werden.", "error");
  })
  .finally(() => {
    supabase.auth.onAuthStateChange(handleAuthStateChange);
  });
