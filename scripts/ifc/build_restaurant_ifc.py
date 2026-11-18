"""Build a single-storey Saudi street restaurant as a real IFC4 model with IfcOpenShell.

The model is a test plan, not an executed project: an 18 m x 12 m corner restaurant with a
glazed street front, 3.60 m floor-to-floor and a ceiling zone from 2.92 m to the roof slab at
3.35 m. It carries what a coordinated BIM export carries:

* architecture: walls with voided openings, a shopfront curtain wall (mullions, glass and the
  double entrance door), an entrance canopy, a signage band, parapets, floor and roof slabs, floor
  finishes, suspended ceilings and the kitchen wall tiles;
* fit-out: dining tables, chairs and booths, the cashier and serving counter, the kitchen
  cooking line under its hood, sinks, dishwasher, fridge and freezer, stainless work tables,
  store shelving and the WC fixtures;
* building services: domestic cold and hot water, sanitary drainage through a grease
  interceptor to the building drain outlet, a drainage vent, kitchen exhaust, WC extract, air
  conditioning with its refrigerant piping, power, lighting, fire sprinklers and fire alarm.
  Every network element has real geometry and IfcDistributionPorts nested to it (IfcRelNests).
  Consecutive ports are joined by IfcRelConnectsPorts, and every network element is grouped into an
  IfcDistributionSystem (IfcRelAssignsToGroup) with its IFC4 PredefinedType.

Nothing here uses Mowaem-specific property sets: rules must read the same standard data any
BIM export would contain.

Usage (PowerShell or bash):
    python scripts/ifc/build_restaurant_ifc.py --exit-door-width 0.95 --out public/samples/restaurant/restaurant-exit-0.95m.ifc
    python scripts/ifc/build_restaurant_ifc.py --exit-door-width 0.95 --disconnect-sink-drain --out public/samples/restaurant/restaurant-sink-not-drained.ifc
    python scripts/ifc/build_restaurant_ifc.py --exit-door-width 0.75 --units mm --out test-fixtures/ifc/standard/restaurant-exit-0.75m-mm.ifc

Plan axes: x = east, y = north (the street is to the south), z = up, metres; the finished floor
is z = 0. GUIDs are derived from a fixed namespace and the entity order, and the header
timestamp is fixed, so two runs with the same arguments write identical files. Variants differ
only where the design differs: a different exit width changes that door and its opening, a
different tile height changes the tiles' geometry, and the unconnected sink drain removes one
IfcRelConnectsPorts while every other GUID stays the same.
"""

from __future__ import annotations

import argparse
import math
import uuid
from dataclasses import dataclass
from pathlib import Path

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.context
import ifcopenshell.api.feature
import ifcopenshell.api.geometry
import ifcopenshell.api.project
import ifcopenshell.api.pset
import ifcopenshell.api.root
import ifcopenshell.api.style
import ifcopenshell.api.unit
import ifcopenshell.guid

GUID_NAMESPACE = uuid.UUID("6f6d6177-6165-6d2d-7265-737461757261")  # fixed: "omawaem-restaura"
TIMESTAMP = "2026-11-18T00:00:00"

# ---- building datums (metres) ----
FOOT_X, FOOT_Y = 18.0, 12.0
EXT_T = 0.25  # external blockwork wall
INT_T = 0.15  # internal partition
SLAB_BOTTOM = -0.30  # ground-bearing slab with screed, -0.30 to -0.05
SLAB_TOP = -0.05  # floor finishes from -0.05 to 0.00 (finished floor level)
CEILING = 2.90  # suspended ceilings, 2.90 to 2.92
CEILING_T = 0.02
SLAB_UNDERSIDE = 3.35  # roof slab soffit: the ceiling zone is 2.92 to 3.35
ROOF_TOP = 3.60  # 3.60 m floor-to-floor
ROOFING_TOP = 3.68
PARAPET_TOP = 4.70
SHOPFRONT_HEAD = 2.95
SPACE_HEIGHT = CEILING  # clear room height (Qto_SpaceBaseQuantities.Height)
GRADE = -0.15  # external paving in the rear lane

# ---- service levels (centre lines) ----
Z_DUCT = 3.085  # supply ducts 2.97 to 3.20
Z_COLD = 3.245  # domestic cold water mains
Z_HOT = 3.18  # domestic hot water mains
Z_TRAY = 3.245  # cable trays 3.22 to 3.27
Z_SPRINKLER = 3.31  # sprinkler mains and branches
Z_LIGHT = 2.94  # lighting conduits lying on the ceiling
Z_ALARM = 2.96  # fire alarm conduits
Z_HEAD = 2.95  # sprinkler head connection just above the ceiling

Vec = tuple[float, float, float]


def v_add(a: Vec, b: Vec) -> Vec:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def v_sub(a: Vec, b: Vec) -> Vec:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def v_mul(a: Vec, s: float) -> Vec:
    return (a[0] * s, a[1] * s, a[2] * s)


def v_dot(a: Vec, b: Vec) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def v_len(a: Vec) -> float:
    return math.sqrt(v_dot(a, a))


def v_unit(a: Vec) -> Vec:
    n = v_len(a)
    return (a[0] / n, a[1] / n, a[2] / n)


def perpendicular(d: Vec) -> Vec:
    """A horizontal reference direction for a run along d (x for vertical runs)."""
    if abs(d[2]) > 0.9:
        return (1.0, 0.0, 0.0)
    return v_unit((-d[1], d[0], 0.0))


def polygon_area(points) -> float:
    s = 0.0
    for (x1, y1), (x2, y2) in zip(points, list(points[1:]) + [points[0]]):
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def rect(x0: float, y0: float, x1: float, y1: float):
    return ((x0, y0), (x1, y0), (x1, y1), (x0, y1))


MATERIALS: dict[str, tuple[tuple[float, float, float], str, float]] = {
    # name: (display colour, IfcMaterial.Category, transparency)
    "Plaster": ((0.93, 0.91, 0.87), "Finish", 0.0),
    "Concrete": ((0.72, 0.71, 0.68), "Concrete", 0.0),
    "Porcelain tiles": ((0.86, 0.83, 0.78), "Finish", 0.0),
    "Quarry tiles": ((0.66, 0.40, 0.31), "Finish", 0.0),
    "Ceramic floor tiles": ((0.80, 0.82, 0.83), "Finish", 0.0),
    "Epoxy floor": ((0.58, 0.62, 0.60), "Finish", 0.0),
    "Gypsum ceiling": ((0.96, 0.96, 0.95), "Finish", 0.0),
    "PVC ceiling tiles": ((0.98, 0.98, 0.97), "Finish", 0.0),
    "Roof tiles": ((0.82, 0.79, 0.74), "Finish", 0.0),
    "Ceramic": ((0.97, 0.97, 0.96), "Ceramic", 0.0),
    "ACP cladding": ((0.16, 0.33, 0.30), "Aluminium", 0.0),
    "Sign face": ((0.95, 0.88, 0.62), "Plastic", 0.0),
    "Aluminium": ((0.60, 0.62, 0.64), "Aluminium", 0.0),
    "Aluminium glazed": ((0.62, 0.66, 0.68), "Aluminium", 0.0),
    "Glass": ((0.70, 0.84, 0.90), "Glass", 0.55),
    "Oak": ((0.66, 0.50, 0.33), "Wood", 0.0),
    "Walnut": ((0.42, 0.29, 0.20), "Wood", 0.0),
    "Steel": ((0.27, 0.36, 0.33), "Steel", 0.0),
    "Black steel": ((0.16, 0.16, 0.17), "Steel", 0.0),
    "Stainless steel": ((0.78, 0.80, 0.82), "Steel", 0.0),
    "Upholstery": ((0.16, 0.36, 0.30), "Textile", 0.0),
    "Leather": ((0.45, 0.22, 0.16), "Textile", 0.0),
    "Quartz": ((0.91, 0.89, 0.85), "Stone", 0.0),
    "Cast iron": ((0.20, 0.20, 0.21), "Metal", 0.0),
    "White enamel": ((0.93, 0.93, 0.91), "Steel", 0.0),
    "Equipment grey": ((0.46, 0.48, 0.51), "Steel", 0.0),
    "Precast concrete": ((0.52, 0.52, 0.50), "Concrete", 0.0),
    "Brass": ((0.80, 0.65, 0.30), "Metal", 0.0),
    "Fire red": ((0.80, 0.08, 0.08), "Steel", 0.0),
    "Exit green": ((0.10, 0.62, 0.32), "Plastic", 0.0),
    "LED diffuser": ((1.00, 0.98, 0.92), "Plastic", 0.0),
    # building services
    "PPR cold": ((0.16, 0.45, 0.86), "Plastic", 0.0),
    "PPR hot": ((0.88, 0.30, 0.16), "Plastic", 0.0),
    "uPVC drain": ((0.56, 0.38, 0.22), "Plastic", 0.0),
    "uPVC vent": ((0.67, 0.56, 0.42), "Plastic", 0.0),
    "Galvanised duct": ((0.71, 0.78, 0.83), "Steel", 0.0),
    "Flexible duct": ((0.82, 0.82, 0.78), "Aluminium", 0.0),
    "Grease duct": ((0.30, 0.30, 0.32), "Steel", 0.0),
    "Copper (insulated)": ((0.74, 0.46, 0.22), "Copper", 0.0),
    "Cable tray": ((0.80, 0.77, 0.58), "Steel", 0.0),
    "Power conduit": ((0.96, 0.55, 0.12), "Plastic", 0.0),
    "Lighting conduit": ((0.96, 0.82, 0.20), "Plastic", 0.0),
    "Fire alarm conduit": ((0.86, 0.14, 0.14), "Plastic", 0.0),
    "Sprinkler pipe": ((0.78, 0.10, 0.10), "Steel", 0.0),
}


# ---------------------------------------------------------------------------------------
# IFC writing helpers
# ---------------------------------------------------------------------------------------


@dataclass(eq=False)
class Port:
    ent: object
    pos: Vec
    element: object
    omit: bool = False  # the connection to this port is written, then removed (test case)


