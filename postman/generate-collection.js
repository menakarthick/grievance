'use strict';
/*
 * Generates a Postman Collection v2.1 from the fully-bundled OpenAPI 3.1
 * document (postman/_bundled-openapi.json, produced by:
 *   npx @redocly/cli bundle docs/openapi.yaml -o postman/_bundled-openapi.json --ext json
 * ). Every operation in the spec becomes exactly one request item, filed
 * under a folder named after its first tag, in path-declaration order.
 */
const fs = require('fs');
const path = require('path');

const SPEC_PATH = path.join(__dirname, '_bundled-openapi.json');
const OUT_PATH = path.join(__dirname, 'Grievance-Platform.postman_collection.json');

const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));

// ---------- $ref resolution (single-document JSON pointer only) ----------
function resolvePointer(ref) {
  const parts = ref.replace(/^#\//, '').split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let node = spec;
  for (const p of parts) node = node[p];
  return node;
}

function deref(schema, visited = new Set()) {
  if (schema && schema.$ref) {
    if (visited.has(schema.$ref)) return {}; // break cycles (e.g. recursive tree nodes)
    const next = new Set(visited);
    next.add(schema.$ref);
    return deref(resolvePointer(schema.$ref), next);
  }
  return schema;
}

// ---------- Example generation from a JSON Schema node ----------
function exampleFromSchema(rawSchema, depth = 0, visited = new Set()) {
  if (rawSchema === undefined || rawSchema === null) return null;
  let schema = rawSchema;
  if (schema.$ref) {
    if (visited.has(schema.$ref) || depth > 8) return null;
    const next = new Set(visited);
    next.add(schema.$ref);
    return exampleFromSchema(resolvePointer(schema.$ref), depth + 1, next);
  }

  if (Array.isArray(schema.examples) && schema.examples.length) {
    return clone(schema.examples[0]);
  }
  if (schema.example !== undefined) return clone(schema.example);
  if (schema.const !== undefined) return clone(schema.const);

  if (Array.isArray(schema.allOf)) {
    let merged = {};
    let isPrimitive = null;
    for (const sub of schema.allOf) {
      const val = exampleFromSchema(sub, depth + 1, visited);
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        merged = Object.assign(merged, val);
      } else if (val !== null && val !== undefined) {
        isPrimitive = val;
      }
    }
    return isPrimitive !== null ? isPrimitive : merged;
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length) {
    return exampleFromSchema(schema.oneOf[0], depth + 1, visited);
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length) {
    return exampleFromSchema(schema.anyOf[0], depth + 1, visited);
  }

  if (Array.isArray(schema.enum) && schema.enum.length) return clone(schema.enum[0]);

  let type = schema.type;
  if (Array.isArray(type)) {
    type = type.find(t => t !== 'null') || type[0];
  }

  if (type === 'object' || (!type && schema.properties)) {
    if (depth > 6) return {};
    const obj = {};
    const props = schema.properties || {};
    for (const key of Object.keys(props)) {
      obj[key] = exampleFromSchema(props[key], depth + 1, visited);
    }
    return obj;
  }
  if (type === 'array') {
    if (depth > 6) return [];
    return [exampleFromSchema(schema.items || {}, depth + 1, visited)];
  }
  if (type === 'string') return stringExample(schema);
  if (type === 'integer') return schema.minimum !== undefined ? schema.minimum : (schema.default !== undefined ? schema.default : 1);
  if (type === 'number') return schema.minimum !== undefined ? schema.minimum : (schema.default !== undefined ? schema.default : 1.5);
  if (type === 'boolean') return schema.default !== undefined ? schema.default : true;
  if (type === 'null') return null;
  return null;
}

function stringExample(schema) {
  switch (schema.format) {
    case 'date-time': return '2026-07-20T09:15:00Z';
    case 'date': return '2026-07-20';
    case 'email': return 'user@example.com';
    case 'uuid': return '8f14e1a2-0000-4000-8000-000000000001';
    case 'password': return '••••••••';
    case 'binary': return '(binary)';
    default:
      if (schema.pattern === '^[0-9]{6}$') return '600045';
      return schema.default !== undefined ? schema.default : 'string';
  }
}

function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

// ---------- Postman URL / param builders ----------
function toPostmanPath(openapiPath) {
  return openapiPath.split('/').filter(Boolean).map(seg => {
    if (seg.startsWith('{') && seg.endsWith('}')) return ':' + seg.slice(1, -1);
    return seg;
  });
}

