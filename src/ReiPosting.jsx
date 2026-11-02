// Public REI posting — what a worker sees after scanning the QR at a field gate.
//
// Deliberately standalone: no supabase client, no auth, no app imports. The only
// thing it can reach is the rei-report function with the token from the URL, so a
// leaked posting link cannot be walked back into the rest of BoomLog.
//
// Re-entry verdicts are recomputed from the returned instants on every tick, so
// the page is live rather than a snapshot of whenever it was generated.

import { useEffect, useMemo, useState } from "react";

const FUNCTION_URL = "https://mlxaljozizaarvdcssew.supabase.co/functions/v1/rei-report";

const REFETCH_MS = 5 * 60 * 1000;
const TICK_MS    = 15 * 1000;

const C = {
  canvas: "#e4e9df", card: "#ffffff", line: "#dbe1d6",
  ink: "#16211b", ink2: "#54635a", mut: "#94a399",
  green: "#167a45", tintGreen: "#e8f3ec",
  red: "#b4452f", tintRed: "#fbece8",
  amber: "#b9810f", tintAmber: "#faf1da",
};

function fmtWhen(iso, tz) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz, month: "numeric", day: "numeric",
      hour: "numeric", minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function fmtDay(ymd, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || "");
  if (!m) return ymd || "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz, month: "numeric", day: "numeric", year: "2-digit",
    }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)));
  } catch {
    return ymd;
  }
}

