# Route Registration Order — Ambiguous Path Resolution

## Status

Informational / implementation guidance. **Not a change to the API contract.** No path, parameter, or field in `openapi.yaml` or any module path file is renamed or altered by this document. This note exists solely to tell whoever wires up the HTTP router (Express or equivalent) the order in which structurally-overlapping routes must be registered so that every request resolves to the endpoint the API Specification actually intends.

## Why this exists

OpenAPI's `paths` object is an unordered map — the specification itself has no concept of "this route is checked before that one." A router, however, matches registered routes sequentially and (in Express and most similar frameworks) stops at the **first** route whose pattern matches the incoming URL, regardless of whether a later-registered route would have been a "more specific" match. Two path templates are ambiguous when they have the same segment count and, at every position where they differ, at least one side is a path parameter (which matches any single segment) rather than a literal. Whichever of the two is registered first "wins" for any URL that happens to satisfy both.

This was surfaced by two independent checks against the full 295-operation, 228-path-template bundle:

1. **Redocly CLI** (`no-ambiguous-paths` rule) — flagged 11 representative pairs (it de-duplicates heavily, reporting one collision per structural group rather than every pair).
2. **A custom exhaustive script** comparing every path template against every other template pairwise — found **49 structurally-ambiguous pairs**, which is the complete picture Redocly's 11 examples were drawn from.

## Real-world risk: negligible

Every colliding parameter in every pair below is an opaque, system-generated identifier (`notificationDispatchId`, `fileId`, `complaintId`, `reportInstanceId`, `authEventId`, `trackingId`, etc.) per the Database Design and API Specification. None of these identifiers will ever literally equal a reserved path word like `track`, `retry`, `archived`, `search`, `export`, `me`, or `failed-attempts`, so no real request will ever actually hit the ambiguous case. This is a theoretical/structural finding, not an observed or reproducible bug — but it costs nothing to resolve deterministically, so the ordering below should be followed as a matter of course.

## General rule

**Within any given path prefix, register every route that has a literal segment before any sibling route that has a parameter in that same segment position.** Apply this module by module; routes in different modules never collide with each other.

## Registration order, by module

### Complaint (`complaint.yaml`)

Register, in this relative order:

1. `/api/v1/complaints/voice`
2. `/api/v1/complaints/track/{trackingId}`
3. `/api/v1/complaints/nearby` *(declared in `geographic.yaml`, mounted under the `/complaints` prefix)*
4. *(then, in any order)* `/api/v1/complaints/{complaintId}`, `/api/v1/complaints/{complaintId}/attachments`, `/api/v1/complaints/{complaintId}/timeline`, `/api/v1/complaints/{complaintId}/assignments`, `/api/v1/complaints/{complaintId}/resolution`, `/api/v1/complaints/{complaintId}/closure`, `/api/v1/complaints/{complaintId}/feedback`, `/api/v1/complaints/{complaintId}/reopen`

### Notification (`notification.yaml`)

Register every literal/mixed route under `/api/v1/notifications/` before the two fully-generic action routes, since those two have a parameter in the *first* slot — the most permissive shape, and the one every sibling below collides with:

1. `sms/{notificationDispatchId}`, `sms/test`
2. `email/{notificationDispatchId}`, `email/test`
3. `whatsapp/{notificationDispatchId}`, `whatsapp/test`
4. `push/{notificationDispatchId}`, `push/test`
5. `in-app/{notificationDispatchId}`, `in-app/read-all`, `in-app/unread-count`
6. `queue/{notificationDispatchId}`, `queue/dead-letter`
7. `history/{notificationDispatchId}`, `history/export`
8. `broadcast/{broadcastId}`
9. `bulk/{bulkJobId}`
10. `analytics/retries`
11. *(then)* `{notificationDispatchId}/retry`, `{notificationDispatchId}/retries`

Independently, also under `notification.yaml`:

- `/api/v1/notification-preferences/me` **before** `/api/v1/notification-preferences/{userId}`

### Reports (`reports.yaml`)

1. `/api/v1/reports/export/{exportJobId}`
2. `/api/v1/reports/export/{exportJobId}/download`
3. `/api/v1/reports/department-performance/{departmentId}/drill-down`
4. `/api/v1/reports/officer-performance/{officerId}/drill-down`
5. *(then)* `/api/v1/reports/{reportInstanceId}/shares`, `/api/v1/reports/{reportInstanceId}/shares/{shareId}`

### File Management (`file-management.yaml`)

1. `/api/v1/files/archived`
2. `/api/v1/files/multipart`
3. `/api/v1/files/multipart/{multipartUploadId}/complete`
4. `/api/v1/files/search`
5. `/api/v1/files/storage-usage`
6. `/api/v1/files/storage-usage/by-category`
7. *(then)* `/api/v1/files/{fileId}` and its nested routes: `{fileId}/access/{accessGrantId}`, `{fileId}/share-links/{shareLinkId}`, `{fileId}/versions/{versionFileAssetId}`, and the rest of the `{fileId}/*` family