function paramExample(param) {
  if (param.example !== undefined) return String(param.example);
  if (param.schema) {
    const ex = exampleFromSchema(param.schema);
    if (ex !== null && ex !== undefined) return String(ex);
  }
  return '';
}

function buildUrl(fullPath, allParams) {
  const pathParams = allParams.filter(p => p.in === 'path');
  const queryParams = allParams.filter(p => p.in === 'query');
  const segs = toPostmanPath(fullPath);
  const raw = '{{baseUrl}}' + fullPath.replace(/\{([^}]+)\}/g, ':$1') +
    (queryParams.length ? '?' + queryParams.map(p => `${p.name}=${encodeURIComponent(paramExample(p))}`).join('&') : '');
  const url = {
    raw,
    host: ['{{baseUrl}}'],
    path: segs,
  };
  if (pathParams.length) {
    url.variable = pathParams.map(p => ({
      key: p.name,
      value: paramExample(p) || 'REPLACE_ME',
      description: (p.description || '').slice(0, 300),
    }));
  }
  if (queryParams.length) {
    url.query = queryParams.map(p => ({
      key: p.name,
      value: paramExample(p),
      description: (p.description || '').slice(0, 300),
      disabled: p.required !== true,
    }));
  }
  return url;
}

// ---------- Response schema -> required-field extraction (for tests) ----------
function successEnvelopeDataRequired(schema) {
  // Walk an allOf [SuccessEnvelope, {properties:{data: X}}] shape (or a bare schema)
  // to find the "data" sub-schema and report {kind, required} for test generation.
  let dataSchema = null;
  function scan(s, depth = 0) {
    if (!s || depth > 6) return;
    if (s.$ref) return scan(resolvePointer(s.$ref), depth + 1);
    if (Array.isArray(s.allOf)) {
      for (const sub of s.allOf) scan(sub, depth + 1);
      return;
    }
    if (s.properties && s.properties.data) {
      dataSchema = s.properties.data;
    }
  }
  scan(schema);
  if (!dataSchema) return null;
  let resolved = dataSchema;
  let depth = 0;
  while (resolved && resolved.$ref && depth < 8) { resolved = resolvePointer(resolved.$ref); depth++; }
  if (resolved && Array.isArray(resolved.allOf)) {
    let required = [];
    for (const sub of resolved.allOf) {
      let r = sub;
      let d2 = 0;
      while (r && r.$ref && d2 < 8) { r = resolvePointer(r.$ref); d2++; }
      if (r && Array.isArray(r.required)) required = required.concat(r.required);
    }
    return { kind: 'object', required };
  }
  if (resolved && resolved.type === 'array') return { kind: 'array', required: [] };
  if (resolved && Array.isArray(resolved.required)) return { kind: 'object', required: resolved.required };
  return { kind: 'object', required: [] };
}

// ---------- Response example + Postman response entries ----------
function buildResponseEntries(operation, methodUpper, fullPath) {
  const entries = [];
  const responses = operation.responses || {};
  for (const code of Object.keys(responses)) {
    const resp = responses[code].$ref ? resolvePointer(responses[code].$ref) : responses[code];
    const shortDescription = (resp.description || '').trim();
    const codeMatch = /^([A-Z][A-Z0-9_]{3,})\.?\s*$/.exec(shortDescription);
    const label = codeMatch ? codeMatch[1] : (shortDescription.length > 60 ? httpStatusText(code) : (shortDescription || httpStatusText(code)));
    const entry = {
      name: `${code} - ${label}`,
      originalRequest: {},
      status: httpStatusText(code),
      code: parseInt(code, 10) || 0,
      header: [],
      body: undefined,
      _postman_previewlanguage: 'json',
    };
    const content = resp.content && resp.content['application/json'];
    if (content) {
      let bodyValue;
      if (content.examples && content.examples.default && content.examples.default.value !== undefined) {
        bodyValue = content.examples.default.value;
      } else if (content.schema) {
        bodyValue = exampleFromSchema(content.schema);
      }
      // Many one-off error responses are documented as e.g. "description: DEPARTMENT_CODE_ALREADY_EXISTS."
      // reusing the generic ErrorEnvelope schema with no dedicated example. When that's the shape,
      // splice the actual reason code/message out of the description into the generated example
      // instead of leaving the generic placeholder from ErrorEnvelope's own example.
      if (codeMatch && bodyValue && bodyValue.error) {
        bodyValue = clone(bodyValue);
        bodyValue.error.code = codeMatch[1];
        bodyValue.error.message = shortDescription;
      }
      if (bodyValue !== undefined) {
        entry.body = JSON.stringify(bodyValue, null, 2);
        entry.header.push({ key: 'Content-Type', value: 'application/json' });
      }
    }
    if (resp.headers) {
      for (const hName of Object.keys(resp.headers)) {
        if (hName.toLowerCase() === 'content-type') continue;
        entry.header.push({ key: hName, value: `<${hName}>` });
      }
    }
    entries.push(entry);
  }
  return entries;
}

