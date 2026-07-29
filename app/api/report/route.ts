import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { cdsConfig, deliveryConfig, queryAll } from "../../../lib/arcgis";

const fields = ["objectid","full_name","mother_name","birth_date","gender","spouse_name","nationality","phone_primary","phone_spouse","id_type","id_number","origin_municipality","origin_home_damage","displacement_status","current_municipality","household_size"];

function esc(value: string) { return value.replace(/'/g, "''"); }
function normalizePhone(value: unknown) {
  let s = String(value ?? "").replace(/\D/g, "");
  if (!s) return "";
  if (s.startsWith("00961")) s = s.slice(5);
  else if (s.startsWith("961")) s = s.slice(3);
  if (s.startsWith("0")) s = s.slice(1);
  return s;
}
function normalizeId(value: unknown) {
  const cleaned = String(value ?? "").trim().replace(/[\s-]/g, "").toUpperCase();
  if (!cleaned) return "";
  return cleaned.replace(/^0+/, "") || "0";
}
function exportPhone(value: unknown) {
  return String(value ?? "").trim().replace(/^\+/, "");
}
function dateClause(field: string, start?: string, end?: string) {
  const parts: string[] = [];
  if (start) parts.push(`${field} >= DATE '${esc(start)} 00:00:00'`);
  if (end) parts.push(`${field} <= DATE '${esc(end)} 23:59:59'`);
  return parts;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const municipality = String(body.municipality || "");
    const statuses: string[] = Array.isArray(body.statuses) ? body.statuses : [];
    const itemTypes: string[] = Array.isArray(body.itemTypes) ? body.itemTypes : [];
    const nationalities: string[] = Array.isArray(body.nationalities) ? body.nationalities.map(String) : [];
    if (!municipality || !nationalities.length || !statuses.length || !itemTypes.length) {
      return NextResponse.json({ error: "Municipality, at least one nationality, at least one status, and at least one item type are required." }, { status: 400 });
    }

    const municipalityFilters = [`current_municipality = '${esc(municipality)}'`];
    const sameOriginAndCurrent = !statuses.includes("currently_displaced");
    if (sameOriginAndCurrent) {
      municipalityFilters.push(`origin_municipality = '${esc(municipality)}'`);
    }

    const cdsWhere = [
      ...municipalityFilters,
      `nationality IN (${nationalities.map(value => `'${esc(value)}'`).join(",")})`,
      `displacement_status IN (${statuses.map(s => `'${esc(s)}'`).join(",")})`
    ].join(" AND ");

    const cds = await queryAll(cdsConfig(), { where: cdsWhere, outFields: fields.join(",") });
    const results: Record<string, Record<string, unknown>[]> = {};

    for (const itemType of itemTypes) {
      const deliveryWhere = [
        `type_items = '${esc(itemType)}'`,
        ...dateClause("delivered_date", "2026-06-15")
      ].join(" AND ");
      const deliveries = await queryAll(deliveryConfig(), { where: deliveryWhere, outFields: "lookup_phone_nbr,lookup_id_number,type_items,delivered_date" });
      const phones = new Set(deliveries.map(f => normalizePhone(f.attributes.lookup_phone_nbr)).filter(Boolean));
      const ids = new Set(deliveries.map(f => normalizeId(f.attributes.lookup_id_number)).filter(Boolean));

      results[itemType] = cds
        .map((f): Record<string, unknown> => ({
          ...f.attributes,
          phone_primary: exportPhone(f.attributes.phone_primary),
          phone_spouse: exportPhone(f.attributes.phone_spouse),
          id_number: f.attributes.id_number
        }))
        .filter((person: Record<string, unknown>) => {
          const p1 = normalizePhone(person.phone_primary);
          const p2 = normalizePhone(person.phone_spouse);
          const id = normalizeId(person.id_number);
          return !((p1 && phones.has(p1)) || (p2 && phones.has(p2)) || (id && ids.has(id)));
        });
    }

    if (body.format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      for (const [itemType, rows] of Object.entries(results)) {
        const sheet = workbook.addWorksheet(itemType.slice(0, 31).replace(/[\\/*?:\[\]]/g, "-"));
        sheet.columns = fields.map(field => ({ header: field, key: field, width: Math.max(14, field.length + 2) }));
        rows.forEach(row => sheet.addRow(row));
        for (const field of ["phone_primary", "phone_spouse", "id_number"]) {
          const column = sheet.getColumn(field);
          column.numFmt = "@";
        }
        sheet.getRow(1).font = { bold: true };
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + fields.length)}1` };
      }
      const buffer = await workbook.xlsx.writeBuffer();
      return new NextResponse(buffer, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="not-received-${municipality}.xlsx"` } });
    }

    return NextResponse.json({ municipality, totalPeople: cds.length, sameOriginAndCurrent, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Report failed." }, { status: 500 });
  }
}
