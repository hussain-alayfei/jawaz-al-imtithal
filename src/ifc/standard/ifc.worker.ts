/// <reference lib="webworker" />
import { IfcAPI } from "web-ifc";
import wasmUrl from "web-ifc/web-ifc.wasm?url";
import { readStandardModel, StandardIfcError } from "./read";
import { standardModelTransferables, type WorkerRequest, type WorkerResponse } from "./messages";

/* Self-hosted WASM (bundled by Vite next to the app), single-threaded so the page needs
   no cross-origin isolation headers. */
let api: IfcAPI | undefined;

async function ready(): Promise<IfcAPI> {
  if (!api) {
    const instance = new IfcAPI();
    await instance.Init(() => wasmUrl, true);
    api = instance;
  }
  return api;
}

const post = (message: WorkerResponse, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const instance = await ready();
    const model = await readStandardModel(instance, event.data.bytes, (progress, detail) =>
      post({ type: "progress", progress, detail }),
    );
    post({ type: "done", model }, standardModelTransferables(model));
  } catch (error) {
    if (error instanceof StandardIfcError) {
      post({ type: "error", code: error.code, message: error.message });
    } else {
      post({
        type: "error",
        code: "READ_FAILED",
        message: `تعذر قراءة هندسة الملف: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
};
