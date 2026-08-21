#!/usr/bin/env python3
"""
Rounds import — HVAC_Contracts.xlsx  ->  Supabase schema (v1)

Source of truth: rounds-schema-and-import-spec.md
Column mapping and calm-start rules are taken verbatim from that spec.

SAFE BY DEFAULT. Running this with no flags does NOT touch Supabase. It
reads the workbook, applies the mapping, writes three CSVs, and prints a
validation report you can eyeball against the spec's expected counts.

    python3 import_rounds.py                 # offline: transform + write CSVs + validate
    python3 import_rounds.py --load          # writes to Supabase (requires env below)

--load requires:
    SUPABASE_URL           your personal project URL
    SUPABASE_SERVICE_KEY   service-role key (bypasses RLS for the seed load)
    ROUNDS_OWNER_ID        the auth.users UUID every row is stamped to
                           (== the father-in-law's allow-listed email, AFTER
                           he has signed in once so the user row exists)

Do not run --load until the schema SQL has been reviewed and applied and
ROUNDS_OWNER_ID is confirmed (open question in the spec).
"""

import os
import sys
import csv
import pandas as pd

SRC = os.environ.get("ROUNDS_XLSX", "HVAC_Contracts.xlsx")
OUT_DIR = os.environ.get("ROUNDS_OUT", ".")

EXPECTED_ROWS = 418
EXPECTED_TERRITORY = {
    "WEST": 54, "RALEIGH-S": 52, "NORTH": 50, "SOUTH": 48, "SOUTHEAST": 47,
    "RALEIGH-N": 40, "FAR NORTH": 33, "EAST": 31, "OUT OF RANGE": 21,
    "DURHAM": 20, "SANFORD": 13, "RALEIGH-UNASSIGNED": 9,
}


def clean_zip(v):
    """zip may arrive as int/float/str; emit clean 5-char text or ''."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    s = str(v).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s


def clean_str(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return str(v).strip()


def clean_num(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    try:
        return float(v)
    except (ValueError, TypeError):
        return ""   # non-numeric junk like "BAD" -> treated as a missing coordinate


def transform_contractors(df):
    """Apply the spec's column mapping. Returns list[dict] of schema rows."""
    rows = []
    for _, r in df.iterrows():
        rows.append({
            "legacy_id":      clean_str(r["contractor_id"]),
            "company":        clean_str(r["company"]),
            "street_address": clean_str(r["street_address"]),
            "city":           clean_str(r["city"]),
            "state":          clean_str(r["state"]) or "NC",     # 1 blank -> NC default
            "zip":            clean_zip(r["zip"]),
            "phone":          clean_str(r["phone"]),
            "contact":        clean_str(r["contact_name"]),      # freeform, NO parsing
            "visitable":      clean_str(r["visitable"]) or "VISIT",
            "starred":        (clean_str(r["starred"]).upper() == "Y"),
            "territory":      clean_str(r["territory"]),         # already computed in the sheet
            "target_days":    60,                                # all blank -> spec default 60
            "last_visited":   "",                                # all blank -> NULL (calm start)
            "lat":            clean_num(r["lat"]),
            "lng":            clean_num(r["lng"]),
            "status":         "active",                          # all blank -> active
            # days_since / overdue / visit_count are intentionally DROPPED
        })
    return rows


