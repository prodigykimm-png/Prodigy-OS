(function (root) {
  "use strict";

  const nodeRequire = typeof require === "function" ? require : (root && typeof root.require === "function" ? root.require.bind(root) : null);
  const basePath = String(root?.app?.vault?.adapter?.basePath || "").replace(/[\\/]$/u, "");
  if (!nodeRequire || !basePath) return;
  try { root.RealEstateSourcePackageCore = nodeRequire(`${basePath}/SYSTEM/SCRIPTS/real-estate-source-package-core.js`); } catch (_error) {}
  try { root.RealEstateSourceIdentityCore = nodeRequire(`${basePath}/SYSTEM/SCRIPTS/real-estate-source-identity-core.js`); } catch (_error) {}
})(typeof globalThis !== "undefined" ? globalThis : this);