function httpStatusText(code) {
  const map = {
    '200': 'OK', '201': 'Created', '202': 'Accepted', '204': 'No Content',
    '302': 'Found', '400': 'Bad Request', '401': 'Unauthorized', '403': 'Forbidden',
    '404': 'Not Found', '409': 'Conflict', '410': 'Gone', '413': 'Payload Too Large',
    '415': 'Unsupported Media Type', '422': 'Unprocessable Entity', '429': 'Too Many Requests',
    '500': 'Internal Server Error', '501': 'Not Implemented', '503': 'Service Unavailable',
  };
  return map[code] || 'Unknown';
}

function primarySuccessCode(operation) {
  const codes = Object.keys(operation.responses || {}).filter(c => /^2\d\d$/.test(c));
  const order = ['200', '201', '202', '204'];
  for (const c of order) if (codes.includes(c)) return c;
  return codes[0];
}

// ---------- Request body builder ----------
function buildRequestBody(operation) {
  let rb = operation.requestBody;
  if (!rb) return undefined;
  if (rb.$ref) rb = resolvePointer(rb.$ref);
  const json = rb.content && rb.content['application/json'];
  const multipart = rb.content && rb.content['multipart/form-data'];
  if (json) {
    let example;
    if (json.examples && json.examples.default && json.examples.default.value !== undefined) {
      example = json.examples.default.value;
    } else if (json.schema) {
      example = exampleFromSchema(json.schema);
    }
    return {
      mode: 'raw',
      raw: JSON.stringify(example !== undefined ? example : {}, null, 2),
      options: { raw: { language: 'json' } },
    };
  }
  if (multipart) {
    const schema = deref(multipart.schema || {});
    const props = schema.properties || {};
    const formdata = Object.keys(props).map(key => {
      const p = props[key];
      if (p.format === 'binary') {
        return { key, type: 'file', src: [] };
      }
      return { key, type: 'text', value: String(exampleFromSchema(p) ?? '') };
    });
    return { mode: 'formdata', formdata };
  }
  return undefined;
}

// ---------- Test script generation ----------
function buildTestScript(operation, expectedCode) {
  const lines = [];
  lines.push(`pm.test('Status code is ${expectedCode}', function () {`);
  lines.push(`    pm.response.to.have.status(${expectedCode});`);
  lines.push('});');
  lines.push('');
  lines.push("pm.test('Response time is less than 1000ms', function () {");
  lines.push('    pm.expect(pm.response.responseTime).to.be.below(1000);');
  lines.push('});');

  if (['204', '302'].includes(String(expectedCode))) {
    return lines;
  }

  let successResp = (operation.responses || {})[String(expectedCode)];
  if (successResp && successResp.$ref) successResp = resolvePointer(successResp.$ref);
  const hasJson = successResp && successResp.content && successResp.content['application/json'];
  if (!hasJson) return lines;

  const dataInfo = successEnvelopeDataRequired(successResp.content['application/json'].schema || {});
  lines.push('');
  lines.push("pm.test('Response has expected envelope', function () {");
  lines.push('    const json = pm.response.json();');
  lines.push("    pm.expect(json).to.have.property('success');");
  lines.push('    pm.expect(json.success).to.eql(true);');
  lines.push('});');

  if (dataInfo && dataInfo.kind === 'array') {
    lines.push('');
    lines.push("pm.test('Response data is an array', function () {");
    lines.push('    const json = pm.response.json();');
    lines.push("    pm.expect(json.data).to.be.an('array');");
    lines.push('});');
  } else if (dataInfo && dataInfo.required && dataInfo.required.length) {
    lines.push('');
    lines.push("pm.test('Response data has required fields', function () {");
    lines.push('    const json = pm.response.json();');
    for (const field of dataInfo.required) {
      lines.push(`    pm.expect(json.data).to.have.property('${field}');`);
    }
    lines.push('});');
  }
  return lines;
}

// ---------- Build one Postman request item per operation ----------
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const manifest = []; // {operationId, method, path}
const foldersByTag = new Map();
for (const tag of spec.tags || []) foldersByTag.set(tag.name, { name: tag.name, item: [] });