def write_csv(path, fieldnames, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in rows:
            w.writerow(row)


def validate(rows, cities, zips):
    print(f"\n=== VALIDATION (expected from spec) ===")
    ok = True

    n = len(rows)
    print(f"contractors: {n} rows (expect {EXPECTED_ROWS})  {'OK' if n == EXPECTED_ROWS else 'MISMATCH'}")
    ok &= (n == EXPECTED_ROWS)

    # required fields per spec: company, territory, visitable populated
    missing = [r["legacy_id"] for r in rows if not (r["company"] and r["territory"] and r["visitable"])]
    print(f"rows missing company/territory/visitable: {len(missing)}  {'OK' if not missing else 'CHECK '+str(missing[:5])}")
    ok &= (not missing)

    # territory distribution
    dist = {}
    for r in rows:
        dist[r["territory"]] = dist.get(r["territory"], 0) + 1
    print("territory distribution:")
    for terr, exp in EXPECTED_TERRITORY.items():
        got = dist.get(terr, 0)
        flag = "OK" if got == exp else "MISMATCH"
        print(f"   {terr:<20} {got:>3}  (expect {exp:>3})  {flag}")
        ok &= (got == exp)

    v = sum(1 for r in rows if r["visitable"] == "VISIT")
    c = sum(1 for r in rows if r["visitable"] == "CALL ONLY")
    print(f"visitable: VISIT={v} (369) CALL ONLY={c} (49)  {'OK' if v==369 and c==49 else 'MISMATCH'}")
    ok &= (v == 369 and c == 49)

    s = sum(1 for r in rows if r["starred"])
    print(f"starred: {s} (expect 135)  {'OK' if s==135 else 'MISMATCH'}")
    ok &= (s == 135)

    nocoord = sum(1 for r in rows if r["lat"] == "" or r["lng"] == "")
    print(f"rows with no coordinates: {nocoord} (~51 expected; map must tolerate)")

    print(f"lookup tables: territory_cities={len(cities)} (33)  territory_raleigh_zips={len(zips)} (17)")
    ok &= (len(cities) == 33 and len(zips) == 17)

    print(f"\n=== {'ALL CHECKS PASSED' if ok else 'CHECKS FAILED — review above'} ===")
    return ok


def load_supabase(rows, cities, zips):
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    owner = os.environ.get("ROUNDS_OWNER_ID")
    if not (url and key and owner):
        sys.exit("--load needs SUPABASE_URL, SUPABASE_SERVICE_KEY, ROUNDS_OWNER_ID. Aborting; nothing written.")
    try:
        from supabase import create_client
    except ImportError:
        sys.exit("pip install supabase to use --load.")

    sb = create_client(url, key)

    # Lookup tables first (referenced conceptually by territory derivation).
    sb.table("territory_cities").upsert(cities).execute()
    sb.table("territory_raleigh_zips").upsert(zips).execute()

    # Contractors, stamped to the confirmed owner. NULL-out empties for
    # nullable columns so calm-start (last_visited NULL) is honored.
    payload = []
    for r in rows:
        row = dict(r)
        row["owner_id"] = owner
        row["last_visited"] = None if row["last_visited"] == "" else row["last_visited"]
        row["lat"] = None if row["lat"] == "" else row["lat"]
        row["lng"] = None if row["lng"] == "" else row["lng"]
        payload.append(row)

    for i in range(0, len(payload), 100):
        sb.table("contractors").insert(payload[i:i+100]).execute()

    print(f"Loaded {len(payload)} contractors + {len(cities)} cities + {len(zips)} zips to {url}")


def main():
    do_load = "--load" in sys.argv

    df = pd.read_excel(SRC, sheet_name="Contractors", dtype=object)
    tc = pd.read_excel(SRC, sheet_name="Territories", dtype=object)
    tz = pd.read_excel(SRC, sheet_name="RaleighZips", dtype=object)

    rows = transform_contractors(df)
    cities = [{"city": clean_str(r["city"]).upper(), "territory": clean_str(r["territory"])}
              for _, r in tc.iterrows() if clean_str(r["city"])]
    zips = [{"zip": clean_zip(r["zip"]), "territory": clean_str(r["territory"])}
            for _, r in tz.iterrows() if clean_zip(r["zip"])]

    # Always write CSVs for inspection.
    cfields = ["legacy_id", "company", "street_address", "city", "state", "zip",
               "phone", "contact", "visitable", "starred", "territory",
               "target_days", "last_visited", "lat", "lng", "status"]
    write_csv(os.path.join(OUT_DIR, "contractors_transformed.csv"), cfields, rows)
    write_csv(os.path.join(OUT_DIR, "territory_cities.csv"), ["city", "territory"], cities)
    write_csv(os.path.join(OUT_DIR, "territory_raleigh_zips.csv"), ["zip", "territory"], zips)
    print("Wrote: contractors_transformed.csv, territory_cities.csv, territory_raleigh_zips.csv")

    validate(rows, cities, zips)

    if do_load:
        load_supabase(rows, cities, zips)
    else:
        print("\nOffline run complete. Nothing was sent to Supabase. Use --load when ready.")


if __name__ == "__main__":
    main()