class Builder:
    def __init__(self, scale: float):
        self.s = scale  # project length units per metre
        f = self.f = ifcopenshell.api.project.create_file(version="IFC4")
        self.project = ifcopenshell.api.root.create_entity(f, ifc_class="IfcProject", name="Mowaem sample restaurant")
        length = ifcopenshell.api.unit.add_si_unit(f, unit_type="LENGTHUNIT", prefix="MILLI" if scale == 1000 else None)
        area = ifcopenshell.api.unit.add_si_unit(f, unit_type="AREAUNIT")
        volume = ifcopenshell.api.unit.add_si_unit(f, unit_type="VOLUMEUNIT")
        ifcopenshell.api.unit.assign_unit(f, units=[length, area, volume])
        model = ifcopenshell.api.context.add_context(f, context_type="Model")
        self.body = ifcopenshell.api.context.add_context(
            f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model
        )
        self.origin_point = f.createIfcCartesianPoint((0.0, 0.0, 0.0))
        # profiles state their (centred) position: optional in IFC4, but web-ifc expects it
        self.profile_origin = f.createIfcAxis2Placement2D(f.createIfcCartesianPoint((0.0, 0.0)), None)
        self._dirs: dict = {}
        self._profiles: dict = {}
        self._styles: dict = {}
        self._materials: dict = {}
        self.identity = f.createIfcCartesianTransformationOperator3D(None, None, self.origin_point, None, None)

        self.site = ifcopenshell.api.root.create_entity(f, ifc_class="IfcSite", name="Site")
        self.building = ifcopenshell.api.root.create_entity(f, ifc_class="IfcBuilding", name="Restaurant building")
        self.storey = ifcopenshell.api.root.create_entity(f, ifc_class="IfcBuildingStorey", name="Ground floor")
        self.storey.Elevation = 0.0
        self.site.ObjectPlacement = f.createIfcLocalPlacement(None, self.axis((0.0, 0.0, 0.0)))
        self.building.ObjectPlacement = f.createIfcLocalPlacement(self.site.ObjectPlacement, self.axis((0.0, 0.0, 0.0)))
        self.storey.ObjectPlacement = f.createIfcLocalPlacement(self.building.ObjectPlacement, self.axis((0.0, 0.0, 0.0)))
        ifcopenshell.api.aggregate.assign_object(f, products=[self.site], relating_object=self.project)
        ifcopenshell.api.aggregate.assign_object(f, products=[self.building], relating_object=self.site)
        ifcopenshell.api.aggregate.assign_object(f, products=[self.storey], relating_object=self.building)

        self.frames: dict[int, tuple[Vec, Vec]] = {}  # (world origin, x axis) of storey-placed elements, for ports
        self.contained: dict[int, tuple[object, list]] = {}
        self.covers: dict[int, tuple[object, list]] = {}
        self.material_users: dict[str, list] = {}
        self.nested: dict[int, tuple[object, list]] = {}
        self.type_users: dict[int, tuple[object, list, str]] = {}
        self.systems: dict[str, tuple[object, dict]] = {}
        self.removals: list = []
        self.counters: dict[str, int] = {}

    # ---- units, points, directions ----
    def L(self, v: float) -> float:
        return round(float(v) * self.s, 9) + 0.0

    def point(self, p: Vec):
        if p == (0.0, 0.0, 0.0):
            return self.origin_point
        return self.f.createIfcCartesianPoint((self.L(p[0]), self.L(p[1]), self.L(p[2])))

    def direction(self, d: Vec):
        key = tuple(round(c, 9) + 0.0 for c in d)
        if key not in self._dirs:
            self._dirs[key] = self.f.createIfcDirection(key)
        return self._dirs[key]

    def axis(self, origin: Vec, z: Vec | None = None, x: Vec | None = None):
        if z is not None and x is not None and v_dot(z, (0, 0, 1)) > 1 - 1e-12 and v_dot(x, (1, 0, 0)) > 1 - 1e-12:
            z = x = None
        return self.f.createIfcAxis2Placement3D(
            self.point(origin), self.direction(z) if z else None, self.direction(x) if x else None
        )

    def placement(self, origin: Vec, rel_to=None, z: Vec | None = None, x: Vec | None = None):
        return self.f.createIfcLocalPlacement(rel_to or self.storey.ObjectPlacement, self.axis(origin, z, x))

    def next_index(self, key: str) -> int:
        self.counters[key] = self.counters.get(key, 0) + 1
        return self.counters[key]

    # ---- profiles and solids (local coordinates, metres) ----
    def rect_profile(self, w: float, h: float):
        key = ("rect", round(w, 6), round(h, 6))
        if key not in self._profiles:
            self._profiles[key] = self.f.createIfcRectangleProfileDef("AREA", None, self.profile_origin, self.L(w),
                                                                      self.L(h))
        return self._profiles[key]

    def circle_profile(self, r: float):
        key = ("circle", round(r, 6))
        if key not in self._profiles:
            self._profiles[key] = self.f.createIfcCircleProfileDef("AREA", None, self.profile_origin, self.L(r))
        return self._profiles[key]

    def u_profile(self, w: float, h: float, t: float):
        """An open-top channel (cable tray) centred on the profile origin."""
        key = ("u", round(w, 6), round(h, 6), round(t, 6))
        if key not in self._profiles:
            a, b = w / 2, h / 2
            pts = [(-a, -b), (a, -b), (a, b), (a - t, b), (a - t, -b + t), (-a + t, -b + t), (-a + t, b), (-a, b)]
            cps = [self.f.createIfcCartesianPoint((self.L(x), self.L(y))) for x, y in pts]
            curve = self.f.createIfcPolyline(cps + [cps[0]])
            self._profiles[key] = self.f.createIfcArbitraryClosedProfileDef("AREA", None, curve)
        return self._profiles[key]

    def box(self, x0: float, y0: float, z0: float, x1: float, y1: float, z1: float):
        """An axis-aligned box as an extruded rectangle."""
        return self.f.createIfcExtrudedAreaSolid(
            self.rect_profile(x1 - x0, y1 - y0),
            self.axis(((x0 + x1) / 2, (y0 + y1) / 2, z0)),
            self.direction((0.0, 0.0, 1.0)),
            self.L(z1 - z0),
        )

    def sweep(self, profile, p0: Vec, p1: Vec):
        d = v_sub(p1, p0)
        z = v_unit(d)
        return self.f.createIfcExtrudedAreaSolid(
            profile, self.axis(p0, z, perpendicular(z)), self.direction((0.0, 0.0, 1.0)), self.L(v_len(d))
        )

    def cyl(self, p0: Vec, p1: Vec, r: float):
        return self.sweep(self.circle_profile(r), p0, p1)

    def vcyl(self, x: float, y: float, z0: float, z1: float, r: float):
        return self.cyl((x, y, z0), (x, y, z1), r)

    def rect_run(self, p0: Vec, p1: Vec, w: float, h: float):
        """A rectangular section along p0-p1: w across (horizontal), h up for horizontal runs."""
        return self.sweep(self.rect_profile(w, h), p0, p1)

    def u_run(self, p0: Vec, p1: Vec, w: float, h: float, t: float = 0.0025):
        return self.sweep(self.u_profile(w, h, t), p0, p1)

    def prism(self, polygon, z0: float, z1: float):
        f = self.f
        pts = [f.createIfcCartesianPoint((self.L(x), self.L(y))) for x, y in polygon]
        profile = f.createIfcArbitraryClosedProfileDef("AREA", None, f.createIfcPolyline(pts + [pts[0]]))
        return f.createIfcExtrudedAreaSolid(profile, self.axis((0.0, 0.0, z0)), self.direction((0.0, 0.0, 1.0)), self.L(z1 - z0))

    # ---- presentation and materials ----
    def style(self, material: str):
        if material not in self._styles:
            rgb, _category, transparency = MATERIALS[material]
            colour = self.f.createIfcColourRgb(None, *rgb)
            shading = self.f.createIfcSurfaceStyleShading(colour, transparency)
            self._styles[material] = self.f.createIfcSurfaceStyle(material, "BOTH", [shading])
        return self._styles[material]

    def material(self, name: str):
        if name not in self._materials:
            self._materials[name] = self.f.createIfcMaterial(name, None, MATERIALS[name][1])
        return self._materials[name]

    def styled_items(self, parts):
        items = []
        for material, its in parts:
            style = self.style(material)
            for it in its:
                self.f.createIfcStyledItem(it, [style], None)
            items.extend(its)
        return items

    def represent(self, ent, parts, styled: bool = True) -> None:
        items = self.styled_items(parts) if styled else [it for _, its in parts for it in its]
        shape = self.f.createIfcShapeRepresentation(self.body, "Body", "SweptSolid", items)
        ent.Representation = self.f.createIfcProductDefinitionShape(None, None, [shape])
        if styled:
            self.material_users.setdefault(parts[0][0], []).append(ent)

    def contain(self, ent, structure) -> None:
        self.contained.setdefault(structure.id(), (structure, []))[1].append(ent)

    def cover(self, space, covering) -> None:
        self.covers.setdefault(space.id(), (space, []))[1].append(covering)

    def container_for(self, *points: Vec):
        x = sum(p[0] for p in points) / len(points)
        y = sum(p[1] for p in points) / len(points)
        inside = -1e-6 <= x <= FOOT_X + 1e-6 and -1e-6 <= y <= FOOT_Y + 1e-6
        return self.storey if inside else self.site

    # ---- elements ----
    def element(self, ifc_class: str, name: str, predefined: str | None = None, *, origin: Vec = (0.0, 0.0, 0.0),
                axes: tuple[Vec, Vec] | None = None, rel_to=None, parts=None, container=None,
                object_type: str | None = None, tag: str | None = None, description: str | None = None,
                styled: bool = True):
        ent = self.f.create_entity(ifc_class, GlobalId=ifcopenshell.guid.new(), Name=name)
        if description:
            ent.Description = description
        if object_type:
            ent.ObjectType = object_type
        if predefined:
            ent.PredefinedType = predefined
        if tag:
            ent.Tag = tag
        z, x = axes if axes else (None, None)
        ent.ObjectPlacement = self.placement(origin, rel_to, z, x)
        if rel_to is None and (axes is None or axes[0] == (0.0, 0.0, 1.0)):
            self.frames[ent.id()] = (origin, axes[1] if axes else (1.0, 0.0, 0.0))
        if parts:
            self.represent(ent, parts, styled)
        if container is not None:
            self.contain(ent, container)
        return ent

    def type_object(self, ifc_class: str, name: str, parts, predefined: str | None = None, **attributes):
        """A type with a shared representation map (instances reference it by IfcMappedItem)."""
        items = self.styled_items(parts)
        shape = self.f.createIfcShapeRepresentation(self.body, "Body", "SweptSolid", items)
        rmap = self.f.createIfcRepresentationMap(self.axis((0.0, 0.0, 0.0)), shape)
        t = self.f.create_entity(ifc_class, GlobalId=ifcopenshell.guid.new(), Name=name, RepresentationMaps=[rmap],
                                 **attributes)
        if predefined:
            t.PredefinedType = predefined
        self.type_users[t.id()] = (t, [], parts[0][0])
        return t

    def instance(self, type_ent, ifc_class: str, name: str, predefined: str | None = None, *, origin: Vec,
                 axes: tuple[Vec, Vec] | None = None, container=None, tag: str | None = None,
                 object_type: str | None = None):
        ent = self.element(ifc_class, name, predefined, origin=origin, axes=axes, container=container, tag=tag,
                           object_type=object_type)
        mapped = self.f.createIfcMappedItem(type_ent.RepresentationMaps[0], self.identity)
        shape = self.f.createIfcShapeRepresentation(self.body, "Body", "MappedRepresentation", [mapped])
        ent.Representation = self.f.createIfcProductDefinitionShape(None, None, [shape])
        entry = self.type_users[type_ent.id()]
        entry[1].append(ent)
        self.material_users.setdefault(entry[2], []).append(ent)
        return ent

    def pset(self, product, name: str, properties: dict) -> None:
        ifcopenshell.api.pset.edit_pset(
            self.f, pset=ifcopenshell.api.pset.add_pset(self.f, product=product, name=name), properties=properties
        )

    # ---- distribution ports, connections and systems ----
    def port(self, element, pos: Vec, name: str, port_type: str, system_type: str) -> Port:
        frame = self.frames.get(element.id())
        if frame is None:
            raise ValueError(f"ports need an upright element placed on the storey: {element.Name}")
        origin, xdir = frame
        d = v_sub(pos, origin)
        local = (v_dot(d, xdir), v_dot(d, (-xdir[1], xdir[0], 0.0)), d[2])
        ent = self.f.create_entity(
            "IfcDistributionPort", GlobalId=ifcopenshell.guid.new(), Name=name,
            ObjectPlacement=self.f.createIfcLocalPlacement(element.ObjectPlacement, self.axis(local)),
            FlowDirection="NOTDEFINED", PredefinedType=port_type, SystemType=system_type,
        )
        self.nested.setdefault(element.id(), (element, []))[1].append(ent)
        return Port(ent, pos, element)

    def connect(self, source: Port, target: Port) -> None:
        """Flow leaves `source` and enters `target`."""
        source.ent.FlowDirection = "SOURCE"
        target.ent.FlowDirection = "SINK"
        rel = self.f.create_entity("IfcRelConnectsPorts", GlobalId=ifcopenshell.guid.new(),
                                   RelatingPort=source.ent, RelatedPort=target.ent)
        if source.omit or target.omit:
            self.removals.append(rel)

    def add_system(self, key: str, name: str, predefined: str, description: str) -> None:
        ent = self.f.create_entity("IfcDistributionSystem", GlobalId=ifcopenshell.guid.new(), Name=name,
                                   Description=description, PredefinedType=predefined)
        self.systems[key] = (ent, {})

    def assign(self, keys, element) -> None:
        for key in keys:
            self.systems[key][1].setdefault(element.id(), element)

    # ---- relationships written once, after all elements exist ----
    def flush(self) -> None:
        f = self.f
        new = ifcopenshell.guid.new
        for structure, elements in self.contained.values():
            f.createIfcRelContainedInSpatialStructure(new(), None, None, None, elements, structure)
        for space, coverings in self.covers.values():
            f.createIfcRelCoversSpaces(new(), None, None, None, space, coverings)
        for element, ports in self.nested.values():
            f.createIfcRelNests(new(), None, None, None, element, ports)
        for type_ent, users, _ in self.type_users.values():
            if users:
                f.createIfcRelDefinesByType(new(), None, None, None, users, type_ent)
        if self.type_users:
            f.createIfcRelDeclares(new(), None, None, None, self.project, [t for t, _, _ in self.type_users.values()])
        for system, members in self.systems.values():
            f.createIfcRelAssignsToGroup(new(), None, None, None, list(members.values()), None, system)
            f.createIfcRelServicesBuildings(new(), None, None, None, system, [self.building])
        for name, products in self.material_users.items():
            f.createIfcRelAssociatesMaterial(new(), None, None, None, products, self.material(name))


# ---------------------------------------------------------------------------------------
# Distribution networks: runs between nodes; fittings where runs meet; ports everywhere
# ---------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Spec:
    family: str  # pipe | duct | flex | tray | conduit
    seg_class: str
    seg_type: str
    shape: tuple  # ("round", r) | ("rect", w, h) | ("u", w, h)
    material: str
    prefix: str  # e.g. "Cold water"
    size: str  # e.g. "DN25"
    port_type: str  # IfcDistributionPortTypeEnum
    system_type: str  # IfcDistributionSystemEnum
    systems: tuple[str, ...]

    @property
    def half(self) -> float:
        return self.shape[1] if self.shape[0] == "round" else max(self.shape[1], self.shape[2]) / 2


NOUN = {"pipe": "pipe", "duct": "duct", "flex": "flexible duct", "tray": "cable tray", "conduit": "conduit"}


def pipe(prefix: str, size: str, r: float, material: str, system_type: str, systems: tuple[str, ...]) -> Spec:
    return Spec("pipe", "IfcPipeSegment", "RIGIDSEGMENT", ("round", r), material, prefix, size, "PIPE", system_type, systems)


def duct(prefix: str, w: float, h: float, material: str, system_type: str, systems: tuple[str, ...]) -> Spec:
    return Spec("duct", "IfcDuctSegment", "RIGIDSEGMENT", ("rect", w, h), material, prefix,
                f"{round(w * 1000)}x{round(h * 1000)}", "DUCT", system_type, systems)


def round_duct(prefix: str, r: float, material: str, system_type: str, systems: tuple[str, ...], flexible: bool) -> Spec:
    return Spec("flex" if flexible else "pipe_duct", "IfcDuctSegment", "FLEXIBLESEGMENT" if flexible else "RIGIDSEGMENT",
                ("round", r), material, prefix, f"DN{round(r * 2000)}", "DUCT", system_type, systems)


def tray(prefix: str, w: float, systems: tuple[str, ...]) -> Spec:
    return Spec("tray", "IfcCableCarrierSegment", "CABLETRAYSEGMENT", ("u", w, 0.05), "Cable tray", prefix,
                f"{round(w * 1000)}x50", "CABLECARRIER", "ELECTRICAL", systems)


def conduit(prefix: str, material: str, system_type: str, systems: tuple[str, ...], r: float = 0.01) -> Spec:
    return Spec("conduit", "IfcCableCarrierSegment", "CONDUITSEGMENT", ("round", r), material, prefix,
                f"{round(r * 2000)} mm", "CABLECARRIER", system_type, systems)


class Node:
    __slots__ = ("pos", "runs", "port")

    def __init__(self, pos: Vec):
        self.pos = pos
        self.runs: list[tuple[Run, str]] = []
        self.port: Port | None = None


class Run:
    __slots__ = ("a", "b", "spec", "pa", "pb")

    def __init__(self, a: Node, b: Node, spec: Spec):
        self.a, self.b, self.spec = a, b, spec
        self.pa = self.pb = None


class Net:
    """One physical network. A path's point order is the flow direction. A path that starts or
    ends inside an existing run splits it there, which is how branches join mains."""

    def __init__(self, builder: Builder, code: str):
        self.b = builder
        self.code = code
        self.nodes: dict[tuple, Node] = {}
        self.runs: list[Run] = []
        self.links: list[tuple[Port, Port]] = []

    @staticmethod
    def _key(p: Vec) -> tuple:
        return (round(p[0], 5), round(p[1], 5), round(p[2], 5))

    def _split(self, p: Vec) -> Node | None:
        for index, run in enumerate(self.runs):
            a, b = run.a.pos, run.b.pos
            ab = v_sub(b, a)
            t = v_dot(v_sub(p, a), ab) / v_dot(ab, ab)
            if t <= 1e-6 or t >= 1 - 1e-6:
                continue
            if v_len(v_sub(p, v_add(a, v_mul(ab, t)))) > 1e-5:
                continue
            node = Node(p)
            self.nodes[self._key(p)] = node
            tail = Run(node, run.b, run.spec)
            run.b.runs.remove((run, "b"))
            run.b.runs.append((tail, "b"))
            run.b = node
            node.runs += [(run, "b"), (tail, "a")]
            self.runs.insert(index + 1, tail)
            return node
        return None

    def _node(self, p: Vec, port: Port | None = None) -> Node:
        node = self.nodes.get(self._key(p)) or self._split(p)
        if node is None:
            node = Node(p)
            self.nodes[self._key(p)] = node
        if port is not None:
            if node.port is not None or node.runs:
                raise ValueError(f"{self.code}: port {port.ent.Name} lands on an occupied node {p}")
            node.port = port
        return node

    def path(self, points, spec: Spec, start: Port | None = None, end: Port | None = None) -> None:
        pts = list(points)
        if start is not None:
            pts.insert(0, start.pos)
        if end is not None:
            pts.append(end.pos)
        nodes = []
        for i, p in enumerate(pts):
            port = start if (i == 0 and start is not None) else end if (i == len(pts) - 1 and end is not None) else None
            nodes.append(self._node(p, port))
        for n0, n1 in zip(nodes, nodes[1:]):
            if v_len(v_sub(n1.pos, n0.pos)) < 1e-6:
                continue
            run = Run(n0, n1, spec)
            self.runs.append(run)
            n0.runs.append((run, "a"))
            n1.runs.append((run, "b"))

    def link(self, source: Port, target: Port) -> None:
        """Two element ports joined directly (no segment between them)."""
        self.links.append((source, target))

    def build(self) -> None:
        b = self.b
        for run in self.runs:
            run.pa, run.pb = b_segment(b, self, run.spec, run.a.pos, run.b.pos)
        for node in self.nodes.values():
            if node.port is not None:
                if len(node.runs) != 1:
                    raise ValueError(f"{self.code}: port {node.port.ent.Name} has {len(node.runs)} runs at {node.pos}")
                run, at = node.runs[0]
                if at == "a":
                    b.connect(node.port, run.pa)
                else:
                    b.connect(run.pb, node.port)
            elif len(node.runs) >= 2:
                ports = b_fitting(b, self, node)
                for (run, at), port in zip(node.runs, ports):
                    if at == "a":
                        b.connect(port, run.pa)
                    else:
                        b.connect(run.pb, port)
            else:
                raise ValueError(f"{self.code}: open end at {node.pos}")
        for source, target in self.links:
            b.connect(source, target)


