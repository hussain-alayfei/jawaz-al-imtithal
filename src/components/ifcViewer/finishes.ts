import type { GeometryCategory } from "../../ifc/standard/model";

/*
 * Which physical finish each element is drawn with. The file gives a display category, the IFC
 * class, PredefinedType, the element's name and its surface-style colour; real BIM exports name
 * things in many ways, so names are hints and the colour decides when they are silent
 * (a warm brown is wood, a neutral light grey is stainless steel, a saturated colour on a seat
 * is upholstery). The colour itself always comes from the file: finishes only add the surface
 * detail and the way light reflects (roughness, metalness) at real scale.
 */

export type Finish =
  | "plaster"
  | "paint"
  | "concrete"
  | "stone"
  | "panel"
  | "terrazzo"
  | "porcelain"
  | "epoxy"
  | "woodFloor"
  | "carpet"
  | "ceramicTile"
  | "roofTile"
  | "ceilingTile"
  | "wood"
  | "fabric"
  | "leather"
  | "stainless"
  | "paintedMetal"
  | "aluminium"
  | "glass"
  | "ceramic"
  | "generic";

export interface FinishInput {
  category: GeometryCategory;
  ifcType: string;
  name?: string;
  predefinedType?: string;
  /** Mean display colour of the element, sRGB 0..1. */
  color: readonly [number, number, number];
}

/** Hue in degrees, HSV saturation and value of an sRGB colour. */
export function hsv([r, g, b]: readonly [number, number, number]): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max > 0 ? d / max : 0, v: max };
}

const WORDS = {
  glass: /GLASS|GLAZ|زجاج/i,
  stone: /STONE|MARBLE|GRANITE|LIMESTONE|QUARTZ|حجر|رخام|جرانيت|كوارتز/i,
  concrete: /CONCRETE|SCREED|خرسان/i,
  panel: /\bACP\b|COMPOSITE|ALUCOBOND|CLADDING PANEL|ألواح/i,
  epoxy: /EPOXY|RESIN|COATING|ايبوكسي|إيبوكسي/i,
  wood: /WOOD|TIMBER|OAK|BEECH|WALNUT|PARQUET|خشب|باركيه/i,
  carpet: /CARPET|RUG|سجاد|موكيت/i,
  tile: /TILE|CERAMIC|PORCELAIN|QUARRY|بلاط|سيراميك|بورسلان/i,
  terrazzo: /TERRAZZO|تيرازو/i,
  leather: /LEATHER|جلد/i,
  seat: /CHAIR|SEAT|SOFA|BENCH|STOOL|COUCH|ARMCHAIR|BOOTH|BANQUETTE|UPHOLST|كرسي|كراسي|كنب|مقعد/i,
  soft: /SOFA|COUCH|BOOTH|BANQUETTE|ARMCHAIR|كنب/i,
  counter: /COUNTER|WORKTOP|BENCHTOP|كاونتر|منضدة/i,
  stainless: /STAINLESS|INOX|ستانلس/i,
  metal: /STEEL|METAL|IRON|ALUMIN|حديد|معدن|ألمنيوم|المنيوم/i,
  ceramicWare: /CERAMIC|PORCELAIN|VITREOUS|سيراميك|خزف|بورسلان/i,
};

export function finishFor(input: FinishInput): Finish {
  const t = input.ifcType.toUpperCase();
  const text = `${input.name ?? ""} ${input.predefinedType ?? ""}`;
  const { h, s, v } = hsv(input.color);
  const neutral = s < 0.15;
  const woody = h >= 12 && h <= 50 && s >= 0.25 && v >= 0.15 && v <= 0.9;
  const lightGrey = neutral && v >= 0.55 && v < 0.9;
  const metalGrey = neutral && v >= 0.4 && v < 0.9;
  const ceiling = /CEILING/i.test(input.predefinedType ?? "") || /CEILING|سقف مستعار/i.test(input.name ?? "");

  switch (input.category) {
    case "window":
      return "glass";
    case "wall":
      if (t === "IFCCOVERING" || /CLADDING/i.test(input.predefinedType ?? "")) {
        if (WORDS.panel.test(text)) return "panel";
        if (WORDS.stone.test(text)) return "stone";
        if (WORDS.wood.test(text)) return "wood";
        if (WORDS.tile.test(text) || !input.name) return "ceramicTile";
        return neutral && v > 0.85 ? "ceramicTile" : "panel";
      }
      if (t === "IFCCURTAINWALL" || WORDS.glass.test(text)) return "glass";
      if (WORDS.stone.test(text)) return "stone";
      if (t === "IFCCOLUMN" || t === "IFCBEAM" || WORDS.concrete.test(text)) return neutral && v < 0.85 ? "concrete" : "paint";
      return neutral ? "plaster" : "paint";
    case "floor":
      if (WORDS.carpet.test(text)) return "carpet";
      if (WORDS.wood.test(text)) return "woodFloor";
      if (WORDS.terrazzo.test(text)) return "terrazzo";
      if (WORDS.epoxy.test(text)) return "epoxy";
      if (WORDS.tile.test(text) || t === "IFCCOVERING") return "porcelain";
      if (WORDS.concrete.test(text)) return "concrete";
      // A bare slab: polished terrazzo when it carries a light finish colour, else the concrete it is.
      return v > 0.78 ? "terrazzo" : "concrete";
    case "roof":
      if (ceiling) return WORDS.tile.test(text) ? "ceilingTile" : "plaster";
      return WORDS.tile.test(text) ? "roofTile" : "concrete";
    case "door":
      if (WORDS.wood.test(text) || woody) return "wood";
      if (WORDS.stainless.test(text) || (neutral && v >= 0.72)) return "stainless";
      if (WORDS.glass.test(text) || lightGrey) return "aluminium";
      return "paintedMetal";
    case "furniture":
      if (WORDS.leather.test(text)) return "leather";
      if (WORDS.seat.test(text)) {
        // Booths and sofas are upholstered (brown ones in leather); a brown chair is timber.
        if (WORDS.soft.test(text)) return woody ? "leather" : "fabric";
        return woody && !/UPHOLST/i.test(text) ? "wood" : "fabric";
      }
      if (WORDS.stainless.test(text)) return "stainless";
      if (WORDS.glass.test(text)) return "glass";
      if (woody || WORDS.wood.test(text)) return "wood";
      if (metalGrey || (neutral && v >= 0.9)) return "stainless";
      if (WORDS.counter.test(text) || WORDS.stone.test(text)) return "stone";
      if (neutral || (s < 0.3 && v < 0.5)) return "paintedMetal";
      return "paint";
    case "sanitary":
      if (WORDS.stainless.test(text)) return "stainless";
      if (WORDS.ceramicWare.test(text)) return "ceramic";
      return lightGrey ? "stainless" : "ceramic";
    case "equipment":
      if (WORDS.stainless.test(text) || lightGrey) return "stainless";
      if (woody) return "wood";
      return "paintedMetal";
    default:
      // Mullions, transoms, canopies and other members: anodised aluminium when grey.
      if (woody) return "wood";
      if (metalGrey) return "aluminium";
      return "generic";
  }
}
