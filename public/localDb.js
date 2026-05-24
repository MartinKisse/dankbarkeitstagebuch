const DB_NAME = "gratitude_journal";
const DB_VERSION = 1;
const ENTRIES_STORE = "entries";
const DB_OPERATION_TIMEOUT_MS = 15_000;
const BULK_IMPORT_TIMEOUT_MS = 15_000;

function createDbError(message, cause) {
  const error = new Error(cause?.message ? `${message}: ${cause.message}` : message);
  error.cause = cause;
  return error;
}

function closeLocalDb(db) {
  try {
    db?.close();
  } catch (error) {
    console.warn("[local-db] db close failed", error);
  }
}

function openLocalDb() {
  console.log("[local-db] opening db");

  return new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error(`IndexedDB open timed out after ${DB_OPERATION_TIMEOUT_MS} ms.`));
    }, DB_OPERATION_TIMEOUT_MS);

    const finish = (callback) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      callback();
    };

    request.addEventListener("upgradeneeded", () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
        const store = db.createObjectStore(ENTRIES_STORE, { keyPath: "id" });
        store.createIndex("entry_date", "entry_date", { unique: false });
        store.createIndex("deleted_at", "deleted_at", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    });

    request.addEventListener("success", () => {
      console.log("[local-db] db opened");
      finish(() => resolve(request.result));
    });
    request.addEventListener("error", () => {
      finish(() => reject(createDbError("IndexedDB open failed", request.error)));
    });
    request.addEventListener("blocked", () => {
      console.warn("[local-db] db open blocked");
    });
  });
}

async function runEntryStore(mode, callback, label = "operation") {
  const db = await openLocalDb();

  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      let transaction = null;
      let store = null;
      let request = null;
      let result = null;
      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        try {
          transaction?.abort();
        } catch {
          // Transaction may already be inactive.
        }
        reject(new Error(`IndexedDB ${label} timed out after ${DB_OPERATION_TIMEOUT_MS} ms.`));
      }, DB_OPERATION_TIMEOUT_MS);

      const finish = (callbackFn) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        callbackFn();
      };

      try {
        console.log(`[local-db] starting ${mode} transaction`, { label });
        transaction = db.transaction(ENTRIES_STORE, mode);
        console.log("[local-db] transaction started", { label });
        store = transaction.objectStore(ENTRIES_STORE);
        console.log("[local-db] object store ready", { label });
      } catch (error) {
        finish(() => reject(createDbError(`IndexedDB ${label} transaction setup failed`, error)));
        return;
      }

      transaction.addEventListener("complete", () => {
        finish(() => resolve(result));
      });

      transaction.addEventListener("error", () => {
        finish(() => reject(createDbError(`IndexedDB ${label} transaction failed`, transaction.error)));
      });

      transaction.addEventListener("abort", () => {
        finish(() => reject(createDbError(`IndexedDB ${label} transaction aborted`, transaction.error)));
      });

      try {
        request = callback(store);
      } catch (error) {
        finish(() => reject(createDbError(`IndexedDB ${label} request setup failed`, error)));
        try {
          transaction.abort();
        } catch {
          // Transaction may already be inactive.
        }
        return;
      }

      if (request) {
        request.addEventListener("success", () => {
          result = request.result;
        });
        request.addEventListener("error", (event) => {
          event.preventDefault();
          finish(() => reject(createDbError(`IndexedDB ${label} request failed`, request.error)));
          try {
            transaction.abort();
          } catch {
            // Transaction may already be inactive.
          }
        });
        request.addEventListener("abort", () => {
          finish(() => reject(createDbError(`IndexedDB ${label} request aborted`, request.error)));
        });
      }
    });
  } finally {
    closeLocalDb(db);
  }
}

async function readAllLocalRowsWithCursor() {
  const db = await openLocalDb();

  try {
    return await new Promise((resolve, reject) => {
      const rows = [];
      let settled = false;
      let transaction = null;
      let store = null;
      let request = null;
      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        try {
          transaction?.abort();
        } catch {
          // Transaction may already be inactive.
        }
        reject(new Error(`IndexedDB cursor iteration timed out after ${DB_OPERATION_TIMEOUT_MS} ms (${rows.length} entries loaded).`));
      }, DB_OPERATION_TIMEOUT_MS);

      const finish = (callback) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        callback();
      };

      try {
        console.log("[local-db] starting readonly transaction");
        transaction = db.transaction(ENTRIES_STORE, "readonly");
        console.log("[local-db] transaction started");
        store = transaction.objectStore(ENTRIES_STORE);
        console.log("[local-db] object store ready");
      } catch (error) {
        finish(() => reject(createDbError("IndexedDB readonly transaction setup failed", error)));
        return;
      }

      transaction.addEventListener("complete", () => {
        console.log("[local-db] entries loaded:", rows.length);
        finish(() => resolve(rows));
      });

      transaction.addEventListener("error", () => {
        finish(() => reject(createDbError("IndexedDB readonly transaction failed", transaction.error)));
      });

      transaction.addEventListener("abort", () => {
        finish(() => reject(createDbError("IndexedDB readonly transaction aborted", transaction.error)));
      });

      try {
        console.log("[local-db] requesting getAll skipped; using cursor fallback");
        console.log("[local-db] requesting cursor");
        request = store.openCursor();
      } catch (error) {
        finish(() => reject(createDbError("IndexedDB openCursor setup failed", error)));
        try {
          transaction.abort();
        } catch {
          // Transaction may already be inactive.
        }
        return;
      }

      request.addEventListener("success", (event) => {
        const cursor = event.target.result;

        if (!cursor) {
          console.log("[local-db] cursor completed");
          return;
        }

        rows.push(cursor.value);
        cursor.continue();
      });

      request.addEventListener("error", (event) => {
        event.preventDefault();
        finish(() => reject(createDbError("IndexedDB cursor request failed", request.error)));
        try {
          transaction.abort();
        } catch {
          // Transaction may already be inactive.
        }
      });
    });
  } finally {
    closeLocalDb(db);
  }
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
  await runEntryStore("readwrite", (store) => store.put(row), "create entry");
  return row;
}

