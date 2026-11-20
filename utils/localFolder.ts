const DB_NAME = 'pagescribe-fs';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'vault-dir';

function openFsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openFsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openFsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function pickLocalFolder(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as { showDirectoryPicker?: (opts?: any) => Promise<FileSystemDirectoryHandle> })
    .showDirectoryPicker;
  if (!picker) {
    throw new Error('File System Access API is not supported in this context.');
  }
  const handle = await picker({ mode: 'readwrite' });
  await saveDirectoryHandle(handle);
  return handle;
}

export async function writeMarkdownToSavedFolder(
  filename: string,
  content: string
): Promise<string> {
  let handle = await getSavedDirectoryHandle();
  if (!handle) {
    handle = await pickLocalFolder();
  }

  const permHost = handle as unknown as {
    queryPermission?: (opts: { mode: string }) => Promise<string>;
    requestPermission?: (opts: { mode: string }) => Promise<string>;
  };

  if (permHost.queryPermission && permHost.requestPermission) {
    let status = await permHost.queryPermission({ mode: 'readwrite' });
    if (status !== 'granted') {
      status = await permHost.requestPermission({ mode: 'readwrite' });
    }
    if (status !== 'granted') {
      throw new Error('Write permission to local folder was denied.');
    }
  }

  const safeName = filename.endsWith('.md') ? filename : `${filename}.md`;
  const fileHandle = await handle.getFileHandle(safeName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return `${handle.name}/${safeName}`;
}
