# ERP evaluation matrix (research, not production acceptance)

| Module | Skuul v3.1.2 | GegoK12 v1.1 | White-label implementation plan |
| --- | --- | --- | --- |
| Organization, school and campus | Documented; test live | Verify in code | per-school config and verified domains |
| Student enrollment | Documented; test live | Documented; test live | verified guardian access |
| Attendance | Documented; test live | Documented; test live | class attendance, audit and SMS |
| Fees and invoices | Documented; test live | Documented; test live | verified payments and reconciliation |
| Exams and grading | Test live | Test live | configurable grade scales |
| Teacher portal | Test live | Test live | assigned-class permissions |
| Parent portal | Documented; test live | Verify in code | authorized child links |
| Admissions | Test live | Documented; test live | application lifecycle |
| Audit/event log | Test live | Test live | append-only sensitive actions |
| AI teaching assistant | Not assumed | Not assumed | separate AI gateway in this project |
| Multi-school SaaS isolation | Test live | Test live | isolated DBs, storage, secrets |
| School transport and library | Test live | Documented; test live | optional modules |

"Documented" is not tested functionality. Install, review migrations, inspect security and exercise use cases before a pilot. Do not combine two production ERPs in one database.
