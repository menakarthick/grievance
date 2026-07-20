# Postman Collection

`Grievance-Platform.postman_collection.json` is generated from `docs/openapi.yaml`, not hand-written. It contains one request item per OpenAPI operation (295 total), one per folder-per-tag, with sample request bodies, sample success/error responses, and per-item test scripts, all derived from the schemas and examples already in the spec.

## Regenerating

```bash
cd postman
npm install

# 1. Bundle the multi-file OpenAPI spec into one JSON document (kept out of
#    git as a build artifact — regenerate it whenever docs/*.yaml changes).
npx @redocly/cli bundle ../docs/openapi.yaml -o _bundled-openapi.json --ext json

# 2. Generate the collection from that bundle.
node generate-collection.js

# 3. Confirm every OpenAPI operation is represented exactly once.
node validate-coverage.js
```

`validate-coverage.js` exits non-zero if any operation is missing, duplicated, or unrecognized — run it after every regeneration, not just once.

## What's in here

- `generate-collection.js` — the generator. Builds folders from `openapi.yaml`'s `tags` list, one request per operation, example bodies/responses from the schemas' own `example`/`examples` fields (falling back to a schema-shape-aware placeholder generator), and test scripts (status code, response time, and — where the response schema declares one — a `required`-fields check on `data`).
- `validate-coverage.js` — cross-checks the generated collection's operationIds against the bundled spec's operationIds: no missing, no extra, no duplicates.
- `Grievance-Platform.postman_collection.json` — the generated collection. Collection-level bearer auth (`{{accessToken}}`), collection variables (`baseUrl`, `accessToken`, `refreshToken`, `tenantId`, `correlationId`), and a collection-level pre-request script that stamps a fresh `correlationId` before every request.
- `environments/` — Development, UAT, and Production environments, each defining `baseUrl` and the same variable set (tokens as Postman `secret`-type values, left blank until you log in).

## Using it

1. Import the collection and all three environment files into Postman.
2. Select an environment, run one of the Authentication folder's requests (e.g. Citizen OTP Verify) to obtain a token, and set `accessToken`/`refreshToken` on that environment — either by hand or with a small `pm.environment.set(...)` snippet in that request's own test script.
3. Run any other request or the whole collection via the Collection Runner / Newman; `X-Correlation-Id` is stamped automatically per request.
