import { useState } from "react";
import { DEFAULT_THEME } from "./utils/theme";

// In-app how-tos. A slide-over that opens on the topic for whichever screen you
// were looking at, with the rest a tap away. Plain content — no app state, no
// supabase — so it stays cheap to keep correct as screens change.

// Each topic: { key, title, blurb, steps[], notes[] }
// `views` maps a view key from the app shell onto the topic to open first.
const TOPICS = [
  {
    key: "tickets",
    views: ["log"],
    title: "Tickets",
    blurb: "A ticket is one spray job: the fields, the tank mix, who ran it and when. Finished tickets are your application records.",
    steps: [
      "Hit New ticket, pick the fields you're treating, and add each chemical in the mix.",
      "Fill in the tank: size, gallons per acre, pressure. BoomLog works out loads, the amount of each product per tank, and a start time for every field.",
      "Save it. The ticket sits in the list as a record you can reopen, print or export.",
      "Flip the queue switch to send it to the cab, where the applicator picks it up on their phone.",
    ],
    notes: [
      "Search the list by field or by chemical to pull up what you sprayed where.",
      "Print a ticket for the cab from the ticket itself — it comes out on one page with the mix sheet.",
    ],
  },
  {
    key: "newticket",
    views: ["form"],
    title: "Writing a ticket",
    blurb: "The form fills top to bottom. Anything still missing is listed when you try to save, so you can work through it in any order.",
    steps: [
      "Fields: search by name or filter by crop. Acres come from the field library — tap the acreage on a tag to override it for this job only.",
      "Chemicals: add a row per product, then enter either a rate per acre or gallons per tank. The other one is worked out for you.",
      "Tank setup: tank size and gal/acre drive the load count. Open the gear to save a tank size you use often.",
      "Weather: wind and temperature auto-fill from your farm location. Set that under Account if the fields are blank.",
    ],
    notes: [
      "Target Zone, if your org has it on, calculates loads and mix on a reduced band while the ticket still shows the broadcast rate.",
      "The non-licensed applicator is optional — the licensed one is not.",
    ],
  },
  {
    key: "cab",
    views: ["applicator"],
    title: "The cab",
    blurb: "What the applicator sees on a phone. Only queued tickets show up, newest first.",
    steps: [
      "Tap a ticket to open the job: the mix sheet, the field list in spray order, and a map.",
      "Work down the fields, marking each one done as you finish it. Times are stamped as you go.",
      "Use the partial-load calculator when the last tank doesn't come out even.",
      "When the last field is marked, the ticket completes and drops out of the queue.",
    ],
    notes: [
      "It keeps working with no signal and syncs when the phone gets a bar back.",
      "Give the applicator the Applicator role — they see the queue and nothing else.",
    ],
  },
  {
    key: "fields",
    views: ["fieldMgr"],
    title: "Fields",
    blurb: "Your field library: name, acres, crop, and a boundary. Nearly always faster to import than to type.",
    steps: [
      "Shapefile (.zip): the usual export from FarmMobile, Climate, Granular or an FSA office. Boundaries and acres come across together, and BoomLog matches them to fields you already have.",
      "CSV: any spreadsheet with a field name and acreage. You map the columns on the next screen, so the headings don't have to match anything.",
      "By hand: add a field, then drop its boundary on the map if you want one.",
    ],
    notes: [
      "Two records for the same ground? Select them and merge — the boundary and history follow.",
      "A field needs a boundary only if you want it on a map or on the re-entry posting. Acres alone is enough to write tickets.",
    ],
  },
  {
    key: "chemicals",
    views: ["chemMgr"],
    title: "Chemicals",
    blurb: "Every product you spray, as it reads on the label. This is the library a ticket draws from, and what your filed records are checked against.",
    steps: [
      "Add a chemical: name, EPA registration number, REI, formulation type, and the container size you buy.",
      "Copy all of it off the jug or the label PDF. Don't work from memory — the EPA number and REI print on the record you file.",
      "Got a lot of products? Download the CSV template, fill it in a spreadsheet, and import it in one pass.",
      "Export the library any time to edit in Excel and re-import — rows match up by name, so edits land in place instead of duplicating.",
    ],
    notes: [
      "Template columns: Chemical Name, EPA #, REI, Unit, Formulation Type, Container Size, Active Ingredient. Only the name is required.",
      "Formulation codes: L liquid flowable/SC, E emulsifiable concentrate, S soluble liquid, WDG water dispersible granule/DF, WP wettable powder, D dry flowable, A adjuvant. Units are oz, gal, lb or pt.",
      "Adjuvants and surfactants: set the formulation to A and you can leave the EPA number and REI empty.",
      "A blank cell in an imported row never wipes a value you already have, so you can fill the library in over several passes.",
      "Container size is what one jug or bag holds, in the unit above. Leave it empty for a tote or bulk.",
    ],
  },
  {
    key: "equipment",
    views: ["equipMgr"],
    title: "Equipment",
    blurb: "The machines a ticket can be run with, and how fast each one covers ground.",
    steps: [
      "Add each sprayer by the name you'd recognise in the cab.",
      "Set acres per hour — that's what lays out the start and finish time for each field on a ticket.",
    ],
    notes: ["Not sure on a number? 75 acres an hour is a reasonable starting point, and tickets will tell you soon enough."],
  },
  {
    key: "people",
    views: [],
    title: "People",
    blurb: "Who can appear as the applicator on a ticket. Separate from who can sign in.",
    steps: [
      "Licensed: name plus license number, exactly as printed on the license.",
      "Non-licensed: anyone who runs the rig under supervision. Name only.",
    ],
    notes: [
      "Adding someone here does not give them a login. To let them into the app, invite them under Account.",
    ],
  },
  {
    key: "team",
    views: ["team"],
    title: "Account and sharing",
    blurb: "Your farm's settings, who's in it, and the two ways records leave BoomLog.",
    steps: [
      "Members: invite by email and pick a role. Owner sets everything up, Member writes tickets, Applicator only sees the cab queue, Viewer only reads.",
      "Re-entry posting: generate a link, print the QR poster, and hang it at the gate. Anyone who scans it sees which fields are under REI right now — no login.",
      "Reports: export your application records as a CSV, or as a TDA-format report for a date range.",
      "Sheets export: creates a token for the Apps Script in your spreadsheet. Revoke it here and the sheet stops pulling immediately.",
    ],
    notes: [
      "An invite doesn't send an email yet. Tell the person you invited to sign up with that exact address — they'll land in your farm.",
      "The Danger Zone clears libraries or all data. It can't be undone.",
    ],
  },
];