function fmtRemaining(ms) {
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return m ? `${h} hr ${m} min` : `${h} hr`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d} day${d > 1 ? "s" : ""} ${rh} hr` : `${d} day${d > 1 ? "s" : ""}`;
}

export default function ReiPosting({ token }) {
  const [data,  setData]  = useState(null);
  const [error, setError] = useState(null);
  const [now,   setNow]   = useState(() => Date.now());
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    let alive = true;
    fetch(`${FUNCTION_URL}?t=${encodeURIComponent(token)}`, { cache: "no-store", signal: abort.signal })
      .then(res => res.json().catch(() => ({})).then(body => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (!ok) { setError(body.error || "This posting is unavailable."); return; }
        setData(body);
        setError(null);
      })
      .catch(() => {
        if (alive) setError("Could not reach the server. Check your signal and try again.");
      });
    return () => { alive = false; abort.abort(); };
  }, [token, reload]);

  useEffect(() => {
    if (data?.org?.name) document.title = `Field re-entry — ${data.org.name}`;
  }, [data]);

  // Re-evaluate the verdicts on a short tick, re-read the records on a long one, and
  // do both the moment a phone that was asleep in a pocket comes back to the page.
  useEffect(() => {
    const tick    = setInterval(() => setNow(Date.now()), TICK_MS);
    const refetch = setInterval(() => setReload(n => n + 1), REFETCH_MS);
    const onShow  = () => {
      if (document.hidden) return;
      setNow(Date.now());
      setReload(n => n + 1);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(tick); clearInterval(refetch); document.removeEventListener("visibilitychange", onShow); };
  }, []);

  const tz = data?.org?.timezone || "UTC";

  // A field is restricted while any outstanding re-entry instant is in the future.
  // An unreadable REI never reads as safe — it is called out for a human to settle.
  const { restricted, unknown, safe } = useMemo(() => {
    const out = { restricted: [], unknown: [], safe: [] };
    for (const f of data?.fields ?? []) {
      const until = f.restrictedUntil ? new Date(f.restrictedUntil).getTime() : null;
      if (until && until > now) out.restricted.push({ ...f, until });
      else if (f.unknown)       out.unknown.push(f);
      else                      out.safe.push(f);
    }
    out.restricted.sort((a, b) => b.until - a.until);
    return out;
  }, [data, now]);

  if (error) {
    return (
      <Shell>
        <div style={{ ...card, borderColor: C.red, background: C.tintRed, textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.red, marginBottom: 6 }}>Posting unavailable</div>
          <div style={{ fontSize: 14, color: C.ink2 }}>{error}</div>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return <Shell><div style={{ ...card, textAlign: "center", color: C.mut, fontSize: 14 }}>Loading field status…</div></Shell>;
  }

  return (
    <Shell>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: C.green, textTransform: "uppercase" }}>
          Field re-entry status
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, lineHeight: 1.2, marginTop: 2 }}>
          {data.org.name}
        </div>
        <div style={{ fontSize: 12.5, color: C.mut, marginTop: 4 }}>
          Live as of {fmtWhen(new Date(now).toISOString(), tz)} · last {data.windowDays} days
        </div>
      </div>

      {!data.org.timezoneSet && (
        <Banner tone="amber">
          This farm has not set its time zone, so re-entry times are shown in UTC and may be
          hours off. Ask the office to set it in BoomLog before relying on this posting.
        </Banner>
      )}

      {restricted.length === 0 && unknown.length === 0 && (
        <div style={{ ...card, borderColor: C.green, background: C.tintGreen, textAlign: "center", padding: "22px 16px" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.green }}>No fields are restricted</div>
          <div style={{ fontSize: 13.5, color: C.ink2, marginTop: 5 }}>
            Every re-entry interval from the last {data.windowDays} days has passed.
          </div>
        </div>
      )}

      {restricted.length > 0 && (
        <Section title={`Do not enter — ${restricted.length} field${restricted.length > 1 ? "s" : ""}`} tone="red">
          {restricted.map(f => (
            <div key={f.field} style={{ ...row, borderLeft: `5px solid ${C.red}`, background: C.tintRed }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16.5, fontWeight: 800, color: C.ink, wordBreak: "break-word" }}>{f.field}</div>
                <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 2 }}>
                  Safe to enter {fmtWhen(f.restrictedUntil, tz)}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.red, whiteSpace: "nowrap" }}>
                  {fmtRemaining(f.until - now)}
                </div>
                <div style={{ fontSize: 11, color: C.mut, fontWeight: 700 }}>remaining</div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {unknown.length > 0 && (
        <Section title={`Treat as restricted — ${unknown.length} field${unknown.length > 1 ? "s" : ""}`} tone="amber">
          <div style={{ fontSize: 12.5, color: C.ink2, marginBottom: 8 }}>
            A product applied here has no readable re-entry interval on record. Do not enter
            without checking the product label with the office.
          </div>
          {unknown.map(f => (
            <div key={f.field} style={{ ...row, borderLeft: `5px solid ${C.amber}`, background: C.tintAmber }}>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: C.ink, wordBreak: "break-word" }}>{f.field}</div>
              <div style={{ fontSize: 12, color: C.ink2, flexShrink: 0, marginLeft: 10 }}>
                last applied {fmtDay(f.lastApplied, tz)}
              </div>
            </div>
          ))}
        </Section>
      )}

      {safe.length > 0 && (
        <Section title={`Clear to enter — ${safe.length} field${safe.length > 1 ? "s" : ""}`} tone="green">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {safe.map(f => (
              <span key={f.field} style={{
                background: C.tintGreen, color: "#0f5c33", borderRadius: 9,
                padding: "5px 10px", fontSize: 13.5, fontWeight: 700,
              }}>{f.field}</span>
            ))}
          </div>
        </Section>
      )}

      <ApplicationLog applications={data.applications} windowDays={data.windowDays} tz={tz} />

      <div style={{ fontSize: 11.5, color: C.mut, lineHeight: 1.5, marginTop: 18, paddingBottom: 24 }}>
        Re-entry times are the minimum interval stated on each product label, measured from the
        end of application. Where a tank mix was applied, the longest interval governs the field.
        This posting shows applications recorded in BoomLog for the last {data.windowDays} days and
        is not a substitute for the product label.
      </div>
    </Shell>
  );
}

function ApplicationLog({ applications, windowDays, tz }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: 16 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 12,
        padding: "13px 15px", fontSize: 14, fontWeight: 700, color: C.ink,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        cursor: "pointer", fontFamily: "inherit",
      }}>
        <span>Applications, last {windowDays} days</span>
        <span style={{ color: C.mut, fontWeight: 600, fontSize: 12.5 }}>
          {applications.length} {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {applications.length === 0 && (
            <div style={{ ...card, color: C.mut, fontSize: 13.5, textAlign: "center" }}>
              No applications on record for this period.
            </div>
          )}
          {applications.map((a, i) => (
            <div key={i} style={{ ...card, padding: "11px 13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: C.ink }}>{a.field}</div>
                <div style={{ fontSize: 12.5, color: C.ink2, whiteSpace: "nowrap" }}>
                  {fmtDay(a.date, tz)}{a.end ? ` · ended ${a.end}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 13.5, color: C.ink, marginTop: 5, fontWeight: 600 }}>{a.product}</div>
              {a.activeIngredient && (
                <div style={{ fontSize: 12, color: C.ink2, marginTop: 1 }}>{a.activeIngredient}</div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 12px", marginTop: 6, fontSize: 12, color: C.ink2 }}>
                {a.epa  && <span>EPA {a.epa}</span>}
                {a.rate && <span>{a.rate}</span>}
                {a.acres != null && <span>{a.acres} ac</span>}
                {a.crop && <span>{a.crop}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 7, flexWrap: "wrap" }}>
                <span style={{
                  background: a.reiKnown ? C.tintGreen : C.tintAmber,
                  color: a.reiKnown ? "#0f5c33" : C.amber,
                  borderRadius: 7, padding: "3px 8px", fontSize: 12, fontWeight: 800,
                }}>
                  REI {a.reiKnown ? a.rei : (a.rei || "not recorded")}
                </span>
                {a.restrictedUntil && (
                  <span style={{ fontSize: 12, color: C.ink2 }}>
                    re-entry {fmtWhen(a.restrictedUntil, tz)}
                  </span>
                )}
                {a.estimated && (
                  <span style={{ fontSize: 11.5, color: C.amber, fontWeight: 700 }}>
                    scheduled time — finish not logged
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const card = {
  background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: "15px 16px",
};

const row = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  borderRadius: 11, padding: "12px 13px", marginBottom: 7,
};

function Section({ title, tone, children }) {
  const color = tone === "red" ? C.red : tone === "amber" ? C.amber : C.green;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Banner({ tone, children }) {
  const color = tone === "amber" ? C.amber : C.red;
  const bg    = tone === "amber" ? C.tintAmber : C.tintRed;
  return (
    <div style={{
      background: bg, border: `1.5px solid ${color}`, borderRadius: 12,
      padding: "11px 13px", fontSize: 12.5, color: C.ink2, lineHeight: 1.45, marginBottom: 14,
    }}>{children}</div>
  );
}

function Shell({ children }) {
  return (
    <div style={{
      minHeight: "100vh", background: C.canvas, padding: "18px 16px 0",
      fontFamily: "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      WebkitTextSizeAdjust: "100%",
    }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>{children}</div>
    </div>
  );
}
