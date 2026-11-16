var offlineDatabasePromise = null;
var offlineDatabaseName = "astralogs-offline-v1";

function openOfflineDatabase() {
  if (!window.indexedDB) {
    return Promise.reject(new Error("This browser does not support offline storage."));
  }
  if (offlineDatabasePromise) return offlineDatabasePromise;

  offlineDatabasePromise = new Promise(function (resolve, reject) {
    var request = window.indexedDB.open(offlineDatabaseName, 1);
    request.onupgradeneeded = function () {
      var database = request.result;
      if (!database.objectStoreNames.contains("pending")) {
        database.createObjectStore("pending", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("snapshots")) {
        database.createObjectStore("snapshots", { keyPath: "userId" });
      }
    };
    request.onsuccess = function () {
      var database = request.result;
      database.onversionchange = function () {
        database.close();
        offlineDatabasePromise = null;
      };
      resolve(database);
    };
    request.onerror = function () {
      offlineDatabasePromise = null;
      reject(request.error || new Error("Could not open offline storage."));
    };
    request.onblocked = function () {
      offlineDatabasePromise = null;
      reject(new Error("Offline storage is busy. Close other AstraLogs tabs and try again."));
    };
  });
  return offlineDatabasePromise;
}

function offlineStoreRequest(storeName, mode, operation) {
  return openOfflineDatabase().then(function (database) {
    return new Promise(function (resolve, reject) {
      var transaction = database.transaction(storeName, mode);
      var request;
      transaction.oncomplete = function () {
        resolve(request ? request.result : undefined);
      };
      transaction.onerror = function () {
        reject(transaction.error || new Error("Could not update offline storage."));
      };
      transaction.onabort = function () {
        reject(transaction.error || new Error("Offline storage transaction was canceled."));
      };
      try {
        request = operation(transaction.objectStore(storeName));
      } catch (error) {
        transaction.abort();
        reject(error);
        return;
      }
      request.onerror = function () {
        reject(request.error || new Error("Could not update offline storage."));
      };
    });
  });
}

function createOfflineId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  if (!window.crypto || !window.crypto.getRandomValues) {
    throw new Error("Secure local IDs are not available in this browser.");
  }
  var bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  var hex = Array.prototype.map.call(bytes, function (byte) {
    return byte.toString(16).padStart(2, "0");
  }).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) +
    "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}

function isNetworkUnavailable(error) {
  if (window.navigator.onLine === false) return true;
  var message = error && error.message ? error.message : String(error || "");
  return /failed to fetch|networkerror|network request failed|load failed|connection (?:lost|closed|reset|refused|failed)|timed? ?out/i.test(message);
}

function getPendingOfflineActions(userId) {
  return offlineStoreRequest("pending", "readonly", function (store) {
    return store.getAll();
  }).then(function (items) {
    return (items || []).filter(function (item) { return item.userId === userId; })
      .sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt); });
  });
}

function savePendingOfflineAction(action) {
  return offlineStoreRequest("pending", "readwrite", function (store) {
    return store.put(action);
  });
}

async function enqueueOfflineAction(action) {
  if (!action || !action.userId || !action.type) {
    throw new Error("The offline save is missing its account or record type.");
  }

  if (action.type === "time_punch") {
    var pending = await getPendingOfflineActions(action.userId);
    var existing = pending.find(function (item) {
      return item.type === "time_punch" &&
        item.workDate === action.workDate &&
        item.field === action.field;
    });
    if (existing) {
      if (!action.allowCorrection) {
        throw new Error("A punch for this date and time slot is already waiting to sync.");
      }
      existing.timestamp = action.timestamp;
      existing.allowCorrection = true;
      existing.lastError = null;
      await savePendingOfflineAction(existing);
      return existing;
    }
  }

  var pendingAction = Object.assign({
    id: createOfflineId(),
    createdAt: new Date().toISOString(),
    lastError: null
  }, action);
  await offlineStoreRequest("pending", "readwrite", function (store) {
    return store.add(pendingAction);
  });
  return pendingAction;
}

function removePendingOfflineAction(actionId) {
  return offlineStoreRequest("pending", "readwrite", function (store) {
    return store.delete(actionId);
  });
}

async function removePendingTimePunch(userId, workDate, field) {
  if (!window.indexedDB) return;
  var pending = await getPendingOfflineActions(userId);
  var matches = pending.filter(function (action) {
    return action.type === "time_punch" &&
      action.workDate === workDate &&
      action.field === field;
  });
  await Promise.all(matches.map(function (action) {
    return removePendingOfflineAction(action.id);
  }));
}

function saveOfflineSnapshot(userId, snapshot) {
  return offlineStoreRequest("snapshots", "readwrite", function (store) {
    return store.put({
      userId: userId,
      snapshot: snapshot,
      updatedAt: new Date().toISOString()
    });
  });
}

function getOfflineSnapshot(userId) {
  return offlineStoreRequest("snapshots", "readonly", function (store) {
    return store.get(userId);
  }).then(function (record) {
    return record ? record.snapshot : null;
  });
}
