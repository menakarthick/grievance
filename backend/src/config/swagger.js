'use strict';

const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const env = require('./env');
const logger = require('./logger');

// docs/ (the approved multi-file OpenAPI 3.1 contract) lives at the repo
// root, one level above backend/. It is served as static files so the
// Swagger UI client can resolve openapi.yaml's relative $refs into
// components/*.yaml and the per-module path files itself, rather than
// requiring a separate server-side bundling step here.
const DOCS_DIR = path.join(__dirname, '..', '..', '..', 'docs');

function mountSwagger(app) {
  if (!env.swagger.enabled) {
    logger.info('Swagger UI disabled (SWAGGER_ENABLED=false)');
    return;
  }

  const specRoute = `${env.swagger.route}/spec`;

  app.use(
    specRoute,
    express.static(DOCS_DIR, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
          res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
        }
      },
    }),
  );

  app.use(
    env.swagger.route,
    swaggerUi.serve,
    swaggerUi.setup(null, {
      customSiteTitle: 'Grievance Platform API Docs',
      swaggerOptions: { url: `${specRoute}/openapi.yaml` },
    }),
  );

  logger.info(`Swagger UI mounted at ${env.swagger.route}`);
}

module.exports = { mountSwagger };
