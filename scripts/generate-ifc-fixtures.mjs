import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureDirectory = path.join(projectDirectory, "test-fixtures");

const configurations = {
  restaurant: {
    prefix: "R",
    counts: { spaces: 6, doors: 7, review: 148, ready: 156 },
    spaces: [
      ["DINING", "منطقة الطعام", "SPACE-DINING", false],
      ["KITCHEN", "المطبخ", "SPACE-KITCHEN", true],
      ["STORAGE", "المخزن", "SPACE-STORAGE", true],
      ["SERVICE", "منطقة الخدمة", "SPACE-SERVICE", false],
      ["WC", "دورة المياه", "SPACE-WC", true],
      ["UTILITY", "غرفة المنافع", "SPACE-UTILITY", true],
    ],
    doors: [
      ["EXIT", "باب مخرج الطوارئ", "D-EXIT-02"],
      ["KITCHEN", "باب المطبخ", "D-KITCHEN-01"],
      ["STORAGE", "باب المخزن", "D-STORAGE-01"],
      ["SERVICE", "باب الخدمة", "D-SERVICE-01"],
      ["WC", "باب دورة المياه", "D-WC-01"],
      ["UTILITY", "باب المنافع", "D-UTILITY-01"],
      ["ENTRANCE", "باب المدخل", "D-ENTRANCE-01"],
    ],
    issueRuleIds: [
      "DOOR-WIDTH-001",
      "ACCESS-ROUTE-001",
      "KITCHEN-VENT-001",
    ],
  },
  cafe: {
    prefix: "C",
    counts: { spaces: 6, doors: 5, review: 132, ready: 141 },
    spaces: [
      ["SEATING", "منطقة الجلوس", "CAFE-SPACE-SEATING", false],
      ["PREP", "منطقة التحضير والبار", "CAFE-SPACE-BAR", false],
      ["STORAGE", "المخزن", "CAFE-SPACE-STORAGE", true],
      ["SERVICE", "منطقة الخدمة", "CAFE-SPACE-SERVICE", false],
      ["WC", "دورة المياه", "CAFE-SPACE-WC", true],
      ["UTILITY", "غرفة المنافع", "CAFE-SPACE-UTILITY", true],
    ],
    doors: [
      ["EXIT", "باب المخرج", "CAFE-D-EXIT-02"],
      ["STORAGE", "باب المخزن", "CAFE-D-STORAGE-01"],
      ["SERVICE", "باب الخدمة", "CAFE-D-SERVICE-01"],
      ["WC", "باب دورة المياه", "CAFE-D-WC-01"],
      ["ENTRANCE", "باب المدخل", "CAFE-D-ENTRANCE-01"],
    ],
    issueRuleIds: [
      "CAFE-AISLE-001",
      "CAFE-EXIT-WIDTH-001",
      "CAFE-DRAIN-001",
    ],
  },
  clinic: {
    prefix: "L",
    counts: { spaces: 8, doors: 9, review: 204, ready: 216 },
    spaces: [
      ["RECEPTION", "الاستقبال", "CLINIC-SPACE-RECEPTION", false],
      ["WAITING", "منطقة الانتظار", "CLINIC-SPACE-WAITING", false],
      ["EXAM_1", "غرفة الفحص 1", "CLINIC-SPACE-EXAM-01", true],
      ["EXAM_2", "غرفة الفحص 2", "CLINIC-SPACE-EXAM-02", true],
      ["TREATMENT", "غرفة العلاج", "CLINIC-SPACE-TREATMENT", true],
      ["STORAGE", "المخزن الطبي", "CLINIC-SPACE-STORAGE", true],
      ["UTILITY", "غرفة المنافع", "CLINIC-SPACE-UTILITY", true],
      ["WC", "دورة المياه", "CLINIC-SPACE-WC", true],
    ],
    doors: [
      ["EXIT", "باب المخرج", "CLINIC-D-EXIT-01"],
      ["EXAM_1", "باب غرفة الفحص 1", "CLINIC-D-EXAM-01"],
      ["EXAM_2", "باب غرفة الفحص 2", "CLINIC-D-EXAM-02"],
      ["TREATMENT", "باب غرفة العلاج", "CLINIC-D-TREATMENT-01"],
      ["STORAGE", "باب المخزن", "CLINIC-D-STORAGE-01"],
      ["UTILITY", "باب المنافع", "CLINIC-D-UTILITY-01"],
      ["WC", "باب دورة المياه", "CLINIC-D-WC-01"],
      ["RECEPTION", "باب الاستقبال", "CLINIC-D-RECEPTION-01"],
      ["ENTRANCE", "باب المدخل", "CLINIC-D-ENTRANCE-01"],
    ],
    issueRuleIds: [
      "CLINIC-DOOR-001",
      "CLINIC-HANDWASH-001",
      "CLINIC-HVAC-001",
    ],
  },
  salon: {
    prefix: "S",
    counts: { spaces: 7, doors: 6, review: 162, ready: 174 },
    spaces: [
      ["RECEPTION", "الاستقبال", "SALON-SPACE-RECEPTION", false],
      ["STYLING", "منطقة التصفيف", "SALON-SPACE-STYLING", false],
      ["WASH", "منطقة الغسيل", "SALON-SPACE-WASH", false],
      ["NAIL", "منطقة الأظافر", "SALON-SPACE-NAIL", false],
      ["TREATMENT", "غرفة العناية", "SALON-SPACE-TREATMENT", true],
      ["STORAGE", "مخزن التشغيل", "SALON-SPACE-STORAGE", true],
      ["WC", "دورة المياه", "SALON-SPACE-WC", true],
    ],
    doors: [
      ["EXIT", "باب المخرج", "SALON-D-EXIT-01"],
      ["TREATMENT", "باب غرفة العناية", "SALON-D-TREATMENT-01"],
      ["STORAGE", "باب المخزن", "SALON-D-STORAGE-01"],
      ["WC", "باب دورة المياه", "SALON-D-WC-01"],
      ["SERVICE", "باب الخدمة", "SALON-D-SERVICE-01"],
      ["ENTRANCE", "باب المدخل", "SALON-D-ENTRANCE-01"],
    ],
    issueRuleIds: [
      "SALON-AISLE-001",
      "SALON-CHEM-STORE-001",
      "SALON-VENT-001",
    ],
  },
};

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

