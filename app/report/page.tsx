"use client";

import { useMemo, useState } from "react";

const MUNICIPALITIES = [
  "Aabbassiye","Aaitit","Aalma ech Chaab","Ain Baal","Arzoun","Bafliye","Barich","Batouliye","Bazouriye","Bedias","Bestiyat","Biyad Sour","Borj ech Chmali","Borj Rahhal","Bourghliye","Boustane Sour","Chaaitiyeh","Chabriha","Chahour","Chamaa","Chehabiye","Chihine","Debaal","Deir Aamess","Deir Kifa","Deir Qanoun en Nahr","Derdghaiya","Dhaira","El Biyada","El Kleile","Halloussiye","Hannaouiye","Hanniye","Haumeiri","Jannata","Jbal el Botm","Jebbain","Jouaiya","Knisse Sour","Maachouq","Maarake","Maaroub","Mahrouneh","Majdel Zoun","Malkeit es Sahel","Mansouri","Marouahine","Mazraat Mechref","Mjadel","Naffakhiye","Naqoura","Ouadi Jilou","Qana","Ras el Ain","Rechkananey","Rmadiyeh","Salaa","Sammaaiye","Siddiqine","Sour","Srifa","Tair Debba","Tair Filsay","Tair Harfa","Toura","Yarine","Ynouh","Zabqine","Zalloutiye","Ziraa","Masaken","Jal Baher","Hay Thakana","Housh","Mafraa Aabbassiye","Mokhayam Borj ech Chmali","Mokhayam Rachidiye","Mokhayam Jal Baher","Mokhayam El Bass","Mokhayam Qasmiye","Jal Baher Nahr El Samer","Kadmus","Deir Qanoun Ras el Ain","Sharnai"
];
const STATUSES = ["returned","currently_displaced","partially_returned","remained_at_origin","relocated"];
const ITEM_TYPES = ["Food parcel","hygiene equipment"];
const NATIONALITIES = ["lebanese", "syrian", "palestinian", "other"];
const START_DATE = "2026-06-15";

type ReportRow = Record<string, unknown>;
type ReportData = { totalPeople: number; results: Record<string, ReportRow[]> };

export default function ReportPage() {
  const [municipality, setMunicipality] = useState("");
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [itemTypes, setItemTypes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  async function run(format = "json") {
    if (!municipality || !nationalities.length || !statuses.length || !itemTypes.length) {
      setError("Select municipality, at least one nationality, at least one displacement status, and at least one item type.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ municipality, nationalities, statuses, itemTypes, startDate: START_DATE, format })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Report failed.");
      }

      if (format === "xlsx") {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `not-received-${municipality}.xlsx`;
        link.click();
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
          <p>Identify CDS records that have not received selected donation items.</p>
        </div>
        <button className="secondary compact" onClick={async () => { await fetch("/api/logout", { method: "POST" }); location.href = "/"; }}>
          Log out
        </button>
      </header>

      <section className="card formgrid">
        <label>
          Current municipality
          <select value={municipality} onChange={event => setMunicipality(event.target.value)}>
            <option value="">Select municipality</option>
            {MUNICIPALITIES.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        <fieldset>
          <legend>Nationality</legend>
          <div className="checks">
            <label>
              <input
                type="checkbox"
                checked={nationalities.length === NATIONALITIES.length}
                onChange={() => setNationalities(nationalities.length === NATIONALITIES.length ? [] : [...NATIONALITIES])}
              />
              All
            </label>
            {NATIONALITIES.map(value => (
              <label key={value}>
                <input type="checkbox" checked={nationalities.includes(value)} onChange={() => toggle(value, nationalities, setNationalities)} />
                {value}
              </label>
            ))}
          </div>
        </fieldset>

        <label>
          Delivery records from
          <input type="date" value={START_DATE} readOnly disabled />
        </label>

        <fieldset>
          <legend>Donation item types</legend>
          <div className="checks">
            {ITEM_TYPES.map(value => (
              <label key={value}>
                <input type="checkbox" checked={itemTypes.includes(value)} onChange={() => toggle(value, itemTypes, setItemTypes)} />
                {value}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="wide">
          <legend>Displacement status</legend>
          <div className="checks">
            {STATUSES.map(value => (
              <label key={value}>
                <input type="checkbox" checked={statuses.includes(value)} onChange={() => toggle(value, statuses, setStatuses)} />
                {value}
              </label>
            ))}
          </div>
        </fieldset>

        {!statuses.includes("currently_displaced") && statuses.length > 0 && (
          <div className="warning wide">
            Currently displaced is not selected. CDS records will be limited to people whose origin municipality and current municipality are both {municipality || "the selected municipality"}.
          </div>
        )}

        <div className="actions">
          <button disabled={loading} onClick={() => run()}>{loading ? "Checking…" : "Get Report"}</button>
          <button className="secondary" disabled={!data || loading} onClick={() => run("xlsx")}>Export Excel</button>
        </div>
        {error && <div className="error wide">{error}</div>}
      </section>

      {data && (
        <section>
          <div className="resultsbar">
            <div className="summary">
              <div className="card metric"><span>CDS checked</span><strong>{data.totalPeople}</strong></div>
              {counts.map(([key, value]) => (
                <div className="card metric" key={key}><span>Not received: {key}</span><strong>{value}</strong></div>
              ))}
            </div>
            <label className="searchbox">
              Search results
              <input type="search" placeholder="Name, phone, ID, status…" value={search} onChange={event => setSearch(event.target.value)} />
            </label>
          </div>

          {Object.entries(filteredResults).map(([type, rows]) => (
            <div className="card tablecard" key={type}>
              <div className="tabletitle">
                <h2>{type}</h2>
                <span>{rows.length} shown / {data.results[type].length} total</span>
              </div>
              <div className="tablewrap">
                <table>
                  <thead><tr><th>Full name</th><th>Nationality</th><th>Phone</th><th>Spouse phone</th><th>ID number</th><th>Status</th><th>Origin municipality</th><th>Current municipality</th><th>HH size</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 500).map((row, index) => (
                      <tr key={String(row.objectid ?? index)}>
                        <td>{String(row.full_name ?? "")}</td><td>{String(row.nationality ?? "")}</td><td>{String(row.phone_primary ?? "")}</td><td>{String(row.phone_spouse ?? "")}</td><td>{String(row.id_number ?? "")}</td><td>{String(row.displacement_status ?? "")}</td><td>{String(row.origin_municipality ?? "")}</td><td>{String(row.current_municipality ?? "")}</td><td>{String(row.household_size ?? "")}</td>
                      </tr>
                    ))}
                  </tbody>
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