def section(b: Builder, spec: Spec, p0: Vec, p1: Vec, grow: float = 0.0):
    kind = spec.shape[0]
    if kind == "round":
        return b.cyl(p0, p1, spec.shape[1] + grow)
    if kind == "rect":
        return b.rect_run(p0, p1, spec.shape[1] + 2 * grow, spec.shape[2] + 2 * grow)
    return b.u_run(p0, p1, spec.shape[1], spec.shape[2])


def b_segment(b: Builder, net: Net, spec: Spec, p0: Vec, p1: Vec):
    index = b.next_index(net.code)
    noun = NOUN.get(spec.family, "duct")
    ent = b.element(
        spec.seg_class, f"{spec.prefix} {noun} {spec.size}", spec.seg_type, origin=p0,
        parts=[(spec.material, [section(b, spec, (0.0, 0.0, 0.0), v_sub(p1, p0))])],
        container=b.container_for(p0, p1), tag=f"{net.code}-{index:03d}",
    )
    pa = b.port(ent, p0, "Port 1", spec.port_type, spec.system_type)
    pb = b.port(ent, p1, "Port 2", spec.port_type, spec.system_type)
    b.assign(spec.systems, ent)
    return pa, pb


def b_fitting(b: Builder, net: Net, node: Node):
    dirs, specs = [], []
    for run, at in node.runs:
        other = run.b if at == "a" else run.a
        dirs.append(v_unit(v_sub(other.pos, node.pos)))
        specs.append(run.spec)
    families = {s.family for s in specs}
    main = max(specs, key=lambda s: s.half)
    deg = len(dirs)
    collinear = deg == 2 and v_dot(dirs[0], dirs[1]) < -0.999
    if families <= {"tray", "conduit"}:
        if "conduit" in families and ("tray" in families or deg >= 3):
            cls, ptype, kind = "IfcJunctionBox", "POWER", "junction box"
        elif families == {"tray"}:
            cls = "IfcCableCarrierFitting"
            ptype, kind = ("BEND", "tray bend") if deg == 2 else ("TEE", "tray tee") if deg == 3 else ("CROSS", "tray cross")
        else:
            cls, ptype, kind = "IfcCableCarrierFitting", "BEND", "conduit bend"
    else:
        cls = "IfcDuctFitting" if families <= {"duct", "flex", "pipe_duct"} else "IfcPipeFitting"
        if deg == 2:
            if collinear:
                same = specs[0].shape == specs[1].shape
                ptype, kind = ("CONNECTOR", "coupling") if same else ("TRANSITION", "reducer")
            else:
                ptype, kind = "BEND", "elbow"
        else:
            ptype, kind = "JUNCTION", "tee" if deg == 3 else "cross" if deg == 4 else "plenum"
    if cls == "IfcJunctionBox":
        items = [b.box(-0.06, -0.06, -0.035, 0.06, 0.06, 0.035)]
        material = "Equipment grey"
    else:
        items = []
        for d, spec in zip(dirs, specs):
            if spec.family == "tray":
                items.append(section(b, spec, (0.0, 0.0, 0.0), v_mul(d, 0.14)))
            elif spec.shape[0] == "round":
                r = spec.shape[1]
                length = max(2.4 * r, 0.035) if spec.family != "conduit" else 0.04
                items.append(b.cyl((0.0, 0.0, 0.0), v_mul(d, length), r * (1.35 if spec.family == "conduit" else 1.22)))
            else:
                items.append(section(b, spec, (0.0, 0.0, 0.0), v_mul(d, 0.09), grow=0.015))
        material = main.material
    index = b.next_index(net.code + "-F")
    ent = b.element(cls, f"{main.prefix} {kind} {main.size}", ptype, origin=node.pos, parts=[(material, items)],
                    container=b.container_for(node.pos), tag=f"{net.code}-F{index:03d}")
    ports = [b.port(ent, node.pos, f"Port {i + 1}", s.port_type, s.system_type) for i, s in enumerate(specs)]
    systems: dict[str, None] = {}
    for s in specs:
        for key in s.systems:
            systems.setdefault(key, None)
    b.assign(list(systems), ent)
    return ports


def graded(points_xy, end_z: float, slope: float) -> list[Vec]:
    """3D points along a plan polyline that falls by `slope` towards its last point."""
    out: list[Vec] = []
    z = end_z
    rev = list(reversed(points_xy))
    for i, (x, y) in enumerate(rev):
        if i:
            px, py = rev[i - 1]
            z += math.hypot(x - px, y - py) * slope
        out.append((x, y, round(z, 6)))
    return list(reversed(out))


def at_xy(points: list[Vec], x: float, y: float) -> Vec:
    for p in points:
        if abs(p[0] - x) < 1e-9 and abs(p[1] - y) < 1e-9:
            return p
    raise KeyError((x, y))


def orth_route(a: Vec, c: Vec, z: float, via=(), first: str = "x") -> list[Vec]:
    """Interior points of an axis-aligned route from a to c at height z through optional waypoints."""
    pts = [(a[0], a[1], z), *[(v[0], v[1], z) for v in via], (c[0], c[1], z)]
    out: list[Vec] = []
    prev = a
    for p in pts:
        corner = (p[0], prev[1], z) if first == "x" else (prev[0], p[1], z)
        for q in ((corner, p) if (abs(p[0] - prev[0]) > 1e-9 and abs(p[1] - prev[1]) > 1e-9) else (p,)):
            if v_len(v_sub(q, prev)) > 1e-6 and v_len(v_sub(q, c)) > 1e-6:
                out.append(q)
                prev = q
    return out


def l_route(a: Vec, c: Vec, z: float, first: str = "x") -> list[Vec]:
    """Up/down to z, along one plan axis, then the other, then to the target (axis-aligned)."""
    pts = [(a[0], a[1], z)]
    if first == "x":
        pts.append((c[0], a[1], z))
    else:
        pts.append((a[0], c[1], z))
    pts.append((c[0], c[1], z))
    out = []
    prev = a
    for p in pts:
        if v_len(v_sub(p, prev)) > 1e-6 and v_len(v_sub(p, c)) > 1e-6:
            out.append(p)
            prev = p
    return out


# ---------------------------------------------------------------------------------------
# Architecture
# ---------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Wall:
    key: str
    name: str
    start: tuple[float, float]
    end: tuple[float, float]
    thickness: float
    external: bool
    z0: float = SLAB_TOP
    z1: float = SLAB_UNDERSIDE
    predefined: str = "SOLIDWALL"


@dataclass(frozen=True)
class Opening:
    """A door or window cut into a wall. `center` is the distance along the wall from its start."""

    key: str
    kind: str  # "door" | "window"
    wall: str
    center: float
    width: float
    height: float
    sill: float = 0.0
    name: str = ""
    reference: str = ""
    fire_exit: bool = False
    external: bool = False
    operation: str = "SINGLE_SWING_LEFT"
    material: str = "Oak"


@dataclass(frozen=True)
class Space:
    key: str
    number: str
    long_name: str
    polygon: tuple
    floor: tuple[str, str]  # (material, name)
    ceiling: tuple[str, str]


def layout(exit_width: float):
    h = EXT_T / 2
    j = INT_T / 2
    walls = [
        Wall("W-W", "External wall west (side street)", (h, 0.0), (h, FOOT_Y), EXT_T, True),
        Wall("W-E", "External wall east (party wall)", (FOOT_X - h, 0.0), (FOOT_X - h, FOOT_Y), EXT_T, True),
        Wall("W-N", "External wall north (rear lane)", (EXT_T, FOOT_Y - h), (FOOT_X - EXT_T, FOOT_Y - h), EXT_T, True),
        Wall("W-S", "Shopfront head wall", (EXT_T, 0.125), (FOOT_X - EXT_T, 0.125), 0.20, True, SHOPFRONT_HEAD),
        Wall("P-1", "Partition dining / WC, corridor and store", (EXT_T, 8.0), (8.0, 8.0), INT_T, False),
        Wall("P-2", "Partition dining / kitchen", (8.15, 6.5), (FOOT_X - EXT_T, 6.5), INT_T, False),
        Wall("P-3", "Partition store / kitchen", (8.075, 6.5 - j), (8.075, FOOT_Y - EXT_T), INT_T, False),
        Wall("P-4", "Partition WC / service corridor", (2.675, 8.0 + j), (2.675, FOOT_Y - EXT_T), INT_T, False),
        Wall("P-5", "Partition service corridor / store", (4.325, 8.0 + j), (4.325, FOOT_Y - EXT_T), INT_T, False),
        Wall("PP-S", "Parapet south", (0.0, 0.1), (FOOT_X, 0.1), 0.2, True, ROOF_TOP, PARAPET_TOP, "PARAPET"),
        Wall("PP-N", "Parapet north", (0.0, FOOT_Y - 0.1), (FOOT_X, FOOT_Y - 0.1), 0.2, True, ROOF_TOP, PARAPET_TOP, "PARAPET"),
        Wall("PP-W", "Parapet west", (0.1, 0.2), (0.1, FOOT_Y - 0.2), 0.2, True, ROOF_TOP, PARAPET_TOP, "PARAPET"),
        Wall("PP-E", "Parapet east", (FOOT_X - 0.1, 0.2), (FOOT_X - 0.1, FOOT_Y - 0.2), 0.2, True, ROOF_TOP, PARAPET_TOP, "PARAPET"),
    ]
    openings = [
        Opening("D-02", "door", "W-W", 4.0, exit_width, 2.2, name="Emergency exit", reference="D-02",
                fire_exit=True, external=True, operation="SINGLE_SWING_RIGHT", material="Steel"),
        Opening("WI-03", "window", "W-W", 1.75, 2.0, 1.5, sill=0.9, name="Dining window west", reference="WI-03", external=True),
        Opening("WI-04", "window", "W-W", 5.6, 1.4, 1.5, sill=0.9, name="Dining window west (rear)", reference="WI-04", external=True),
        Opening("WI-06", "window", "W-W", 10.4, 0.6, 0.6, sill=1.9, name="WC window (high level)", reference="WI-06", external=True),
        Opening("D-09", "door", "W-N", 3.3 - EXT_T, 1.0, 2.2, name="Rear staff door", reference="D-09",
                external=True, material="Steel"),
        Opening("WI-05", "window", "W-N", 12.5 - EXT_T, 1.5, 0.9, sill=1.6, name="Kitchen window (high level)",
                reference="WI-05", external=True),
        Opening("D-07", "door", "W-N", 16.3 - EXT_T, 1.0, 2.2, name="Kitchen service door", reference="D-07",
                external=True, material="Steel"),
        Opening("D-03", "door", "P-1", 3.5 - EXT_T, 1.0, 2.1, name="Dining to service corridor", reference="D-03"),
        Opening("D-04", "door", "P-1", 1.425 - EXT_T, 0.9, 2.1, name="Dining to WC", reference="D-04"),
        Opening("D-05", "door", "P-3", 9.9 - (6.5 - j), 0.9, 2.1, name="Store to kitchen", reference="D-05",
                material="Stainless steel"),
        Opening("D-06", "door", "P-5", 10.5 - (8.0 + j), 0.9, 2.1, name="Corridor to store", reference="D-06"),
        Opening("D-08", "door", "P-2", 9.9 - 8.15, 1.0, 2.1, name="Kitchen to serving counter", reference="D-08",
                operation="DOUBLE_SWING_LEFT", material="Stainless steel"),
        Opening("WI-07", "window", "P-2", 13.0 - 8.15, 1.8, 0.9, sill=0.95, name="Service hatch (kitchen / counter)",
                reference="WI-07", external=False),
    ]
    i = EXT_T
    spaces = [
        Space("SP-DINING", "101", "Dining hall / صالة الطعام",
              ((i, 0.20), (FOOT_X - i, 0.20), (FOOT_X - i, 6.5 - j), (8.0, 6.5 - j), (8.0, 8.0 - j), (i, 8.0 - j)),
              ("Porcelain tiles", "Porcelain floor tiles 600x600"), ("Gypsum ceiling", "Gypsum board ceiling")),
        Space("SP-KITCHEN", "102", "Kitchen / المطبخ", rect(8.15, 6.5 + j, FOOT_X - i, FOOT_Y - i),
              ("Quarry tiles", "Anti-slip quarry tiles"), ("PVC ceiling tiles", "Washable PVC ceiling tiles")),
        Space("SP-WC", "103", "WC / دورة المياه", rect(i, 8.0 + j, 2.6, FOOT_Y - i),
              ("Ceramic floor tiles", "Anti-slip ceramic tiles"), ("Gypsum ceiling", "Moisture-resistant gypsum ceiling")),
        Space("SP-CORRIDOR", "104", "Service corridor / ممر الخدمة", rect(2.75, 8.0 + j, 4.25, FOOT_Y - i),
              ("Porcelain tiles", "Porcelain floor tiles 600x600"), ("Gypsum ceiling", "Gypsum board ceiling")),
        Space("SP-STORE", "105", "Dry store / المخزن", rect(4.4, 8.0 + j, 8.0, FOOT_Y - i),
              ("Epoxy floor", "Epoxy floor coating"), ("Gypsum ceiling", "Gypsum board ceiling")),
    ]
    return walls, openings, spaces


def wall_frame(w: Wall):
    (x0, y0), (x1, y1) = w.start, w.end
    length = math.hypot(x1 - x0, y1 - y0)
    d = ((x1 - x0) / length, (y1 - y0) / length)
    return length, d