function fixtureFor(activityId, scenario) {
  const configuration = configurations[activityId];
  const records = [];
  const products = [];
  const productByRole = new Map();
  const guidByRole = new Map();
  let nextId = 1;
  let nextGuidNumber = 1;

  const guid = () => {
    const serial = (
      Object.keys(configurations).indexOf(activityId) * 1_000_000 +
      (scenario === "ready" ? 500_000 : 0) +
      nextGuidNumber
    )
      .toString(36)
      .toUpperCase()
      .padStart(20, "0");
    nextGuidNumber += 1;
    return `${configuration.prefix}${scenario === "ready" ? "1" : "0"}${serial}`.slice(
      0,
      22,
    );
  };

  const add = (expression) => {
    const id = nextId;
    nextId += 1;
    records.push({ id, expression });
    return id;
  };

  const addRoot = (type, args, role, isProduct = true) => {
    const entityGuid = guid();
    const id = add(`${type}(${quote(entityGuid)},${args.join(",")})`);
    if (isProduct) products.push(id);
    if (role) {
      productByRole.set(`${type}:${role}`, id);
      if (!guidByRole.has(role)) guidByRole.set(role, entityGuid);
    }
    return { id, guid: entityGuid };
  };

  const propertyValue = (value) => {
    if (typeof value === "boolean") {
      return `IFCBOOLEAN(${value ? ".T." : ".F."})`;
    }
    if (typeof value === "number") return `IFCREAL(${value})`;
    return `IFCLABEL(${quote(value)})`;
  };

  const addPropertySet = (targetId, name, properties) => {
    const propertyIds = Object.entries(properties).map(([key, value]) =>
      add(
        `IFCPROPERTYSINGLEVALUE(${quote(key)},$,${propertyValue(value)},$)`,
      ),
    );
    const propertySet = addRoot(
      "IFCPROPERTYSET",
      ["$", quote(name), "$", `(${propertyIds.map((id) => `#${id}`).join(",")})`],
      undefined,
      false,
    );
    addRoot(
      "IFCRELDEFINESBYPROPERTIES",
      ["$", "$", "$", `(#${targetId})`, `#${propertySet.id}`],
      undefined,
      false,
    );
  };

  const project = addRoot(
    "IFCPROJECT",
    ["$", quote(`Jawaz ${activityId} fixture`), "$", "$", "$", "$", "$", "$"],
    undefined,
    false,
  );
  addRoot(
    "IFCBUILDINGSTOREY",
    ["$", quote("الطابق الأرضي"), "$", "$", "$", "$", "$", ".ELEMENT.", "0."],
    undefined,
    false,
  );

  const spaceEntities = new Map();
  for (const [role, name, viewerElementId, isEnclosed] of configuration.spaces) {
    const space = addRoot(
      "IFCSPACE",
      [
        "$",
        quote(name),
        "$",
        quote(role),
        "$",
        "$",
        "$",
        ".ELEMENT.",
        ".INTERNAL.",
        "0.",
      ],
      role,
    );
    spaceEntities.set(role, space);
    addPropertySet(space.id, "Pset_JawazSpace", {
      RoleCode: role,
      ViewerElementId: viewerElementId,
      NetFloorArea: 20 + spaceEntities.size * 4,
      IsEnclosed: isEnclosed,
    });
  }

  for (const [role, name, viewerElementId] of configuration.doors) {
    const isIssueDoor =
      (activityId === "restaurant" && role === "EXIT") ||
      (activityId === "cafe" && role === "EXIT") ||
      (activityId === "clinic" && role === "EXAM_2");
    const reviewWidth =
      activityId === "restaurant"
        ? 0.82
        : activityId === "cafe"
          ? 0.84
          : activityId === "clinic"
            ? 0.78
            : 0.96;
    const width = isIssueDoor && scenario === "review" ? reviewWidth : 1.0;
    const door = addRoot(
      "IFCDOOR",
      [
        "$",
        quote(name),
        "$",
        quote(role),
        "$",
        "$",
        quote(`TAG-${role}`),
        "2.10",
        String(width),
        ".DOOR.",
        ".SINGLE_SWING_LEFT.",
        "$",
      ],
      role,
    );
    addPropertySet(door.id, "Pset_JawazDoor", {
      RoleCode: role,
      ViewerElementId: viewerElementId,
      ServesSpaceGuid:
        spaceEntities.get(role)?.guid ??
        spaceEntities.get(configuration.spaces[0][0])?.guid ??
        "",
      ConnectsToExterior: role === "EXIT" || role === "ENTRANCE",
    });
  }

  const semanticElement = ({
    type = "IFCBUILDINGELEMENTPROXY",
    role,
    name,
    viewerElementId,
    servedRole,
    properties = {},
  }) => {
    const element = addRoot(
      type,
      ["$", quote(name), "$", quote(role), "$", "$", quote(`TAG-${role}`), "$"],
      role,
    );
    addPropertySet(element.id, "Pset_JawazEquipment", {
      RoleCode: role,
      ViewerElementId: viewerElementId,
      ServedSpaceGuid: spaceEntities.get(servedRole)?.guid ?? "",
      ...properties,
    });
    return element;
  };

  semanticElement({
    type: "IFCFLOWTERMINAL",
    role: "SANITARY_FIXTURE",
    name: "تجهيز صحي",
    viewerElementId: `${configuration.prefix}-SANITARY-01`,
    servedRole: "WC",
    properties: { HasServiceConnection: true },
  });

  if (activityId === "restaurant") {
    semanticElement({
      role: "MAIN_FACADE",
      name: "الواجهة الرئيسية",
      viewerElementId: "FACADE-MAIN",
      servedRole: "DINING",
      properties: { ServicesConcealed: true },
    });
    semanticElement({
      role: "ACCESS_ROUTE",
      name: "مسار الوصول",
      viewerElementId: "COR-ACCESS-01",
      servedRole: "DINING",
      properties: {
        MinimumClearWidth: scenario === "review" ? 0.76 : 1.1,
      },
    });
    if (scenario === "ready") {
      semanticElement({
        type: "IFCFLOWTERMINAL",
        role: "KITCHEN_VENTILATION",
        name: "شفاط المطبخ",
        viewerElementId: "VENT-HOOD-01",
        servedRole: "KITCHEN",
        properties: { HasServiceConnection: true },
      });
    }
  }

  if (activityId === "cafe") {
    semanticElement({
      type: "IFCFLOWTERMINAL",
      role: "PREP_HANDWASH",
      name: "حوض التحضير",
      viewerElementId: "CAFE-SINK-BAR-01",
      servedRole: "PREP",
      properties: { HasServiceConnection: true },
    });
    semanticElement({
      role: "COUNTER_AISLE",
      name: "ممر حاجز التحضير",
      viewerElementId: "CAFE-COR-COUNTER-01",
      servedRole: "PREP",
      properties: {
        MinimumClearWidth: scenario === "review" ? 0.72 : 1.1,
      },
    });
    if (scenario === "ready") {
      semanticElement({
        type: "IFCFLOWTERMINAL",
        role: "PREP_DRAIN",
        name: "مصرف منطقة التحضير",
        viewerElementId: "CAFE-DRAIN-BAR-01",
        servedRole: "PREP",
        properties: { HasServiceConnection: true },
      });
    }
  }

  if (activityId === "clinic" && scenario === "ready") {
    semanticElement({
      type: "IFCFLOWTERMINAL",
      role: "EXAM_2_HANDWASH",
      name: "حوض غسل اليدين، غرفة الفحص 2",
      viewerElementId: "CLINIC-SINK-EXAM-02",
      servedRole: "EXAM_2",
      properties: { HasServiceConnection: true },
    });
    semanticElement({
      type: "IFCFLOWTERMINAL",
      role: "EXAM_2_HVAC",
      name: "تهوية غرفة الفحص 2",
      viewerElementId: "CLINIC-VENT-EXAM-02",
      servedRole: "EXAM_2",
      properties: { HasServiceConnection: true },
    });
  }

  if (activityId === "salon") {
    for (let index = 1; index <= 2; index += 1) {
      semanticElement({
        type: "IFCFLOWTERMINAL",
        role: "HAIR_WASH_STATION",
        name: `وحدة غسل الشعر ${index}`,
        viewerElementId: `SALON-SINK-WASH-0${index}`,
        servedRole: "WASH",
        properties: { HasServiceConnection: true },
      });
    }
    semanticElement({
      role: "STYLING_AISLE",
      name: "ممر محطات التصفيف",
      viewerElementId: "SALON-COR-STYLING-01",
      servedRole: "STYLING",
      properties: {
        MinimumClearWidth: scenario === "review" ? 0.74 : 1.1,
      },
    });
    semanticElement({
      type: "IFCFURNISHINGELEMENT",
      role: "CHEMICAL_STORAGE",
      name: "تخزين مواد التشغيل",
      viewerElementId: "SALON-STORAGE-CHEM-01",
      servedRole: "STORAGE",
      properties: { IsEnclosed: scenario === "ready" },
    });
    if (scenario === "ready") {
      semanticElement({
        type: "IFCFLOWTERMINAL",
        role: "NAIL_VENTILATION",
        name: "تهوية منطقة الأظافر",
        viewerElementId: "SALON-VENT-NAIL-01",
        servedRole: "NAIL",
        properties: { HasServiceConnection: true },
      });
    }
  }

  const targetProducts = configuration.counts[scenario];
  while (products.length < targetProducts) {
    addRoot(
      "IFCBUILDINGELEMENTPROXY",
      [
        "$",
        quote(`عنصر نموذجي ${products.length + 1}`),
        "$",
        quote("MODEL_ELEMENT"),
        "$",
        "$",
        quote(`FILLER-${products.length + 1}`),
        "$",
      ],
      undefined,
    );
  }
  if (products.length !== targetProducts) {
    throw new Error(
      `${activityId}/${scenario} produced ${products.length} products, expected ${targetProducts}`,
    );
  }

  addPropertySet(project.id, "Pset_JawazProject", {
    ActivityCode: activityId,
    LengthUnit: "METRE",
    GrossArea:
      activityId === "restaurant"
        ? 284
        : activityId === "cafe"
          ? 168
          : activityId === "clinic"
            ? 236
            : 142,
    DeclaredCapacity:
      activityId === "restaurant"
        ? 72
        : activityId === "cafe"
          ? 42
          : activityId === "clinic"
            ? 36
            : 28,
    FixtureContractVersion: "JAWAZ-IFC-1.0",
    ArchitecturalEquipmentComplete: true,
    MEPModelComplete: scenario === "ready",
  });

  const header = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Jawaz deterministic semantic fixture'),'2;1');
FILE_NAME('${activityId}-semantic-model.ifc','2026-07-27T00:00:00',('Jawaz QA'),('Jawaz'),'Codex','Jawaz','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;`;
  const body = records
    .map((record) => `#${record.id}=${record.expression};`)
    .join("\n");
  const text = `${header}\n${body}\nENDSEC;\nEND-ISO-10303-21;\n`;

  return {
    text,
    expected: {
      activityId,
      scenario,
      schema: "IFC4",
      spaces: configuration.counts.spaces,
      doors: configuration.counts.doors,
      elements: targetProducts,
      passed: scenario === "ready" ? 10 : 7,
      failed: scenario === "ready" ? 0 : 2,
      unknown: scenario === "ready" ? 0 : 1,
      score: scenario === "ready" ? 100 : 78,
      unresolvedRuleIds:
        scenario === "ready" ? [] : configuration.issueRuleIds,
    },
  };
}

await mkdir(path.join(fixtureDirectory, "ifc", "invalid"), {
  recursive: true,
});
await mkdir(path.join(fixtureDirectory, "expected"), { recursive: true });

const manifest = [];
const generated = new Map();
for (const activityId of Object.keys(configurations)) {
  await mkdir(path.join(fixtureDirectory, "ifc", activityId), {
    recursive: true,
  });
  for (const scenario of ["review", "ready"]) {
    const fileName = scenario === "review" ? "needs-work.ifc" : "ready.ifc";
    const fixture = fixtureFor(activityId, scenario);
    const relativePath = `ifc/${activityId}/${fileName}`;
    generated.set(`${activityId}-${scenario}`, fixture.text);
    await writeFile(
      path.join(fixtureDirectory, relativePath),
      fixture.text,
      "utf8",
    );
    await writeFile(
      path.join(
        fixtureDirectory,
        "expected",
        `${activityId}-${scenario === "review" ? "needs-work" : "ready"}.json`,
      ),
      `${JSON.stringify(fixture.expected, null, 2)}\n`,
      "utf8",
    );
    manifest.push({
      activityId,
      case: scenario === "review" ? "needs-work" : "ready",
      file: relativePath,
      expected: `expected/${activityId}-${scenario === "review" ? "needs-work" : "ready"}.json`,
    });
  }
}

const restaurantReady = generated.get("restaurant-ready");
await writeFile(
  path.join(fixtureDirectory, "ifc", "invalid", "invalid-envelope.ifc"),
  "HEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\n",
  "utf8",
);
await writeFile(
  path.join(fixtureDirectory, "ifc", "invalid", "unsupported-schema.ifc"),
  restaurantReady.replace("FILE_SCHEMA(('IFC4'))", "FILE_SCHEMA(('IFC2X3'))"),
  "utf8",
);
await writeFile(
  path.join(fixtureDirectory, "ifc", "invalid", "duplicate-express-id.ifc"),
  restaurantReady.replace(
    "\nENDSEC;\nEND-ISO",
    "\n#1=IFCBUILDINGELEMENTPROXY('DUPLICATE0000000000000',$,'Duplicate',$,$,$,$,$,$);\nENDSEC;\nEND-ISO",
  ),
  "utf8",
);
await writeFile(
  path.join(fixtureDirectory, "ifc", "invalid", "broken-reference.ifc"),
  restaurantReady.replace(
    "IFCBUILDINGELEMENTPROXY(",
    "IFCBUILDINGELEMENTPROXY(#999,",
  ),
  "utf8",
);
await writeFile(
  path.join(fixtureDirectory, "ifc", "invalid", "no-spaces.ifc"),
  restaurantReady.replaceAll("IFCSPACE(", "IFCBUILDINGELEMENTPROXY("),
  "utf8",
);
await writeFile(
  path.join(fixtureDirectory, "ifc", "invalid", "incomplete-properties.ifc"),
  restaurantReady.replace(
    "FixtureContractVersion",
    "FixtureContractVersionMissing",
  ),
  "utf8",
);
await writeFile(
  path.join(fixtureDirectory, "ifc", "invalid", "activity-mismatch.ifc"),
  restaurantReady,
  "utf8",
);

await writeFile(
  path.join(fixtureDirectory, "manifest.json"),
  `${JSON.stringify({ contractVersion: "JAWAZ-IFC-1.0", cases: manifest }, null, 2)}\n`,
  "utf8",
);

process.stdout.write(
  `Generated ${manifest.length} valid IFC fixtures and 7 invalid fixtures.\n`,
);
