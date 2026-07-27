import {
  IfcProcessingError,
  type IfcUpload,
  type ParsedStepDocument,
  type StepEntity,
} from "./types";

const SUPPORTED_SCHEMAS = new Set(["IFC4", "IFC4X3", "IFC4X3_ADD2"]);

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

function splitRecords(data: string): string[] {
  const records: string[] = [];
  let current = "";
  let inString = false;
  let collecting = false;

  for (let index = 0; index < data.length; index += 1) {
    const character = data[index];
    const next = data[index + 1];

    if (!collecting) {
      if (character === "#") {
        collecting = true;
        current = character;
      }
      continue;
    }

    current += character;
    if (character === "'") {
      if (inString && next === "'") {
        current += next;
        index += 1;
        continue;
      }
      inString = !inString;
    }

    if (character === ";" && !inString) {
      records.push(current.trim());
      current = "";
      collecting = false;
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

async function sha256(value: string): Promise<{
  hash: string;
  byteLength: number;
}> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { hash, byteLength: bytes.byteLength };
}

export async function parseStepDocument(
  upload: IfcUpload,
): Promise<ParsedStepDocument> {
  if (!upload.name.toLowerCase().endsWith(".ifc")) {
    throw new IfcProcessingError(
      "validate",
      "UNSUPPORTED_EXTENSION",
      "الملف غير مدعوم. اختر ملفًا بامتداد .ifc",
    );
  }
  if (!upload.text.trim()) {
    throw new IfcProcessingError(
      "validate",
      "EMPTY_FILE",
      "ملف IFC فارغ ولا يحتوي بيانات قابلة للفحص.",
    );
  }
  if (upload.size > 50 * 1024 * 1024) {
    throw new IfcProcessingError(
      "validate",
      "FILE_TOO_LARGE",
      "حجم الملف يتجاوز الحد الحالي البالغ 50 MB.",
    );
  }

  const normalized = upload.text.replace(/^\uFEFF/, "");
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

  const dataMatch = normalized.match(/\bDATA\s*;([\s\S]*?)\bENDSEC\s*;/i);
  if (!dataMatch) {
    throw new IfcProcessingError(
      "validate",
      "MISSING_DATA_SECTION",
      "قسم DATA غير موجود أو غير مكتمل.",
    );
  }

  const entities = splitRecords(dataMatch[1]).map(parseRecord);
  if (!entities.length) {
    throw new IfcProcessingError(
      "validate",
      "EMPTY_DATA_SECTION",
      "قسم DATA لا يحتوي سجلات IFC.",
    );
  }

  const ids = new Set<number>();
  for (const entity of entities) {
    if (ids.has(entity.stepId)) {
      throw new IfcProcessingError(
        "validate",
        "DUPLICATE_STEP_ID",
        `المعرف #${entity.stepId} مكرر في الملف.`,
      );
    }
    ids.add(entity.stepId);
  }

  for (const entity of entities) {
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
  }

  const digest = await sha256(normalized);
  return {
    schema,
    entities,
    sha256: digest.hash,
    byteLength: digest.byteLength,
  };
}

export { splitTopLevel };