def build_walls_and_openings(b: Builder, walls, openings, fire_exit_flags: bool):
    f = b.f
    by_key = {}
    for w in walls:
        length, d = wall_frame(w)
        ent = b.element("IfcWall", w.name, w.predefined, origin=(w.start[0], w.start[1], 0.0),
                        axes=((0.0, 0.0, 1.0), (d[0], d[1], 0.0)),
                        parts=[("Plaster", [b.box(0, -w.thickness / 2, w.z0, length, w.thickness / 2, w.z1)])],
                        container=b.storey)
        b.pset(ent, "Pset_WallCommon", {"Reference": w.key, "IsExternal": w.external, "LoadBearing": w.external})
        by_key[w.key] = (w, ent, d)

    doors = {}
    for o in openings:
        w, wall_ent, d = by_key[o.wall]
        x0, y0 = w.start
        n = (-d[1], d[0])
        along = o.center - o.width / 2
        origin = (x0 + d[0] * along - n[0] * w.thickness / 2, y0 + d[1] * along - n[1] * w.thickness / 2, o.sill)
        axes = ((0.0, 0.0, 1.0), (d[0], d[1], 0.0))
        opening = b.element("IfcOpeningElement", f"Opening for {o.reference}", "OPENING", origin=origin, axes=axes,
                            parts=[("Plaster", [b.box(0, -0.05, 0, o.width, w.thickness + 0.05, o.height)])],
                            styled=False)
        ifcopenshell.api.feature.add_feature(f, feature=opening, element=wall_ent)
        if o.kind == "door":
            filling = make_door(b, o.name, o.reference, o.width, o.height, w.thickness, o.operation, o.material,
                                origin, axes, external=o.external, fire_exit=o.fire_exit if fire_exit_flags else None)
            doors[o.reference] = filling
        else:
            filling = b.element("IfcWindow", o.name, "WINDOW", origin=origin, axes=axes)
            filling.OverallWidth = b.L(o.width)
            filling.OverallHeight = b.L(o.height)
            filling.PartitioningType = "SINGLE_PANEL"
            rep = ifcopenshell.api.geometry.add_window_representation(
                f, context=b.body, overall_height=b.L(o.height), overall_width=b.L(o.width),
                partition_type="SINGLE_PANEL",
                lining_properties={"LiningDepth": b.L(w.thickness), "LiningThickness": b.L(0.06)},
                unit_scale=1.0 / b.s,
            )
            finish_api(b, filling, rep, "Glass")
            b.pset(filling, "Pset_WindowCommon", {"Reference": o.reference, "IsExternal": o.external})
            b.contain(filling, b.storey)
        ifcopenshell.api.feature.add_filling(f, opening=opening, element=filling)
    return by_key, doors


def finish_api(b: Builder, product, rep, material: str) -> None:
    ifcopenshell.api.geometry.assign_representation(b.f, product=product, representation=rep)
    ifcopenshell.api.style.assign_representation_styles(b.f, shape_representation=rep, styles=[b.style(material)])
    b.material_users.setdefault(material, []).append(product)


def make_door(b: Builder, name, reference, width, height, depth, operation, material, origin, axes, *, external,
              fire_exit):
    door = b.element("IfcDoor", name, "DOOR", origin=origin, axes=axes)
    door.OverallWidth = b.L(width)
    door.OverallHeight = b.L(height)
    door.OperationType = operation
    rep = ifcopenshell.api.geometry.add_door_representation(
        b.f, context=b.body, overall_height=b.L(height), overall_width=b.L(width), operation_type=operation,
        lining_properties={"LiningDepth": b.L(depth), "LiningThickness": b.L(0.05)}, unit_scale=1.0 / b.s,
    )
    finish_api(b, door, rep, material)
    props = {"Reference": reference, "IsExternal": external}
    if fire_exit is not None:
        props["FireExit"] = fire_exit
    b.pset(door, "Pset_DoorCommon", props)
    b.contain(door, b.storey)
    return door


def build_shopfront(b: Builder, fire_exit_flags: bool):
    """Aluminium curtain wall along the street with the double entrance door in its middle bay."""
    cw = b.element("IfcCurtainWall", "Shopfront curtain wall", "USERDEFINED", object_type="SHOPFRONT",
                   container=b.storey)
    b.pset(cw, "Pset_CurtainWallCommon", {"Reference": "CW-01", "IsExternal": True})
    rel = cw.ObjectPlacement
    y0, y1 = 0.05, 0.20  # mullion depth
    west = [0.28 + k * (8.07 - 0.28) / 5 for k in range(6)]
    east = [9.93 + k * (17.72 - 9.93) / 5 for k in range(6)]
    mullions = west + east
    parts = []
    for k, x in enumerate(mullions, start=1):
        parts.append(b.element("IfcMember", f"Shopfront mullion M-{k:02d}", "MULLION", rel_to=rel,
                               parts=[("Aluminium", [b.box(x - 0.03, y0, 0.0, x + 0.03, y1, SHOPFRONT_HEAD)])]))
    transoms = [
        ("Shopfront sill rail west", 0.25, 8.04, 0.0, 0.08),
        ("Shopfront sill rail east", 9.96, FOOT_X - EXT_T, 0.0, 0.08),
        ("Shopfront door-head transom", 0.25, FOOT_X - EXT_T, 2.40, 2.48),
        ("Shopfront head transom", 0.25, FOOT_X - EXT_T, 2.87, SHOPFRONT_HEAD),
    ]
    for name, xa, xb, za, zb in transoms:
        parts.append(b.element("IfcMember", name, "USERDEFINED", object_type="TRANSOM", rel_to=rel,
                               parts=[("Aluminium", [b.box(xa, y0 + 0.01, za, xb, y1 - 0.01, zb)])]))
    pane = 0
    for xa, xb in zip(mullions, mullions[1:]):
        if xb - xa > 1.7:  # the entrance bay: fanlight only
            levels = [(2.48, 2.87)]
        else:
            levels = [(0.08, 2.40), (2.48, 2.87)]
        for za, zb in levels:
            pane += 1
            parts.append(b.element("IfcPlate", f"Shopfront glazing G-{pane:02d}", "CURTAIN_PANEL", rel_to=rel,
                                   parts=[("Glass", [b.box(xa + 0.03, 0.113, za, xb - 0.03, 0.137, zb)])]))
    ifcopenshell.api.aggregate.assign_object(b.f, products=parts, relating_object=cw)
    door = make_door(b, "Main entrance", "D-01", 1.8, 2.4, y1 - y0, "DOUBLE_DOOR_SINGLE_SWING", "Aluminium glazed",
                     (8.1, y0, 0.0), ((0.0, 0.0, 1.0), (1.0, 0.0, 0.0)), external=True,
                     fire_exit=True if fire_exit_flags else None)
    return door


def build_envelope(b: Builder) -> None:
    s = b.storey
    b.element("IfcSlab", "Ground floor slab", "FLOOR", container=s,
              parts=[("Concrete", [b.box(0, 0, SLAB_BOTTOM, FOOT_X, FOOT_Y, SLAB_TOP)])])
    b.element("IfcSlab", "Roof slab", "ROOF", container=s,
              parts=[("Concrete", [b.box(0, 0, SLAB_UNDERSIDE, FOOT_X, FOOT_Y, ROOF_TOP)])])
    roofing = b.element("IfcCovering", "Roof waterproofing, insulation and tiles", "ROOFING", container=s,
                        parts=[("Roof tiles", [b.box(0.2, 0.2, ROOF_TOP, FOOT_X - 0.2, FOOT_Y - 0.2, ROOFING_TOP)])])
    b.pset(roofing, "Pset_CoveringCommon", {"Reference": "ROOFING", "IsExternal": True})
    band = b.element("IfcCovering", "Signage band (ACP cladding)", "CLADDING", container=s,
                     parts=[("ACP cladding", [b.box(-0.10, -0.12, SHOPFRONT_HEAD, FOOT_X + 0.10, 0.0, PARAPET_TOP + 0.05),
                                              b.box(-0.12, -0.12, SHOPFRONT_HEAD, 0.0, 2.0, PARAPET_TOP + 0.05)])])
    b.pset(band, "Pset_CoveringCommon", {"Reference": "FACADE-BAND", "IsExternal": True})
    b.element("IfcBuildingElementProxy", "Illuminated shop sign", "ELEMENT", container=s,
              parts=[("Sign face", [b.box(5.0, -0.24, 3.30, 13.0, -0.12, 4.40)])])
    canopy = b.element("IfcShadingDevice", "Entrance canopy", "AWNING", container=s,
                       parts=[("Aluminium", [b.box(7.2, -1.5, 2.56, 10.8, 0.0, 2.68),
                                             b.cyl((7.4, -1.4, 2.68), (7.4, -0.12, 3.40), 0.02),
                                             b.cyl((10.6, -1.4, 2.68), (10.6, -0.12, 3.40), 0.02)])])
    b.pset(canopy, "Pset_ShadingDeviceCommon", {"Reference": "CANOPY-01", "IsExternal": True})


def build_spaces(b: Builder, spaces):
    ents = {}
    for sp in spaces:
        ent = b.f.create_entity("IfcSpace", GlobalId=ifcopenshell.guid.new(), Name=sp.number, LongName=sp.long_name,
                                PredefinedType="INTERNAL", CompositionType="ELEMENT")
        ent.ObjectPlacement = b.placement((0.0, 0.0, 0.0))
        rep = b.f.createIfcShapeRepresentation(b.body, "Body", "SweptSolid", [b.prism(sp.polygon, 0.0, SPACE_HEIGHT)])
        ent.Representation = b.f.createIfcProductDefinitionShape(None, None, [rep])
        area = round(polygon_area(sp.polygon), 3)
        qto = ifcopenshell.api.pset.add_qto(b.f, product=ent, name="Qto_SpaceBaseQuantities")
        ifcopenshell.api.pset.edit_qto(b.f, qto=qto, properties={
            "NetFloorArea": area, "GrossFloorArea": area, "Height": b.L(SPACE_HEIGHT),
        })
        b.pset(ent, "Pset_SpaceCommon", {"Reference": sp.number, "IsExternal": False})
        ents[sp.key] = ent
    ifcopenshell.api.aggregate.assign_object(b.f, products=list(ents.values()), relating_object=b.storey)
    # floor finishes and suspended ceilings, contained in and covering their rooms
    for sp in spaces:
        space = ents[sp.key]
        material, name = sp.floor
        flooring = b.element("IfcCovering", f"{name} ({sp.number})", "FLOORING", container=space,
                             parts=[(material, [b.prism(sp.polygon, SLAB_TOP, 0.0)])])
        b.pset(flooring, "Pset_CoveringCommon", {"Reference": f"FLOOR-{sp.number}", "IsExternal": False})
        b.cover(space, flooring)
        material, name = sp.ceiling
        ceiling = b.element("IfcCovering", f"{name} ({sp.number})", "CEILING", container=space,
                            parts=[(material, [b.prism(sp.polygon, CEILING, CEILING + CEILING_T)])])
        b.pset(ceiling, "Pset_CoveringCommon", {"Reference": f"CEILING-{sp.number}", "IsExternal": False})
        b.cover(space, ceiling)
    return ents


def clad_kitchen(b: Builder, kitchen, height: float) -> None:
    """Ceramic wall tiles on the kitchen's inner faces (IfcCovering CLADDING), stopped at openings.

    Restaurant requirements 4.5.2 ask for washable cladding of at least 1.80 m in food preparation
    areas; the height here is a design input so the rule can be tested against real geometry."""
    t = 0.012
    x0, y0, x1, y1 = 8.15, 6.5 + INT_T / 2, FOOT_X - EXT_T, FOOT_Y - EXT_T
    # (side, fixed coordinate, span start, span end, openings as (a0, a1, z0, z1))
    sides = [
        ("west", x0, y0, y1, [(9.45, 10.35, 0.0, 2.1)]),  # D-05 store to kitchen
        ("east", x1, y0, y1, []),
        ("south", y0, x0, x1, [(9.4, 10.4, 0.0, 2.1), (12.1, 13.9, 0.95, 1.85)]),  # D-08, service hatch
        ("north", y1, x0, x1, [(11.75, 13.25, 1.6, 2.5), (15.8, 16.8, 0.0, 2.2)]),  # WI-05, D-07
    ]
    tiles = []
    for side, fixed, start, end, gaps in sides:
        cuts = sorted({start, end, *[g[0] for g in gaps], *[g[1] for g in gaps]})
        items = []
        for a, c in zip(cuts, cuts[1:]):
            mid = (a + c) / 2
            blocked = sorted((g[2], g[3]) for g in gaps if g[0] <= mid <= g[1])
            free, cursor = [], 0.0
            for z0, z1 in blocked:
                if z0 > cursor:
                    free.append((cursor, min(z0, height)))
                cursor = max(cursor, z1)
            if cursor < height:
                free.append((cursor, height))
            for z0, z1 in free:
                if z1 - z0 < 1e-6:
                    continue
                if side == "west":
                    items.append(b.box(fixed, a, z0, fixed + t, c, z1))
                elif side == "east":
                    items.append(b.box(fixed - t, a, z0, fixed, c, z1))
                elif side == "south":
                    items.append(b.box(a, fixed, z0, c, fixed + t, z1))
                else:
                    items.append(b.box(a, fixed - t, z0, c, fixed, z1))
        covering = b.element("IfcCovering", f"Kitchen wall tiles {side}", "CLADDING", container=kitchen,
                             parts=[("Ceramic", items)])
        b.pset(covering, "Pset_CoveringCommon", {"Reference": f"KITCHEN-TILES-{side.upper()}", "IsExternal": False})
        b.cover(kitchen, covering)
        tiles.append(covering)


# ---------------------------------------------------------------------------------------
# Furniture and fixtures
# ---------------------------------------------------------------------------------------

FACING = {"n": (0.0, 1.0), "s": (0.0, -1.0), "e": (1.0, 0.0), "w": (-1.0, 0.0)}


def facing_axes(direction: str):
    fx, fy = FACING[direction]
    return ((0.0, 0.0, 1.0), (fy, -fx, 0.0))  # local +y faces `direction`


