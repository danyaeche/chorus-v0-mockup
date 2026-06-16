// model.js — the canonical worked-example data model (read-only seed).
//
// THE RULE: a Part is a reusable *design* that lives at the workspace level.
// A Project *references* parts. The DFM process — Package gate, Revisions,
// per-provider DFMs, Issues, Sign-offs, DFM Approval, Part State — is NOT a
// property of the Part; it belongs to the (Part × Project) membership.
// So the same part design can be in several projects, each running its own
// independent DFM process (different package state, providers, issues, approval).
//
//   Workspace
//   ├── Part  (design · reusable)          number · name · geometry · material · process
//   └── Project
//        └── Membership = Part-in-Project   ← the DFM PROCESS lives here, one per (part, project)
//             ├── Package (gate) · Revisions · DFMs (per provider) · Issue Groups
//             └── Sign-offs · DFM Approval · Part State
//
window.ChorusModel = (function () {

  // ---- Parts library (workspace-level designs) -------------------------------
  var PARTS = [
    { number: 'TM-4-2001', name: 'Battery enclosure — lower', shape: 'enclosure', material: 'PC-ABS', process: 'Injection Mold' },
    { number: 'TM-4-2002', name: 'Battery enclosure — upper', shape: 'enclosure', material: 'PC-ABS', process: 'Injection Mold' },
    { number: 'TM-4-2003', name: 'Display bezel',             shape: 'bezel',     material: 'PC',     process: 'Injection Mold' },
    { number: 'TM-4-2004', name: 'Controller housing',        shape: 'housing',   material: 'PC-ABS', process: 'Injection Mold' },
    { number: 'TM-4-2005', name: 'Charge-port cap',           shape: 'cap',       material: 'TPU',    process: 'Injection Mold' },
    { number: 'TM-4-2006', name: 'Light lens',                shape: 'lens',      material: 'PMMA',   process: 'Injection Mold' },
    { number: 'CE-2001',   name: 'Mainframe enclosure',       shape: 'frame',     material: 'ADC12',  process: 'Die Cast' },
    { number: 'CE-2002',   name: 'Battery tray',              shape: 'tray',      material: 'PP',     process: 'Injection Mold' }
  ];

  // ---- Projects --------------------------------------------------------------
  var PROJECTS = [
    { name: 'TM-4 Bike Program', product: 'TM-4 urban e-bike',            partner: 'Hsinchu Precision',   status: 'Active' },
    { name: 'Cargo eBike',       product: 'Cargo platform',               partner: 'Taichung MetalWorks', status: 'Active' },
    { name: 'Helmet HUD',        product: 'Smart-helmet display housing', partner: 'Shenzhen Optics',     status: 'DFM complete' }
  ];

  // ---- Memberships: one per (part, project) = an independent DFM process ------
  // `badge`/`badgeClass` drive the status pill; `open` is the issue summary.
  // For the worked-example hero (TM-4-2001) the membership also carries the full
  // per-provider DFM detail (providers + issues + sign-offs + approval) that
  // part-detail renders and swaps when you switch project.
  var MEMBERSHIPS = [

    // ===== SHARED PART · Battery enclosure — lower, in TWO programs =====
    {
      part: 'TM-4-2001', project: 'TM-4 Bike Program', volume: '50,000 / yr',
      badge: 'DFM Active', badgeClass: 'badge--blue', open: '2 open',
      partState: 'DFM Active', stateClass: 'badge--blue',
      packageRev: 'Rev C', packageState: 'Complete',
      ctx: '2 open · 1 awaiting', allCount: 7,
      signoffs: '3 of 4 signed · gate awaiting counter-sign',
      approval: 'Pending — 2 issues open, 1 sign-off unsigned',
      providers: [
        {
          name: 'Hsinchu Precision', role: 'CM', rev: 'Rev C', dfmState: 'DFM Active', stateClass: 'badge--blue', open: '2 open',
          email: 'benjamin.chen@hsinchu-precision.com', logo: 'HP', logoBg: '',
          issues: [
            { no: '#14', title: 'Ejector pins mark Class A face',   st: 'Open',                sc: 'open',   sev: 'Medium', sv: 'med',  cat: 'Process',  meta: 'Benjamin Chen · Rev C' },
            { no: '#13', title: 'Rib-to-wall ratio causes sink',    st: 'Open',                sc: 'open',   sev: 'Low',    sv: 'low',  cat: 'Geometry', meta: 'Benjamin Chen · Rev C' },
            { no: '#12', title: 'Insufficient draft for ejection',  st: 'Awaiting validation', sc: 'await',  sev: 'High',   sv: 'high', cat: 'Tooling',  meta: 'accepted · fixed in Rev C' },
            { no: '#7',  title: 'Gate witness on cosmetic face',    st: 'Closed',              sc: 'closed', sev: 'Medium', sv: 'med',  cat: 'Tooling',  meta: 'validated · Rev B', closed: true }
          ]
        },
        {
          name: 'Shenzhen Optics', role: 'Supplier', rev: 'Rev B', dfmState: 'Awaiting validation', stateClass: 'badge--amber', open: '1 open',
          email: 'sora@shenzhen-optics.com', logo: 'SO', logoBg: '#2f73c4',
          issues: [
            { no: '#21', title: 'AR coating adhesion risk on lens face', st: 'Open',                sc: 'open',   sev: 'Medium', sv: 'med',  cat: 'Process',  meta: 'Sora Tanaka · Rev B' },
            { no: '#18', title: 'Lens edge chips on demold',             st: 'Awaiting validation', sc: 'await',  sev: 'High',   sv: 'high', cat: 'Tooling',  meta: 'accepted · fixed in Rev B' },
            { no: '#9',  title: 'Bezel flatness out of spec',            st: 'Closed',              sc: 'closed', sev: 'Medium', sv: 'med',  cat: 'Geometry', meta: 'validated · Rev A', closed: true }
          ]
        }
      ]
    },
    {
      part: 'TM-4-2001', project: 'Cargo eBike', volume: '75,000 / yr',
      badge: 'DFM Active', badgeClass: 'badge--blue', open: '2 open',
      partState: 'DFM Active', stateClass: 'badge--blue',
      packageRev: 'Rev A', packageState: 'Complete',
      ctx: '2 open', allCount: 2,
      signoffs: '0 of 2 · parting line + material lock proposed',
      approval: 'Far — package just cleared, review underway',
      providers: [
        {
          name: 'Taichung MetalWorks', role: 'CM', rev: 'Rev A', dfmState: 'In Review', stateClass: 'badge--blue', open: '2 open',
          email: 'marco.liu@taichung-mw.com', logo: 'TM', logoBg: '#b7791f',
          issues: [
            { no: '#4', title: 'Wall section too thin for the larger Cargo pack', st: 'Open', sc: 'open', sev: 'High',   sv: 'high', cat: 'Geometry', meta: 'Marco Liu · Rev A' },
            { no: '#2', title: 'Mounting bosses need coring to avoid sink',       st: 'Open', sc: 'open', sev: 'Medium', sv: 'med',  cat: 'Geometry', meta: 'Marco Liu · Rev A' }
          ]
        }
      ]
    },

    // ===== SHARED PART · Charge-port cap, in TWO programs =====
    { part: 'TM-4-2005', project: 'TM-4 Bike Program', volume: '50,000 / yr', badge: 'DFM Approved', badgeClass: 'badge--green', open: '0 open', partState: 'DFM Approved', stateClass: 'badge--green', packageRev: 'Rev B', packageState: 'Complete' },
    { part: 'TM-4-2005', project: 'Cargo eBike',       volume: '75,000 / yr', badge: 'DFM Active',   badgeClass: 'badge--blue',  open: '1 open', partState: 'DFM Active',   stateClass: 'badge--blue',  packageRev: 'Rev A', packageState: 'Complete' },

    // ===== single-project parts =====
    { part: 'TM-4-2002', project: 'TM-4 Bike Program', volume: '50,000 / yr', badge: 'Awaiting validation', badgeClass: 'badge--amber', open: '1 open',     partState: 'Awaiting validation', stateClass: 'badge--amber' },
    { part: 'TM-4-2003', project: 'TM-4 Bike Program', volume: '50,000 / yr', badge: 'Needs DFM response',  badgeClass: 'badge--red',   open: '3 open',     partState: 'DFM Active',          stateClass: 'badge--blue' },
    { part: 'TM-4-2004', project: 'TM-4 Bike Program', volume: '50,000 / yr', badge: 'DFM Active',          badgeClass: 'badge--blue',  open: '1 critical', partState: 'DFM Active',          stateClass: 'badge--blue' },
    { part: 'TM-4-2006', project: 'TM-4 Bike Program', volume: '50,000 / yr', badge: 'DFM Approved',        badgeClass: 'badge--green', open: '0 open',     partState: 'DFM Approved',        stateClass: 'badge--green' },
    { part: 'CE-2001',   project: 'Cargo eBike',       volume: '40,000 / yr', badge: 'DFM Approved',        badgeClass: 'badge--green', open: '0 open',     partState: 'DFM Approved',        stateClass: 'badge--green' },
    { part: 'CE-2002',   project: 'Cargo eBike',       volume: '40,000 / yr', badge: 'DFM Active',          badgeClass: 'badge--blue',  open: '2 open',     partState: 'DFM Active',          stateClass: 'badge--blue' }
  ];

  function partByNumber(num) { return PARTS.filter(function (p) { return p.number === num; })[0] || null; }
  function membershipsForPart(num) { return MEMBERSHIPS.filter(function (m) { return m.part === num; }); }
  function projectsForPart(num) { return membershipsForPart(num).map(function (m) { return m.project; }); }
  function partsForProject(name) {
    return MEMBERSHIPS.filter(function (m) { return m.project === name; })
      .map(function (m) { return Object.assign({}, partByNumber(m.part), { membership: m }); });
  }
  function membership(num, project) { return MEMBERSHIPS.filter(function (m) { return m.part === num && m.project === project; })[0] || null; }
  function isShared(num) { return membershipsForPart(num).length > 1; }

  return {
    parts: function () { return PARTS.slice(); },
    projects: function () { return PROJECTS.slice(); },
    partByNumber: partByNumber,
    membershipsForPart: membershipsForPart,
    projectsForPart: projectsForPart,
    partsForProject: partsForProject,
    membership: membership,
    isShared: isShared
  };
})();
