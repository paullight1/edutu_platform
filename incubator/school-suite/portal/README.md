# SchoolSuite portal (interactive preview)

Open index.html in a browser, or run:

    python3 -m http.server 4173 --directory incubator/school-suite/portal

Then visit http://localhost:4173.

This standalone page demonstrates role-aware **navigation**, per-tenant branding, responsive layout, student search and fee views using **synthetic** records. It never connects to the Edutu application or school ERP. It does not implement production authentication or authorization.

The school selector changes the tenant demo and theme. In production, the tenant must come from a verified server-side session or trusted hostname mapping; it must not come solely from a dropdown, URL parameter or user-supplied header.

The role selector only changes demo presentation; **never use client-side role selection for access control**. The source ERP is responsible for authenticated identities, permissions and record-level access.

Next: connect a school tenant to a dedicated Skuul installation or secure tenant-aware API; replace fixtures with server responses; add payment reconciliation, guardian/student scoping, and automated accessibility/end-to-end tests.