def furnish(b: Builder, sp) -> None:
    dining, kitchen, store = sp["SP-DINING"], sp["SP-KITCHEN"], sp["SP-STORE"]
    chair_t = b.type_object("IfcFurnitureType", "Dining chair", [
        ("Upholstery", [b.box(-0.22, -0.22, 0.43, 0.22, 0.22, 0.47), b.box(-0.22, -0.24, 0.47, 0.22, -0.20, 0.88)]),
        ("Black steel", [b.box(sx - 0.015, sy - 0.015, 0.0, sx + 0.015, sy + 0.015, 0.43)
                         for sx in (-0.19, 0.19) for sy in (-0.19, 0.19)]),
    ], "CHAIR", AssemblyPlace="FACTORY")
    cafe_t = b.type_object("IfcFurnitureType", "Cafe table 700x700 (2 seats)", [
        ("Walnut", [b.box(-0.35, -0.35, 0.72, 0.35, 0.35, 0.75)]),
        ("Black steel", [b.box(-0.04, -0.04, 0.03, 0.04, 0.04, 0.72), b.box(-0.25, -0.25, 0.0, 0.25, 0.25, 0.03)]),
    ], "TABLE", AssemblyPlace="FACTORY")
    table_t = b.type_object("IfcFurnitureType", "Dining table 1200x750 (4 seats)", [
        ("Walnut", [b.box(-0.6, -0.375, 0.72, 0.6, 0.375, 0.75)]),
        ("Black steel", [b.box(sx - 0.025, sy - 0.025, 0.0, sx + 0.025, sy + 0.025, 0.72)
                         for sx in (-0.54, 0.54) for sy in (-0.31, 0.31)]),
    ], "TABLE", AssemblyPlace="FACTORY")
    booth_t = b.type_object("IfcFurnitureType", "Booth seating 1800 (4 seats)", [
        ("Leather", [b.box(-0.9, -1.30, 0.0, -0.45, 0.0, 0.45), b.box(-0.9, -1.30, 0.45, -0.8, 0.0, 1.10),
                     b.box(0.45, -1.30, 0.0, 0.9, 0.0, 0.45), b.box(0.8, -1.30, 0.45, 0.9, 0.0, 1.10)]),
        ("Walnut", [b.box(-0.4, -1.20, 0.72, 0.4, -0.05, 0.75), b.box(-0.05, -0.75, 0.0, 0.05, -0.55, 0.72)]),
    ], "USERDEFINED", ElementType="BOOTH", AssemblyPlace="SITE")
    shelf_t = b.type_object("IfcFurnitureType", "Steel shelving unit 1600x500x2000", [
        ("Stainless steel", [b.box(-0.8, -0.25, z, 0.8, 0.25, z + 0.025) for z in (0.15, 0.6, 1.05, 1.5, 1.95)]),
        ("Steel", [b.box(sx - 0.02, sy - 0.02, 0.0, sx + 0.02, sy + 0.02, 2.0)
                   for sx in (-0.78, 0.78) for sy in (-0.23, 0.23)]),
    ], "SHELF", AssemblyPlace="FACTORY")
    work_t = b.type_object("IfcFurnitureType", "Stainless work table 1800x700", [
        ("Stainless steel", [b.box(-0.9, -0.35, 0.86, 0.9, 0.35, 0.9), b.box(-0.88, -0.33, 0.18, 0.88, 0.33, 0.2)]),
        ("Steel", [b.box(sx - 0.02, sy - 0.02, 0.0, sx + 0.02, sy + 0.02, 0.86)
                   for sx in (-0.86, 0.86) for sy in (-0.31, 0.31)]),
    ], "TABLE", AssemblyPlace="FACTORY")

    chairs = 0

    def chair(x: float, y: float, face: str) -> None:
        nonlocal chairs
        chairs += 1
        b.instance(chair_t, "IfcFurniture", f"Chair C-{chairs:02d}", "CHAIR", origin=(x, y, 0.0),
                   axes=facing_axes(face), container=dining)

    tables = 0
    # window tables for two along the glazing, either side of the entrance
    for x in (1.35, 3.25, 5.15, 7.05, 10.95, 12.85, 14.75, 16.65):
        tables += 1
        b.instance(cafe_t, "IfcFurniture", f"Table T-{tables:02d} (2 seats)", "TABLE", origin=(x, 1.05, 0.0),
                   container=dining)
        chair(x - 0.55, 1.05, "e")
        chair(x + 0.55, 1.05, "w")
    # tables for four; the aisle between the rows leads to the emergency exit D-02
    for x, y in ((1.4, 2.6), (3.6, 2.6), (5.8, 2.6), (1.4, 5.2), (3.6, 5.2), (5.8, 5.2), (12.0, 2.6), (15.2, 2.6)):
        tables += 1
        b.instance(table_t, "IfcFurniture", f"Table T-{tables:02d} (4 seats)", "TABLE", origin=(x, y, 0.0),
                   container=dining)
        for dx in (-0.3, 0.3):
            chair(x + dx, y - 0.6, "n")
            chair(x + dx, y + 0.6, "s")
    for k, x in enumerate((5.3, 7.1), start=1):
        b.instance(booth_t, "IfcFurniture", f"Booth B-{k:02d} (4 seats)", "USERDEFINED", object_type="BOOTH",
                   origin=(x, 8.0 - INT_T / 2, 0.0), container=dining)
    b.element("IfcFurniture", "Cashier and serving counter", "USERDEFINED", object_type="COUNTER",
              origin=(10.8, 4.7, 0.0), container=dining,
              parts=[("Walnut", [b.box(0.0, 0.05, 0.0, FOOT_X - EXT_T - 10.8, 0.65, 1.0)]),
                     ("Quartz", [b.box(-0.03, 0.0, 1.0, FOOT_X - EXT_T - 10.8, 0.7, 1.05)])])
    # kitchen stainless tables: island (two back to back), pass table under the hatch, landing table
    for name, x, y in (("Prep table P-01", 12.3, 8.75), ("Prep table P-02", 12.3, 9.45),
                       ("Pass table under the service hatch", 13.0, 6.925), ("Landing table P-03", 14.9, 7.75)):
        b.instance(work_t, "IfcFurniture", name, "TABLE", origin=(x, y, 0.0), container=kitchen)
    for k, (x, y) in enumerate(((5.55, 11.5), (7.15, 11.5), (5.55, 8.325)), start=1):
        b.instance(shelf_t, "IfcFurniture", f"Shelving unit S-{k:02d}", "SHELF", origin=(x, y, 0.0), container=store)


def equipment(b: Builder, sp):
    """Kitchen appliances, sanitary fixtures and floor traps. Returns their ports by name."""
    kitchen, wc, dining = sp["SP-KITCHEN"], sp["SP-WC"], sp["SP-DINING"]
    P: dict[str, Port] = {}
    E: dict[str, object] = {}

    def add(key, cls, name, predefined, origin, parts, container, object_type=None, systems=()):
        ent = b.element(cls, name, predefined, origin=origin, parts=parts, container=container,
                        object_type=object_type, tag=key)
        E[key] = ent
        b.assign(systems, ent)
        return ent

    def port(key, element_key, pos, name, ptype, systype):
        P[key] = b.port(E[element_key], pos, name, ptype, systype)

    # cooking line along the east (party) wall, under the hood
    add("GR-1", "IfcElectricAppliance", "Griddle 900", "USERDEFINED", (16.95, 7.6, 0.0),
        [("Stainless steel", [b.box(0.0, 0.0, 0.55, 0.75, 0.9, 0.9)]),
         ("Steel", [b.box(0.05, 0.05, 0.0, 0.7, 0.85, 0.55)]),
         ("Cast iron", [b.box(0.06, 0.06, 0.9, 0.7, 0.84, 0.925)])], kitchen, "GRIDDLE", ("ELP",))
    add("RG-1", "IfcElectricAppliance", "Six-burner range with oven", "ELECTRICCOOKER", (16.95, 8.5, 0.0),
        [("Stainless steel", [b.box(0.0, 0.0, 0.0, 0.75, 1.2, 0.9)]),
         ("Cast iron", [b.vcyl(x, y, 0.9, 0.93, 0.1) for x in (0.22, 0.52) for y in (0.22, 0.6, 0.98)])],
        kitchen, None, ("ELP",))
    add("FR-1", "IfcElectricAppliance", "Twin-tank fryer", "USERDEFINED", (16.95, 9.7, 0.0),
        [("Stainless steel", [b.box(0.0, 0.0, 0.0, 0.75, 0.8, 0.95)]),
         ("Cast iron", [b.box(0.1, 0.08, 0.95, 0.65, 0.38, 0.97), b.box(0.1, 0.42, 0.95, 0.65, 0.72, 0.97)])],
        kitchen, "FRYER", ("ELP",))
    add("HD-1", "IfcAirTerminal", "Kitchen exhaust hood (canopy, 3.2 m)", "USERDEFINED", (16.65, 7.45, 0.0),
        [("Stainless steel", [b.box(0.0, 0.0, 2.0, 1.1, 3.2, 2.6), b.box(0.3, 1.425, 2.6, 0.8, 1.775, 2.68)])],
        kitchen, "KITCHENHOOD", ("KEX",))
    port("hood", "HD-1", (17.2, 9.05, 2.68), "Exhaust air outlet", "DUCT", "EXHAUST")
    for key, y in (("GR-1", 8.05), ("RG-1", 9.6), ("FR-1", 10.1)):
        port(f"{key}.power", key, (17.82, y, 0.55), "Power", "CABLECARRIER", "ELECTRICAL")

    # wash-up along the north wall under the window
    add("SK-1", "IfcSanitaryTerminal", "Three-compartment sink", "SINK", (11.6, 11.05, 0.0),
        [("Stainless steel", [b.box(0.0, 0.0, 0.58, 1.8, 0.7, 0.9), b.box(0.0, 0.62, 0.9, 1.8, 0.7, 1.15)]
          + [b.box(xa, 0.03, 0.0, xa + 0.04, 0.07, 0.58) for xa in (0.03, 1.73)]),
         ("Cast iron", [b.box(x0, 0.1, 0.895, x0 + 0.45, 0.55, 0.9) for x0 in (0.2, 0.675, 1.15)])],
        kitchen, None, ("DCW", "DHW", "DRN"))
    port("SK-1.cold", "SK-1", (12.3, 11.875, 1.1), "Cold water inlet", "PIPE", "DOMESTICCOLDWATER")
    port("SK-1.hot", "SK-1", (12.7, 11.875, 1.1), "Hot water inlet", "PIPE", "DOMESTICHOTWATER")
    port("SK-1.drain", "SK-1", (12.5, 11.4, 0.45), "Drain outlet", "PIPE", "DRAINAGE")
    add("DW-1", "IfcElectricAppliance", "Hood-type dishwasher", "DISHWASHER", (13.5, 11.0, 0.0),
        [("Stainless steel", [b.box(0.0, 0.0, 0.0, 0.75, 0.75, 0.85), b.box(0.02, 0.02, 0.85, 0.73, 0.73, 1.75),
                              b.box(0.12, 0.12, 1.75, 0.63, 0.63, 1.95)])], kitchen, None, ("DCW", "DRN", "ELP"))
    port("DW-1.cold", "DW-1", (13.9, 11.875, 0.5), "Cold water inlet", "PIPE", "DOMESTICCOLDWATER")
    port("DW-1.drain", "DW-1", (13.75, 11.4, 0.2), "Drain outlet", "PIPE", "DRAINAGE")
    port("DW-1.power", "DW-1", (14.1, 11.6, 1.95), "Power", "CABLECARRIER", "ELECTRICAL")
    add("WH-1", "IfcBoiler", "Electric water heater 80 L", "WATER", (9.85, 11.47, 0.0),
        [("White enamel", [b.vcyl(0.0, 0.0, 1.85, 2.65, 0.22)])], kitchen, None, ("DCW", "DHW", "ELP"))
    port("WH-1.cold", "WH-1", (9.75, 11.875, 2.0), "Cold water inlet", "PIPE", "DOMESTICCOLDWATER")
    port("WH-1.hot", "WH-1", (9.95, 11.875, 2.0), "Hot water outlet", "PIPE", "DOMESTICHOTWATER")
    port("WH-1.power", "WH-1", (10.0, 11.47, 2.65), "Power", "CABLECARRIER", "ELECTRICAL")
    add("RF-1", "IfcElectricAppliance", "Reach-in refrigerator", "REFRIGERATOR", (8.15, 10.6, 0.0),
        [("Stainless steel", [b.box(0.0, 0.0, 0.0, 0.75, 0.8, 2.05)])], kitchen, None, ("ELP",))
    port("RF-1.power", "RF-1", (8.6, 11.0, 2.05), "Power", "CABLECARRIER", "ELECTRICAL")
    add("FZ-1", "IfcElectricAppliance", "Reach-in freezer", "FREEZER", (8.15, 7.8, 0.0),
        [("Stainless steel", [b.box(0.0, 0.0, 0.0, 0.75, 0.8, 2.05)])], kitchen, None, ("ELP",))
    port("FZ-1.power", "FZ-1", (8.6, 8.2, 2.05), "Power", "CABLECARRIER", "ELECTRICAL")
    add("HW-K", "IfcSanitaryTerminal", "Kitchen hand-wash basin", "WASHHANDBASIN", (8.15, 6.95, 0.0),
        [("Stainless steel", [b.box(0.0, 0.0, 0.72, 0.45, 0.5, 0.9), b.box(0.0, 0.0, 0.9, 0.04, 0.5, 1.2)])],
        kitchen, None, ("DCW", "DHW", "DRN"))
    port("HW-K.cold", "HW-K", (8.075, 7.1, 1.15), "Cold water inlet", "PIPE", "DOMESTICCOLDWATER")
    port("HW-K.hot", "HW-K", (8.075, 7.3, 1.0), "Hot water inlet", "PIPE", "DOMESTICHOTWATER")
    port("HW-K.drain", "HW-K", (8.4, 7.2, 0.6), "Drain outlet", "PIPE", "DRAINAGE")

    # WC and the hand-wash basins outside it
    add("WC-1", "IfcSanitaryTerminal", "WC pan with close-coupled cistern", "TOILETPAN", (1.24, 11.05, 0.0),
        [("Ceramic", [b.box(0.0, 0.0, 0.0, 0.38, 0.7, 0.42), b.box(-0.06, 0.5, 0.42, 0.44, 0.7, 0.85)])],
        wc, None, ("DCW", "DRN"))
    port("WC-1.cold", "WC-1", (1.72, 11.875, 0.25), "Cold water inlet", "PIPE", "DOMESTICCOLDWATER")
    port("WC-1.drain", "WC-1", (1.43, 11.45, 0.0), "Drain outlet", "PIPE", "DRAINAGE")
    basins = (("HW-WC", "WC wash basin", 9.4, wc), ("HW-1", "Hand-wash basin HW-1 (dining)", 6.8, dining),
              ("HW-2", "Hand-wash basin HW-2 (dining)", 7.55, dining))
    for key, name, y, room in basins:
        add(key, "IfcSanitaryTerminal", name, "WASHHANDBASIN", (EXT_T, y, 0.0),
            [("Ceramic", [b.box(0.0, -0.21, 0.72, 0.5, 0.21, 0.86), b.box(0.0, -0.06, 0.4, 0.12, 0.06, 0.72)])],
            room, None, ("DCW", "DRN"))
        port(f"{key}.cold", key, (0.125, y, 1.0), "Cold water inlet", "PIPE", "DOMESTICCOLDWATER")
        port(f"{key}.drain", key, (0.45, y, 0.6), "Drain outlet", "PIPE", "DRAINAGE")

    # floor traps (gully with stainless grate) flush with the floor finish
    for key, name, x, y, room in (("FT-1", "Floor trap FT-1 (cooking line)", 16.3, 9.0, kitchen),
                                  ("FT-2", "Floor trap FT-2 (wash-up)", 12.5, 10.6, kitchen),
                                  ("FT-3", "Floor trap FT-3 (WC)", 1.8, 10.0, wc)):
        add(key, "IfcWasteTerminal", name, "FLOORTRAP", (x, y, 0.0),
            [("uPVC drain", [b.vcyl(0.0, 0.0, -0.25, -0.006, 0.1)]),
             ("Stainless steel", [b.box(-0.075, -0.075, -0.006, 0.075, 0.075, 0.0)])], room, None, ("DRN",))
        port(f"{key}.drain", key, (x, y, -0.25), "Drain outlet", "PIPE", "DRAINAGE")
    return E, P


# ---------------------------------------------------------------------------------------
# Building services
# ---------------------------------------------------------------------------------------