export default function HelpDrawer({ theme = DEFAULT_THEME, isMobile = false, view, onClose }) {
  const initial = TOPICS.find(t => t.views.includes(view))?.key || null;
  const [openKey, setOpenKey] = useState(initial);
  const topic = TOPICS.find(t => t.key === openKey) || null;

  const panel = isMobile
    ? { position: "fixed", inset: 0, zIndex: 400, background: theme.canvas, display: "flex", flexDirection: "column" }
    : { position: "fixed", top: 0, bottom: 0, right: 0, width: 440, zIndex: 400, background: theme.canvas,
        display: "flex", flexDirection: "column", boxShadow: "-12px 0 40px -18px rgba(10,20,14,0.4)" };

  return (
    <>
      {!isMobile && (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 399, background: "rgba(10,20,14,0.35)" }} />
      )}
      <div role="dialog" aria-label="Help" style={panel}>
        <div style={{ background: theme.header, color: "#fff", flexShrink: 0,
          padding: isMobile ? "calc(14px + env(safe-area-inset-top)) 16px 14px" : "18px 20px",
          display: "flex", alignItems: "center", gap: 12 }}>
          {topic && (
            <button onClick={() => setOpenKey(null)} aria-label="Back to all topics"
              style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", borderRadius: 10,
                width: 32, height: 32, cursor: "pointer", fontSize: 17, fontFamily: "inherit", flexShrink: 0 }}>‹</button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>
              {topic ? topic.title : "How to use BoomLog"}
            </div>
            <div style={{ fontSize: 12, color: theme.headerSub, marginTop: 1 }}>
              {topic ? "Help" : "Pick a screen to read about"}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close help"
            style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", borderRadius: 10,
              width: 32, height: 32, cursor: "pointer", fontSize: 18, lineHeight: 1, fontFamily: "inherit", flexShrink: 0 }}>×</button>
        </div>

        {/* On phones the app's bottom nav draws over this panel, so the last lines
            of a long topic need room to clear it. */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 16px 96px" : "18px 20px 28px",
          fontFamily: "'Hanken Grotesk',system-ui,sans-serif" }}>
          {!topic ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TOPICS.map(t => (
                <button key={t.key} onClick={() => setOpenKey(t.key)}
                  style={{
                    textAlign: "left", background: theme.card, border: `1px solid ${theme.line}`,
                    borderRadius: 14, padding: "13px 15px", cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: theme.ink }}>{t.title}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: theme.mut, marginTop: 2, lineHeight: 1.45 }}>
                      {t.blurb}
                    </span>
                  </span>
                  <span style={{ color: theme.mut, fontSize: 18, flexShrink: 0 }}>›</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, color: theme.ink2, lineHeight: 1.6 }}>{topic.blurb}</div>

              <div style={{ marginTop: 18 }}>
                {topic.steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 11, marginBottom: 13 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 7, background: theme.tintGreen,
                      color: theme.onGreen, fontSize: 11.5, fontWeight: 800, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                    <div style={{ fontSize: 13.5, color: theme.ink, lineHeight: 1.6 }}>{s}</div>
                  </div>
                ))}
              </div>

              {topic.notes?.length > 0 && (
                <div style={{ background: theme.card, border: `1px solid ${theme.line}`, borderRadius: 14,
                  padding: "13px 15px", marginTop: 6 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", color: theme.onGreen,
                    textTransform: "uppercase", marginBottom: 9 }}>Worth knowing</div>
                  {topic.notes.map((n, i) => (
                    <div key={i} style={{ display: "flex", gap: 9, marginTop: i ? 9 : 0 }}>
                      <span style={{ color: theme.mut, flexShrink: 0 }}>·</span>
                      <span style={{ fontSize: 13, color: theme.ink2, lineHeight: 1.55 }}>{n}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
