import {
  IfcProcessingError,
  type IfcUpload,
  type ParsedStepDocument,
  type StepEntity,
} from "./types";

const SUPPORTED_SCHEMAS = new Set(["IFC4", "IFC4X3", "IFC4X3_ADD2"]);
const CHARACTER_CHUNK = 64 * 1024;
const ENTITY_CHUNK = 500;

type ParseOptions = {
  signal?: AbortSignal;
  onProgress?: (
    progress: number,
    detail: string,
    evidence?: Record<string, string | number | boolean>,
  ) => void;
};

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

async function yieldToMainThread(signal?: AbortSignal) {
  await new Promise<void>((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => resolve());
      return;
    }
    globalThis.setTimeout(resolve, 0);
  });
  throwIfAborted(signal);
}

async function reportPhase(
  progress: number,
  detail: string,
  options: ParseOptions,
  evidence: Record<string, string | number | boolean>,
) {
  options.onProgress?.(progress, detail, evidence);
  await yieldToMainThread(options.signal);
}

function splitTopLevel(value: string): string[] {
  const values: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];

    if (character === "'") {
      current += character;
      if (inString && next === "'") {
        current += next;
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (character === "(") depth += 1;
      if (character === ")") depth -= 1;
      if (character === "," && depth === 0) {
        values.push(current.trim());
        current = "";
        continue;
      }
    }

    current += character;
  }

  if (current.trim() || value.endsWith(",")) values.push(current.trim());
  return values;
}

async function splitRecords(
  data: string,
  options: ParseOptions,
): Promise<string[]> {
  const records: string[] = [];
  let current = "";
  let inString = false;
  let collecting = false;
  let nextYield = CHARACTER_CHUNK;

  for (let index = 0; index < data.length; index += 1) {
    const character = data[index];
    const next = data[index + 1];

    if (!collecting) {
      if (character === "#") {
        collecting = true;
        current = character;
      }
    } else {
      current += character;
      if (character === "'") {
        if (inString && next === "'") {
          current += next;
          index += 1;
        } else {
          inString = !inString;
        }
      }

      if (character === ";" && !inString) {
        records.push(current.trim());
        current = "";
        collecting = false;
      }
    }

    if (index >= nextYield) {
      const fraction = data.length ? index / data.length : 1;
      options.onProgress?.(
        0.15 + fraction * 0.35,
        `قراءة قسم DATA: ${Math.round(fraction * 100)}%`,
        { scannedCharacters: index, discoveredRecords: records.length },
      );
      nextYield += CHARACTER_CHUNK;
      await yieldToMainThread(options.signal);
    }
  }

  if (collecting && current.trim()) {
    throw new IfcProcessingError(
      "validate",
      "UNTERMINATED_RECORD",
      "يوجد سجل STEP غير مكتمل في قسم DATA.",
    );
  }

  return records;
}

function parseRecord(raw: string): StepEntity {
  const match = raw.match(
    /^#(\d+)\s*=\s*([A-Z][A-Z0-9_]*)\s*\(([\s\S]*)\)\s*;$/i,
  );
  if (!match) {
    throw new IfcProcessingError(
      "validate",
      "INVALID_RECORD",
      `تعذر تحليل سجل STEP: ${raw.slice(0, 80)}`,
    );
  }

  const stepId = Number(match[1]);
  const type = match[2].toUpperCase();
  if (!type.startsWith("IFC")) {
    throw new IfcProcessingError(
      "validate",
      "NON_IFC_RECORD",
      `السجل #${stepId} ليس كيان IFC مدعومًا.`,
    );
  }

  const args = splitTopLevel(match[3]);
  const references = [...match[3].matchAll(/#(\d+)/g)].map((item) =>
    Number(item[1]),
  );

  return { stepId, type, args, raw, references };
}

async function sha256(bytes: Uint8Array): Promise<{
  hash: string;
  byteLength: number;
}> {
  const digestSource = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(digestSource).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestSource);
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { hash, byteLength: bytes.byteLength };
}

