"""Build a single-storey restaurant as a real IFC4 model with IfcOpenShell.

The model is a test plan, not an executed project. Every element carries real geometry:
walls with voided openings, parametric doors and windows, spaces with closed footprints and
quantities, slabs, furniture and sanitary fixtures. Nothing here uses Mowaem-specific
property sets: rules must read the same standard data any BIM export would contain.

Usage (PowerShell or bash):
    python scripts/ifc/build_restaurant_ifc.py --exit-door-width 0.95 --out public/samples/restaurant/restaurant-exit-0.95m.ifc
    python scripts/ifc/build_restaurant_ifc.py --exit-door-width 0.75 --units mm --out test-fixtures/ifc/standard/restaurant-exit-0.75m-mm.ifc

Plan axes: x = east, y = north, z = up, metres. The building footprint is 16 m x 11 m.
GUIDs are derived from a fixed namespace and the entity order, and the header timestamp is
fixed, so two runs with the same arguments write identical files and two runs that differ
only in the exit door width differ only in that door's data and geometry.
"""

from __future__ import annotations

import argparse
import math
import uuid
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.context
import ifcopenshell.api.feature
import ifcopenshell.api.geometry
import ifcopenshell.api.material
import ifcopenshell.api.project
import ifcopenshell.api.pset
import ifcopenshell.api.root
import ifcopenshell.api.spatial
import ifcopenshell.api.style
import ifcopenshell.api.unit
import ifcopenshell.guid

GUID_NAMESPACE = uuid.UUID("6f6d6177-6165-6d2d-7265-737461757261")  # fixed: "omawaem-restaura"
TIMESTAMP = "2026-11-18T00:00:00"

WALL_HEIGHT = 3.2
EXT_T = 0.25  # exterior wall thickness
INT_T = 0.15  # interior partition thickness
FOOT_X, FOOT_Y = 16.0, 11.0


@dataclass(frozen=True)
class Wall:
    key: str
    name: str
    start: tuple[float, float]
    end: tuple[float, float]
    thickness: float
    external: bool


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
    polygon: tuple[tuple[float, float], ...]


def polygon_area(points: tuple[tuple[float, float], ...]) -> float:
    s = 0.0
    for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def rect(x0: float, y0: float, x1: float, y1: float) -> tuple[tuple[float, float], ...]:
    return ((x0, y0), (x1, y0), (x1, y1), (x0, y1))


