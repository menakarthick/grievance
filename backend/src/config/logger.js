'use strict';

const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');
const env = require('./env');

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const consoleFormat = combine(
  colorize(),
  timestamp(),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, correlationId, requestId, stack, ...meta }) => {
    const ids = [requestId && `req=${requestId}`, correlationId && `corr=${correlationId}`].filter(Boolean).join(' ');
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} [${level}]${ids ? ` ${ids}` : ''} ${stack || message}${extra}`;
  }),
);

const fileFormat = combine(timestamp(), errors({ stack: true }), json());

const transports = [
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

if (!env.isTest) {
  transports.push(
    new winston.transports.DailyRotateFile({
      dirname: path.join(process.cwd(), env.logDir),
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      format: fileFormat,
    }),
    new winston.transports.DailyRotateFile({
      dirname: path.join(process.cwd(), env.logDir),
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      level: 'error',
      format: fileFormat,
    }),
  );
}

const logger = winston.createLogger({
  level: env.logLevel,
  defaultMeta: { service: env.appName },
  transports,
  exitOnError: false,
});

module.exports = logger;
