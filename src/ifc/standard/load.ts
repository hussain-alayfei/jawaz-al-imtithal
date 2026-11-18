import type { WorkerRequest, WorkerResponse } from "./messages";
import type { StandardModel } from "./model";

/*
 * Reads a standard IFC file off the main thread in the browser (a module worker that
 * owns web-ifc and its WASM), and directly in Node for tests. Both paths run the same
 * readStandardModel().
 */

type Progress = (progress: number, detail: string) => void;

export class StandardLoadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function loadStandardModel(
  bytes: Uint8Array,
  options: { signal?: AbortSignal; onProgress?: Progress } = {},
): Promise<StandardModel> {
  const inBrowser = typeof window !== "undefined" && typeof Worker !== "undefined";
  if (!inBrowser) {
    const [{ IfcAPI }, { readStandardModel, StandardIfcError }] = await Promise.all([
      import("web-ifc"),
      import("./read"),
    ]);
    const api = new IfcAPI();
    await api.Init();
    try {
      return await readStandardModel(api, bytes, options.onProgress);
    } catch (error) {
      if (error instanceof StandardIfcError) throw new StandardLoadError(error.code, error.message);
      throw error;
    }
  }

  const worker = new Worker(new URL("./ifc.worker.ts", import.meta.url), { type: "module" });
  return await new Promise<StandardModel>((resolve, reject) => {
    const stop = () => {
      worker.terminate();
      reject(new DOMException("Aborted", "AbortError"));
    };
    options.signal?.addEventListener("abort", stop, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "progress") {
        options.onProgress?.(message.progress, message.detail);
        return;
      }
      options.signal?.removeEventListener("abort", stop);
      worker.terminate();
      if (message.type === "done") resolve(message.model);
      else reject(new StandardLoadError(message.code, message.message));
    };
    worker.onerror = (event) => {
      options.signal?.removeEventListener("abort", stop);
      worker.terminate();
      reject(new StandardLoadError("WORKER_FAILED", event.message || "تعذر تشغيل قارئ IFC."));
    };
    // Send a copy: the upload bytes are still needed for hashing on this thread.
    const copy = bytes.slice();
    worker.postMessage({ bytes: copy } satisfies WorkerRequest, [copy.buffer]);
  });
}
