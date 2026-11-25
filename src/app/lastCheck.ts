import type { ActivityId, FacilityDetails } from "../data";
import type { IfcUpload } from "../ifc/types";

/*
 * The last finished check, kept in this browser's IndexedDB (never sent anywhere) so that reloading the
 * results or the report can run the same file again instead of losing them. One entry, replaced by each
 * new check, and ignored after a day.
 */

export interface LastCheck {
  upload: IfcUpload;
  activityId: ActivityId;
  /** As the check read it, with the commercial registration number and the visitor's declarations (the report's
      «إقرار المستخدم»); entries saved before these fields existed simply lack them. */
  facility: FacilityDetails;
  savedAt: number;
}

const DB = "mowaem";
const STORE = "last-check";
const KEY = "latest";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Saves the check's inputs; failures (private mode, quota) are ignored: the session goes on without it. */
export async function saveLastCheck(entry: Omit<LastCheck, "savedAt">): Promise<void> {
  try {
    const db = await open();
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put({ ...entry, savedAt: Date.now() } satisfies LastCheck, KEY);
    await done(transaction);
    db.close();
  } catch {
    // Not kept: a reload will ask for a new check.
  }
}

/** The saved inputs, if there are any from the last day. */
export async function loadLastCheck(): Promise<LastCheck | undefined> {
  try {
    const db = await open();
    const transaction = db.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(KEY);
    const value = await new Promise<LastCheck | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as LastCheck | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!value || !(value.upload?.bytes instanceof Uint8Array) || Date.now() - value.savedAt > MAX_AGE_MS) return undefined;
    return value;
  } catch {
    return undefined;
  }
}
