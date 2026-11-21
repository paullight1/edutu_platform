// Example tenants and synthetic fixtures for a standalone preview.
// This is not a production identity store or authorization system.
window.SCHOOL_SUITE_TENANTS = Object.freeze({
  evolve: {
    id: "evolve", brand: "EVOLVE", school: "Evolve Academy", monogram: "EA",
    location: "Lagos, Nigeria", currency: "NGN", academicYear: "2026/2027",
    accent: "#e67436", accentSoft: "#fff1e8",
    statistics: { students: 684, teachers: 38, present: 93, collected: 82, outstanding: 14, applications: 27 },
    students: [
      { name: "Amara Example", id: "EV-001", class: "JSS 2A", attendance: "96%", guardian: "Guardian A" },
      { name: "Tunde Example", id: "EV-002", class: "SS 1B", attendance: "91%", guardian: "Guardian B" },
      { name: "Zara Example", id: "EV-003", class: "Primary 5", attendance: "98%", guardian: "Guardian C" }
    ],
    payments: [
      { name: "Tuition · Primary 5", ref: "DEMO-INV-401", amount: 125000, status: "Paid" },
      { name: "Tuition · JSS 2", ref: "DEMO-INV-402", amount: 145000, status: "Pending" },
      { name: "Transport · SS 1", ref: "DEMO-INV-403", amount: 35000, status: "Paid" }
    ]
  },
  summit: {
    id: "summit", brand: "SUMMIT", school: "Summit College", monogram: "SC",
    location: "Abuja, Nigeria", currency: "NGN", academicYear: "2026/2027",
    accent: "#267b65", accentSoft: "#e6f5f0",
    statistics: { students: 420, teachers: 26, present: 97, collected: 91, outstanding: 8, applications: 19 },
    students: [
      { name: "Student Example One", id: "SC-001", class: "Year 7", attendance: "99%", guardian: "Guardian A" },
      { name: "Student Example Two", id: "SC-002", class: "Year 9", attendance: "94%", guardian: "Guardian B" }
    ],
    payments: [
      { name: "Term fees · Year 7", ref: "DEMO-INV-711", amount: 185000, status: "Paid" },
      { name: "Exam levy · Year 9", ref: "DEMO-INV-712", amount: 18000, status: "Pending" }
    ]
  },
  horizon: {
    id: "horizon", brand: "HORIZON", school: "Horizon Learning Centre", monogram: "HL",
    location: "Accra, Ghana", currency: "GHS", academicYear: "2026/2027",
    accent: "#6350bd", accentSoft: "#f0edff",
    statistics: { students: 312, teachers: 19, present: 95, collected: 86, outstanding: 11, applications: 12 },
    students: [
      { name: "Learner Example One", id: "HL-001", class: "Grade 5", attendance: "95%", guardian: "Guardian A" },
      { name: "Learner Example Two", id: "HL-002", class: "Grade 8", attendance: "97%", guardian: "Guardian B" }
    ],
    payments: [
      { name: "Learning fee · Grade 5", ref: "DEMO-INV-818", amount: 85000, status: "Paid" },
      { name: "Activities · Grade 8", ref: "DEMO-INV-819", amount: 22000, status: "Pending" }
    ]
  }
});
