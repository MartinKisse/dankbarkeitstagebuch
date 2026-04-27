const form = document.querySelector("#upload-form");
const audioInput = document.querySelector("#audio");
const fileName = document.querySelector("#file-name");
const statusText = document.querySelector("#status");
const entriesContainer = document.querySelector("#entries");
const submitButton = document.querySelector("#submit-button");
const refreshButton = document.querySelector("#refresh-button");
const jsonExportButton = document.querySelector("#json-export-button");
const markdownExportButton = document.querySelector("#markdown-export-button");
const importButton = document.querySelector("#import-button");
const importInput = document.querySelector("#import-input");
const recordButton = document.querySelector("#record-button");
const recordingVisualizer = document.querySelector("#recording-visualizer");
const visualizerCanvas = document.querySelector("#visualizer-canvas");
const visualizerContext = visualizerCanvas.getContext("2d");
const speechStatus = document.querySelector("#speech-status");
const recordingPreview = document.querySelector("#recording-preview");
const recordingAudio = document.querySelector("#recording-audio");
const discardRecordingButton = document.querySelector("#discard-recording-button");
const transcribeRecordingButton = document.querySelector("#transcribe-recording-button");
const draftEditor = document.querySelector("#draft-editor");
const draftBullets = document.querySelector("#draft-bullets");
const draftOriginalText = document.querySelector("#draft-original-text");
const draftOriginalDetails = document.querySelector("#draft-original-details");
const discardDraftButton = document.querySelector("#discard-draft-button");
const saveDraftButton = document.querySelector("#save-draft-button");

let mediaRecorder = null;
let recordedChunks = [];
let recordingStream = null;
let isRecording = false;
let audioContext = null;
let analyser = null;
let visualizerFrameId = null;
let smoothedVolume = 0;
let silentSince = null;
let recordedBlob = null;
let recordedAudioUrl = null;
let recordedAudioFile = null;
let currentDraft = null;
let savedDraftFingerprint = "";

const speakingThreshold = 0.035;
const smoothingFactor = 0.82;
const silenceStopDelay = 2000;

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeStyle: "short",
});

const dayFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = `status ${type}`.trim();
}

function downloadFromUrl(url) {
  const link = document.createElement("a");
  link.href = url;
  document.body.append(link);
  link.click();
  link.remove();
}

function setBackupControlsDisabled(isDisabled) {
  jsonExportButton.disabled = isDisabled;
  markdownExportButton.disabled = isDisabled;
  importButton.disabled = isDisabled;
  refreshButton.disabled = isDisabled;
}

function getDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const sortedEntries = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
  const groups = new Map();

  for (const entry of sortedEntries) {
    const dayKey = getDayKey(new Date(entry.date));
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

  const time = document.createElement("time");
  time.dateTime = entry.date;
  time.textContent = dateFormatter.format(new Date(entry.date));

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
  deleteButton.textContent = "Loeschen";
  deleteButton.addEventListener("click", () => deleteEntry(entry.id));

  actions.append(editButton, deleteButton);
  header.append(time, actions);

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
    empty.textContent = "Noch keine Eintraege vorhanden.";
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

async function loadEntries() {
  const response = await fetch("/api/entries");
  if (!response.ok) {
    throw new Error("Eintraege konnten nicht geladen werden.");
  }

  renderEntries(await response.json());
}

function setProcessing(isProcessing) {
  submitButton.disabled = isProcessing;
  audioInput.disabled = isProcessing;
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

  return confirm("Es gibt einen ungespeicherten Entwurf. Moechtest du ihn verwerfen?");
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

function stopRecording() {
  if (!isRecording || !mediaRecorder) {
    return;
  }

  setStatus("Aufnahme wird beendet ...");
  recordButton.disabled = true;
  mediaRecorder.stop();
}

function getSpeechState(volume) {
  return volume >= speakingThreshold ? "speaking" : "silent";
}

function drawVisualizer() {
  if (!analyser) {
    return;
  }

  const { width, height } = visualizerCanvas;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);
  let sumSquares = 0;

  for (const value of data) {
    const normalized = (value - 128) / 128;
    sumSquares += normalized * normalized;
  }

  const rms = Math.sqrt(sumSquares / data.length);
  smoothedVolume = smoothingFactor * smoothedVolume + (1 - smoothingFactor) * rms;
  const speechState = getSpeechState(smoothedVolume);
  const now = performance.now();

  speechStatus.textContent = speechState === "speaking" ? "Spricht..." : "Warte auf Input";

  if (speechState === "silent") {
    silentSince ??= now;
    if (now - silentSince >= silenceStopDelay) {
      stopRecording();
      return;
    }
  } else {
    silentSince = null;
  }

  visualizerContext.clearRect(0, 0, width, height);

  const barCount = 36;
  const samplesPerBar = Math.floor(data.length / barCount);
  const barWidth = width / barCount;

  for (let i = 0; i < barCount; i += 1) {
    let sum = 0;

    for (let j = 0; j < samplesPerBar; j += 1) {
      const sample = data[i * samplesPerBar + j] - 128;
      sum += Math.abs(sample);
    }

    const volume = sum / samplesPerBar / 128;
    const barHeight = Math.max(6, volume * height * 1.9);
    const x = i * barWidth + 2;
    const y = (height - barHeight) / 2;

    visualizerContext.fillStyle = "#2f7d6d";
    visualizerContext.fillRect(x, y, Math.max(3, barWidth - 4), barHeight);
  }

  visualizerFrameId = requestAnimationFrame(drawVisualizer);
}

function startVisualizer(stream) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  audioContext = new AudioContextClass();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  smoothedVolume = 0;
  silentSince = null;

  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  recordingVisualizer.hidden = false;
  speechStatus.textContent = "Warte auf Input";
  cancelAnimationFrame(visualizerFrameId);
  drawVisualizer();
}

function stopVisualizer() {
  if (visualizerFrameId) {
    cancelAnimationFrame(visualizerFrameId);
    visualizerFrameId = null;
  }

  analyser = null;
  silentSince = null;
  recordingVisualizer.hidden = true;
  speechStatus.textContent = "Warte auf Input";
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
    form.reset();
    fileName.textContent = "Keine Datei ausgewaehlt";
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
  if (!confirm("Diesen Eintrag wirklich loeschen?")) {
    return;
  }

  try {
    setStatus("Eintrag wird geloescht ...");
    const response = await fetch(`/api/entries/${id}`, { method: "DELETE" });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Eintrag konnte nicht geloescht werden.");
    }

    setStatus("Eintrag geloescht.", "success");
    await loadEntries();
  } catch (error) {
    setStatus(error.message || "Eintrag konnte nicht geloescht werden.", "error");
  }
}

