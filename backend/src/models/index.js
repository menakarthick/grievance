'use strict';

const fs = require('fs');
const path = require('path');
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const basename = path.basename(__filename);
const db = {};

// Standard sequelize-cli auto-loader: every *.model.js file in this
// directory (added in the implementation phase) is picked up automatically
// — no manual registration required per model.
fs.readdirSync(__dirname)
  .filter((file) => file !== basename && file.endsWith('.model.js'))
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, DataTypes);
    db[model.name] = model;
  });

Object.values(db).forEach((model) => {
  if (typeof model.associate === 'function') model.associate(db);
});

db.sequelize = sequelize;

module.exports = db;