for (const fullPath of Object.keys(spec.paths)) {
  const pathItem = spec.paths[fullPath];
  const pathLevelParams = pathItem.parameters || [];
  for (const method of METHODS) {
    const operation = pathItem[method];
    if (!operation) continue;
    const allParams = [...pathLevelParams, ...(operation.parameters || [])].map(p => (p.$ref ? resolvePointer(p.$ref) : p));

    const tag = (operation.tags && operation.tags[0]) || 'Uncategorized';
    if (!foldersByTag.has(tag)) foldersByTag.set(tag, { name: tag, item: [] });

    const methodUpper = method.toUpperCase();
    const expectedCode = primarySuccessCode(operation) || '200';
    const isPublic = Array.isArray(operation.security) && operation.security.length === 0;

    const headers = [];
    let resolvedRequestBody = operation.requestBody;
    if (resolvedRequestBody && resolvedRequestBody.$ref) resolvedRequestBody = resolvePointer(resolvedRequestBody.$ref);
    const jsonBody = resolvedRequestBody && resolvedRequestBody.content && resolvedRequestBody.content['application/json'];
    const multipartBody = resolvedRequestBody && resolvedRequestBody.content && resolvedRequestBody.content['multipart/form-data'];
    if (jsonBody) headers.push({ key: 'Content-Type', value: 'application/json' });
    headers.push({ key: 'X-Correlation-Id', value: '{{correlationId}}' });
    headers.push({ key: 'X-Tenant-Id', value: '{{tenantId}}' });
    if (allParams.some(p => p.name === 'If-Match')) {
      headers.push({ key: 'If-Match', value: '"1"' });
    }
    if (allParams.some(p => p.name === 'Idempotency-Key')) {
      headers.push({ key: 'Idempotency-Key', value: '{{$guid}}' });
    }
    // strip the header-style entries out of query/path param list (they're modeled as
    // in:header parameters in the spec, e.g. If-Match/Idempotency-Key wrappers)
    const nonHeaderParams = allParams.filter(p => p.in === 'path' || p.in === 'query');

    const item = {
      name: operation.summary || operation.operationId,
      event: [
        {
          listen: 'test',
          script: { type: 'text/javascript', exec: buildTestScript(operation, expectedCode) },
        },
      ],
      request: {
        method: methodUpper,
        header: headers,
        url: buildUrl(fullPath, nonHeaderParams),
        description: `operationId: ${operation.operationId}\n\n${operation.description || ''}`.trim(),
      },
      response: buildResponseEntries(operation, methodUpper, fullPath),
    };
    if (isPublic) {
      item.request.auth = { type: 'noauth' };
    }
    const body = buildRequestBody(operation);
    if (body) item.request.body = body;

    foldersByTag.get(tag).item.push(item);
    manifest.push({ operationId: operation.operationId, method: methodUpper, path: fullPath, tag });
  }
}

// ---------- Assemble the collection ----------
const collection = {
  info: {
    name: spec.info.title,
    description: spec.info.description || '',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }],
  },
  event: [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [
          '// Generate a fresh correlation id for every request in this collection,',
          "// mirroring the platform's X-Correlation-Id convention (API_SPECIFICATION.md Section 1.14).",
          "const corr = 'corr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);",
          "pm.collectionVariables.set('correlationId', corr);",
        ],
      },
    },
    {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          "pm.test('Response time is within collection-wide budget (2000ms)', function () {",
          '    pm.expect(pm.response.responseTime).to.be.below(2000);',
          '});',
        ],
      },
    },
  ],
  variable: [
    { key: 'baseUrl', value: 'https://tambaram.grievance.tn.gov.in/api/v1', type: 'string' },
    { key: 'accessToken', value: '', type: 'string' },
    { key: 'refreshToken', value: '', type: 'string' },
    { key: 'tenantId', value: 'tmbm', type: 'string' },
    { key: 'correlationId', value: '', type: 'string' },
  ],
  item: (spec.tags || []).map(t => foldersByTag.get(t.name)).filter(Boolean),
};

// Any tag not in spec.tags (shouldn't happen, but be safe)
for (const [name, folder] of foldersByTag.entries()) {
  if (!(spec.tags || []).some(t => t.name === name)) collection.item.push(folder);
}

fs.writeFileSync(OUT_PATH, JSON.stringify(collection, null, 2), 'utf8');
fs.writeFileSync(path.join(__dirname, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

console.log(`Generated ${manifest.length} request items across ${collection.item.length} folders.`);
console.log(`Written to ${OUT_PATH}`);
