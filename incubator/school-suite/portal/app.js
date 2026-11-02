/* SchoolSuite: dependency-free, synthetic-only UX preview. Not an auth gate. */
(function () {
  "use strict";
  const tenants = window.SCHOOL_SUITE_TENANTS;
  if (!tenants) throw new Error("Missing tenant fixtures");
  const permissions = {
    principal: ["Overview", "Students", "Attendance", "Academics", "Fees", "Reports", "Settings"],
    admin: ["Overview", "Students", "Admissions", "Attendance", "Academics", "Fees", "Staff", "Reports", "Settings"],
    teacher: ["Overview", "Students", "Attendance", "Academics", "Reports"],
    bursar: ["Overview", "Fees", "Reports"],
    parent: ["Overview", "Attendance", "Academics", "Fees"]
  };
  const state = { tenant: "evolve", role: "principal", page: "Overview", query: "" };
  const $ = (id) => document.getElementById(id);
  const escape = (v) => String(v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
  const formatMoney = (value) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
  const icon = (name) => ({
    Overview: "▦", Students: "♙", Admissions: "⊕", Attendance: "✓",
    Academics: "▤", Fees: "₦", Staff: "♧", Reports: "▥", Settings: "⚙"
  })[name] || "·";
  const tenant = () => tenants[state.tenant];
  function setPage(page) {
    if (!permissions[state.role].includes(page)) return;
    state.page = page;
    state.query = "";
    render();
    $("content").focus({ preventScroll: true });
    closeMenu();
  }
  function closeMenu() {
    $("sidebar").classList.remove("open");
    $("backdrop").hidden = true;
    $("openMenu").setAttribute("aria-expanded", "false");
  }
  function renderNav() {
    const nav = $("mainNav");
    nav.replaceChildren();
    permissions[state.role].forEach((page) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nav-item" + (state.page === page ? " active" : "");
      button.setAttribute("aria-current", state.page === page ? "page" : "false");
      button.innerHTML = '<span class="nav-icon" aria-hidden="true">' + icon(page) + "</span><span>" + page + "</span>";
      button.addEventListener("click", () => setPage(page));
      nav.appendChild(button);
    });
  }
  function statCard(label, value, detail, glyph) {
    return '<article class="stat-card"><div class="stat-top"><span>' + escape(label) + '</span><span class="stat-icon" aria-hidden="true">' + glyph + '</span></div><strong>' + escape(value) + '</strong><small>' + escape(detail) + '</small></article>';
  }
  function sectionHead(title, caption) {
    return '<div class="section-heading"><div><h2>' + escape(title) + '</h2><p>' + escape(caption) + '</p></div></div>';
  }
  function paymentRows() {
    return tenant().payments.map((item) =>
      '<tr><td><strong>' + escape(item.name) + '</strong><small>' + escape(item.ref) +
      '</small></td><td>' + escape(formatMoney(item.amount)) + '</td><td><span class="pill ' +
      (item.status === "Paid" ? "success" : "pending") + '">' + escape(item.status) + '</span></td></tr>'
    ).join("");
  }
  function studentRows() {
    const matches = tenant().students.filter((s) =>
      [s.name, s.id, s.class].some((field) => field.toLowerCase().includes(state.query.toLowerCase()))
    );
    return matches.length ? matches.map((s) =>
      '<tr><td><strong>' + escape(s.name) + '</strong><small>' + escape(s.id) +
      '</small></td><td>' + escape(s.class) + '</td><td>' + escape(s.attendance) +
      '</td><td><span class="pill neutral">Demo student</span></td></tr>'
    ).join("") : '<tr><td colspan="4" class="empty-cell">No matching demo students.</td></tr>';
  }
  function overview() {
    const s = tenant().statistics;
    const cards = state.role === "bursar" ? [
      statCard("Fees collected", s.collected + "%", "This term · sample", "↗"),
      statCard("Outstanding invoices", s.outstanding, "Follow-up required", "◷"),
      statCard("Payment entries", tenant().payments.length, "Example transactions", "₦"),
      statCard("School enrollment", s.students, "Example profiles", "♙")
    ] : state.role === "teacher" ? [
      statCard("Learners", s.students, "Across all classes", "♙"),
      statCard("Present today", s.present + "%", "Example daily rate", "✓"),
      statCard("Teaching staff", s.teachers, "School-wide preview", "♧"),
      statCard("Lesson drafts", "AI-ready", "Teacher approval required", "✦")
    ] : state.role === "parent" ? [
      statCard("Linked learners", "2", "Example family profile", "♙"),
      statCard("Attendance", s.present + "%", "Sample school rate", "✓"),
      statCard("Fee status", "View", "Transparent invoices", "₦"),
      statCard("Announcements", "3", "Example messages", "✉")
    ] : [
      statCard("Enrolled students", s.students.toLocaleString(), "Across the school", "♙"),
      statCard("Attendance today", s.present + "%", "Example daily rate", "✓"),
      statCard("Fees collected", s.collected + "%", "This term · sample", "↗"),
      statCard("Open applications", s.applications, "Awaiting review", "⊕")
    ];
    const priorities = state.role === "parent"
      ? [["View fee statements", "Fees", "Due dates and payment history"], ["Check academic progress", "Academics", "Learning updates"], ["Attendance summary", "Attendance", "Daily presence record"]]
      : state.role === "bursar"
      ? [["Review fee statements", "Fees", "Amounts due and payment status"], ["Export finance view", "Reports", "Track reconciled totals"]]
      : state.role === "teacher"
      ? [["Review attendance", "Attendance", "Verify the register"], ["Prepare classwork", "Academics", "Curriculum and lesson planning"], ["Review learners", "Students", "Class list"]]
      : [["Verify attendance", "Attendance", "Confirm today's register"], ["Review open invoices", "Fees", "Follow up without spreadsheets"], ["Student records", "Students", "One clear enrollment view"]];
    return '<div class="stat-grid">' + cards.join("") + '</div><div class="two-column"><section class="panel priority-panel">' +
      sectionHead("Today’s priorities", "A short list of what needs attention") +
      '<div class="priority-list">' + priorities.map((row, i) => '<button type="button" class="priority-row" data-page="' +
      escape(row[1]) + '"><span class="priority-number">0' + (i + 1) + '</span><span><strong>' +
      escape(row[0]) + '</strong><small>' + escape(row[2]) + '</small></span><span class="row-arrow">↗</span></button>').join("") +
      '</div></section><section class="panel pulse-panel">' + sectionHead("School pulse", "A simple picture of the term") +
      progress("Attendance", s.present, "attendance") + progress("Fees collected", s.collected, "fees") +
      '<div class="quiet-callout"><strong>Separate roles. One workspace.</strong><span>Staff, parents and school leaders see only the modules relevant to them in this preview.</span></div></section></div>' +
      '<div class="two-column lower"><section class="panel">' + sectionHead("Recent fee activity", "Illustrative entries, not real transactions") +
      '<div class="table-scroll"><table><thead><tr><th>Item</th><th>Amount</th><th>Status</th></tr></thead><tbody>' +
      paymentRows() + '</tbody></table></div></section><section class="panel ai-panel"><div class="ai-icon">✦</div>' +
      '<span class="ai-label">AI TEACHING DESK</span><h2>Make more time for teaching.</h2><p>Draft lesson objectives and exercises using an approved AI service. Human review always comes first.</p>' +
      '<div class="ai-chip-row"><span>Lesson planning</span><span>Teacher review</span><span>No pupil data</span></div>' +
      '<button type="button" class="ghost-button" id="aiGuide">How AI connects ↗</button><small class="ai-note">AI generation is not enabled in this static preview.</small></section></div>';
  }
  function progress(label, value, marker) {
    return '<div class="progress-block"><div class="progress-label"><span>' + escape(label) + '</span><strong>' +
      value + '%</strong></div><div class="progress-track"><div class="progress-fill ' + marker +
      '" style="width:' + value + '%"></div></div></div>';
  }
  function generalModule() {
    const title = state.page;
    const descriptions = {
      Admissions: ["Admission pipeline", "Application review and admission decision records are supplied by the ERP backend."],
      Academics: ["Academics and classes", "Timetables, lesson plans and assessments become available after ERP integration."],
      Attendance: ["Attendance register", "Daily class attendance and parent notifications require the school data service."],
      Staff: ["Team and teaching staff", "Assignments, access roles and leave are managed by verified administrators."],
      Reports: ["Reports and insights", "Financial and academic reporting require reconciled, authorized school data."],
      Settings: ["Brand and school settings", "Color, logo and school name are configured per institution, not hard-coded."]
    };
    const t = descriptions[title] || [title, "This module is awaiting secure ERP connectivity."];
    let preview = '<div class="feature-empty"><div class="feature-glyph" aria-hidden="true">' + icon(title) +
      '</div><h3>' + escape(t[0]) + '</h3><p>' + escape(t[1]) + '</p><span class="integration-label">ERP integration pending</span></div>';
    if (title === "Settings") preview = '<div class="feature-empty"><div class="feature-glyph" aria-hidden="true">◈</div><h3>Your school, your identity.</h3><p>Change the example school at the top of the page to see independent school names, marks and brand colors.</p><div class="brand-preview"><span style="background:' +
      escape(tenant().accent) + '"></span><strong>' + escape(tenant().school) + '</strong></div><span class="integration-label">Branding preview is active</span></div>';
    return '<section class="panel module-panel">' + sectionHead(title, "Only the information you need") + preview + '</section>';
  }
  function students() {
    return '<section class="panel module-panel">' + sectionHead("Student directory", "Synthetic student examples, not live records") +
      '<div class="search-row"><label for="studentSearch">Find a learner</label><input type="search" id="studentSearch" placeholder="Search demo name, ID or class…" value="' +
      escape(state.query) + '" autocomplete="off"></div><div class="table-scroll"><table><thead><tr><th>Student</th><th>Class</th><th>Attendance</th><th>Record</th></tr></thead><tbody id="studentRows">' +
      studentRows() + '</tbody></table></div></section>';
  }
  function fees() {
    const sum = tenant().payments.reduce((acc, p) => acc + p.amount, 0);
    return '<div class="stat-grid compact-stats">' + statCard("Sample invoice value", formatMoney(sum), "Not a real balance", "₦") +
      statCard("Payment entries", tenant().payments.length, "Illustrative records", "▤") +
      statCard("Collections", tenant().statistics.collected + "%", "Example term rate", "↗") + '</div>' +
      '<section class="panel module-panel">' + sectionHead("Fee statements", "Sample ledger · no live payment integration") +
      '<div class="table-scroll"><table><thead><tr><th>Description</th><th>Amount</th><th>Status</th></tr></thead><tbody>' + paymentRows() +
      '</tbody></table></div><p class="fine-print">A production fee is marked paid only after verified processor events and reconciliation, never from the browser alone.</p></section>';
  }
  function render() {
    const school = tenant();
    document.documentElement.style.setProperty("--accent", school.accent);
    document.documentElement.style.setProperty("--accent-soft", school.accentSoft);
    document.title = school.school + " | SchoolSuite Preview";
    $("brandMark").textContent = school.monogram.slice(0, 1);
    $("brandName").textContent = school.brand;
    $("yearLabel").textContent = school.academicYear;
    $("breadcrumbCurrent").textContent = state.page;
    const heading = state.page === "Overview" ? "Your school, at a glance." : state.page + ", made simple.";
    $("pageHeading").textContent = heading;
    $("pageLead").textContent = state.page === "Overview"
      ? school.school + " · " + school.location + ". Everything that matters today, without the clutter."
      : "A clear workspace for " + state.role + " tasks at " + school.school + ".";
    $("heroAction").textContent = state.page === "Overview" ? "View attendance ↗" : "Back to overview ↗";
    $("heroAction").onclick = () => setPage(state.page === "Overview" ? (permissions[state.role].includes("Attendance") ? "Attendance" : "Fees") : "Overview");
    renderNav();
    $("viewRoot").innerHTML = state.page === "Overview" ? overview() : state.page === "Students" ? students() : state.page === "Fees" ? fees() : generalModule();
    document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
    const search = $("studentSearch");
    if (search) search.addEventListener("input", (event) => {
      state.query = event.target.value;
      $("studentRows").innerHTML = studentRows();
    });
    const aiGuide = $("aiGuide");
    if (aiGuide) aiGuide.addEventListener("click", () => {
      alert("The AI gateway is a separate, server-only service. See incubator/school-suite/services/ai-gateway/README.md for setup. No live student data may be sent.");
    });
  }
  $("schoolSelect").innerHTML = Object.values(tenants).map((s) => '<option value="' + escape(s.id) + '">' + escape(s.school) + '</option>').join("");
  $("schoolSelect").value = state.tenant;
  $("roleSelect").value = state.role;
  $("schoolSelect").addEventListener("change", (event) => {
    if (!Object.prototype.hasOwnProperty.call(tenants, event.target.value)) return;
    state.tenant = event.target.value;
    state.page = "Overview";
    render();
  });
  $("roleSelect").addEventListener("change", (event) => {
    if (!Object.prototype.hasOwnProperty.call(permissions, event.target.value)) return;
    state.role = event.target.value;
    state.page = "Overview";
    render();
  });
  $("openMenu").addEventListener("click", () => {
    const open = $("sidebar").classList.toggle("open");
    $("backdrop").hidden = !open;
    $("openMenu").setAttribute("aria-expanded", String(open));
  });
  $("backdrop").addEventListener("click", closeMenu);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
  render();
})();