SYSTEMS = [
    ("DCW", "Domestic cold water / المياه الباردة", "DOMESTICCOLDWATER",
     "Municipal supply through meter M-1 and the main stop valve to every sink, basin, WC, dishwasher and the heater"),
    ("DHW", "Domestic hot water / المياه الساخنة", "DOMESTICHOTWATER",
     "Electric water heater WH-1 to the three-compartment sink and the kitchen hand-wash basin"),
    ("DRN", "Sanitary drainage / الصرف الصحي", "DRAINAGE",
     "Kitchen waste through grease interceptor GI-1; WC and basins join the building drain to inspection chamber IC-1"),
    ("VNT", "Drainage vent / تهوية الصرف", "VENT", "Vent stack from the WC branch to the roof"),
    ("KEX", "Kitchen exhaust / عادم المطبخ", "EXHAUST", "Hood HD-1 through the grease duct to roof fan KEF-1"),
    ("WEX", "WC extract / شفط دورة المياه", "EXHAUST", "Ceiling grille through inline fan WEF-1 to the roof cowl"),
    ("AC", "Air conditioning / التكييف", "AIRCONDITIONING",
     "Ducted split units AC-1 to AC-3 with supply ducts, ceiling diffusers and return grilles"),
    ("REF", "Refrigerant piping / مواسير وسيط التبريد", "REFRIGERATION",
     "Insulated refrigerant lines between the indoor units and condensing units CU-1 to CU-3 on the roof"),
    ("ELP", "Power / القوى الكهربائية", "ELECTRICAL",
     "Main distribution board MDB-1, cable trays, junction boxes and conduits to outlets, appliances and fans"),
    ("LTG", "Lighting / الإنارة", "LIGHTING", "Lighting circuits from MDB-1 to the ceiling luminaires"),
    ("SPK", "Fire sprinklers / رشاشات الحريق", "FIREPROTECTION",
     "Wet sprinkler riser with alarm check valve, mains, branches and pendent heads"),
    ("FAL", "Fire alarm and life safety / إنذار الحريق والسلامة", "FIREPROTECTION",
     "Fire alarm panel, detectors, call points and sounders on looped conduits; exit signs and extinguishers"),
]


