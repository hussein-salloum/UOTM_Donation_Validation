"use client";

import { useMemo, useState } from "react";

const MUNICIPALITIES = [
  "Aabbassiye","Aaitit","Ain Baal","Arzoun","Bafliye","Barich","Batouliye","Bazouriye","Bedias","Bestiyat","Biyad Sour","Borj ech Chmali","Borj Rahhal","Bourghliye","Chaaitiyeh","Chabriha","Chahour","Chehabiye","Debaal","Deir Aamess","Deir Kifa","Deir Qanoun en Nahr","Deir Qanoun Ras el Ain","Derdghaiya","El Kleile","Halloussiye","Hannaouiye","Hanniye","Haumeiri","Hay Thakana","Housh","Jal Baher","Jannata","Jbal el Botm","Jouaiya","Knisse Sour","Maachouq","Maarake","Maaroub","Mafraa Aabbassiye","Mahrouneh","Malkeit es Sahel","Mansouri","Masaken","Mazraat Mechref","Mjadel","Mokhayam Borj ech Chmali","Mokhayam El Bass","Mokhayam Jal Baher","Mokhayam Qasmiye","Mokhayam Rachidiye","Naffakhiye","Ouadi Jilou","Qana","Ras el Ain","Rechkananey","Rmadiyeh","Salaa","Sammaaiye","Sharnai","Siddiqine","Sour","Srifa","Tair Debba","Tair Filsay","Toura","Ynouh","Zabqine","Ziraa"
];
const STATUS_GROUPS = ["All", "Returnees", "Displaced"];
const STANDARD_ITEM_TYPES = ["Food parcel", "hygiene equipment"];
const DISPLACED_ONLY_ITEM_TYPES = ["Mattresses/ sleeping bag", "Pillows", "Kitchen Kit", "Summer Bedsheet"];
const ITEM_TYPES = [...STANDARD_ITEM_TYPES, ...DISPLACED_ONLY_ITEM_TYPES];
const NATIONALITIES = ["lebanese", "syrian", "palestinian", "other"];

const ITEM_CODE: Record<string, string> = {
  "Food parcel": "FP",
  "hygiene equipment": "HK",
  "Mattresses/ sleeping bag": "MSB",
  "Pillows": "PIL",
  "Kitchen Kit": "KK",
  "Summer Bedsheet": "SB"
};

type ReportRow = Record<string, unknown>;
type ReportData = { totalPeople: number; results: Record<string, ReportRow[]> };