### Audit (`audit.yaml`)

- `/api/v1/audit/login-history/failed-attempts` **before** `/api/v1/audit/login-history/{authEventId}`

## Appendix: full pairwise collision list (exhaustive, 49 pairs)

Generated by comparing every path template's segments pairwise; a pair is listed if both templates have the same segment count and no position has two *different* literals (i.e., every differing position involves at least one parameter).

```
/api/v1/audit/login-history/{authEventId}
  <-> /api/v1/audit/login-history/failed-attempts

/api/v1/complaints/track/{trackingId}
  <-> /api/v1/complaints/{complaintId}/assignments
  <-> /api/v1/complaints/{complaintId}/closure
  <-> /api/v1/complaints/{complaintId}/feedback
  <-> /api/v1/complaints/{complaintId}/reopen
  <-> /api/v1/complaints/{complaintId}/resolution
  <-> /api/v1/complaints/{complaintId}/attachments
  <-> /api/v1/complaints/{complaintId}/timeline

/api/v1/complaints/voice
  <-> /api/v1/complaints/{complaintId}

/api/v1/complaints/{complaintId}
  <-> /api/v1/complaints/nearby

/api/v1/files/archived
  <-> /api/v1/files/{fileId}

/api/v1/files/multipart
  <-> /api/v1/files/{fileId}

/api/v1/files/multipart/{multipartUploadId}/complete
  <-> /api/v1/files/{fileId}/access/{accessGrantId}
  <-> /api/v1/files/{fileId}/share-links/{shareLinkId}
  <-> /api/v1/files/{fileId}/versions/{versionFileAssetId}

/api/v1/files/search
  <-> /api/v1/files/{fileId}

/api/v1/files/{fileId}
  <-> /api/v1/files/storage-usage

/api/v1/notification-preferences/me
  <-> /api/v1/notification-preferences/{userId}

/api/v1/notifications/email/{notificationDispatchId}
  <-> /api/v1/notifications/email/test
  <-> /api/v1/notifications/{notificationDispatchId}/retries
  <-> /api/v1/notifications/{notificationDispatchId}/retry

/api/v1/notifications/history/{notificationDispatchId}
  <-> /api/v1/notifications/history/export
  <-> /api/v1/notifications/{notificationDispatchId}/retries
  <-> /api/v1/notifications/{notificationDispatchId}/retry

/api/v1/notifications/in-app/{notificationDispatchId}
  <-> /api/v1/notifications/in-app/read-all
  <-> /api/v1/notifications/in-app/unread-count
  <-> /api/v1/notifications/{notificationDispatchId}/retries
  <-> /api/v1/notifications/{notificationDispatchId}/retry

/api/v1/notifications/push/{notificationDispatchId}
  <-> /api/v1/notifications/push/test
  <-> /api/v1/notifications/{notificationDispatchId}/retries
  <-> /api/v1/notifications/{notificationDispatchId}/retry

/api/v1/notifications/queue/{notificationDispatchId}
  <-> /api/v1/notifications/queue/dead-letter
  <-> /api/v1/notifications/{notificationDispatchId}/retries
  <-> /api/v1/notifications/{notificationDispatchId}/retry

/api/v1/notifications/sms/{notificationDispatchId}
  <-> /api/v1/notifications/sms/test
  <-> /api/v1/notifications/{notificationDispatchId}/retries
  <-> /api/v1/notifications/{notificationDispatchId}/retry

/api/v1/notifications/whatsapp/{notificationDispatchId}
  <-> /api/v1/notifications/whatsapp/test
  <-> /api/v1/notifications/{notificationDispatchId}/retries
  <-> /api/v1/notifications/{notificationDispatchId}/retry

/api/v1/notifications/{notificationDispatchId}/retries
  <-> /api/v1/notifications/analytics/retries
  <-> /api/v1/notifications/broadcast/{broadcastId}
  <-> /api/v1/notifications/bulk/{bulkJobId}

/api/v1/notifications/{notificationDispatchId}/retry
  <-> /api/v1/notifications/broadcast/{broadcastId}
  <-> /api/v1/notifications/bulk/{bulkJobId}

/api/v1/reports/department-performance/{departmentId}/drill-down
  <-> /api/v1/reports/{reportInstanceId}/shares/{shareId}

/api/v1/reports/export/{exportJobId}
  <-> /api/v1/reports/{reportInstanceId}/shares

/api/v1/reports/export/{exportJobId}/download
  <-> /api/v1/reports/{reportInstanceId}/shares/{shareId}

/api/v1/reports/officer-performance/{officerId}/drill-down
  <-> /api/v1/reports/{reportInstanceId}/shares/{shareId}
```

## Validation

Re-derivable at any time with:

```
npx @redocly/cli lint openapi.yaml
```

(surfaces the `no-ambiguous-paths` warnings this document resolves the ordering for) and the exhaustive pairwise segment-comparison script used to produce the appendix above, which compares every one of the 228 path templates against every other for same-length, literal-compatible collisions.
