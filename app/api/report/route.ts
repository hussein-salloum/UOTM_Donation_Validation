import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { cdsConfig, deliveryConfig, queryAll } from "../../../lib/arcgis";

const fields = ["objectid","full_name","mother_name","birth_date","gender","spouse_name","nationality","phone_primary","phone_spouse","id_type","id_number","origin_municipality","origin_home_damage","displacement_status","current_municipality","household_size"];
const itemCodes: Record<string, string> = { "Food parcel": "FP", "hygiene equipment": "HK" };

function esc(value: string) { return value.replace(/'/g, "''"); }
function normalizePhone(value: unknown) {
  let s = String(value ?? "").replace(/\D/g, "");
  if (!s) return "";
  if (s.startsWith("00961")) s = s.slice(5);
  else if (s.startsWith("961")) s = s.slice(3);
  s = s.replace(/^0+/, "");
  return s;
}
function normalizeId(value: unknown) {
  const cleaned = String(value ?? "").trim().replace(/[\s-]/g, "").toUpperCase();
  if (!cleaned) return "";
  return cleaned.replace(/^0+/, "") || "0";
}
function exportPhone(value: unknown) { return String(value ?? "").trim().replace(/^\+/, ""); }
function dateClause(field: string, start?: string) {
  return start ? [`${field} >= DATE '${esc(start)} 00:00:00'`] : [];
}
function safeFilePart(value: string) { return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, " ").trim(); }
function reportDateLabel(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Beirut"
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${get("day")}${get("month")}${get("year")}`;
}
function exportName(municipalities: string[], itemTypes: string[], suffix = "") {
  const municipalityPart = municipalities.length === 1
    ? municipalities[0]
    : municipalities.length <= 3
      ? municipalities.join(" - ")
      : municipalities.length > 70
        ? "All Municipalities"
        : `${municipalities.length} Municipalities`;
  const itemPart = itemTypes.map(type => itemCodes[type] || type).join("-");
  return safeFilePart(`${municipalityPart} - ${itemPart}${suffix} - ${reportDateLabel()}`) + ".xlsx";
}
function addMetadata(sheet: ExcelJS.Worksheet, municipalities: string[], status: string, nationalities: string[], itemTypes: string[], startDate: string) {
  sheet.mergeCells("A1:F1");
  sheet.getCell("A1").value = "DONATION GAP REPORT";
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 27;
  const meta = [
    ["Municipalities", municipalities.length > 8 ? `${municipalities.length} selected` : municipalities.join(", ")],
    ["Displacement status", status],
    ["Nationality", nationalities.join(", ")],
    ["Donation items", itemTypes.join(", ")],
    ["Delivery records from", startDate]
  ];
  meta.forEach((row, index) => {
    const r = index + 2;
    sheet.getCell(r, 1).value = row[0];
    sheet.getCell(r, 1).font = { bold: true, color: { argb: "FF334155" } };
    sheet.getCell(r, 2).value = row[1];
    sheet.mergeCells(r, 2, r, 6);
  });
}
function styleDetailSheet(sheet: ExcelJS.Worksheet, title: string) {
  sheet.insertRow(1, [title]);
  sheet.mergeCells(1, 1, 1, fields.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB42318" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 26;
  const header = sheet.getRow(2);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  header.alignment = { horizontal: "center", vertical: "middle" };
  header.height = 23;
  sheet.views = [{ state: "frozen", ySplit: 2 }];
  sheet.autoFilter = { from: "A2", to: `${String.fromCharCode(64 + fields.length)}2` };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 2 && rowNumber % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6FA" } };
    row.alignment = { vertical: "middle" };
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const municipalities: string[] = Array.isArray(body.municipalities) ? body.municipalities.map(String).filter(Boolean) : [];
    const status = String(body.status || "All");
    const itemTypes: string[] = Array.isArray(body.itemTypes) ? body.itemTypes.map(String) : [];
    const nationalities: string[] = Array.isArray(body.nationalities) ? body.nationalities.map(String) : [];
    const startDate = String(body.startDate || "2026-06-15");
    if (!municipalities.length || !nationalities.length || !["All", "Returnees", "Displaced"].includes(status) || !itemTypes.length || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return NextResponse.json({ error: "At least one municipality, nationality, status, item type, and a valid start date are required." }, { status: 400 });
    }

    const returneeStatuses = ["returned", "partially_returned", "remained_at_origin", "relocated"];
    const municipalityIn = `current_municipality IN (${municipalities.map(value => `'${esc(value)}'`).join(",")})`;
    let statusClause = municipalityIn;
    if (status === "Returnees") {
      statusClause = `(${municipalities.map(value => `(current_municipality = '${esc(value)}' AND origin_municipality = '${esc(value)}')`).join(" OR ")}) AND displacement_status IN (${returneeStatuses.map(value => `'${value}'`).join(",")})`;
    } else if (status === "Displaced") {
      statusClause = `${municipalityIn} AND displacement_status = 'currently_displaced'`;
    }
    const cdsWhere = [
      `(${statusClause})`,
      `nationality IN (${nationalities.map(value => `'${esc(value)}'`).join(",")})`
    ].join(" AND ");

    const cds = await queryAll(cdsConfig(), { where: cdsWhere, outFields: fields.join(",") });
    const prepared = cds.map((f): Record<string, unknown> => ({
      ...f.attributes,
      phone_primary: exportPhone(f.attributes.phone_primary),
      phone_spouse: exportPhone(f.attributes.phone_spouse),
      id_number: f.attributes.id_number
    }));
    const results: Record<string, Record<string, unknown>[]> = {};

    for (const itemType of itemTypes) {
      const deliveryWhere = [`type_items = '${esc(itemType)}'`, ...dateClause("delivered_date", startDate)].join(" AND ");
      const deliveries = await queryAll(deliveryConfig(), { where: deliveryWhere, outFields: "lookup_phone_nbr,lookup_id_number,type_items,delivered_date" });
      const phones = new Set(deliveries.map(f => normalizePhone(f.attributes.lookup_phone_nbr)).filter(Boolean));
      const ids = new Set(deliveries.map(f => normalizeId(f.attributes.lookup_id_number)).filter(Boolean));
      results[itemType] = prepared.filter(person => {
        const p1 = normalizePhone(person.phone_primary);
        const p2 = normalizePhone(person.phone_spouse);
        const id = normalizeId(person.id_number);
        return !((p1 && phones.has(p1)) || (p2 && phones.has(p2)) || (id && ids.has(id)));
      });
    }

    if (body.format === "xlsx" || body.format === "gap") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Donation Validation Portal";
      workbook.created = new Date();

      if (body.format === "gap") {
        const summary = workbook.addWorksheet("GAP Summary", { views: [{ state: "frozen", ySplit: 9, xSplit: 1 }] });
        addMetadata(summary, municipalities, status, nationalities, itemTypes, startDate);

        const hasFP = itemTypes.includes("Food parcel");
        const hasHK = itemTypes.includes("hygiene equipment");
        const groups = status === "All" ? ["Returnees", "Displaced"] : [status];
        const metricLabels = ["REGISTERED CDS", ...(hasFP ? ["FP RECEIVED", "FP GAP"] : []), ...(hasHK ? ["HK RECEIVED", "HK GAP"] : [])];
        const headerTop = 8;
        const headerBottom = 9;
        let column = 2;

        summary.mergeCells(headerTop, 1, headerBottom, 1);
        summary.getCell(headerTop, 1).value = "CURRENT MUNICIPALITY";
        for (const group of groups) {
          const startCol = column;
          const endCol = column + metricLabels.length - 1;
          summary.mergeCells(headerTop, startCol, headerTop, endCol);
          summary.getCell(headerTop, startCol).value = group.toUpperCase();
          metricLabels.forEach((label, index) => { summary.getCell(headerBottom, startCol + index).value = label; });
          column = endCol + 1;
        }
        if (hasFP) { summary.mergeCells(headerTop, column, headerBottom, column); summary.getCell(headerTop, column).value = "TOTAL FP GAP"; column++; }
        if (hasHK) { summary.mergeCells(headerTop, column, headerBottom, column); summary.getCell(headerTop, column).value = "TOTAL HK GAP"; column++; }
        const lastCol = column - 1;

        for (const rowNo of [headerTop, headerBottom]) {
          const row = summary.getRow(rowNo);
          row.font = { bold: true, color: { argb: "FFFFFFFF" } };
          row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
          row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          row.height = rowNo === headerTop ? 25 : 34;
        }

        const isGroup = (row: Record<string, unknown>, group: string) => group === "Displaced"
          ? String(row.displacement_status ?? "") === "currently_displaced"
          : returneeStatuses.includes(String(row.displacement_status ?? ""));

        const buildRow = (municipality: string | null) => {
          const values: (string | number)[] = [municipality ?? "TOTAL"];
          let totalFpGap = 0;
          let totalHkGap = 0;
          for (const group of groups) {
            const registeredRows = prepared.filter(row => (!municipality || String(row.current_municipality ?? "") === municipality) && isGroup(row, group));
            values.push(registeredRows.length);
            if (hasFP) {
              const gap = results["Food parcel"].filter(row => (!municipality || String(row.current_municipality ?? "") === municipality) && isGroup(row, group)).length;
              values.push(registeredRows.length - gap, gap);
              totalFpGap += gap;
            }
            if (hasHK) {
              const gap = results["hygiene equipment"].filter(row => (!municipality || String(row.current_municipality ?? "") === municipality) && isGroup(row, group)).length;
              values.push(registeredRows.length - gap, gap);
              totalHkGap += gap;
            }
          }
          if (hasFP) values.push(totalFpGap);
          if (hasHK) values.push(totalHkGap);
          return values;
        };

        summary.addRow(buildRow(null));
        municipalities.forEach(municipality => summary.addRow(buildRow(municipality)));
        const totalExcelRow = headerBottom + 1;
        summary.getRow(totalExcelRow).font = { bold: true, color: { argb: "FF1F2937" } };
        summary.getRow(totalExcelRow).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAF7" } };
        for (let rowNo = totalExcelRow + 1; rowNo <= totalExcelRow + municipalities.length; rowNo++) {
          if ((rowNo - totalExcelRow) % 2 === 0) summary.getRow(rowNo).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7FA" } };
        }
        summary.getColumn(1).width = 28;
        for (let col = 2; col <= lastCol; col++) summary.getColumn(col).width = 15;
        summary.autoFilter = { from: { row: headerBottom, column: 1 }, to: { row: totalExcelRow + municipalities.length, column: lastCol } };
        summary.eachRow((row, rowNumber) => {
          if (rowNumber >= headerTop) row.eachCell({ includeEmpty: true }, cell => {
            cell.border = { bottom: { style: "thin", color: { argb: "FFD8DEE7" } }, right: { style: "thin", color: { argb: "FFE5E7EB" } } };
            cell.alignment = { ...cell.alignment, vertical: "middle" };
          });
        });
      }

      if (body.format === "xlsx") for (const [itemType, rows] of Object.entries(results)) {
        const code = itemCodes[itemType] || itemType;
        const sheetName = `${code} GAP`.slice(0, 31).replace(/[\\/*?:\[\]]/g, "-");
        const sheet = workbook.addWorksheet(sheetName);
        sheet.columns = fields.map(field => ({ header: field, key: field, width: field.includes("municipality") ? 24 : Math.max(14, Math.min(24, field.length + 3)) }));
        rows.forEach(row => sheet.addRow(row));
        for (const field of ["phone_primary", "phone_spouse", "id_number"]) sheet.getColumn(field).numFmt = "@";
        styleDetailSheet(sheet, `${code} GAP — NOT RECEIVED`);
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const filename = exportName(municipalities, itemTypes, body.format === "gap" ? " - GAP" : "");
      return new NextResponse(buffer, { headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      } });
    }

    return NextResponse.json({ municipalities, totalPeople: prepared.length, returneeOriginRule: status === "Returnees", status, startDate, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Report failed." }, { status: 500 });
  }
}