function reportDateLabel(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${day}${month}${date.getFullYear()}`;
}

function fileLabel(municipalities: string[], itemTypes: string[]) {
  const municipalityPart = municipalities.length === MUNICIPALITIES.length
    ? "All Municipalities"
    : municipalities.length <= 3
      ? municipalities.join(" - ")
      : `${municipalities.length} Municipalities`;
  return `${municipalityPart} - ${itemTypes.map(type => ITEM_CODE[type] || type).join("-")}`;
}

export default function ReportPage() {
  const [municipalities, setMunicipalities] = useState<string[]>([]);
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [status, setStatus] = useState("All");
  const [itemTypes, setItemTypes] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("2026-06-15");
  const [search, setSearch] = useState("");
  const [municipalitySearch, setMunicipalitySearch] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const visibleMunicipalities = useMemo(() => {
    const term = municipalitySearch.trim().toLowerCase();
    return term ? MUNICIPALITIES.filter(value => value.toLowerCase().includes(term)) : MUNICIPALITIES;
  }, [municipalitySearch]);

  const counts = useMemo(
    () => data ? Object.entries(data.results).map(([key, value]) => [key, value.length] as const) : [],
    [data]
  );

  const filteredResults = useMemo(() => {
    if (!data) return {};
    const term = search.trim().toLowerCase();
    if (!term) return data.results;
    return Object.fromEntries(Object.entries(data.results).map(([type, rows]) => [
      type,
      rows.filter(row => Object.values(row).some(value => String(value ?? "").toLowerCase().includes(term)))
    ]));
  }, [data, search]);

  function toggle(value: string, list: string[], setter: (values: string[]) => void) {
    setter(list.includes(value) ? list.filter(item => item !== value) : [...list, value]);
  }

  async function run(format: "json" | "xlsx" | "gap" = "json") {
    if (!municipalities.length || !nationalities.length || !status || !itemTypes.length || !startDate) {
      setError("Select at least one municipality, nationality, displacement status, item type, and a delivery start date.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ municipalities, nationalities, status, itemTypes, startDate, format })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Report failed.");
      }

      if (format !== "json") {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileLabel(municipalities, itemTypes)}${format === "gap" ? " - GAP" : ""} - ${reportDateLabel()}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } else {
        setData(await response.json());
        setSearch("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Report failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <header>
        <div>
          <h1>Donation Validation Report</h1>
          <p>Validate received donations and export operational gap lists.</p>
        </div>
        <button className="secondary compact" onClick={async () => { await fetch("/api/logout", { method: "POST" }); location.href = "/"; }}>
          Log out
        </button>
      </header>

      <section className="card formgrid">
        <fieldset className="municipality-field">
          <legend>Current municipality</legend>
          <input className="mini-search" type="search" placeholder="Search municipality…" value={municipalitySearch} onChange={event => setMunicipalitySearch(event.target.value)} />
          <div className="select-tools">
            <button type="button" className="text-action" onClick={() => setMunicipalities([...MUNICIPALITIES])}>Select all</button>
            <button type="button" className="text-action" onClick={() => setMunicipalities([])}>Clear</button>
            <span>{municipalities.length} selected</span>
          </div>
          <div className="municipality-list">
            {visibleMunicipalities.map(value => (
              <label key={value}>
                <input type="checkbox" checked={municipalities.includes(value)} onChange={() => toggle(value, municipalities, setMunicipalities)} />
                {value}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Nationality</legend>
          <div className="checks">
            <label><input type="checkbox" checked={nationalities.length === NATIONALITIES.length} onChange={() => setNationalities(nationalities.length === NATIONALITIES.length ? [] : [...NATIONALITIES])} />All</label>
            {NATIONALITIES.map(value => <label key={value}><input type="checkbox" checked={nationalities.includes(value)} onChange={() => toggle(value, nationalities, setNationalities)} />{value}</label>)}
          </div>
        </fieldset>

        <label>
          Delivery records from
          <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} />
        </label>

        <fieldset>
          <legend>Donation item types</legend>
          <div className="checks item-checks">
            {ITEM_TYPES.map(value => {
              const displacedOnly = DISPLACED_ONLY_ITEM_TYPES.includes(value);
              const disabled = displacedOnly && status !== "Displaced";
              return (
                <label key={value} className={disabled ? "disabled-choice" : ""} title={disabled ? "Available only when Displaced is selected" : undefined}>
                  <input type="checkbox" disabled={disabled} checked={itemTypes.includes(value)} onChange={() => toggle(value, itemTypes, setItemTypes)} />
                  {value}{displacedOnly && <span className="choice-note">Displaced only</span>}
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="wide">
          Displacement status
          <select value={status} onChange={event => {
            const nextStatus = event.target.value;
            setStatus(nextStatus);
            if (nextStatus !== "Displaced") {
              setItemTypes(current => current.filter(item => !DISPLACED_ONLY_ITEM_TYPES.includes(item)));
            }
          }}>
            {STATUS_GROUPS.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        {status === "Returnees" && (
          <div className="warning wide">
            Returnees include returned, partially returned, remained at origin, and relocated. The report applies origin municipality = current municipality.
          </div>
        )}
        {status === "All" && (
          <div className="info wide">
            All includes every displacement status. No displacement-status or origin-municipality rule is applied.
          </div>
        )}
        {status === "Displaced" && itemTypes.some(item => DISPLACED_ONLY_ITEM_TYPES.includes(item)) && (
          <div className="warning wide">
            Mattresses/sleeping bags, pillows, kitchen kits, and summer bedsheets validate currently displaced people only. Their GAP lists include only CDS records where origin home damage is total damage.
          </div>
        )}

        <div className="actions">
          <button disabled={loading} onClick={() => run()}>{loading ? "Checking…" : "Get Report"}</button>
          <button className="secondary" disabled={loading} onClick={() => run("xlsx")}>Export Excel</button>
          <button className="gap-button" disabled={loading} onClick={() => run("gap")}>GAP</button>
        </div>
        {error && <div className="error wide">{error}</div>}
      </section>

      {data && (
        <section>
          <div className="resultsbar">
            <div className="summary">
              <div className="card metric"><span>CDS checked</span><strong>{data.totalPeople}</strong></div>
              {counts.map(([key, value]) => <div className="card metric" key={key}><span>Gap: {key}</span><strong>{value}</strong></div>)}
            </div>
            <label className="searchbox">Search results<input type="search" placeholder="Name, municipality, phone, ID…" value={search} onChange={event => setSearch(event.target.value)} /></label>
          </div>

          {Object.entries(filteredResults).map(([type, rows]) => (
            <div className="card tablecard" key={type}>
              <div className="tabletitle"><h2>{type}</h2><span>{rows.length} shown / {data.results[type].length} total</span></div>
              <div className="tablewrap">
                <table>
                  <thead><tr><th>Full name</th><th>Nationality</th><th>Phone</th><th>Spouse phone</th><th>ID number</th><th>Status</th><th>Origin municipality</th><th>Current municipality</th><th>HH size</th></tr></thead>
                  <tbody>{rows.slice(0, 500).map((row, index) => <tr key={`${String(row.objectid ?? index)}-${index}`}><td>{String(row.full_name ?? "")}</td><td>{String(row.nationality ?? "")}</td><td>{String(row.phone_primary ?? "")}</td><td>{String(row.phone_spouse ?? "")}</td><td>{String(row.id_number ?? "")}</td><td>{String(row.displacement_status ?? "")}</td><td>{String(row.origin_municipality ?? "")}</td><td>{String(row.current_municipality ?? "")}</td><td>{String(row.household_size ?? "")}</td></tr>)}</tbody>
                </table>
              </div>
              {rows.length > 500 && <p className="tablehint">Showing the first 500 matching rows. Excel contains all rows.</p>}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