def build_services(b: Builder, sp, disconnect_sink_drain: bool) -> None:
    for key, name, predefined, description in SYSTEMS:
        b.add_system(key, name, predefined, description)
    E, P = equipment(b, sp)
    if disconnect_sink_drain:
        P["SK-1.drain"].omit = True
    storey, site = b.storey, b.site
    dining, kitchen, corridor = sp["SP-DINING"], sp["SP-KITCHEN"], sp["SP-CORRIDOR"]
    store, wc = sp["SP-STORE"], sp["SP-WC"]

    def unit(key, cls, name, predefined, origin, parts, systems, container=None, object_type=None):
        ent = b.element(cls, name, predefined, origin=origin, parts=parts, object_type=object_type, tag=key,
                        container=container or b.container_for(origin))
        E[key] = ent
        b.assign(systems, ent)
        return ent

    def port(key, element_key, pos, name, ptype, systype):
        P[key] = b.port(E[element_key], pos, name, ptype, systype)
        return P[key]

    # ---------------- domestic cold water: meter, stop valve, riser, mains in the ceiling zone ----------------
    cold_main = pipe("Cold water", "DN32", 0.020, "PPR cold", "DOMESTICCOLDWATER", ("DCW",))
    cold_branch = pipe("Cold water", "DN20", 0.0125, "PPR cold", "DOMESTICCOLDWATER", ("DCW",))
    unit("M-1", "IfcFlowMeter", "Water meter M-1 (municipal connection)", "WATERMETER", (4.55, 12.3, 0.0),
         [("Brass", [b.box(-0.07, -0.15, 0.53, 0.07, 0.15, 0.67)]),
          ("Cast iron", [b.vcyl(0.0, 0.0, 0.67, 0.72, 0.06)])], ("DCW",), site)
    port("M-1.in", "M-1", (4.55, 12.45, 0.6), "Municipal supply", "PIPE", "DOMESTICCOLDWATER")
    port("M-1.out", "M-1", (4.55, 12.15, 0.6), "Outlet", "PIPE", "DOMESTICCOLDWATER")
    unit("V-1", "IfcValve", "Main stop valve V-1", "ISOLATING", (4.55, 11.55, 0.0),
         [("Brass", [b.vcyl(0.0, 0.0, 1.0, 1.2, 0.03), b.cyl((0.0, 0.0, 1.1), (0.0, -0.12, 1.1), 0.008)])],
         ("DCW",), storey)
    port("V-1.in", "V-1", (4.55, 11.55, 1.0), "Inlet", "PIPE", "DOMESTICCOLDWATER")
    port("V-1.out", "V-1", (4.55, 11.55, 1.2), "Outlet", "PIPE", "DOMESTICCOLDWATER")
    dcw = Net(b, "DCW")
    dcw.path([(4.55, 11.55, 0.6)], cold_main, start=P["M-1.out"], end=P["V-1.in"])
    dcw.path([(4.55, 11.55, Z_COLD)], cold_main, start=P["V-1.out"])
    dcw.path([(4.55, 11.55, Z_COLD), (13.9, 11.55, Z_COLD), (13.9, 11.875, Z_COLD)], cold_main, end=P["DW-1.cold"])
    dcw.path([(4.55, 11.55, Z_COLD), (0.125, 11.55, Z_COLD), (0.125, 11.55, 2.6), (0.125, 6.8, 2.6)], cold_main,
             end=P["HW-1.cold"])
    dcw.path([(0.125, 7.55, 2.6)], cold_branch, end=P["HW-2.cold"])
    dcw.path([(0.125, 9.4, 2.6)], cold_branch, end=P["HW-WC.cold"])
    dcw.path([(1.72, 11.55, Z_COLD), (1.72, 11.875, Z_COLD)], cold_branch, end=P["WC-1.cold"])
    dcw.path([(8.075, 11.55, Z_COLD), (8.075, 11.55, 2.35), (8.075, 7.1, 2.35)], cold_branch, end=P["HW-K.cold"])
    dcw.path([(9.75, 11.55, Z_COLD), (9.75, 11.875, Z_COLD)], cold_branch, end=P["WH-1.cold"])
    dcw.path([(11.6, 11.55, Z_COLD), (11.6, 11.875, Z_COLD), (11.6, 11.875, 1.3), (12.3, 11.875, 1.3)], cold_branch,
             end=P["SK-1.cold"])
    dcw.build()

    # ---------------- domestic hot water ----------------
    hot = pipe("Hot water", "DN20", 0.0125, "PPR hot", "DOMESTICHOTWATER", ("DHW",))
    dhw = Net(b, "DHW")
    dhw.path([(9.95, 11.875, Z_HOT), (9.95, 11.65, Z_HOT)], hot, start=P["WH-1.hot"])
    dhw.path([(9.95, 11.65, Z_HOT), (13.4, 11.65, Z_HOT), (13.4, 11.875, Z_HOT), (13.4, 11.875, 1.2),
              (12.7, 11.875, 1.2)], hot, end=P["SK-1.hot"])
    dhw.path([(9.95, 11.65, Z_HOT), (8.075, 11.65, Z_HOT), (8.075, 11.65, 2.25), (8.075, 7.3, 2.25)], hot,
             end=P["HW-K.hot"])
    dhw.build()

    # ---------------- sanitary drainage under the slab, grease interceptor, building drain, vent ----------------
    drain_main = pipe("Drainage", "DN100", 0.055, "uPVC drain", "DRAINAGE", ("DRN",))
    drain_branch = pipe("Drainage", "DN50", 0.032, "uPVC drain", "DRAINAGE", ("DRN",))
    vent = pipe("Vent", "DN50", 0.030, "uPVC vent", "VENT", ("VNT",))
    unit("GI-1", "IfcInterceptor", "Grease interceptor GI-1 (in-ground, 1500 L)", "GREASE", (13.85, 13.0, 0.0),
         [("Precast concrete", [b.box(-0.9, -0.5, -1.40, 0.9, 0.5, GRADE - 0.03)]),
          ("Cast iron", [b.box(x - 0.3, -0.3, GRADE - 0.03, x + 0.3, 0.3, GRADE) for x in (-0.45, 0.45)])],
         ("DRN",), site)
    unit("IC-1", "IfcDistributionChamberElement", "Inspection chamber IC-1 (building drain outlet)",
         "INSPECTIONCHAMBER", (6.0, 14.3, 0.0),
         [("Precast concrete", [b.box(-0.4, -0.4, -1.25, 0.4, 0.4, GRADE - 0.03)]),
          ("Cast iron", [b.box(-0.3, -0.3, GRADE - 0.03, 0.3, 0.3, GRADE)])], ("DRN",), site)
    unit("VC-1", "IfcStackTerminal", "Vent cap VC-1", "BIRDCAGE", (0.45, 11.0, 0.0),
         [("uPVC vent", [b.vcyl(0.0, 0.0, 4.0, 4.12, 0.045), b.vcyl(0.0, 0.0, 4.12, 4.16, 0.07)])], ("VNT",), storey)
    chamber_in = (6.0, 13.9, -0.80)
    j1 = (6.0, 13.2, round(chamber_in[2] + 0.7 * 0.01, 6))
    gi_out = (12.95, 13.2, round(j1[2] + 6.95 * 0.01, 6))
    port("GI-1.in", "GI-1", (13.45, 12.5, -0.55), "Inlet", "PIPE", "DRAINAGE")
    port("GI-1.out", "GI-1", gi_out, "Outlet", "PIPE", "DRAINAGE")
    port("IC-1.in", "IC-1", chamber_in, "Inlet", "PIPE", "DRAINAGE")
    port("IC-1.out", "IC-1", (6.0, 14.7, -0.85), "To municipal sewer", "PIPE", "DRAINAGE")
    port("VC-1.in", "VC-1", (0.45, 11.0, 4.0), "Inlet", "PIPE", "VENT")
    drn = Net(b, "DRN")
    # kitchen waste to the grease interceptor at 1 % fall; fixture branches at 2 %
    kitchen_line = graded([(8.4, 7.2), (13.45, 7.2), (13.45, 9.0), (13.45, 10.6), (13.45, 11.4), (13.45, 12.5)],
                          -0.55, 0.01)
    drn.path(kitchen_line[:-1], drain_main, start=P["HW-K.drain"], end=P["GI-1.in"])
    for key, x, y in (("FT-1.drain", 16.3, 9.0), ("FT-2.drain", 12.5, 10.6), ("SK-1.drain", 12.5, 11.4),
                      ("DW-1.drain", 13.75, 11.4)):
        join = at_xy(kitchen_line, 13.45, y)
        drn.path([(x, y, round(join[2] + abs(x - 13.45) * 0.02, 6)), join], drain_branch, start=P[key])
    # treated kitchen waste and the WC branch meet at J1, then run to the inspection chamber
    drn.path([j1], drain_main, start=P["GI-1.out"], end=P["IC-1.in"])
    wc_line = graded([(0.45, 6.8), (0.45, 7.55), (0.45, 9.4), (0.45, 10.0), (0.45, 11.0), (0.45, 11.45),
                      (1.43, 11.45), (1.43, 13.2), (6.0, 13.2)], j1[2], 0.02)
    drn.path(wc_line, drain_main, start=P["HW-1.drain"])
    for key, x, y in (("HW-2.drain", 0.45, 7.55), ("HW-WC.drain", 0.45, 9.4), ("WC-1.drain", 1.43, 11.45)):
        drn.path([at_xy(wc_line, x, y)], drain_main if key == "WC-1.drain" else drain_branch, start=P[key])
    join = at_xy(wc_line, 0.45, 10.0)
    drn.path([(1.8, 10.0, round(join[2] + 1.35 * 0.02, 6)), join], drain_branch, start=P["FT-3.drain"])
    drn.path([at_xy(wc_line, 0.45, 11.0)], vent, end=P["VC-1.in"])
    drn.build()

    # ---------------- kitchen exhaust: hood collar straight up to the roof fan ----------------
    unit("KEF-1", "IfcFan", "Kitchen exhaust fan KEF-1 (roof upblast)", "CENTRIFUGALBACKWARDINCLINEDCURVED",
         (17.2, 9.05, 0.0),
         [("Equipment grey", [b.box(-0.4, -0.4, ROOF_TOP, 0.4, 0.4, 3.95), b.vcyl(0.0, 0.0, 3.95, 4.35, 0.38)]),
          ("Black steel", [b.vcyl(0.0, 0.0, 4.35, 4.42, 0.25)])], ("KEX", "ELP"), storey)
    port("KEF-1.in", "KEF-1", (17.2, 9.05, 3.70), "Exhaust air inlet", "DUCT", "EXHAUST")
    port("KEF-1.power", "KEF-1", (17.2, 9.45, 3.85), "Power", "CABLECARRIER", "ELECTRICAL")
    kex = Net(b, "KEX")
    kex.path([], duct("Kitchen exhaust", 0.5, 0.35, "Grease duct", "EXHAUST", ("KEX",)), start=P["hood"],
             end=P["KEF-1.in"])
    kex.build()

    # ---------------- WC extract ----------------
    wc_duct = round_duct("WC extract", 0.075, "Galvanised duct", "EXHAUST", ("WEX",), flexible=False)
    unit("WEG-1", "IfcAirTerminal", "WC extract grille", "GRILLE", (0.7, 10.9, 0.0),
         [("White enamel", [b.box(-0.15, -0.15, 2.88, 0.15, 0.15, 2.90), b.vcyl(0.0, 0.0, 2.90, 2.94, 0.08)])],
         ("WEX",), storey)
    port("WEG-1.out", "WEG-1", (0.7, 10.9, 2.94), "Exhaust air outlet", "DUCT", "EXHAUST")
    unit("WEF-1", "IfcFan", "Inline WC extract fan WEF-1", "TUBEAXIAL", (0.9, 10.9, 0.0),
         [("Equipment grey", [b.cyl((0.0, 0.0, 3.05), (0.35, 0.0, 3.05), 0.11)])], ("WEX", "ELP"), storey)
    port("WEF-1.in", "WEF-1", (0.9, 10.9, 3.05), "Inlet", "DUCT", "EXHAUST")
    port("WEF-1.out", "WEF-1", (1.25, 10.9, 3.05), "Outlet", "DUCT", "EXHAUST")
    unit("WEC-1", "IfcStackTerminal", "WC extract roof cowl", "COWL", (1.5, 10.9, 0.0),
         [("Galvanised duct", [b.vcyl(0.0, 0.0, ROOF_TOP, 3.95, 0.09), b.vcyl(0.0, 0.0, 3.95, 4.0, 0.16)])],
         ("WEX",), storey)
    port("WEC-1.in", "WEC-1", (1.5, 10.9, 3.70), "Inlet", "DUCT", "EXHAUST")
    wex = Net(b, "WEX")
    wex.path([(0.7, 10.9, 3.05)], wc_duct, start=P["WEG-1.out"], end=P["WEF-1.in"])
    wex.path([(1.5, 10.9, 3.05)], wc_duct, start=P["WEF-1.out"], end=P["WEC-1.in"])
    wex.build()

    # ---------------- air conditioning: ducted splits with roof condensing units ----------------
    diffuser_t = b.type_object("IfcAirTerminalType", "Square ceiling diffuser 600x600", [
        ("White enamel", [b.box(-0.3, -0.3, -0.06, 0.3, 0.3, -0.04), b.box(-0.22, -0.22, -0.04, 0.22, 0.22, 0.0)]),
    ], "DIFFUSER")
    grille_t = b.type_object("IfcAirTerminalType", "Return air grille 600x300", [
        ("White enamel", [b.box(-0.3, -0.15, -0.06, 0.3, 0.15, -0.04), b.box(-0.25, -0.12, -0.04, 0.25, 0.12, 0.0)]),
    ], "GRILLE")
    supply = duct("Supply air", 0.40, 0.23, "Galvanised duct", "AIRCONDITIONING", ("AC",))
    trunk = duct("Supply air", 0.35, 0.23, "Galvanised duct", "AIRCONDITIONING", ("AC",))
    flex = round_duct("Supply air", 0.10, "Flexible duct", "AIRCONDITIONING", ("AC",), flexible=True)
    refrigerant = pipe("Refrigerant", "DN22 pair", 0.026, "Copper (insulated)", "REFRIGERATION", ("REF",))
    acnet = Net(b, "AC")
    refnet = Net(b, "REF")
    units = [
        # key, name, unit box (x0, y0, x1, y1), supply spigot, return spigot, refrigerant / power entry,
        # trunk (tee first) and the diffusers fed from each trunk node
        ("AC-1", "Ducted split indoor unit AC-1 (dining west)", (5.8, 6.9, 6.8, 7.6), (6.3, 6.9), (6.3, 7.45),
         (6.6, 7.15), (5.95, 7.2), [(6.3, 3.4), (2.7, 3.4), (7.5, 3.4)],
         {(2.7, 3.4): [(2.7, 2.3), (2.7, 4.5)], (7.5, 3.4): [(7.5, 2.3), (7.5, 4.5)]}),
        ("AC-2", "Ducted split indoor unit AC-2 (dining east and counter)", (13.0, 5.65, 14.0, 6.35), (13.5, 5.65),
         (13.2, 6.15), (13.8, 6.1), (13.2, 5.85), [(13.5, 3.4), (9.9, 3.4), (17.1, 3.4)],
         {(9.9, 3.4): [(9.9, 2.3), (9.9, 4.5)], (14.7, 3.4): [(14.7, 2.3), (14.7, 4.5)],
          (17.1, 3.4): [(17.1, 2.3), (17.1, 4.5)]}),
        ("AC-3", "Ducted split indoor unit AC-3 (kitchen)", (9.0, 7.0, 10.0, 7.7), (10.0, 7.35), (9.3, 7.5),
         (9.5, 7.35), (9.3, 7.35), [(11.8, 7.35), (14.0, 7.35)],
         {(11.8, 7.35): [(11.8, 8.4)], (14.0, 7.35): [(14.0, 8.4)]}),
    ]
    terminals = 0
    for k, (key, name, (x0, y0, x1, y1), sup, ret, refr, power, trunk_pts, outlets) in enumerate(units, start=1):
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        unit(key, "IfcUnitaryEquipment", name, "SPLITSYSTEM", (cx, cy, 0.0),
             [("White enamel", [b.box(x0 - cx, y0 - cy, 2.97, x1 - cx, y1 - cy, 3.20)])], ("AC", "REF", "ELP"),
             storey)
        port(f"{key}.supply", key, (sup[0], sup[1], Z_DUCT), "Supply air outlet", "DUCT", "AIRCONDITIONING")
        port(f"{key}.return", key, (ret[0], ret[1], 2.97), "Return air inlet", "DUCT", "AIRCONDITIONING")
        port(f"{key}.ref", key, (refr[0], refr[1], 3.20), "Refrigerant", "PIPE", "REFRIGERATION")
        port(f"{key}.power", key, (power[0], power[1], 3.20), "Power", "CABLECARRIER", "ELECTRICAL")
        cu = f"CU-{k}"
        unit(cu, "IfcUnitaryEquipment", f"Condensing unit {cu} (roof, behind the parapet)", "SPLITSYSTEM",
             (refr[0], refr[1], 0.0),
             [("White enamel", [b.box(-0.475, -0.2, 3.70, 0.475, 0.2, 4.50)]),
              ("Black steel", [b.box(-0.45, -0.22, ROOFING_TOP, 0.45, 0.22, 3.70)])], ("AC", "REF", "ELP"), storey)
        port(f"{cu}.ref", cu, (refr[0], refr[1], 3.70), "Refrigerant", "PIPE", "REFRIGERATION")
        refnet.path([], refrigerant, start=P[f"{cu}.ref"], end=P[f"{key}.ref"])
        grille = b.instance(grille_t, "IfcAirTerminal", f"Return air grille ({key})", "GRILLE",
                            origin=(ret[0], ret[1], 2.94), container=storey, tag=f"RAG-{k}")
        b.assign(("AC",), grille)
        acnet.link(b.port(grille, (ret[0], ret[1], 2.94), "Return air outlet", "DUCT", "AIRCONDITIONING"),
                   P[f"{key}.return"])
        tee = trunk_pts[0]
        acnet.path([(tee[0], tee[1], Z_DUCT)], supply, start=P[f"{key}.supply"])
        for tp in trunk_pts[1:]:
            acnet.path([(tee[0], tee[1], Z_DUCT), (tp[0], tp[1], Z_DUCT)], trunk)
        for (tx, ty), targets in outlets.items():
            for dx, dy in targets:
                terminals += 1
                d = b.instance(diffuser_t, "IfcAirTerminal", f"Supply diffuser SD-{terminals:02d} ({key})", "DIFFUSER",
                               origin=(dx, dy, 2.94), container=storey, tag=f"SD-{terminals:02d}")
                b.assign(("AC",), d)
                acnet.path([(tx, ty, Z_DUCT)], flex,
                           end=b.port(d, (dx, dy, 2.94), "Supply air inlet", "DUCT", "AIRCONDITIONING"))
    acnet.build()
    refnet.build()

    # ---------------- power and lighting: board, trays, junction boxes, conduits ----------------
    unit("MDB-1", "IfcElectricDistributionBoard", "Main distribution board MDB-1", "DISTRIBUTIONBOARD",
         (2.85, 9.35, 0.0), [("Equipment grey", [b.box(-0.1, -0.35, 1.2, 0.1, 0.35, 2.0)])], ("ELP", "LTG"), storey)
    port("MDB-1.out", "MDB-1", (2.85, 9.35, 2.0), "Outgoing ways", "CABLECARRIER", "ELECTRICAL")
    port("MDB-1.in", "MDB-1", (2.85, 9.35, 1.2), "Incoming supply (utility meter)", "CABLE", "ELECTRICAL")
    trays = tray("Power and lighting", 0.20, ("ELP", "LTG"))
    riser = tray("Board riser", 0.20, ("ELP", "LTG"))
    power = conduit("Power", "Power conduit", "ELECTRICAL", ("ELP",), 0.012)
    light = conduit("Lighting", "Lighting conduit", "LIGHTING", ("LTG",), 0.01)
    el = Net(b, "EL")
    el.path([(2.85, 9.35, Z_TRAY)], riser, start=P["MDB-1.out"])
    el.path([(2.85, 9.35, Z_TRAY), (16.4, 9.35, Z_TRAY)], trays)
    el.path([(3.5, 9.35, Z_TRAY), (3.5, 5.5, Z_TRAY), (1.0, 5.5, Z_TRAY)], trays)
    el.path([(3.5, 5.5, Z_TRAY), (16.6, 5.5, Z_TRAY)], trays)
    el.path([(16.4, 9.35, Z_TRAY), (16.4, 7.8, Z_TRAY)], trays)
    el.path([(16.4, 9.35, Z_TRAY), (16.4, 10.4, Z_TRAY)], trays)

    def tap(x: float, y: float) -> Vec:
        return (x, y, Z_TRAY)

    # appliances, fans and AC units: one conduit each from a junction box on the tray
    for start, route, target in (
        (tap(8.6, 9.35), [(8.6, 11.0, Z_TRAY)], "RF-1.power"),
        (tap(8.6, 9.35), [(8.6, 8.2, Z_TRAY)], "FZ-1.power"),
        (tap(10.0, 9.35), [(10.0, 11.47, Z_TRAY)], "WH-1.power"),
        (tap(14.1, 9.35), [(14.1, 11.6, Z_TRAY)], "DW-1.power"),
        (tap(9.3, 9.35), [(9.3, 7.35, Z_TRAY)], "AC-3.power"),
        (tap(3.5, 7.2), [(5.95, 7.2, Z_TRAY)], "AC-1.power"),
        (tap(13.2, 5.5), [(13.2, 5.85, Z_TRAY)], "AC-2.power"),
        (tap(16.4, 8.05), [(17.82, 8.05, Z_TRAY)], "GR-1.power"),
        (tap(16.4, 9.6), [(17.82, 9.6, Z_TRAY)], "RG-1.power"),
        (tap(16.4, 10.1), [(17.82, 10.1, Z_TRAY)], "FR-1.power"),
        (tap(16.4, 10.4), [(16.4, 10.4, 3.85), (17.2, 10.4, 3.85)], "KEF-1.power"),
    ):
        el.path([start, *route], power, end=P[target])

    # socket outlets in walls: the conduit drops inside the wall to the first back box, then runs on
    outlet_t = b.type_object("IfcOutletType", "Twin switched socket outlet 13 A", [
        ("White enamel", [b.box(-0.07, 0.0, -0.045, 0.07, 0.02, 0.045)]),
    ], "POWEROUTLET")
    outlets = 0
    for start, route, plates, room in (
        (tap(16.6, 5.5), [(17.82, 5.5, Z_TRAY), (17.82, 3.6, Z_TRAY)], [(17.75, 3.6, 0.4, "w"), (17.75, 2.0, 0.4, "w")],
         dining),
        (tap(1.0, 5.5), [(0.18, 5.5, Z_TRAY), (0.18, 5.5, 2.5), (0.18, 3.0, 2.5)], [(EXT_T, 3.0, 0.4, "e")], dining),
        (tap(16.4, 7.8), [(16.0, 7.8, Z_TRAY), (16.0, 6.505, Z_TRAY)],
         [(16.0, 6.575, 1.2, "n"), (14.6, 6.575, 1.2, "n")], kitchen),
    ):
        previous = None
        for i, (x, y, z, face) in enumerate(plates):
            outlets += 1
            fx, fy = FACING[face]
            ent = b.instance(outlet_t, "IfcOutlet", f"Socket outlet SO-{outlets:02d}", "POWEROUTLET",
                             origin=(x, y, z), axes=facing_axes(face), container=room, tag=f"SO-{outlets:02d}")
            b.assign(("ELP",), ent)
            bx, by = x - fx * 0.07, y - fy * 0.07  # back box in the wall
            pin = b.port(ent, (bx, by, z + 0.03), "Supply", "CABLECARRIER", "ELECTRICAL")
            if previous is None:
                el.path([start, *route], power, end=pin)
            else:
                el.path([(bx, by, previous.pos[2])], power, start=previous, end=pin)
            if i < len(plates) - 1:
                previous = b.port(ent, (bx, by, z - 0.03), "Onward", "CABLECARRIER", "ELECTRICAL")

    # luminaires (types) looped by lighting conduits lying on the ceiling
    panel_t = b.type_object("IfcLightFixtureType", "LED panel 600x600 40 W", [
        ("LED diffuser", [b.box(-0.3, -0.3, -0.06, 0.3, 0.3, -0.05)]),
        ("Aluminium", [b.box(-0.3, -0.3, -0.05, 0.3, 0.3, 0.0)]),
    ], "POINTSOURCE")
    batten_t = b.type_object("IfcLightFixtureType", "LED batten 1200 IP65 36 W", [
        ("LED diffuser", [b.box(-0.6, -0.075, -0.06, 0.6, 0.075, -0.03)]),
        ("Aluminium", [b.box(-0.6, -0.075, -0.03, 0.6, 0.075, 0.0)]),
    ], "POINTSOURCE")
    down_t = b.type_object("IfcLightFixtureType", "LED downlight 200 18 W", [
        ("LED diffuser", [b.vcyl(0.0, 0.0, -0.06, -0.05, 0.1)]), ("Aluminium", [b.vcyl(0.0, 0.0, -0.05, 0.0, 0.1)]),
    ], "POINTSOURCE")
    lights = 0

    def chain(start: Vec, rows, lead=()) -> None:
        """Luminaires visited in order; the first is fed from a tray junction, each next one from the last."""
        flat = [(t, x, y, half, d, room) for t, pts, half, d, room in rows for x, y in pts]
        previous = None
        nonlocal lights
        for i, (type_ent, x, y, half, direction, room) in enumerate(flat):
            lights += 1
            ent = b.instance(type_ent, "IfcLightFixture", f"Luminaire L-{lights:02d}", "POINTSOURCE",
                             origin=(x, y, Z_LIGHT), container=room, tag=f"L-{lights:02d}")
            b.assign(("LTG",), ent)
            dx, dy = FACING[direction]
            pin = b.port(ent, (x - dx * half, y - dy * half, Z_LIGHT), "Supply", "CABLECARRIER", "LIGHTING")
            if previous is None:
                route = [start, *lead]
                down = (route[-1][0], route[-1][1], Z_LIGHT)
                route += [down, *l_route(down, pin.pos, Z_LIGHT, "y")]
                el.path(route, light, end=pin)
            else:
                el.path(l_route(previous.pos, pin.pos, Z_LIGHT, "x"), light, start=previous, end=pin)
            if i < len(flat) - 1:
                previous = b.port(ent, (x + dx * half, y + dy * half, Z_LIGHT), "Onward", "CABLECARRIER", "LIGHTING")

    cols = [1.5 + 2.4 * k for k in range(7)]
    chain(tap(1.0, 5.5), [(panel_t, [(x, 5.6) for x in cols], 0.2, "e", dining),
                          (panel_t, [(x, 3.4) for x in reversed(cols)], 0.2, "w", dining),
                          (panel_t, [(x, 1.2) for x in cols], 0.2, "e", dining)])
    chain(tap(3.5, 7.2), [(panel_t, [(2.7, 7.2), (5.1, 7.2), (7.5, 7.2)], 0.2, "e", dining)],
          lead=[(2.2, 7.2, Z_TRAY)])
    chain(tap(8.9, 9.35), [(batten_t, [(x, 9.6) for x in (9.6, 11.8, 14.0, 15.9)], 0.6, "e", kitchen),
                           (batten_t, [(x, 7.2) for x in (15.9, 14.0, 11.8, 9.6)], 0.6, "w", kitchen)])
    chain(tap(4.6, 9.35), [(batten_t, [(5.4, 9.9), (7.2, 9.9)], 0.6, "e", store)])
    chain(tap(3.25, 9.35), [(down_t, [(3.6, 9.0), (3.6, 10.8)], 0.1, "n", corridor),
                           (down_t, [(1.4, 9.4)], 0.1, "s", wc)])
    el.build()

    # ---------------- fire sprinklers: wet riser, mains, branches and pendent heads ----------------
    head_t = b.type_object("IfcFireSuppressionTerminalType", "Pendent sprinkler K80 68 C", [
        ("Brass", [b.vcyl(0.0, 0.0, -0.075, 0.0, 0.012), b.vcyl(0.0, 0.0, -0.085, -0.08, 0.028)]),
        ("White enamel", [b.vcyl(0.0, 0.0, -0.035, -0.03, 0.04)]),
    ], "SPRINKLER")
    spk_main = pipe("Sprinkler", "DN50", 0.030, "Sprinkler pipe", "FIREPROTECTION", ("SPK",))
    spk_branch = pipe("Sprinkler", "DN32", 0.021, "Sprinkler pipe", "FIREPROTECTION", ("SPK",))
    spk_drop = pipe("Sprinkler", "DN25", 0.017, "Sprinkler pipe", "FIREPROTECTION", ("SPK",))
    unit("BF-1", "IfcValve", "Backflow preventer BF-1 (fire service connection)", "DOUBLECHECK", (4.05, 12.35, 0.0),
         [("Brass", [b.box(-0.08, -0.2, 0.42, 0.08, 0.2, 0.58)])], ("SPK",), site)
    port("BF-1.in", "BF-1", (4.05, 12.55, 0.5), "Fire service supply", "PIPE", "FIREPROTECTION")
    port("BF-1.out", "BF-1", (4.05, 12.15, 0.5), "Outlet", "PIPE", "FIREPROTECTION")
    for key, cls, name, predefined, z0, z1, material in (
        ("SV-1", "IfcValve", "Sprinkler main stop valve SV-1 (OS&Y)", "ISOLATING", 0.9, 1.2, "Fire red"),
        ("AV-1", "IfcValve", "Alarm check valve AV-1", "CHECK", 1.35, 1.65, "Fire red"),
        ("FS-1", "IfcSensor", "Sprinkler flow switch FS-1", "FLOWSENSOR", 1.8, 1.9, "Brass"),
    ):
        unit(key, cls, name, predefined, (4.05, 11.35, 0.0), [(material, [b.vcyl(0.0, 0.0, z0, z1, 0.055)])],
             ("SPK", "FAL") if key == "FS-1" else ("SPK",), storey)
        port(f"{key}.in", key, (4.05, 11.35, z0), "Inlet", "PIPE", "FIREPROTECTION")
        port(f"{key}.out", key, (4.05, 11.35, z1), "Outlet", "PIPE", "FIREPROTECTION")
    spk = Net(b, "SPK")
    spk.path([(4.05, 11.35, 0.5)], spk_main, start=P["BF-1.out"], end=P["SV-1.in"])
    spk.path([], spk_main, start=P["SV-1.out"], end=P["AV-1.in"])
    spk.path([], spk_main, start=P["AV-1.out"], end=P["FS-1.in"])
    spk.path([(4.05, 11.35, Z_SPRINKLER), (4.05, 11.0, Z_SPRINKLER), (15.2, 11.0, Z_SPRINKLER),
              (15.2, 8.1, Z_SPRINKLER)], spk_main, start=P["FS-1.out"])
    spk.path([(4.05, 11.0, Z_SPRINKLER), (3.1, 11.0, Z_SPRINKLER), (3.1, 2.3, Z_SPRINKLER)], spk_main)
    for x in (10.7, 13.0):
        spk.path([(x, 11.0, Z_SPRINKLER), (x, 8.1, Z_SPRINKLER)], spk_branch)
    head_x = (1.5, 5.1, 8.7, 12.3, 15.9)
    for y in (2.3, 4.5):
        spk.path([(3.1, y, Z_SPRINKLER), (head_x[0], y, Z_SPRINKLER)], spk_branch)
        spk.path([(3.1, y, Z_SPRINKLER), (head_x[-1], y, Z_SPRINKLER)], spk_branch)
    spk.path([(3.1, 7.75, Z_SPRINKLER), (1.5, 7.75, Z_SPRINKLER)], spk_branch)
    spk.path([(3.1, 7.75, Z_SPRINKLER), (6.3, 7.75, Z_SPRINKLER)], spk_branch)
    spk.path([(3.1, 10.5, Z_SPRINKLER), (1.6, 10.5, Z_SPRINKLER)], spk_branch)
    heads = ([(x, y, dining) for y in (2.3, 4.5) for x in head_x]
             + [(x, 7.75, dining) for x in (1.5, 3.9, 6.3)]
             + [(3.1, 9.6, corridor), (1.6, 10.5, wc), (5.4, 11.0, store), (7.2, 11.0, store)]
             + [(x, y, kitchen) for x in (10.7, 13.0, 15.2) for y in (10.4, 8.1)])
    for k, (x, y, room) in enumerate(heads, start=1):
        head = b.instance(head_t, "IfcFireSuppressionTerminal", f"Sprinkler head SP-{k:02d}", "SPRINKLER",
                          origin=(x, y, Z_HEAD), container=room, tag=f"SP-{k:02d}")
        b.assign(("SPK",), head)
        spk.path([(x, y, Z_SPRINKLER)], spk_drop,
                 end=b.port(head, (x, y, Z_HEAD), "Inlet", "PIPE", "FIREPROTECTION"))
    spk.build()

    # ---------------- fire alarm: panel, two loops of detectors, call points and sounders ----------------
    fa = conduit("Fire alarm", "Fire alarm conduit", "FIREPROTECTION", ("FAL",), 0.008)
    unit("FACP-1", "IfcUnitaryControlElement", "Fire alarm control panel FACP-1", "ALARMPANEL", (2.8, 10.2, 0.0),
         [("Fire red", [b.box(-0.05, -0.2, 1.4, 0.05, 0.2, 1.9)])], ("FAL",), storey)
    port("FACP-1.loop1", "FACP-1", (2.8, 10.3, 1.9), "Loop 1 (back of house)", "CABLECARRIER", "FIREPROTECTION")
    port("FACP-1.loop2", "FACP-1", (2.8, 10.1, 1.9), "Loop 2 (dining hall)", "CABLECARRIER", "FIREPROTECTION")
    smoke_t = b.type_object("IfcSensorType", "Optical smoke detector", [
        ("White enamel", [b.vcyl(0.0, 0.0, -0.09, -0.04, 0.05), b.vcyl(0.0, 0.0, -0.04, 0.0, 0.03)]),
    ], "SMOKESENSOR")
    heat_t = b.type_object("IfcSensorType", "Rate-of-rise heat detector", [
        ("White enamel", [b.vcyl(0.0, 0.0, -0.09, -0.04, 0.05), b.vcyl(0.0, 0.0, -0.04, 0.0, 0.03)]),
    ], "HEATSENSOR")
    fanet = Net(b, "FA")
    devices = 0

    def loop(start: Port, sequence) -> None:
        nonlocal devices
        previous = start
        for i, (kind, x, y, room, z, face, first, *via) in enumerate(sequence):
            devices += 1
            tag = f"FA-{devices:02d}"
            if kind in ("smoke", "heat"):
                ent = b.instance(smoke_t if kind == "smoke" else heat_t, "IfcSensor",
                                 f"{'Smoke' if kind == 'smoke' else 'Heat'} detector {tag}",
                                 "SMOKESENSOR" if kind == "smoke" else "HEATSENSOR", origin=(x, y, z),
                                 container=room, tag=tag)
                top, (ax, ay) = z, (1.0, 0.0)
            else:
                fx, fy = FACING[face]
                xa, xb = (min(0.0, fx * 0.045), max(0.0, fx * 0.045)) if fx else (-0.045, 0.045)
                ya, yb = (min(0.0, fy * 0.045), max(0.0, fy * 0.045)) if fy else (-0.045, 0.045)
                label, predefined = ("Manual call point", "BREAKGLASSBUTTON") if kind == "mcp" else (
                    "Fire alarm sounder", "SIREN")
                ent = b.element("IfcAlarm", f"{label} {tag}", predefined, origin=(x, y, z), container=room, tag=tag,
                                parts=[("Fire red", [b.box(xa, ya, -0.06, xb, yb, 0.06)])])
                top, (ax, ay) = z + 0.06, (abs(fy), abs(fx))  # ports along the wall
            b.assign(("FAL",), ent)
            # the loop enters on the side facing the previous device and leaves on the other
            near, far = (x - ax * 0.03, y - ay * 0.03, top), (x + ax * 0.03, y + ay * 0.03, top)
            if math.dist(previous.pos[:2], far[:2]) < math.dist(previous.pos[:2], near[:2]):
                near, far = far, near
            pin = b.port(ent, near, "Loop in", "CABLECARRIER", "FIREPROTECTION")
            fanet.path(orth_route(previous.pos, pin.pos, Z_ALARM, via, first), fa, start=previous, end=pin)
            if i < len(sequence) - 1:
                previous = b.port(ent, far, "Loop out", "CABLECARRIER", "FIREPROTECTION")

    loop(P["FACP-1.loop1"], [
        ("smoke", 3.9, 9.9, corridor, Z_ALARM, None, "x"),
        ("mcp", 4.25, 11.2, corridor, 1.4, "w", "x"),
        ("smoke", 6.3, 8.9, store, Z_ALARM, None, "x"),
        ("heat", 10.7, 9.0, kitchen, Z_ALARM, None, "x"),
        ("sounder", 12.0, 6.575, kitchen, 2.3, "n", "y"),
        ("heat", 14.6, 9.0, kitchen, Z_ALARM, None, "x"),
        ("mcp", 15.5, 11.75, kitchen, 1.4, "s", "x"),
    ])
    loop(P["FACP-1.loop2"], [
        ("smoke", 4.0, 6.75, dining, Z_ALARM, None, "x", (2.67, 10.1), (2.67, 6.75)),
        ("mcp", EXT_T, 4.85, dining, 1.4, "e", "y"),
        ("smoke", 3.3, 1.75, dining, Z_ALARM, None, "y"),
        ("mcp", 6.512, 0.23, dining, 1.4, "n", "x"),
        ("smoke", 8.1, 1.75, dining, Z_ALARM, None, "x"),
        ("smoke", 12.9, 1.75, dining, Z_ALARM, None, "x"),
        ("smoke", 16.5, 1.75, dining, Z_ALARM, None, "x"),
        ("sounder", FOOT_X - EXT_T, 4.0, dining, 2.3, "w", "x"),
    ])
    fanet.build()

    exit_t = b.type_object("IfcLightFixtureType", "Maintained exit sign with battery", [
        ("Exit green", [b.box(-0.18, 0.0, -0.1, 0.18, 0.03, 0.1)]),
    ], "SECURITYLIGHTING")
    for k, (x, y, face, room) in enumerate(((9.0, 0.32, "n", dining), (EXT_T, 4.0, "e", dining),
                                            (16.3, FOOT_Y - EXT_T, "s", kitchen),
                                            (3.3, FOOT_Y - EXT_T, "s", corridor)), start=1):
        sign = b.instance(exit_t, "IfcLightFixture", f"Exit sign EX-{k:02d}", "SECURITYLIGHTING",
                          origin=(x, y, 2.45), axes=facing_axes(face), container=room, tag=f"EX-{k:02d}")
        b.assign(("FAL",), sign)
    extinguisher_t = b.type_object("IfcFireSuppressionTerminalType", "Portable fire extinguisher", [
        ("Fire red", [b.vcyl(0.0, 0.0, 0.0, 0.5, 0.08)]), ("Black steel", [b.vcyl(0.0, 0.0, 0.5, 0.58, 0.03)]),
    ], "USERDEFINED", ElementType="FIREEXTINGUISHER")
    for k, (name, x, y, room) in enumerate((
        ("CO2 extinguisher 5 kg (board)", 2.85, 8.5, corridor),
        ("Dry powder extinguisher 6 kg (dining)", 0.35, 3.3, dining),
        ("Dry powder extinguisher 6 kg (counter)", 10.6, 5.9, dining),
        ("Wet chemical extinguisher 6 L (cooking line)", 17.2, 11.6, kitchen),
    ), start=1):
        ext = b.instance(extinguisher_t, "IfcFireSuppressionTerminal", name, "USERDEFINED",
                         object_type="FIREEXTINGUISHER", origin=(x, y, 0.6), container=room, tag=f"FE-{k:02d}")
        b.assign(("FAL",), ext)