export async function getLocalEntries() {
  const rows = await readAllLocalRowsWithCursor();
  return sortLocalRows((rows || []).filter((row) => row && typeof row === "object"));
}

export async function getAllEntriesIncludingDeleted() {
  return getLocalEntries();
}

export async function clearAllEntries() {
  await runEntryStore("readwrite", (store) => store.clear(), "clear entries");
}

export async function getLocalEntryById(id) {
  return runEntryStore("readonly", (store) => store.get(id), "get entry by id");
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

  await runEntryStore("readwrite", (store) => store.put(row), "update entry");
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

  await runEntryStore("readwrite", (store) => store.delete(id), "delete entry");
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
  }, "delete trash entries");
}

export async function bulkImportEntries(entries) {
  const rows = entries.map(normalizeLocalEntry);

  console.log("[backup-import] IndexedDB bulk import started", {
    count: rows.length,
  });

  if (!rows.length) {
    console.log("[backup-import] IndexedDB bulk import skipped: no rows");
    return rows;
  }

  const db = await openLocalDb();

  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      let completedWrites = 0;
      let transaction = null;
      let store = null;
      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        try {
          transaction?.abort();
        } catch {
          // Transaction may already be inactive.
        }
        reject(new Error(`IndexedDB transaction timed out after ${BULK_IMPORT_TIMEOUT_MS} ms (${completedWrites}/${rows.length} writes completed).`));
      }, BULK_IMPORT_TIMEOUT_MS);

      const finish = (callback) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        callback();
      };

      try {
        console.log("[local-db] starting readwrite transaction", { label: "bulk import" });
        transaction = db.transaction(ENTRIES_STORE, "readwrite");
        console.log("[local-db] transaction started", { label: "bulk import" });
        store = transaction.objectStore(ENTRIES_STORE);
        console.log("[local-db] object store ready", { label: "bulk import" });
      } catch (error) {
        finish(() => reject(createDbError("IndexedDB bulk import transaction setup failed", error)));
        return;
      }

      transaction.addEventListener("complete", () => {
        console.log("[backup-import] IndexedDB bulk import completed", {
          count: rows.length,
        });
        finish(resolve);
      });

      transaction.addEventListener("error", () => {
        finish(() => reject(createDbError("IndexedDB bulk import transaction failed", transaction.error)));
      });

      transaction.addEventListener("abort", () => {
        finish(() => reject(createDbError("IndexedDB bulk import transaction aborted", transaction.error)));
      });

      rows.forEach((row, index) => {
        if (settled) {
          return;
        }

        console.log("[backup-import] IndexedDB write started", {
          index,
          id: row.id,
          entry_date: row.entry_date,
        });

        let request = null;
        try {
          request = store.put(row);
        } catch (error) {
          finish(() => reject(new Error(`IndexedDB write failed at index ${index}, id ${row.id || "unknown"}: ${error.message || error}`)));
          try {
            transaction.abort();
          } catch {
            // Transaction may already be inactive.
          }
          return;
        }

        request.addEventListener("success", () => {
          completedWrites += 1;
          console.log("[backup-import] IndexedDB write completed", {
            index,
            id: row.id,
            completedWrites,
            totalWrites: rows.length,
          });
        });

        request.addEventListener("error", (event) => {
          event.preventDefault();
          const reason = request.error?.message || "unknown IndexedDB request error";
          finish(() => reject(new Error(`IndexedDB write failed at index ${index}, id ${row.id || "unknown"}: ${reason}`)));
          try {
            transaction.abort();
          } catch {
            // Transaction may already be inactive.
          }
        });
        request.addEventListener("abort", () => {
          finish(() => reject(new Error(`IndexedDB write aborted at index ${index}, id ${row.id || "unknown"}`)));
        });
      });
    });
  } finally {
    closeLocalDb(db);
  }

  return rows;
}
