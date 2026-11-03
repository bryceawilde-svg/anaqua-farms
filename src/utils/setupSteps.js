// The first-run checklist, derived from real row counts so a step can never read
// "done" while the library behind it is empty. `go` is a target the app shell
// maps onto a view (see goToSetupStep).
//
// Lives apart from Onboarding.jsx so that file only exports components and keeps
// fast refresh working.

// counts: { fields, chemicals, equipment, licensed, tickets }
export function buildSetupSteps(counts) {
  return [
    { key: "fields",    label: "Add your fields",             done: counts.fields > 0,
      hint: "Import a shapefile or CSV, or add them by hand.",    go: "fieldMgr" },
    { key: "chemicals", label: "Build your chemical library",  done: counts.chemicals > 0,
      hint: "Each product off its label — name, EPA #, REI.",     go: "chemMgr" },
    { key: "equipment", label: "Add a sprayer",                done: counts.equipment > 0,
      hint: "The machine a ticket is run with.",                  go: "equipMgr" },
    { key: "licensed",  label: "Add a licensed applicator",    done: counts.licensed > 0,
      hint: "Name and license number, as printed.",               go: "people" },
    { key: "ticket",    label: "Write your first ticket",      done: counts.tickets > 0,
      hint: "Pick fields and chemicals; BoomLog does the math.",  go: "newTicket" },
  ];
}