# ---------------------------------------------------------------------------------------


def build(exit_width: float, units: str, fire_exit_flags: bool = True, cladding_height: float = 2.0,
          disconnect_sink_drain: bool = False) -> ifcopenshell.file:
    b = Builder(1000.0 if units == "mm" else 1.0)
    walls, openings, spaces = layout(exit_width)
    build_walls_and_openings(b, walls, openings, fire_exit_flags)
    build_shopfront(b, fire_exit_flags)
    build_envelope(b)
    sp = build_spaces(b, spaces)
    furnish(b, sp)
    build_services(b, sp, disconnect_sink_drain)
    clad_kitchen(b, sp["SP-KITCHEN"], cladding_height)  # last, so the tile height only changes the tiles
    b.flush()
    finalise(b.f, b.removals)
    return b.f


def finalise(f: ifcopenshell.file, removals) -> None:
    """Deterministic GUIDs and header, so regenerated files only differ where the design differs."""
    for index, entity in enumerate(f.by_type("IfcRoot")):
        entity.GlobalId = ifcopenshell.guid.compress(uuid.uuid5(GUID_NAMESPACE, f"{entity.is_a()}:{index}").hex)
    for rel in removals:  # after the GUIDs, so every other GUID matches the connected variant
        f.remove(rel)
    header = f.header
    header.file_name.time_stamp = TIMESTAMP
    header.file_name.author = ("",)
    header.file_name.organization = ("",)
    header.file_name.preprocessor_version = "IfcOpenShell " + ifcopenshell.version
    header.file_name.originating_system = "Mowaem restaurant generator (scripts/ifc/build_restaurant_ifc.py)"
    header.file_description.description = ("ViewDefinition [DesignTransferView]", "Test plan, not an executed project")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--exit-door-width", type=float, required=True, help="clear width of door D-02 in metres")
    ap.add_argument("--units", choices=("m", "mm"), default="m")
    ap.add_argument("--no-fire-exit-flags", action="store_true", help="omit Pset_DoorCommon.FireExit (test case)")
    ap.add_argument("--kitchen-cladding-height", type=float, default=2.0,
                    help="height of the kitchen wall tiles in metres (requirements 4.5.2: at least 1.80 m)")
    ap.add_argument("--disconnect-sink-drain", action="store_true",
                    help="leave the three-compartment sink's drain port unconnected (test case for clause 4.1.3)")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    model = build(
        args.exit_door_width,
        args.units,
        fire_exit_flags=not args.no_fire_exit_flags,
        cladding_height=args.kitchen_cladding_height,
        disconnect_sink_drain=args.disconnect_sink_drain,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    model.header.file_name.name = args.out.name
    model.write(str(args.out))
    print(f"wrote {args.out} ({args.out.stat().st_size} bytes, {len(list(model))} entities)")


if __name__ == "__main__":
    main()
