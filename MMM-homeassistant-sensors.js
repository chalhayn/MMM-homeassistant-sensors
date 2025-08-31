/* MagicMirror²
 * Module: MMM-homeassistant-sensors
 * Updated for current Home Assistant token-based API
 * Front-end only: relies on node_helper.js to perform API calls.
 */
"use strict";

Module.register("MMM-homeassistant-sensors", {
  // === Public state ===
  result: [],
  lastError: null,
  updateTimer: null,

  // === Defaults ===
  defaults: {
    title: "Home Assistant",
    host: "homeassistant.local", // or your HA IP
    port: "8123",
    https: false,                // true only if you terminate TLS (e.g., reverse proxy)
    token: "",                   // Long-Lived Access Token from HA profile
    updateInterval: 300000,      // 5 minutes
    displaySymbol: true,
    prettyName: true,
    stripName: true,
    showUnit: true,
    debuglogging: false,
    values: [
      // Example:
      // {
      //   sensor: "sensor.living_room_temperature",
      //   name: "Living Room",
      //   icons: {
      //     default: "thermometer",
      //     state_on: "toggle-switch",
      //     state_off: "toggle-switch-off",
      //     state_open: "door-open",
      //     state_closed: "door-closed"
      //   },
      //   attributes: [],           // e.g., ["state"] or ["battery_level"]
      //   alertThreshold: 80        // optional numeric threshold; row blinks if value > threshold
      // }
    ]
  },

  // === Styles ===
  getStyles: function () {
    return [
      // Ensure these files exist in your module or adjust paths to your setup.
      "modules/MMM-homeassistant-sensors/MaterialDesign-Webfont-master/css/materialdesignicons.min.css",
      "modules/MMM-homeassistant-sensors/hassio.css"
    ];
  },

  // === Startup ===
  start: function () {
    this.log("Starting MMM-homeassistant-sensors");
    if (!this.config.token || typeof this.config.token !== "string" || this.config.token.trim() === "") {
      this.lastError = "Missing Home Assistant long-lived access token in config.";
    }

    this.getStats();       // immediate fetch
    this.scheduleUpdate(); // periodic updates
  },

  // === Logging helper ===
  log: function (...args) {
    if (this.config.debuglogging) {
      // eslint-disable-next-line no-console
      console.log("[MMM-homeassistant-sensors]", ...args);
    }
  },

  // === Utility ===
  isEmptyObject: function (obj) {
    // For arrays, length check; for objects, own keys
    if (Array.isArray(obj)) return obj.length === 0;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) return false;
    }
    return true;
  },

  _formatName: function (name) {
    let out = name || "";
    if (this.config.stripName) {
      const parts = out.split(".");
      out = parts[parts.length - 1];
    }
    if (this.config.prettyName) {
      // insert underscores before capitals, then title-case
      out = out.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/_/g, " ");
      out = out.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1));
    }
    return out;
  },

  _getEntity: function (data, entityId) {
    if (!Array.isArray(data)) return null;
    for (let i = 0; i < data.length; i++) {
      if (data[i] && data[i].entity_id === entityId) return data[i];
    }
    return null;
  },

  _getValue: function (data, entityId, attributes = []) {
    const entity = this._getEntity(data, entityId);
    if (!entity) return null;

    // If no attributes specified, return state
    if (!attributes || attributes.length === 0) return entity.state;

    // Otherwise, build a pipe-separated string of requested items
    let pieces = [];
    for (let j = 0; j < attributes.length; j++) {
      const attr = attributes[j];
      if (attr === "state") {
        pieces.push(entity.state);
      } else if (entity.attributes && typeof entity.attributes[attr] !== "undefined") {
        pieces.push(String(entity.attributes[attr]));
      }
    }
    return pieces.join(" | ");
  },

  _getUnit: function (data, entityId) {
    if (!this.config.showUnit) return "";
    const entity = this._getEntity(data, entityId);
    if (!entity || !entity.attributes) return "";
    return typeof entity.attributes.unit_of_measurement !== "undefined"
      ? entity.attributes.unit_of_measurement
      : "";
  },

  _getFriendlyName: function (data, valueConfig) {
    // If explicit name provided
    if (valueConfig && valueConfig.name) return valueConfig.name;

    // Otherwise, use HA friendly_name
    const entity = this._getEntity(data, valueConfig.sensor);
    if (entity && entity.attributes && entity.attributes.friendly_name) {
      return entity.attributes.friendly_name;
    }
    return valueConfig.sensor || "Unknown";
  },

  _resolveIcons: function (value, iconsConfig) {
    if (!iconsConfig || typeof iconsConfig !== "object") return null;

    const v = String(value).toLowerCase();
    const i = iconsConfig;

    if (v === "on" && typeof i.state_on === "string") return i.state_on;
    if (v === "off" && typeof i.state_off === "string") return i.state_off;
    if (v === "open" && typeof i.state_open === "string") return i.state_open;
    if (v === "closed"
