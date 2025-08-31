/* MagicMirror² Node Helper
 * Module: MMM-homeassistant-sensors
 */
"use strict";

const NodeHelper = require("node_helper");
const fetch = require("node-fetch");          // v2 (CommonJS)
const http = require("http");
const https = require("https");

module.exports = NodeHelper.create({
  start() {
    this.log("helper started");
  },

  log(...args) {
    console.log("[MMM-homeassistant-sensors]", ...args); // eslint-disable-line no-console
  },

  async getStats(config) {
    const url = this.buildUrl(config);

    if (!config || !config.token) {
      const msg = "Missing Home Assistant long-lived access token";
      this.log(msg);
      this.sendSocketNotification("STATS_ERROR", msg);
      return;
    }

    // Allow self-signed if you set rejectUnauthorized: false in the module config
    const agent = config.https
      ? new https.Agent({ rejectUnauthorized: config.rejectUnauthorized !== false })
      : new http.Agent();

    try {
      const res = await fetch(url, {
        agent,
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/json"
        },
        timeout: 10000
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const msg = `HTTP ${res.status} ${res.statusText} ${text}`;
        this.log("request failed:", msg);
        this.sendSocketNotification("STATS_ERROR", msg);
        return;
      }

      const body = await res.json();
      this.sendSocketNotification("STATS_RESULT", body);
    } catch (err) {
      const msg = err && err.message ? err.message : "Unknown error";
      this.log("fetch error:", msg);
      this.sendSocketNotification("STATS_ERROR", msg);
    }
  },

  buildUrl(config) {
    const proto = config.https ? "https" : "http";
    const host = String(config.host || "").replace(/\/+$/, "");
    const port = config.port ? `:${config.port}` : "";
    const url = `${proto}://${host}${port}/api/states`;
    if (config.debuglogging) this.log("buildUrl:", url);
    return url;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "GET_STATS") {
      this.getStats(payload);
    }
  }
});
