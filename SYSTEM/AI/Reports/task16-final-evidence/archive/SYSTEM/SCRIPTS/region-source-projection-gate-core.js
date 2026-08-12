"use strict";

const ledger = require("./region-source-ledger-core.js");
const matrixContract = require("./region-provider-support-matrix-core.js");

function selectReadyProjection(ledgerState, matrix = matrixContract.loadMatrix()) {
  const errors = matrixContract.validateMatrix(matrix);
  if (errors.length > 0) throw new Error(`support matrix validation failed: ${errors.join("; ")}`);
  const readyProviders = new Set(matrix.providers.filter((provider) => provider.projection_ready).map((provider) => provider.provider_id));
  return ledger.selectCurrentProjection(ledgerState).filter((item) => readyProviders.has(item.provider_id));
}

module.exports = Object.freeze({ selectReadyProjection });