def layout(exit_width: float):
    h = EXT_T / 2
    walls = [
        Wall("W-S", "External wall south", (0.0, h), (FOOT_X, h), EXT_T, True),
        Wall("W-N", "External wall north", (0.0, FOOT_Y - h), (FOOT_X, FOOT_Y - h), EXT_T, True),
        Wall("W-W", "External wall west", (h, EXT_T), (h, FOOT_Y - EXT_T), EXT_T, True),
        Wall("W-E", "External wall east", (FOOT_X - h, EXT_T), (FOOT_X - h, FOOT_Y - EXT_T), EXT_T, True),
        # interior partitions, trimmed to the inner faces they meet
        Wall("P-1", "Partition dining / back of house", (10.0, EXT_T), (10.0, FOOT_Y - EXT_T), INT_T, False),
        Wall("P-2", "Partition kitchen / service", (10.0 + INT_T / 2, 4.5), (FOOT_X - EXT_T, 4.5), INT_T, False),
        Wall("P-3", "Partition service / storage", (13.0, EXT_T), (13.0, 4.5 - INT_T / 2), INT_T, False),
        Wall("P-4", "Partition WC / corridor", (10.0 + INT_T / 2, 2.5), (13.0 - INT_T / 2, 2.5), INT_T, False),
    ]
    # Opening centres are measured along each wall from its start point.
    openings = [
        Opening("D-01", "door", "W-S", 5.0, 1.8, 2.4, name="Main entrance", reference="D-01",
                fire_exit=True, external=True, operation="DOUBLE_DOOR_SINGLE_SWING", material="Aluminium glazed"),
        Opening("D-02", "door", "W-W", 8.0 - EXT_T, exit_width, 2.2, name="Emergency exit", reference="D-02",
                fire_exit=True, external=True, operation="SINGLE_SWING_RIGHT", material="Steel"),
        Opening("D-03", "door", "P-1", 3.5 - EXT_T, 1.0, 2.1, name="Dining to service corridor", reference="D-03"),
        Opening("D-04", "door", "P-1", 1.3 - EXT_T, 0.9, 2.1, name="Dining to WC", reference="D-04"),
        Opening("D-05", "door", "P-2", 11.5 - (10.0 + INT_T / 2), 1.0, 2.1, name="Corridor to kitchen", reference="D-05",
                material="Stainless steel"),
        Opening("D-06", "door", "P-3", 3.5 - EXT_T, 0.9, 2.1, name="Corridor to storage", reference="D-06"),
        Opening("D-07", "door", "W-E", 8.0 - EXT_T, 1.0, 2.2, name="Kitchen service door", reference="D-07",
                external=True, material="Steel"),
        Opening("D-08", "door", "P-1", 7.5 - EXT_T, 1.0, 2.1, name="Dining to kitchen", reference="D-08",
                operation="DOUBLE_SWING_LEFT", material="Stainless steel"),
        Opening("WI-01", "window", "W-S", 2.0, 2.4, 1.8, sill=0.6, name="Shopfront window west", reference="WI-01"),
        Opening("WI-02", "window", "W-S", 8.0, 2.4, 1.8, sill=0.6, name="Shopfront window east", reference="WI-02"),
        Opening("WI-03", "window", "W-W", 3.5 - EXT_T, 2.0, 1.5, sill=0.9, name="Dining window west", reference="WI-03"),
        Opening("WI-04", "window", "W-N", 5.0, 3.0, 1.5, sill=0.9, name="Dining window north", reference="WI-04"),
        Opening("WI-05", "window", "W-N", 13.0, 1.5, 1.0, sill=1.2, name="Kitchen window", reference="WI-05"),
    ]
    i, j = EXT_T, INT_T / 2
    spaces = [
        Space("SP-DINING", "101", "Dining hall / صالة الطعام", rect(i, i, 10.0 - j, FOOT_Y - i)),
        Space("SP-KITCHEN", "102", "Kitchen / المطبخ", rect(10.0 + j, 4.5 + j, FOOT_X - i, FOOT_Y - i)),
        Space("SP-WC", "103", "WC / دورة المياه", rect(10.0 + j, i, 13.0 - j, 2.5 - j)),
        Space("SP-CORRIDOR", "104", "Service corridor / ممر الخدمة", rect(10.0 + j, 2.5 + j, 13.0 - j, 4.5 - j)),
        Space("SP-STORAGE", "105", "Storage / المخزن", rect(13.0 + j, i, FOOT_X - i, 4.5 - j)),
    ]
    return walls, openings, spaces


