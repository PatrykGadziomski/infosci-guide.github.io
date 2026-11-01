"""Adds one program from a GitHub issue body (JSON in a ```json block) to the SQLite DB.
Usage: ISSUE_BODY=... python scripts/add_program.py data/studiengaenge.db
Exit code 1 + message on stdout if the submission is invalid."""
import json, os, re, sqlite3, sys

ABSCHLUSS = ["B.A.", "B.Sc.", "M.A.", "M.Sc.", "M.LIS", "Zertifikat"]
MODUS = ["Vollzeit", "Teilzeit", "Fernstudium", "Berufsbegleitend", "Dual"]
HTYPE = ["Universität", "Fachhochschule", "Fernstudium"]

def fail(msg):
    print(msg); sys.exit(1)

def text(d, key, required=False, maxlen=200):
    v = re.sub(r"[\x00-\x1f]", " ", str(d.get(key) or "")).strip()
    if required and not v: fail(f"Pflichtfeld fehlt: {key}")
    if len(v) > maxlen: fail(f"Feld zu lang: {key}")
    return v or None

def url(d, key):
    v = text(d, key, maxlen=300)
    if v and not re.match(r"https?://[^\s<>\"']+$", v): fail(f"Ungültige URL: {key}")
    return v

def main(dbpath):
    m = re.search(r"```json\s*(\{.*?\})\s*```", os.environ.get("ISSUE_BODY", ""), re.S)
    if not m: fail("Kein JSON-Block im Issue gefunden.")
    try: d = json.loads(m[1])
    except ValueError: fail("JSON ist nicht lesbar.")
    name = text(d, "name", True); hname = text(d, "hochschule", True)
    abschluss = text(d, "abschluss", True)
    if abschluss not in ABSCHLUSS: fail("Ungültiger Abschluss.")
    modus = text(d, "modus")
    if modus and modus not in MODUS: fail("Ungültiger Modus.")
    sem = d.get("semester")
    if sem not in (None, ""):
        try: sem = int(sem); assert 1 <= sem <= 20
        except (ValueError, AssertionError): fail("Semester muss zwischen 1 und 20 liegen.")
    else: sem = None
    tags = [t.strip()[:40] for t in str(d.get("tags") or "").split(",") if t.strip()][:10]

    db = sqlite3.connect(dbpath); db.execute("PRAGMA foreign_keys = ON")
    row = db.execute("SELECT id FROM hochschulen WHERE name = ?", (hname,)).fetchone()
    if row: hid = row[0]
    else:
        city = text(d, "city", True); htype = text(d, "hochschultyp", True)
        if htype not in HTYPE: fail("Ungültiger Hochschultyp.")
        hid = db.execute("INSERT INTO hochschulen(name,city,land,type,website) VALUES(?,?,?,?,?)",
                         (hname, city, text(d, "land") or "Deutschland", htype, url(d, "hochschule_website"))).lastrowid
    try:
        sid = db.execute(
            "INSERT INTO studiengaenge(name,hochschule_id,abschluss,schwerpunkt,semester,modus,studienbeginn,zulassung,sprache,website)"
            " VALUES(?,?,?,?,?,?,?,?,?,?)",
            (name, hid, abschluss, text(d, "schwerpunkt"), sem, modus, text(d, "studienbeginn"),
             text(d, "zulassung"), text(d, "sprache"), url(d, "website"))).lastrowid
    except sqlite3.IntegrityError:
        fail("Dieser Studiengang existiert bereits.")
    db.executemany("INSERT OR IGNORE INTO tags VALUES(?,?)", [(sid, t) for t in tags])
    db.commit()
    print(f"Hinzugefügt: {abschluss} {name} ({hname})")

main(sys.argv[1])