function showEditMode(article, entry) {
  article.classList.add("is-editing");
  article.innerHTML = "";

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

    if (!bullets.length) {
      setStatus("Bitte behalte mindestens einen Stichpunkt.", "error");
      return;
    }

    saveButton.disabled = true;
    cancelButton.disabled = true;
    setStatus("Eintrag wird aktualisiert ...");

    try {
      const response = await fetch(`/api/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalText: entry.originalText || "",
          bullets,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Eintrag konnte nicht bearbeitet werden.");
      }

      setStatus("Eintrag aktualisiert.", "success");
      await loadEntries();
    } catch (error) {
      setStatus(error.message || "Eintrag konnte nicht bearbeitet werden.", "error");
      saveButton.disabled = false;
      cancelButton.disabled = false;
    }
  });

  actions.append(saveButton, cancelButton);
  article.append(label, textarea, actions);
  textarea.focus();
}

audioInput.addEventListener("change", () => {
  fileName.textContent = audioInput.files[0]?.name || "Keine Datei ausgewaehlt";
});

recordButton.addEventListener("click", async () => {
  if (isRecording && mediaRecorder) {
    stopRecording();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus("Dein Browser unterstuetzt Mikrofonaufnahmen leider nicht.", "error");
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
      recordButton.textContent = "Aufnahme starten";
      recordButton.disabled = false;
      submitButton.disabled = false;
      audioInput.disabled = false;

      if (!recordedBlob.size) {
        clearRecordingPreview();
        setStatus("Die Aufnahme war leer. Bitte versuche es noch einmal.", "error");
        return;
      }

      recordedAudioUrl = URL.createObjectURL(recordedBlob);
      recordingAudio.src = recordedAudioUrl;
      recordingPreview.hidden = false;
      discardRecordingButton.disabled = false;
      transcribeRecordingButton.disabled = false;
      setStatus("Aufnahme bereit. Du kannst sie anhoeren, verwerfen oder transkribieren.", "success");
    });

    mediaRecorder.start();
    startVisualizer(recordingStream);
    isRecording = true;
    recordButton.textContent = "Aufnahme stoppen";
    submitButton.disabled = true;
    audioInput.disabled = true;
    discardRecordingButton.disabled = true;
    transcribeRecordingButton.disabled = true;
    setStatus("Aufnahme laeuft ...");
  } catch (error) {
    stopVisualizer();
    recordingStream?.getTracks().forEach((track) => track.stop());
    recordingStream = null;
    submitButton.disabled = false;
    audioInput.disabled = false;

    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      setStatus("Mikrofonzugriff wurde verweigert. Bitte erlaube den Zugriff im Browser.", "error");
      return;
    }

    setStatus("Mikrofonaufnahme konnte nicht gestartet werden.", "error");
  }
});

discardRecordingButton.addEventListener("click", () => {
  clearRecordingPreview();
  setStatus("Aufnahme verworfen.");
});

discardDraftButton.addEventListener("click", () => {
  clearDraftEditor();
  setStatus("Entwurf verworfen.");
});

saveDraftButton.addEventListener("click", async () => {
  if (!currentDraft || saveDraftButton.disabled) {
    return;
  }

  const bullets = getEditedDraftBullets();
  if (!bullets.length) {
    setStatus("Bitte behalte mindestens einen Stichpunkt.", "error");
    return;
  }

  setProcessing(true);
  setStatus("Eintrag wird gespeichert ...");

  try {
    const response = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalText: currentDraft.originalText,
        bullets,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Eintrag konnte nicht gespeichert werden.");
    }

    clearDraftEditor();
    setStatus("Eintrag gespeichert.", "success");
    await loadEntries();
  } catch (error) {
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
    setStatus("Eintraege werden aktualisiert ...");
    await loadEntries();
    setStatus("");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

jsonExportButton.addEventListener("click", () => {
  downloadFromUrl("/api/export/json");
});

markdownExportButton.addEventListener("click", () => {
  downloadFromUrl("/api/export/markdown");
});

importButton.addEventListener("click", () => {
  importInput.value = "";
  importInput.click();
});

importInput.addEventListener("change", async () => {
  const file = importInput.files[0];
  if (!file) {
    return;
  }

  try {
    setBackupControlsDisabled(true);
    setStatus("Backup wird importiert ...");
    let importedEntries;

    try {
      importedEntries = JSON.parse(await file.text());
    } catch {
      throw new Error("Die ausgewaehlte Datei ist kein gueltiges JSON.");
    }

    if (!Array.isArray(importedEntries)) {
      throw new Error("Das Backup muss ein JSON-Array mit Eintraegen sein.");
    }

    const response = await fetch("/api/import/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(importedEntries),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Backup konnte nicht importiert werden.");
    }

    setStatus(
      `${data.imported} Eintraege importiert, ${data.skippedDuplicates} Duplikate uebersprungen, ${data.invalid} ungueltige Eintraege uebersprungen.`,
      "success",
    );
    await loadEntries();
  } catch (error) {
    setStatus(error.message || "Backup konnte nicht importiert werden.", "error");
  } finally {
    setBackupControlsDisabled(false);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isRecording) {
    setStatus("Bitte stoppe zuerst die laufende Aufnahme.", "error");
    return;
  }

  if (!audioInput.files.length) {
    setStatus("Bitte waehle zuerst eine Audio-Datei aus.", "error");
    return;
  }

  await uploadAudioFile(audioInput.files[0]);
});

clearRecordingPreview();
clearDraftEditor();
loadEntries().catch((error) => setStatus(error.message, "error"));
