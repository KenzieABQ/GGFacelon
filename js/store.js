// Scans live in IndexedDB (photos are too big for localStorage). Small prefs live in localStorage.
const DB = 'ggfacelon', STORE = 'scans', VER = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
  });
};

export const listScans = async () => {
  const all = await tx('readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => b.created - a.created);
};
export const saveScan = (scan) => tx('readwrite', (s) => s.put(scan));
export const deleteScan = (id) => tx('readwrite', (s) => s.delete(id));

export const prefs = {
  get(k, d) {
    try { const v = localStorage.getItem('ggf.' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('ggf.' + k, JSON.stringify(v)); } catch { /* private mode */ }
  },
};