class Builder:
    def __init__(self, scale: float):
        self.s = scale  # project length units per metre
        self.f = ifcopenshell.api.project.create_file(version="IFC4")
        f = self.f
        self.project = ifcopenshell.api.root.create_entity(f, ifc_class="IfcProject", name="Mowaem test restaurant")
        length = ifcopenshell.api.unit.add_si_unit(f, unit_type="LENGTHUNIT", prefix="MILLI" if scale == 1000 else None)
        area = ifcopenshell.api.unit.add_si_unit(f, unit_type="AREAUNIT")
        volume = ifcopenshell.api.unit.add_si_unit(f, unit_type="VOLUMEUNIT")
        ifcopenshell.api.unit.assign_unit(f, units=[length, area, volume])
        model = ifcopenshell.api.context.add_context(f, context_type="Model")
        self.body = ifcopenshell.api.context.add_context(
            f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model
        )
        self.site = ifcopenshell.api.root.create_entity(f, ifc_class="IfcSite", name="Site")
        self.building = ifcopenshell.api.root.create_entity(f, ifc_class="IfcBuilding", name="Restaurant building")
        self.storey = ifcopenshell.api.root.create_entity(f, ifc_class="IfcBuildingStorey", name="Ground floor")
        self.storey.Elevation = 0.0
        ifcopenshell.api.aggregate.assign_object(f, products=[self.site], relating_object=self.project)
        ifcopenshell.api.aggregate.assign_object(f, products=[self.building], relating_object=self.site)
        ifcopenshell.api.aggregate.assign_object(f, products=[self.storey], relating_object=self.building)
        for product in (self.site, self.building, self.storey):
            self.place(product, np.eye(4))
        self.materials: dict[str, object] = {}
        self.styles: dict[str, object] = {}

    # ---- geometry helpers (inputs in metres, written in project units) ----
    def L(self, v: float) -> float:
        return float(v) * self.s

    def place(self, product, matrix: np.ndarray) -> None:
        m = matrix.copy()
        m[:3, 3] *= self.s
        ifcopenshell.api.geometry.edit_object_placement(self.f, product=product, matrix=m, is_si=False)

    @staticmethod
    def frame(origin: tuple[float, float, float], x_dir: tuple[float, float]) -> np.ndarray:
        dx, dy = x_dir
        m = np.eye(4)
        m[:3, 0] = (dx, dy, 0.0)
        m[:3, 1] = (-dy, dx, 0.0)
        m[:3, 2] = (0.0, 0.0, 1.0)
        m[:3, 3] = origin
        return m

    def axis2(self, x: float, y: float, z: float):
        return self.f.createIfcAxis2Placement3D(self.f.createIfcCartesianPoint((self.L(x), self.L(y), self.L(z))))

    def box_item(self, x0: float, y0: float, z0: float, x1: float, y1: float, z1: float):
        """An axis-aligned box in the product's local frame as an extruded rectangle."""
        f = self.f
        profile = f.createIfcRectangleProfileDef(
            "AREA", None,
            f.createIfcAxis2Placement2D(f.createIfcCartesianPoint((self.L((x0 + x1) / 2), self.L((y0 + y1) / 2)))),
            self.L(x1 - x0), self.L(y1 - y0),
        )
        return f.createIfcExtrudedAreaSolid(
            profile, self.axis2(0, 0, z0), f.createIfcDirection((0.0, 0.0, 1.0)), self.L(z1 - z0)
        )

    def prism_item(self, polygon, z0: float, z1: float):
        f = self.f
        pts = [f.createIfcCartesianPoint((self.L(x), self.L(y))) for x, y in polygon]
        curve = f.createIfcPolyline(pts + [pts[0]])
        profile = f.createIfcArbitraryClosedProfileDef("AREA", None, curve)
        return f.createIfcExtrudedAreaSolid(
            profile, self.axis2(0, 0, z0), f.createIfcDirection((0.0, 0.0, 1.0)), self.L(z1 - z0)
        )

    def body_rep(self, items, kind: str = "SweptSolid"):
        return self.f.createIfcShapeRepresentation(self.body, "Body", kind, items)

    def style(self, name: str, rgb: tuple[float, float, float], transparency: float = 0.0):
        if name not in self.styles:
            st = ifcopenshell.api.style.add_style(self.f, name=name)
            ifcopenshell.api.style.add_surface_style(
                self.f, style=st, ifc_class="IfcSurfaceStyleShading",
                attributes={"SurfaceColour": {"Name": None, "Red": rgb[0], "Green": rgb[1], "Blue": rgb[2]},
                            "Transparency": transparency},
            )
            self.styles[name] = st
        return self.styles[name]

    def material(self, name: str, category: str):
        if name not in self.materials:
            self.materials[name] = ifcopenshell.api.material.add_material(self.f, name=name, category=category)
        return self.materials[name]

    def finish(self, product, rep, material: str, category: str, rgb, transparency: float = 0.0):
        ifcopenshell.api.geometry.assign_representation(self.f, product=product, representation=rep)
        ifcopenshell.api.style.assign_representation_styles(
            self.f, shape_representation=rep, styles=[self.style(material, rgb, transparency)]
        )
        ifcopenshell.api.material.assign_material(self.f, products=[product], type="IfcMaterial",
                                                  material=self.material(material, category))

    def element(self, ifc_class: str, name: str, predefined: str | None = None):
        return ifcopenshell.api.root.create_entity(self.f, ifc_class=ifc_class, name=name, predefined_type=predefined)


MATERIAL_RGB = {
    "Plaster": ((0.93, 0.91, 0.87), "Finish"),
    "Concrete": ((0.72, 0.71, 0.68), "Concrete"),
    "Terrazzo": ((0.84, 0.82, 0.78), "Finish"),
    "Oak": ((0.66, 0.5, 0.33), "Wood"),
    "Steel": ((0.27, 0.36, 0.33), "Steel"),
    "Stainless steel": ((0.78, 0.8, 0.82), "Steel"),
    "Aluminium glazed": ((0.62, 0.66, 0.68), "Aluminium"),
    "Glass": ((0.7, 0.84, 0.9), "Glass"),
    "Upholstery": ((0.16, 0.36, 0.3), "Textile"),
    "Ceramic": ((0.97, 0.97, 0.96), "Ceramic"),
}