export async function parseStepDocument(
  upload: IfcUpload,
  options: ParseOptions = {},
): Promise<ParsedStepDocument> {
  throwIfAborted(options.signal);
  if (!upload.name.toLowerCase().endsWith(".ifc")) {
    throw new IfcProcessingError(
      "validate",
      "UNSUPPORTED_EXTENSION",
      "الملف غير مدعوم. اختر ملفًا بامتداد .ifc",
    );
  }
  if (!upload.bytes.byteLength) {
    throw new IfcProcessingError(
      "validate",
      "EMPTY_FILE",
      "ملف IFC فارغ ولا يحتوي بيانات قابلة للفحص.",
    );
  }
  if (upload.bytes.byteLength > 50 * 1024 * 1024) {
    throw new IfcProcessingError(
      "validate",
      "FILE_TOO_LARGE",
      "حجم الملف يتجاوز الحد الحالي البالغ 50 MB.",
    );
  }

  await reportPhase(
    0.03,
    "تم استلام بايتات الملف",
    options,
    { byteLength: upload.bytes.byteLength },
  );
  let decoded = "";
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(upload.bytes);
  } catch {
    throw new IfcProcessingError(
      "validate",
      "INVALID_TEXT_ENCODING",
      "تعذر فك ترميز الملف بوصفه UTF-8 صالحًا.",
    );
  }
  const normalized = decoded.replace(/^\uFEFF/, "");
  if (!normalized.trim()) {
    throw new IfcProcessingError(
      "validate",
      "EMPTY_FILE",
      "ملف IFC فارغ ولا يحتوي بيانات قابلة للفحص.",
    );
  }
  await reportPhase(
    0.08,
    "تم فك ترميز الملف والتحقق من وجود محتوى",
    options,
    { decodedCharacters: normalized.length },
  );
  if (
    !/^\s*ISO-10303-21\s*;/i.test(normalized) ||
    !/END-ISO-10303-21\s*;\s*$/i.test(normalized)
  ) {
    throw new IfcProcessingError(
      "validate",
      "INVALID_ENVELOPE",
      "غلاف STEP غير مكتمل؛ يجب أن يبدأ وينتهي بترويسة ISO-10303-21.",
    );
  }

  const schemaMatch = normalized.match(
    /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)\s*\)\s*;/i,
  );
  if (!schemaMatch) {
    throw new IfcProcessingError(
      "validate",
      "MISSING_SCHEMA",
      "لم يتم العثور على FILE_SCHEMA في ترويسة IFC.",
    );
  }
  const schema = schemaMatch[1].toUpperCase();
  if (!SUPPORTED_SCHEMAS.has(schema)) {
    throw new IfcProcessingError(
      "validate",
      "UNSUPPORTED_SCHEMA",
      `المخطط ${schema} غير مدعوم في هذه النسخة. استخدم IFC4 أو IFC4X3.`,
    );
  }
  await reportPhase(
    0.15,
    `تم التحقق من غلاف STEP ومخطط ${schema}`,
    options,
    { schema },
  );

  const dataMatch = normalized.match(/\bDATA\s*;([\s\S]*?)\bENDSEC\s*;/i);
  if (!dataMatch) {
    throw new IfcProcessingError(
      "validate",
      "MISSING_DATA_SECTION",
      "قسم DATA غير موجود أو غير مكتمل.",
    );
  }

  const rawRecords = await splitRecords(dataMatch[1], options);
  await reportPhase(
    0.5,
    `اكتمل فصل ${rawRecords.length} سجل STEP`,
    options,
    { discoveredRecords: rawRecords.length },
  );
  const entities: StepEntity[] = [];
  for (let index = 0; index < rawRecords.length; index += 1) {
    entities.push(parseRecord(rawRecords[index]));
    if ((index + 1) % ENTITY_CHUNK === 0) {
      const fraction = (index + 1) / rawRecords.length;
      options.onProgress?.(
        0.5 + fraction * 0.18,
        `تحليل سجلات EXPRESS: ${index + 1} من ${rawRecords.length}`,
        { parsedRecords: index + 1, totalRecords: rawRecords.length },
      );
      await yieldToMainThread(options.signal);
    }
  }
  if (!entities.length) {
    throw new IfcProcessingError(
      "validate",
      "EMPTY_DATA_SECTION",
      "قسم DATA لا يحتوي سجلات IFC.",
    );
  }
  await reportPhase(
    0.68,
    `اكتمل تحليل ${entities.length} سجل EXPRESS`,
    options,
    { parsedRecords: entities.length },
  );

  const ids = new Set<number>();
  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index];
    if (ids.has(entity.stepId)) {
      throw new IfcProcessingError(
        "validate",
        "DUPLICATE_STEP_ID",
        `المعرف #${entity.stepId} مكرر في الملف.`,
      );
    }
    ids.add(entity.stepId);
    if ((index + 1) % ENTITY_CHUNK === 0) {
      const fraction = (index + 1) / entities.length;
      options.onProgress?.(
        0.68 + fraction * 0.1,
        `فحص تفرد المعرفات: ${index + 1} من ${entities.length}`,
        { uniqueStepIds: ids.size },
      );
      await yieldToMainThread(options.signal);
    }
  }
  await reportPhase(
    0.78,
    `اكتمل فحص ${ids.size} معرف STEP فريد`,
    options,
    { uniqueStepIds: ids.size },
  );

  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index];
    const missingReference = entity.references.find(
      (reference) => !ids.has(reference),
    );
    if (missingReference !== undefined) {
      throw new IfcProcessingError(
        "validate",
        "BROKEN_REFERENCE",
        `السجل #${entity.stepId} يشير إلى معرف غير موجود #${missingReference}.`,
      );
    }
    if ((index + 1) % ENTITY_CHUNK === 0) {
      const fraction = (index + 1) / entities.length;
      options.onProgress?.(
        0.78 + fraction * 0.12,
        `فحص المراجع: ${index + 1} من ${entities.length}`,
        { checkedReferencesFor: index + 1 },
      );
      await yieldToMainThread(options.signal);
    }
  }
  await reportPhase(
    0.9,
    `اكتمل فحص مراجع ${entities.length} سجلًا`,
    options,
    { checkedReferencesFor: entities.length },
  );

  await reportPhase(
    0.92,
    "حساب بصمة SHA-256 من البايتات الأصلية",
    options,
    { records: entities.length },
  );
  throwIfAborted(options.signal);
  const digest = await sha256(upload.bytes);
  throwIfAborted(options.signal);
  await reportPhase(
    1,
    "اكتملت سلامة الملف والبصمة",
    options,
    { records: entities.length, sha256: digest.hash },
  );
  return {
    schema,
    entities,
    sha256: digest.hash,
    byteLength: digest.byteLength,
  };
}

export { splitTopLevel };
