const DB_NAME = "gratitude_journal";
const DB_VERSION = 1;
const ENTRIES_STORE = "entries";

let dbPromise = null;

function openLocalDb() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.addEventListener("upgradeneeded", () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
        const store = db.createObjectStore(ENTRIES_STORE, { keyPath: "id" });
        store.createIndex("entry_date", "entry_date", { unique: false });
        store.createIndex("deleted_at", "deleted_at", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    });

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });

  return dbPromise;
}

function runEntryStore(mode, callback) {
  return openLocalDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(ENTRIES_STORE, mode);
    const store = transaction.objectStore(ENTRIES_STORE);
    const request = callback(store);
    let result = null;

    if (request) {
      request.addEventListener("success", () => {
        result = request.result;
      });
      request.addEventListener("error", () => reject(request.error));
    }

    transaction.addEventListener("complete", () => resolve(result));
    transaction.addEventListener("error", () => reject(transaction.error));
    transaction.addEventListener("abort", () => reject(transaction.error));
  }));
}

function createLocalId() {
  return globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeLocalEntry(entry) {
  const now = new Date().toISOString();
  const content = typeof entry.content === "string"
    ? entry.content
    : (entry.bullets || []).map((bullet) => String(bullet).trim()).filter(Boolean).join("\n");

  return {
    id: entry.id || createLocalId(),
    entry_date: entry.entry_date || now.slice(0, 10),
    bullets: Array.isArray(entry.bullets)
      ? entry.bullets
      : String(content || "").split("\n").filter(Boolean),
    content,
    transcript: entry.transcript || "",
    audio: entry.audio || null,
    created_at: entry.created_at || now,
    updated_at: entry.updated_at || now,
    deleted_at: entry.deleted_at || null,
    source: "local",
  };
}

function sortLocalRows(rows) {
  return [...rows].sort((a, b) => {
    const dateComparison = new Date(b.entry_date || b.created_at) - new Date(a.entry_date || a.created_at);
    if (dateComparison) {
      return dateComparison;
    }

    return new Date(b.created_at) - new Date(a.created_at);
  });
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export async function createLocalEntry(entry) {
  const row = normalizeLocalEntry(entry);
  await runEntryStore("readwrite", (store) => store.put(row));
  return row;
}

export async function getLocalEntries() {
  const rows = await runEntryStore("readonly", (store) => store.getAll());
  return sortLocalRows((rows || []).filter((row) => row && typeof row === "object"));
}

export async function getAllEntriesIncludingDeleted() {
  return getLocalEntries();
}

export async function clearAllEntries() {
  await runEntryStore("readwrite", (store) => store.clear());
}

export async function getLocalEntryById(id) {
  return runEntryStore("readonly", (store) => store.get(id));
}

export async function updateLocalEntry(id, updates) {
  const existing = await getLocalEntryById(id);
  if (!existing) {
    throw new Error("Eintrag wurde nicht gefunden.");
  }

  const content = hasOwn(updates, "content")
    ? updates.content
    : existing.content;
  const row = {
    ...existing,
    ...updates,
    content,
    bullets: hasOwn(updates, "bullets")
      ? updates.bullets
      : String(content || "").split("\n").filter(Boolean),
    updated_at: new Date().toISOString(),
    source: "local",
  };

  await runEntryStore("readwrite", (store) => store.put(row));
  return row;
}

export function softDeleteLocalEntry(id) {
  return updateLocalEntry(id, { deleted_at: new Date().toISOString() });
}

export function restoreLocalEntry(id) {
  return updateLocalEntry(id, { deleted_at: null });
}

export async function permanentlyDeleteLocalEntry(id) {
  const existing = await getLocalEntryById(id);
  if (!existing?.deleted_at) {
    return;
  }

  await runEntryStore("readwrite", (store) => store.delete(id));
}

export async function permanentlyDeleteLocalTrashEntries() {
  const rows = await getLocalEntries();
  const deletedIds = rows.filter((row) => row?.deleted_at).map((row) => row.id);

  if (!deletedIds.length) {
    return;
  }

  await runEntryStore("readwrite", (store) => {
    for (const id of deletedIds) {
      store.delete(id);
    }
  });
}

export async function bulkImportEntries(entries) {
  const rows = entries.map(normalizeLocalEntry);
  await runEntryStore("readwrite", (store) => {
    for (const row of rows) {
      store.put(row);
    }
  });
  return rows;
}
