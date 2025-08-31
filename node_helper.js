/* MagicMirror² Node Helper
 * Module: MMM-homeassistant-sensors
 */
"use strict";

const NodeHelper = require("node_helper");
const fetch = require("node-fetch");          // make sure v2 is installed: npm i node-fetch@2
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
    this.log("getStats() called →", url);

    if (!config || !config.token) {
      const msg = "Missing Home Assistant long-lived access token";
      this.log(msg);
      this.sendSocketNotification("STATS_ERROR", msg);
      return;
    }

    const agent = config.https
      ? new https.Agent({ rejectUnauthorized: config.rejectUnauthorized !== false })
      : new http.Agent();

    try {
      this.log("Fetching…", url);
      const res = await fetch(url, {
        agent,
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/json"
        },
        timeout: 10000
      });

      this.log("HTTP status:", res.status, res.statusText);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const msg = `HTTP ${res.status} ${res.statusText} ${text}`;
        this.log("request failed:", msg);
        this.sendSocketNotification("STATS_ERROR", msg);
        return;
      }

      const body = await res.json();
      this.log("Fetched entities:", Array.isArray(body) ? body.length : "(not array)");
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
      this.log(`socketNotificationReceived: GET_STATS (https=${!!payload.https})`);
      this.getStats(payload);
    }
  }
});
