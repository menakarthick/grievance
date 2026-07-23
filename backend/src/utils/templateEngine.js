'use strict';

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

// {{variable}} substitution (08-Notification-APIs.md §8.1.4/§8.7.7). A
// variable missing from the supplied set renders as a visibly flagged
// `[[missing:variableName]]` token rather than throwing — the documented
// Preview behavior ("so an Admin can spot an incomplete sample payload"),
// reused here for every render path (production send and preview alike)
// since both need the same non-throwing, non-silent-data-loss behavior.
function render(template, variables = {}) {
  const missingVariables = [];
  const renderedText = String(template).replace(PLACEHOLDER_PATTERN, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(variables, name) && variables[name] !== undefined && variables[name] !== null) {
      return String(variables[name]);
    }
    missingVariables.push(name);
    return `[[missing:${name}]]`;
  });
  return { renderedText, missingVariables: [...new Set(missingVariables)] };
}

// The set of {{variable}} placeholder names a template body declares —
// used to validate a caller-supplied variables object against "the
// template's declared placeholder set" (§8.2.1's Validation Rules).
function extractPlaceholders(template) {
  const names = new Set();
  let match;
  const pattern = new RegExp(PLACEHOLDER_PATTERN);
  while ((match = pattern.exec(String(template))) !== null) {
    names.add(match[1]);
  }
  return [...names];
}

module.exports = { render, extractPlaceholders };
