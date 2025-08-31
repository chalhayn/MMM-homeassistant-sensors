/* MagicMirror² Node Helper
 * Module: MMM-homeassistant-sensors
 */
"use strict";

const NodeHelper = require("node_helper");
const got = require("got");

module.exports = NodeHelper.create({
  start() {
    // Single reusable HTTP client
    this.client = got.extend({
      timeout: { request: 10000 },     // 10s request timeout
      retry: { limit: 1 },             // light retry; HA usually local
      hooks: {
        beforeRequest: [
          (options) => {
            const tok = options.context && options.context.token;
            if (!tok) {
              throw new Error("Missing Home Assistant long-lived access token");
            }
            options.headers = {
              ...(options.headers || {}),
              Authorization: `Bearer ${tok}`,
              Accept: "application/json"
            };
          }
        ]
      }
    });
    this._log("helper started");
  },

  _log(...args) {
    // Always log with a prefix; MM config-level logging is handled on the front-end
    console.log("[MMM-homeassistant-sensors]", ...args); // eslint-disable-line no-console
  },

  async getStats(config) {
    const url = this.buildUrl(config);
    const httpsOptions = { rejectUnauthorized: config.rejectUnauthorized !== false };

    try {
      const res = await this.client.get(url, {
        con
