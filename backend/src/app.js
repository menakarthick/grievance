'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const env = require('./config/env');
const { mountSwagger } = require('./config/swagger');
const { requestContext } = require('./middleware/requestContext');
const { requestLogger } = require('./middleware/requestLogger');
const { notFound } = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health.routes');
const v1Routes = require('./routes/v1');

const app = express();

if (env.trustProxy) app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: env.corsAllowedOrigins,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'X-Correlation-Id'],
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(requestContext);
app.use(requestLogger);

// Liveness/readiness probes stay outside API versioning — they are
// infrastructure surface, not part of the docs/openapi.yaml contract.
app.use('/health', healthRoutes);

mountSwagger(app);

app.use(env.apiPrefix, v1Routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
