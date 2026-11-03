import { useState } from "react";
import { DEFAULT_THEME } from "./utils/theme";

// First-run setup. Two pieces that work together:
//
//   SetupWizard   — a short, skippable run through the org-level settings that are
//                   painful to change later (location, units, crops) plus the first
//                   sprayer and first licensed applicator. Purely local state: it
//                   hands everything back through onComplete and App does the saving.
//   GetStartedCard — the checklist that outlives the wizard. Its steps are derived
//                   from real row counts, so it ticks itself off as the libraries
//                   fill up and can't drift out of sync with the data.
//
// Deliberately NOT here: any suggested chemical, EPA number or REI. Those are read
// off the product label onto a filed TDA record — the app never guesses them.

// ── shared bits ───────────────────────────────────────────────────────────────

const field = (theme) => ({
  width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 11,
  border: `1.5px solid ${theme.inputLine}`, background: theme.input, color: theme.ink,
  fontSize: 15, fontFamily: "inherit", outline: "none",
});

const label = (theme) => ({
  fontSize: 12.5, fontWeight: 800, color: theme.ink2, letterSpacing: "0.03em",
  display: "block", marginBottom: 6,
});

const hint = (theme) => ({ fontSize: 12.5, color: theme.mut, lineHeight: 1.55, marginTop: 6 });

function PrimaryBtn({ theme, children, disabled, onClick, style }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: "13px 22px", borderRadius: 12, border: "none", cursor: disabled ? "default" : "pointer",
        background: disabled ? theme.fill : theme.green, color: disabled ? theme.mut : "#fff",
        fontSize: 15, fontWeight: 800, fontFamily: "inherit", ...style,
      }}>
      {children}
    </button>
  );
}

function GhostBtn({ theme, children, onClick, style }) {
  return (
    <button onClick={onClick}
      style={{
        padding: "13px 18px", borderRadius: 12, border: "none", background: "none",
        color: theme.mut, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", ...style,
      }}>
      {children}
    </button>
  );
}

// ── the wizard ────────────────────────────────────────────────────────────────

const STEPS = ["Welcome", "Farm", "Crops", "Crew", "Done"];