def finish(b: Builder, product, rep, material: str, transparency: float = 0.0) -> None:
    rgb, category = MATERIAL_RGB[material]
    b.finish(product, rep, material, category, rgb, transparency)


def build(exit_width: float, units: str, fire_exit_flags: bool = True) -> ifcopenshell.file:
    b = Builder(1000.0 if units == "mm" else 1.0)
    f = b.f
    walls, openings, spaces = layout(exit_width)
    wall_by_key: dict[str, tuple[Wall, object, tuple[float, float]]] = {}
    contained = []

    for w in walls:
        (x0, y0), (x1, y1) = w.start, w.end
        length = math.hypot(x1 - x0, y1 - y0)
        d = ((x1 - x0) / length, (y1 - y0) / length)
        ent = b.element("IfcWall", w.name, "SOLIDWALL")
        b.place(ent, Builder.frame((x0, y0, 0.0), d))
        item = b.box_item(0, -w.thickness / 2, 0, length, w.thickness / 2, WALL_HEIGHT)
        finish(b, ent, b.body_rep([item]), "Plaster")
        ifcopenshell.api.pset.edit_pset(
            f, pset=ifcopenshell.api.pset.add_pset(f, product=ent, name="Pset_WallCommon"),
            properties={"Reference": w.key, "IsExternal": w.external, "LoadBearing": w.external},
        )
        wall_by_key[w.key] = (w, ent, d)
        contained.append(ent)

    for o in openings:
        w, wall_ent, d = wall_by_key[o.wall]
        x0, y0 = w.start
        n = (-d[1], d[0])
        along = o.center - o.width / 2
        # origin at the opening's start on the wall's "-n" face
        ox = x0 + d[0] * along - n[0] * w.thickness / 2
        oy = y0 + d[1] * along - n[1] * w.thickness / 2
        frame = Builder.frame((ox, oy, o.sill), d)

        opening = b.element("IfcOpeningElement", f"Opening for {o.reference}", "OPENING")
        b.place(opening, frame)
        cut = b.box_item(0, -0.05, 0, o.width, w.thickness + 0.05, o.height)
        ifcopenshell.api.geometry.assign_representation(f, product=opening, representation=b.body_rep([cut]))
        ifcopenshell.api.feature.add_feature(f, feature=opening, element=wall_ent)

        if o.kind == "door":
            filling = b.element("IfcDoor", o.name, "DOOR")
            filling.OverallWidth = b.L(o.width)
            filling.OverallHeight = b.L(o.height)
            filling.OperationType = o.operation
            rep = ifcopenshell.api.geometry.add_door_representation(
                f, context=b.body, overall_height=b.L(o.height), overall_width=b.L(o.width),
                operation_type=o.operation,
                lining_properties={"LiningDepth": b.L(w.thickness), "LiningThickness": b.L(0.05)},
                unit_scale=1.0 / b.s,
            )
            finish(b, filling, rep, o.material)
            pset = ifcopenshell.api.pset.add_pset(f, product=filling, name="Pset_DoorCommon")
            props = {"Reference": o.reference, "IsExternal": o.external}
            if fire_exit_flags:
                props["FireExit"] = o.fire_exit
            ifcopenshell.api.pset.edit_pset(f, pset=pset, properties=props)
        else:
            filling = b.element("IfcWindow", o.name, "WINDOW")
            filling.OverallWidth = b.L(o.width)
            filling.OverallHeight = b.L(o.height)
            filling.PartitioningType = "SINGLE_PANEL"
            rep = ifcopenshell.api.geometry.add_window_representation(
                f, context=b.body, overall_height=b.L(o.height), overall_width=b.L(o.width),
                partition_type="SINGLE_PANEL",
                lining_properties={"LiningDepth": b.L(w.thickness), "LiningThickness": b.L(0.06)},
                unit_scale=1.0 / b.s,
            )
            finish(b, filling, rep, "Glass", transparency=0.55)
            ifcopenshell.api.pset.edit_pset(
                f, pset=ifcopenshell.api.pset.add_pset(f, product=filling, name="Pset_WindowCommon"),
                properties={"Reference": o.reference, "IsExternal": True},
            )
        b.place(filling, frame)
        ifcopenshell.api.feature.add_filling(f, opening=opening, element=filling)
        contained.append(filling)

    floor = b.element("IfcSlab", "Ground floor slab", "FLOOR")
    b.place(floor, np.eye(4))
    finish(b, floor, b.body_rep([b.box_item(0, 0, -0.2, FOOT_X, FOOT_Y, 0.0)]), "Terrazzo")
    roof = b.element("IfcSlab", "Roof slab", "ROOF")
    b.place(roof, np.eye(4))
    finish(b, roof, b.body_rep([b.box_item(0, 0, WALL_HEIGHT, FOOT_X, FOOT_Y, WALL_HEIGHT + 0.2)]), "Concrete")
    contained += [floor, roof]
    ifcopenshell.api.spatial.assign_container(f, products=contained, relating_structure=b.storey)

    space_ents = {}
    for sp in spaces:
        ent = b.element("IfcSpace", sp.number, "INTERNAL")
        ent.LongName = sp.long_name
        b.place(ent, np.eye(4))
        rep = b.body_rep([b.prism_item(sp.polygon, 0.0, 3.0)])
        ifcopenshell.api.geometry.assign_representation(f, product=ent, representation=rep)
        ifcopenshell.api.style.assign_representation_styles(
            f, shape_representation=rep, styles=[b.style("Space", (0.55, 0.75, 0.95), 0.85)]
        )
        area = round(polygon_area(sp.polygon), 3)
        qto = ifcopenshell.api.pset.add_qto(f, product=ent, name="Qto_SpaceBaseQuantities")
        ifcopenshell.api.pset.edit_qto(f, qto=qto, properties={
            "NetFloorArea": area, "GrossFloorArea": area, "Height": b.L(3.0),
        })
        ifcopenshell.api.pset.edit_pset(
            f, pset=ifcopenshell.api.pset.add_pset(f, product=ent, name="Pset_SpaceCommon"),
            properties={"Reference": sp.number, "IsExternal": False},
        )
        space_ents[sp.key] = ent
    ifcopenshell.api.aggregate.assign_object(f, products=list(space_ents.values()), relating_object=b.storey)

    furnish(b, space_ents)
    finalise(f)
    return f


