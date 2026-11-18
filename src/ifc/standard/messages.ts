import type { StandardModel } from "./model";

export type WorkerRequest = { bytes: Uint8Array };
export type WorkerResponse =
  | { type: "progress"; progress: number; detail: string }
  | { type: "done"; model: StandardModel }
  | { type: "error"; code: string; message: string };

/** The typed-array buffers of a model, moved (not copied) between threads. */
export function standardModelTransferables(model: StandardModel): Transferable[] {
  return model.geometry.chunks.flatMap((chunk) => [
    chunk.positions.buffer,
    chunk.normals.buffer,
    chunk.colors.buffer,
    chunk.uvs.buffer,
    chunk.indices.buffer,
  ]);
}
