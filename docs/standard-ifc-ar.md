# فحص ملفات IFC القياسية والعارض المبني من هندسة الملف

يصف هذا المستند المسار الجديد في موائم: قراءة أي ملف IFC صادر من برنامج BIM، وقياس عناصره من بياناته
وهندسته، ثم عرض الملف نفسه ثلاثي الأبعاد. لا يعتمد هذا المسار على مجموعات الخصائص الخاصة بموائم
(`Pset_Mowaem*`).

## المساران

| نوع الملف | كيف يُميَّز | القارئ |
|---|---|---|
| ملفات عقد `MOWAEM-IFC-1.0` التجريبية | تحتوي أي مجموعة `Pset_Mowaem` | المحلل السابق كما هو، بقواعده واختباراته |
| أي ملف IFC آخر (IFC2X3 وIFC4) | لا تحتوي تلك المجموعات | مكتبة web-ifc داخل Web Worker |

## ما يُقرأ من الملف القياسي

- **الوحدات:** من `IfcUnitAssignment`، وتحوَّل الأطوال إلى المتر، بما فيها ملفات المليمتر والقدم.
- **الأبواب:** العرض من `IfcDoor.OverallWidth`. وإذا غاب يُقدَّر من حدود الهندسة، ويُذكر ذلك صراحة في النتيجة.
- **مخارج الطوارئ:** من الخاصية القياسية `Pset_DoorCommon.FireExit`، والاتصال بالخارج من `IsExternal`.
- **الغرف:** التصنيف من أسماء `IfcSpace` (Name وLongName وObjectType) بالعربية أو الإنجليزية. والغرفة التي لا يطابق اسمها أي تصنيف تبقى غير مصنفة، ولا يخمّن النظام نوعها.
- **المساحات:** من `Qto_SpaceBaseQuantities.NetFloorArea`، وإن غابت فمن مجموع مثلثات أرضية الغرفة في الهندسة.
- **العلاقات:** الاحتواء المكاني (`IfcRelContainedInSpatialStructure` و`IfcRelAggregates`)، وقرب الباب من حد الغرفة محسوبًا من الهندسة.

## القواعد في هذه المرحلة (نشاط المطعم)

| القاعدة | الدليل المستخدم |
|---|---|
| `DOOR-WIDTH-001` | أضيق باب `FireExit` مقارنة بالحد 0.90 م (حد تجريبي بانتظار ربطه ببند رسمي) |
| `EGRESS-001` | باب `FireExit` و`IsExternal` يقع على حد صالة الطعام |
| `REST-SPACE-001` و`DATA-SPACE-001` | تصنيف الغرف من أسمائها |
| `IFC-QUAL-001` | قراءة الملف ومعرّفات GUID لكل العناصر |
| `REST-SAN-001` و`KITCHEN-VENT-001` | يُرصد العنصر في غرفته، أما اتصال التغذية والصرف أو التهوية فلا يُحكم عليه إلا بوجود منافذ MEP موصولة |
| `FACADE-MEP-001` و`ACCESS-ROUTE-001` | غير قابلة للتحقق من النموذج المعماري في هذه المرحلة |

القاعدة التي لا دليل لها في الملف تظهر بحالة «غير قابل للتحقق من الملف»، ولا تُحتسب مطابقة. لذلك
تعرض الواجهة نطاق التحقق (مثل 6 من 10) بدل نسبة جاهزية مئوية للملفات القياسية.

## العارض ثلاثي الأبعاد

العارض (`src/components/IfcModelViewer.tsx`) يرسم المثلثات التي أخرجها web-ifc من بايتات الملف نفسه
الذي فُحص، وألوان العناصر من أنماط الأسطح المعرّفة في الملف (`IfcSurfaceStyle`). يتبع العارض منهج
مهارة `3d-studio:building-3d-scenes`:

- **الإضاءة:** سماء فيزيائية وشمس الرياض في موقعها المحسوب (الساعة 10:30، اعتدال الربيع)، وإضاءة بيئية من قبة ملونة مخبوزة بـ PMREM.
- **الظلال والألوان:** ظلال من نوع PCF، و`NeutralToneMapping` للحفاظ على ألوان الحالات.
- **المواد:** خامات مرسومة بالكود بمقاسها الحقيقي (لياسة، تيرازو، خشب، رمل).
- **مقطع الدمية:** قص الجدران على ارتفاع 1.45 م من أرضية الدور المختار، مع أغطية داكنة مكان القص.
- **الإبراز:** يُبرز العنصر المرتبط بالنتيجة بمعرّفه، ويُرسم خط قياس بالقيمة المقاسة والحد.

السماء والأرض الرملية للسياق فقط، وليست من الملف.

## ملفات التجربة

| الملف | الوصف |
|---|---|
| `public/samples/restaurant/restaurant-exit-0.75m.ifc` | مطعم بدور واحد (16 × 11 م)، باب الطوارئ D-02 بعرض 0.75 م |
| `public/samples/restaurant/restaurant-exit-0.95m.ifc` | المخطط نفسه، والفرق الوحيد عرض الباب D-02 وهندسته |
| `test-fixtures/ifc/standard/restaurant-exit-0.75m-mm.ifc` | المخطط نفسه بوحدة المليمتر |
| `test-fixtures/ifc/standard/restaurant-no-fire-exit-flags.ifc` | بدون الخاصية `FireExit` |
| `public/samples/external/Duplex_A_20110907.ifc` | تصدير حقيقي من Revit 2011 (buildingSMART، رخصة CC BY 4.0) |

مخطط المطعم نموذج هندسي تجريبي، وليس مشروعًا منفذًا. يولّده السكربت
`scripts/ifc/build_restaurant_ifc.py` بمكتبة IfcOpenShell. والمعرّفات GUID حتمية، فإعادة التوليد
بالمعاملات نفسها تعطي الملف نفسه.

### إعادة توليد المخططات (PowerShell)

```powershell
py -m venv .venv-ifc
.\.venv-ifc\Scripts\pip install -r scripts\ifc\requirements.txt
.\.venv-ifc\Scripts\python scripts\ifc\build_restaurant_ifc.py --exit-door-width 0.75 --out public\samples\restaurant\restaurant-exit-0.75m.ifc
.\.venv-ifc\Scripts\python scripts\ifc\build_restaurant_ifc.py --exit-door-width 0.95 --out public\samples\restaurant\restaurant-exit-0.95m.ifc
.\.venv-ifc\Scripts\python scripts\ifc\build_restaurant_ifc.py --exit-door-width 0.75 --units mm --out test-fixtures\ifc\standard\restaurant-exit-0.75m-mm.ifc
.\.venv-ifc\Scripts\python scripts\ifc\build_restaurant_ifc.py --exit-door-width 0.95 --no-fire-exit-flags --out test-fixtures\ifc\standard\restaurant-no-fire-exit-flags.ifc
```

## ما لم يُنجز بعد

- **ربط الحدود ببنود رسمية:** يجب ربط الحدود (مثل 0.90 م) ببنود اشتراطات المطاعم الرسمية، مع رقم البند وإصدار الوثيقة.
- **عرض مسار الوصول:** قياس أضيق نقطة بين الأثاث يحتاج تحليل مسارات.
- **علاقات حدود الغرف:** قراءة `IfcRelSpaceBoundary` بدل القرب الهندسي.
- **الأنشطة الأخرى:** المقهى والعيادة والصالون على الملفات القياسية.
