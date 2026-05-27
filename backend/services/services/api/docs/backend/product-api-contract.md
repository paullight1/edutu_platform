# Product API Contract

This contract defines the backend-owned routes mobile and web should use for user-specific product state. Public opportunity reads can remain read-only while user actions move behind authenticated NestJS endpoints.

## Implemented Now

All routes require the existing bearer-token auth guard.

| Capability | Route | Notes |
| --- | --- | --- |
| Read product profile | `GET /profile` | Returns the backend `profiles` row and profile completeness metadata. Creates a minimal profile if the authenticated user has none. |
| Update product profile | `PATCH /profile` | Accepts `fullName`, `email`, `country`, and `skills`. |
| Profile completeness | `GET /profile/completeness` | Returns `{ percent, completed, total, missing }`. |
| Read preferences bundle | `GET /profile/preferences` | Returns `{ opportunities, notifications }`. |
| Update opportunity preferences | `PATCH /profile/preferences/opportunities` | Uses the same payload as `PATCH /opportunities/preferences`. |
| Update notification preferences | `PATCH /profile/preferences/notifications` | Uses the notification preference payload from `PATCH /notifications/preferences`. |
| Saved opportunities | `GET /me/opportunities/bookmarks` | Returns saved opportunities hydrated with opportunity summary fields. |
| Bookmark status | `GET /me/opportunities/:id/bookmark` | Returns `{ saved, bookmark }` for a single opportunity. |
| Save opportunity | `POST /me/opportunities/:id/bookmark` | Accepts optional `priority` (`low`, `medium`, `high`) and `notes`. Upserts into `opportunity_bookmarks`. |
| Unsave opportunity | `DELETE /me/opportunities/:id/bookmark` | Deletes the authenticated user's bookmark for the opportunity. |
| Application list | `GET /me/applications` | Returns tracked applications hydrated with opportunity summary fields. |
| Create/update application by opportunity | `POST /me/applications` | Accepts `opportunityId`, optional canonical `status`, `notes`, and `metadata`. Upserts by `(user_id, opportunity_id)`. |
| Update application | `PATCH /me/applications/:id` | Accepts canonical `status`, `notes`, and `metadata`. |
| Delete application | `DELETE /me/applications/:id` | Deletes one authenticated-user application record. |
| Deadline rollup | `GET /me/deadlines` | Returns `{ summary, groups, items }` from bookmarks, applications, and goals. |

## Application Status Model

Backend storage and `/me/applications` responses use the canonical database lifecycle:

- `draft`
- `submitted`
- `interview`
- `offer`
- `rejected`
- `withdrawn`

Client-specific labels such as "applied", "accepted", or "under review" should be mapped in the client presentation layer, not stored as alternate backend values.

## Implementation Constraint

Authenticated product state is now owned by NestJS routes under `/me`. Web and mobile adapters may temporarily fall back to legacy Supabase reads while clients roll forward, but new product workflows should call the backend route first when a bearer token is available.