def furnish(b: Builder, spaces) -> None:
    """Furniture and fixtures with simple but real geometry, contained in their spaces."""
    f = b.f
    per_space: dict[str, list] = {k: [] for k in spaces}

    def add(space_key: str, ifc_class: str, name: str, predefined: str | None, items, material: str, origin):
        ent = b.element(ifc_class, name, predefined)
        b.place(ent, Builder.frame((origin[0], origin[1], 0.0), (1.0, 0.0)))
        finish(b, ent, b.body_rep(items), material)
        per_space[space_key].append(ent)
        return ent

    # Dining: eight tables for four, with chairs, keeping a clear aisle from the entrance.
    tables = [(2.2, 3.6), (7.8, 3.6), (2.2, 6.2), (5.0, 6.2), (7.8, 6.2), (2.2, 8.8), (5.0, 8.8), (7.8, 8.8)]
    for n, (tx, ty) in enumerate(tables, start=1):
        top = b.box_item(-0.4, -0.4, 0.72, 0.4, 0.4, 0.75)
        stem = b.box_item(-0.05, -0.05, 0.0, 0.05, 0.05, 0.72)
        foot = b.box_item(-0.25, -0.25, 0.0, 0.25, 0.25, 0.03)
        add("SP-DINING", "IfcFurniture", f"Table T-{n:02d}", "TABLE", [top, stem, foot], "Oak", (tx, ty))
        for cx, cy, back in ((0, -0.62, "s"), (0, 0.62, "n"), (-0.62, 0, "w"), (0.62, 0, "e")):
            seat = b.box_item(-0.22, -0.22, 0.42, 0.22, 0.22, 0.47)
            legs = [b.box_item(sx - 0.02, sy - 0.02, 0.0, sx + 0.02, sy + 0.02, 0.42)
                    for sx in (-0.19, 0.19) for sy in (-0.19, 0.19)]
            if back == "s":
                rest = b.box_item(-0.22, -0.24, 0.47, 0.22, -0.2, 0.9)
            elif back == "n":
                rest = b.box_item(-0.22, 0.2, 0.47, 0.22, 0.24, 0.9)
            elif back == "w":
                rest = b.box_item(-0.24, -0.22, 0.47, -0.2, 0.22, 0.9)
            else:
                rest = b.box_item(0.2, -0.22, 0.47, 0.24, 0.22, 0.9)
            add("SP-DINING", "IfcFurniture", f"Chair T-{n:02d}{back.upper()}", "CHAIR",
                [seat, rest, *legs], "Upholstery", (tx + cx, ty + cy))
    add("SP-DINING", "IfcFurniture", "Cashier counter", "USERDEFINED",
        [b.box_item(0.0, 0.0, 0.0, 2.0, 0.6, 1.05)], "Oak", (7.4, 1.2))

    # Kitchen: wall counters, cooker with hood, prep island and sink.
    add("SP-KITCHEN", "IfcFurniture", "Kitchen counter west", "USERDEFINED",
        [b.box_item(0.0, 0.0, 0.0, 1.9, 0.7, 0.9)], "Stainless steel", (10.4, 10.05))
    add("SP-KITCHEN", "IfcFurniture", "Kitchen counter east", "USERDEFINED",
        [b.box_item(0.0, 0.0, 0.0, 1.7, 0.7, 0.9)], "Stainless steel", (13.7, 10.05))
    add("SP-KITCHEN", "IfcElectricAppliance", "Cooking range", "ELECTRICCOOKER",
        [b.box_item(0.0, 0.0, 0.0, 1.4, 0.7, 0.9)], "Steel", (12.3, 10.05))
    add("SP-KITCHEN", "IfcBuildingElementProxy", "Kitchen exhaust hood", "USERDEFINED",
        [b.box_item(0.0, 0.0, 2.0, 1.6, 0.9, 2.5)], "Stainless steel", (12.2, 9.85))
    add("SP-KITCHEN", "IfcFurniture", "Prep island", "USERDEFINED",
        [b.box_item(0.0, 0.0, 0.0, 2.2, 0.8, 0.9)], "Stainless steel", (11.8, 6.6))
    add("SP-KITCHEN", "IfcSanitaryTerminal", "Kitchen sink", "SINK",
        [b.box_item(0.0, 0.0, 0.0, 0.7, 1.2, 0.9)], "Stainless steel", (15.05, 5.2))

    # WC: wash basin and toilet.
    add("SP-WC", "IfcSanitaryTerminal", "Wash hand basin", "WASHHANDBASIN",
        [b.box_item(0.0, 0.0, 0.7, 0.6, 0.45, 0.85)], "Ceramic", (10.5, 0.25))
    add("SP-WC", "IfcSanitaryTerminal", "Toilet", "TOILETPAN",
        [b.box_item(0.0, 0.0, 0.0, 0.55, 0.7, 0.42), b.box_item(0.0, 0.55, 0.42, 0.55, 0.7, 0.8)],
        "Ceramic", (12.3, 1.0))

    # Storage: shelving along two walls.
    add("SP-STORAGE", "IfcFurniture", "Shelving east", "SHELF",
        [b.box_item(0.0, 0.0, 0.0, 0.5, 3.5, 2.0)], "Steel", (15.25, 0.5))
    add("SP-STORAGE", "IfcFurniture", "Shelving south", "SHELF",
        [b.box_item(0.0, 0.0, 0.0, 1.6, 0.5, 2.0)], "Steel", (13.4, 0.25))

    for key, items in per_space.items():
        if items:
            ifcopenshell.api.spatial.assign_container(f, products=items, relating_structure=spaces[key])


def finalise(f: ifcopenshell.file) -> None:
    """Deterministic GUIDs and header, so regenerated files only differ where the design differs."""
    for index, entity in enumerate(f.by_type("IfcRoot")):
        entity.GlobalId = ifcopenshell.guid.compress(uuid.uuid5(GUID_NAMESPACE, f"{entity.is_a()}:{index}").hex)
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
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    model = build(args.exit_door_width, args.units, fire_exit_flags=not args.no_fire_exit_flags)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    model.header.file_name.name = args.out.name
    model.write(str(args.out))
    print(f"wrote {args.out} ({args.out.stat().st_size} bytes, {len(list(model))} entities)")


if __name__ == "__main__":
    main()
