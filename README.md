# ArcGIS Donation Validation

A password-protected Next.js report that finds registered people who have not received selected donation items.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Enter the two ArcGIS usernames and passwords.
3. Keep passwords containing `#` inside double quotes.
4. Install and start:

```bash
npm install
npm run check-env
npm run dev
```

Open `http://localhost:3000`.

## Authentication

The CDS and Delivery accounts are authenticated independently. Each account may belong to a different ArcGIS Online organization. The default token portal is `https://www.arcgis.com`; a different portal can be set separately with `CDS_PORTAL_URL` or `DELIVERY_PORTAL_URL`.

The report page does not contact ArcGIS when it opens. Tokens are requested only after **Get Report** or **Export Excel** is clicked.

Authentication errors identify the failing account as `CDS` or `Delivery`, the username loaded by Next.js, and the portal endpoint used.

## Report rules

- CDS filter: selected `current_municipality` and one or more `displacement_status` values.
- Delivery filter: selected `type_items`, from June 15, 2026 onward.
- A person is treated as received when `phone_primary` or `phone_spouse` matches `lookup_phone_nbr`, or `id_number` matches `lookup_id_number`.
- Results and Excel worksheets are separated by item type.

## Latest report updates

- Nationality filter: lebanese, syrian, palestinian, or other.
- Compact professional report layout with smaller controls and table rows.
- Search across displayed report fields.
- Phone validation normalizes `+961`, `00961`, `961`, and local leading-zero formats.
- Exported phone values omit a leading `+`.
- ID validation ignores leading zeros, so `000016562757` matches `16562757`.
- Phone and ID columns are formatted as text in Excel.

## Latest filter behavior

- Nationality supports multiple selections, including an **All** option.
- When `currently_displaced` is not among the selected statuses, the CDS query automatically requires both `current_municipality` and `origin_municipality` to equal the selected municipality.
- The report page displays a red warning whenever this municipality rule is active.
- The preview table includes both origin and current municipality.