export function SetupWizard({
  theme = DEFAULT_THEME,
  isMobile = false,
  orgName = "",
  cropOptions = [],
  initial = {},
  onComplete,
  onSkip,
}) {
  const [step, setStep] = useState(0);

  const [zip, setZip]             = useState(initial.farmZip || "");
  const [located, setLocated]     = useState(null);   // { lat, lng, label }
  const [locating, setLocating]   = useState(false);
  const [locError, setLocError]   = useState("");

  const [units, setUnits]         = useState(initial.unitSystem || "imperial");
  const [crops, setCrops]         = useState(initial.crops || []);
  const [cropInput, setCropInput] = useState("");

  const [equipName, setEquipName] = useState("");
  const [equipAph,  setEquipAph]  = useState("75");
  const [licName,   setLicName]   = useState("");
  const [licNumber, setLicNumber] = useState("");

  const [saving, setSaving]       = useState(false);

  const lookUp = async () => {
    const q = zip.trim();
    if (!q) return;
    setLocating(true); setLocError("");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      if (!res.ok) throw new Error("lookup failed");
      const data = await res.json();
      if (!data.length) { setLocError("Couldn't find that. Try a nearby town or a postal code."); return; }
      setLocated({
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        label: data[0].display_name.split(",").slice(0, 3).join(",").trim(),
      });
    } catch {
      setLocError("Couldn't reach the lookup service. You can set this later in Account.");
    } finally {
      setLocating(false);
    }
  };

  const toggleCrop = (c) =>
    setCrops(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const addTypedCrop = () => {
    const c = cropInput.trim();
    if (c && !crops.includes(c)) setCrops(prev => [...prev, c]);
    setCropInput("");
  };

  const finish = async (dest) => {
    setSaving(true);
    await onComplete({
      farmZip:  located ? zip.trim() : "",
      farmLat:  located?.lat ?? null,
      farmLng:  located?.lng ?? null,
      unitSystem: units,
      crops,
      equipment: equipName.trim()
        ? { name: equipName.trim(), acresPerHour: parseFloat(equipAph) || 75 }
        : null,
      licensed: licName.trim()
        ? { name: licName.trim(), license: licNumber.trim() }
        : null,
      destination: dest,
    });
    setSaving(false);
  };

  const page = { minHeight: "100vh", background: theme.canvas, color: theme.ink,
    fontFamily: "'Hanken Grotesk',system-ui,sans-serif", display: "flex", flexDirection: "column" };

  const body = { flex: 1, width: "100%", maxWidth: 560, margin: "0 auto", boxSizing: "border-box",
    padding: isMobile ? "22px 18px 28px" : "40px 28px 44px" };

  const h1 = { fontSize: isMobile ? 24 : 29, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2 };
  const sub = { fontSize: 14.5, color: theme.ink2, lineHeight: 1.6, marginTop: 10 };
  const cardT = { background: theme.card, border: `1px solid ${theme.line}`, borderRadius: 16,
    padding: isMobile ? "15px 15px" : "18px 20px", marginTop: 18 };

  const footer = (primaryLabel, primaryAction, { disabled = false, back = true, skip = false } = {}) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 26, flexWrap: "wrap" }}>
      <PrimaryBtn theme={theme} onClick={primaryAction} disabled={disabled || saving}
        style={isMobile ? { flex: 1, minWidth: 160 } : undefined}>
        {saving ? "Saving…" : primaryLabel}
      </PrimaryBtn>
      {back && step > 0 && (
        <GhostBtn theme={theme} onClick={() => setStep(s => s - 1)}>Back</GhostBtn>
      )}
      {skip && (
        <GhostBtn theme={theme} onClick={() => setStep(s => s + 1)} style={{ marginLeft: "auto" }}>
          Skip this
        </GhostBtn>
      )}
    </div>
  );

  return (
    <div style={page}>
      {/* progress rail */}
      <div style={{ background: theme.header, color: "#fff",
        padding: isMobile ? "calc(16px + env(safe-area-inset-top)) 18px 16px" : "20px 28px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.04em" }}>
              SETTING UP {orgName ? orgName.toUpperCase() : "YOUR FARM"}
            </div>
            <div style={{ fontSize: 12, color: theme.headerSub, fontWeight: 700 }}>
              {step + 1} of {STEPS.length}
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 11 }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{ flex: 1, height: 4, borderRadius: 2,
                background: i <= step ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.22)" }} />
            ))}
          </div>
        </div>
      </div>

      <div style={body}>
        {step === 0 && (
          <>
            <div style={h1}>Let's get your records going.</div>
            <div style={sub}>
              BoomLog keeps a spray record for every field you treat — what went on, who applied it,
              and when the field is safe to re-enter. This takes about five minutes, and you can
              change any of it later.
            </div>
            <div style={cardT}>
              {[
                ["Plan a ticket", "Pick fields and chemicals; BoomLog works out loads, tank mix and timing."],
                ["Send it to the cab", "The applicator sprays from their phone and marks fields done as they go."],
                ["Keep the record", "Every finished ticket becomes a filed application record you can export."],
              ].map(([t, d], i) => (
                <div key={t} style={{ display: "flex", gap: 12, marginBottom: i < 2 ? 14 : 0 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 8, background: theme.tintGreen,
                    color: theme.onGreen, fontSize: 12, fontWeight: 800, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: 700 }}>{t}</div>
                    <div style={{ fontSize: 13, color: theme.mut, lineHeight: 1.5, marginTop: 2 }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 26, flexWrap: "wrap" }}>
              <PrimaryBtn theme={theme} onClick={() => setStep(1)}
                style={isMobile ? { flex: 1, minWidth: 160 } : undefined}>
                Set up my farm
              </PrimaryBtn>
              <GhostBtn theme={theme} onClick={onSkip} style={{ marginLeft: "auto" }}>
                I'll do this later
              </GhostBtn>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div style={h1}>Where do you farm?</div>
            <div style={sub}>
              BoomLog uses this to pull wind and temperature onto a ticket, so you're not
              typing the weather in by hand. A nearby town or a postal code is close enough.
            </div>
            <div style={cardT}>
              <label style={label(theme)} htmlFor="wiz-loc">Town or postal code</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input id="wiz-loc" value={zip}
                  onChange={e => { setZip(e.target.value); setLocated(null); setLocError(""); }}
                  onKeyDown={e => e.key === "Enter" && lookUp()}
                  placeholder="e.g. Lyford, TX" style={{ ...field(theme), flex: 1 }} />
                <PrimaryBtn theme={theme} onClick={lookUp} disabled={!zip.trim() || locating}
                  style={{ padding: "11px 18px", fontSize: 14 }}>
                  {locating ? "…" : "Find"}
                </PrimaryBtn>
              </div>
              {located && (
                <div style={{ ...hint(theme), color: theme.onGreen, fontWeight: 700 }}>
                  ✓ {located.label}
                </div>
              )}
              {locError && <div style={{ ...hint(theme), color: theme.red }}>{locError}</div>}
            </div>

            <div style={cardT}>
              <label style={label(theme)}>Units</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[["imperial", "Acres, gallons, °F"], ["metric", "Hectares, litres, °C"]].map(([val, desc]) => {
                  const on = units === val;
                  return (
                    <button key={val} onClick={() => setUnits(val)}
                      style={{
                        flex: 1, padding: "12px 10px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                        border: `1.5px solid ${on ? theme.green : theme.line}`,
                        background: on ? theme.tintGreen : theme.card,
                        color: on ? theme.onGreen : theme.ink2, textAlign: "left",
                      }}>
                      <div style={{ fontSize: 14, fontWeight: 800, textTransform: "capitalize" }}>{val}</div>
                      <div style={{ fontSize: 12, marginTop: 2, color: on ? theme.onGreen : theme.mut }}>{desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            {footer("Continue", () => setStep(2))}
          </>
        )}

        {step === 2 && (
          <>
            <div style={h1}>What do you grow?</div>
            <div style={sub}>
              This narrows the crop list when you add a field or write a ticket. Pick the ones you
              plant — you can add more any time.
            </div>
            <div style={cardT}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {/* The common crops, plus anything already selected that falls
                    outside them — otherwise a chosen crop would be invisible here. */}
                {[...new Set([...cropOptions.slice(0, 28), ...crops])].map(c => {
                  const on = crops.includes(c);
                  return (
                    <button key={c} onClick={() => toggleCrop(c)}
                      style={{
                        padding: "7px 13px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                        fontSize: 13, fontWeight: 700,
                        border: `1.5px solid ${on ? theme.green : theme.line}`,
                        background: on ? theme.green : theme.card,
                        color: on ? "#fff" : theme.ink2,
                      }}>
                      {c}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <input value={cropInput} onChange={e => setCropInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addTypedCrop()}
                  placeholder="Something else? Type it here"
                  style={{ ...field(theme), flex: 1 }} />
                <PrimaryBtn theme={theme} onClick={addTypedCrop} disabled={!cropInput.trim()}
                  style={{ padding: "11px 18px", fontSize: 14 }}>Add</PrimaryBtn>
              </div>
              {crops.length > 0 && (
                <div style={hint(theme)}>{crops.length} selected · {crops.join(", ")}</div>
              )}
            </div>
            {footer("Continue", () => setStep(3), { skip: true })}
          </>
        )}

        {step === 3 && (
          <>
            <div style={h1}>Your sprayer and applicator</div>
            <div style={sub}>
              Every ticket names the machine and the licensed applicator. Add the ones you use most —
              the rest can go in later under Equipment and People.
            </div>

            <div style={cardT}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
                color: theme.onGreen, textTransform: "uppercase", marginBottom: 11 }}>Sprayer</div>
              <label style={label(theme)} htmlFor="wiz-eq">Name</label>
              <input id="wiz-eq" value={equipName} onChange={e => setEquipName(e.target.value)}
                placeholder="e.g. John Deere 4440" style={field(theme)} />
              <div style={{ marginTop: 12 }}>
                <label style={label(theme)} htmlFor="wiz-aph">Acres covered per hour</label>
                <input id="wiz-aph" type="number" min="1" value={equipAph}
                  onChange={e => setEquipAph(e.target.value)} style={field(theme)} />
                <div style={hint(theme)}>Used to lay out start and finish times for each field on a ticket.</div>
              </div>
            </div>

            <div style={cardT}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
                color: theme.onGreen, textTransform: "uppercase", marginBottom: 11 }}>Licensed applicator</div>
              <label style={label(theme)} htmlFor="wiz-lic">Name</label>
              <input id="wiz-lic" value={licName} onChange={e => setLicName(e.target.value)}
                placeholder="e.g. Sam Ortega" style={field(theme)} />
              <div style={{ marginTop: 12 }}>
                <label style={label(theme)} htmlFor="wiz-licno">License number</label>
                <input id="wiz-licno" value={licNumber} onChange={e => setLicNumber(e.target.value)}
                  placeholder="As printed on the license" style={field(theme)} />
                <div style={hint(theme)}>
                  Copy this off the license itself. It prints on every application record you file.
                </div>
              </div>
            </div>
            {footer("Continue", () => setStep(4), { skip: true })}
          </>
        )}

        {step === 4 && (
          <>
            <div style={h1}>Next: your fields and chemicals</div>
            <div style={sub}>
              These two libraries are what a ticket is built from, so they're worth doing first.
              Fields can come straight off a boundary file — you don't have to type them.
            </div>
            <div style={cardT}>
              {[
                ["Fields", "Import a shapefile (.zip) or a CSV from your records, or drop pins on a map. Acres come across with the boundaries."],
                ["Chemicals", "Add each product off its label — name, EPA number, REI, formulation. You can fill a spreadsheet instead and import it in one go."],
              ].map(([t, d], i) => (
                <div key={t} style={{ marginBottom: i === 0 ? 14 : 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{t}</div>
                  <div style={{ fontSize: 13, color: theme.mut, lineHeight: 1.55, marginTop: 3 }}>{d}</div>
                </div>
              ))}
            </div>
            <div style={{ ...hint(theme), marginTop: 16 }}>
              The Get Started checklist on your Tickets screen tracks what's left.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
              <PrimaryBtn theme={theme} onClick={() => finish("fields")} disabled={saving}
                style={isMobile ? { flex: 1, minWidth: 160 } : undefined}>
                {saving ? "Saving…" : "Add my fields"}
              </PrimaryBtn>
              <GhostBtn theme={theme} onClick={() => finish("log")}>Go to Tickets</GhostBtn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── the checklist ─────────────────────────────────────────────────────────────

// An empty library, with the ways out of it. `actions` are the real paths a user
// has on that screen — import something, or add one by hand — so the dead end
// becomes the next step instead of a sentence saying there's nothing here.
export function EmptyLibrary({ theme = DEFAULT_THEME, isMobile = false, title, blurb, actions = [] }) {
  return (
    <div style={{
      border: `1.5px dashed ${theme.dash}`, borderRadius: 16, background: theme.card,
      padding: isMobile ? "22px 16px" : "32px 28px", textAlign: "center", gridColumn: "1 / -1",
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: theme.ink }}>{title}</div>
      <div style={{ fontSize: 13.5, color: theme.mut, lineHeight: 1.6, marginTop: 6,
        maxWidth: 420, marginInline: "auto" }}>{blurb}</div>
      {actions.length > 0 && (
        <div style={{
          display: isMobile ? "flex" : "grid", flexDirection: "column",
          gridTemplateColumns: `repeat(${Math.min(actions.length, 2)}, minmax(0,1fr))`,
          gap: 9, marginTop: 18, maxWidth: 520, marginInline: "auto", textAlign: "left",
        }}>
          {actions.map(a => (
            <button key={a.label} onClick={a.onClick}
              style={{
                padding: "12px 14px", borderRadius: 13, cursor: "pointer", fontFamily: "inherit",
                border: a.primary ? "none" : `1.5px solid ${theme.line}`,
                background: a.primary ? theme.green : theme.card,
                color: a.primary ? "#fff" : theme.ink,
              }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{a.label}</div>
              {a.desc && (
                <div style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45,
                  color: a.primary ? "rgba(255,255,255,0.85)" : theme.mut }}>{a.desc}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GetStartedCard({ theme = DEFAULT_THEME, isMobile = false, steps, onGo, onDismiss }) {
  const doneCount = steps.filter(s => s.done).length;
  const next = steps.find(s => !s.done);

  return (
    <div style={{
      background: theme.card, border: `1.5px solid ${theme.line}`, borderRadius: 16,
      padding: isMobile ? "14px 14px 10px" : "18px 20px 14px", marginBottom: isMobile ? 14 : 18,
      boxShadow: "0 6px 18px -9px rgba(20,40,26,0.16)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: theme.ink }}>Get started</div>
          <div style={{ fontSize: 12.5, color: theme.mut, marginTop: 2 }}>
            {doneCount} of {steps.length} done
            {next ? ` · next up: ${next.label.toLowerCase()}` : ""}
          </div>
        </div>
        <button onClick={onDismiss} aria-label="Hide the get started checklist"
          style={{ background: "none", border: "none", color: theme.mut, fontSize: 20, lineHeight: 1,
            cursor: "pointer", padding: "0 2px", fontFamily: "inherit" }}>×</button>
      </div>

      <div style={{ display: "flex", gap: 4, margin: "12px 0 4px" }}>
        {steps.map(s => (
          <div key={s.key} style={{ flex: 1, height: 4, borderRadius: 2,
            background: s.done ? theme.green : theme.fill }} />
        ))}
      </div>

      <div>
        {steps.map(s => (
          <button key={s.key} onClick={() => !s.done && onGo(s.go)} disabled={s.done}
            style={{
              display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left",
              background: "none", border: "none", borderTop: `1px solid ${theme.divider}`,
              padding: isMobile ? "11px 2px" : "12px 2px", cursor: s.done ? "default" : "pointer",
              fontFamily: "inherit",
            }}>
            <span style={{
              width: 21, height: 21, borderRadius: 7, flexShrink: 0, fontSize: 12, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: s.done ? theme.green : theme.fill,
              color: s.done ? "#fff" : theme.mut,
              border: s.done ? "none" : `1.5px solid ${theme.dash}`,
            }}>{s.done ? "✓" : ""}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 700,
                color: s.done ? theme.mut : theme.ink,
                textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
              {!s.done && (
                <span style={{ display: "block", fontSize: 12, color: theme.mut, marginTop: 1 }}>{s.hint}</span>
              )}
            </span>
            {!s.done && (
              <span style={{ fontSize: 12.5, fontWeight: 800, color: theme.onGreen, flexShrink: 0 }}>Go →</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
