/* MagicMirror² - MMM-homeassistant-sensors (front-end) */
"use strict";

Module.register("MMM-homeassistant-sensors", {
  // Public state
  result: [],
  lastError: null,
  updateTimer: null,

  // Defaults
  defaults: {
    title: "Home Assistant",
    host: "homeassistant.local",
    port: "8123",
    https: false,
    token: "",
    updateInterval: 300000, // 5 min
    displaySymbol: true,
    prettyName: false,
    stripName: false,
    showUnit: true,
    debuglogging: true,     // enable while debugging
    values: []              // leave empty to list everything first
  },

  // Styles (keep minimal to avoid missing-file noise)
  getStyles() {
    return [ "modules/MMM-homeassistant-sensors/hassio.css" ];
  },

  // Startup
  start() {
    console.log("[MMM-homeassistant-sensors] front-end start()");
    if (!this.config.token || !String(this.config.token).trim()) {
      this.lastError = "Missing Home Assistant long-lived access token in config.";
    }
    this.getStats();        // immediate fetch
    this.scheduleUpdate();  // periodic fetch
  },

  // Helpers
  _log(...a) { if (this.config.debuglogging) console.log("[MMM-homeassistant-sensors]", ...a); },

  _formatName(name) {
    let out = name || "";
    if (this.config.stripName) {
      const parts = out.split(".");
      out = parts[parts.length - 1];
    }
    if (this.config.prettyName) {
      out = out.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/_/g, " ");
      out = out.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1));
    }
    return out;
  },

  _getEntity(data, entityId) {
    if (!Array.isArray(data)) return null;
    for (let i = 0; i < data.length; i++) {
      if (data[i] && data[i].entity_id === entityId) return data[i];
    }
    return null;
  },

  _getValue(data, entityId, attributes = []) {
    const entity = this._getEntity(data, entityId);
    if (!entity) return null;
    if (!attributes || attributes.length === 0) return entity.state;
    const pieces = [];
    for (let j = 0; j < attributes.length; j++) {
      const attr = attributes[j];
      if (attr === "state") pieces.push(entity.state);
      else if (entity.attributes && typeof entity.attributes[attr] !== "undefined")
        pieces.push(String(entity.attributes[attr]));
    }
    return pieces.join(" | ");
  },

  _getUnit(data, entityId) {
    if (!this.config.showUnit) return "";
    const entity = this._getEntity(data, entityId);
    if (!entity || !entity.attributes) return "";
    return typeof entity.attributes.unit_of_measurement !== "undefined"
      ? entity.attributes.unit_of_measurement
      : "";
  },

  _getFriendlyName(data, valueConfig) {
    if (valueConfig && valueConfig.name) return valueConfig.name;
    const entity = this._getEntity(data, valueConfig.sensor);
    if (entity && entity.attributes && entity.attributes.friendly_name) {
      return entity.attributes.friendly_name;
    }
    return valueConfig.sensor || "Unknown";
  },

  _resolveIcons(value, iconsConfig) {
    if (!iconsConfig || typeof iconsConfig !== "object") return null;
    const v = String(value).toLowerCase();
    const i = iconsConfig;
    if (v === "on" && typeof i.state_on === "string") return i.state_on;
    if (v === "off" && typeof i.state_off === "string") return i.state_off;
    if (v === "open" && typeof i.state_open === "string") return i.state_open;
    if (v === "closed" && typeof i.state_closed === "string") return i.state_closed;
    if (typeof i.default === "string") return i.default;
    return null;
  },

  _shouldBlink(value, alertThreshold) {
    if (value === null || value === undefined) return false;
    if (typeof alertThreshold === "number" && !Number.isNaN(alertThreshold)) {
      const num = parseFloat(value);
      return !Number.isNaN(num) && num > alertThreshold;
    }
    return false;
  },

  // DOM
  getDom() {
    const wrapper = document.createElement("div");
    const header = document.createElement("header");
    header.textContent = this.config.title || "Home Assistant";
    wrapper.appendChild(header);

    if (this.lastError) {
      const e = document.createElement("div");
      e.className = "small dimmed";
      e.textContent = `Error: ${this.lastError}`;
      wrapper.appendChild(e);
      return wrapper;
    }

    if (!this.result || this.result.length === 0) {
      const l = document.createElement("div");
      l.className = "small dimmed";
      l.textContent = "Loading…";
      wrapper.appendChild(l);
      return wrapper;
    }

    const table = document.createElement("table");
    table.className = "small";

    if (Array.isArray(this.config.values) && this.config.values.length > 0) {
      for (let i = 0; i < this.config.values.length; i++) {
        const cfg = this.config.values[i];
        if (!cfg || !cfg.sensor) continue;

        let icons = cfg.icons;
        if (Array.isArray(icons) && icons.length > 0) icons = icons[0];

        const nameRaw = this._getFriendlyName(this.result, cfg);
        const unit = this._getUnit(this.result, cfg.sensor);
        const value = this._getValue(this.result, cfg.sensor, cfg.attributes || []);
        if (value === null || value === "unknown" || value === "unavailable") continue;

        const name = this._formatName(nameRaw);
        const iconName = this._resolveIcons(value, icons);
        const blink = this._shouldBlink(value, cfg.alertThreshold);

        table.appendChild(this._buildRow(name, value, this.config.showUnit ? unit : "", iconName, blink));
      }
    } else {
      // Show first 20 entities for sanity
      const data = this.result.slice(0, 20);
      for (let i = 0; i < data.length; i++) {
        const ent = data[i];
        if (!ent || !ent.entity_id) continue;
        const name = this._formatName(ent.attributes?.friendly_name || ent.entity_id);
        const val = ent.state;
        if (val === "unknown" || val === "unavailable") continue;
        const unit = ent.attributes?.unit_of_measurement || "";
        table.appendChild(this._buildRow(name, val, this.config.showUnit ? unit : "", null, false));
      }
    }

    if (table.children.length === 0) {
      const empty = document.createElement("div");
      empty.className = "small dimmed";
      empty.textContent = "No sensors to display.";
      wrapper.appendChild(empty);
    } else {
      wrapper.appendChild(table);
    }

    return wrapper;
  },

  _buildRow(name, value, unit, mdiIconName, blink) {
    const tr = document.createElement("tr");
    if (blink) tr.classList.add("blink");

    // Icon
    const iconTd = tr.insertCell(-1);
    iconTd.className = "align-left";
    if (this.config.displaySymbol && mdiIconName) {
      const i = document.createElement("i");
      i.className = "mdi mdi-" + mdiIconName;
      iconTd.appendChild(i);
    }

    // Name
    const nameTd = tr.insertCell(-1);
    nameTd.textContent = name;

    // Value
    const valTd = tr.insertCell(-1);
    valTd.className = "align-right";
    valTd.textContent = value;

    // Unit
    const unitTd = tr.insertCell(-1);
    unitTd.className = "align-left";
    unitTd.textContent = unit || "";

    return tr;
  },

  // Scheduling
  scheduleUpdate(delayMs) {
    const interval = typeof delayMs === "number" && delayMs >= 0 ? delayMs : this.config.updateInterval;
    if (this.updateTimer) clearInterval(this.updateTimer);
    this.updateTimer = setInterval(() => this.getStats(), interval);
  },

  // IPC to node_helper
  getStats() {
    const payload = {
      host: this.config.host,
      port: this.config.port,
      https: !!this.config.https,
      token: this.config.token,
      values: this.config.values,
      debuglogging: !!this.config.debuglogging
    };
    console.log("[MMM-homeassistant-sensors] sending GET_STATS", payload.host, payload.port, payload.https);
    this.sendSocketNotification("GET_STATS", payload);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "STATS_RESULT") {
      console.log("[MMM-homeassistant-sensors] STATS_RESULT len=", Array.isArray(payload) ? payload.length : "n/a");
      this.lastError = null;
      this.result = Array.isArray(payload) ? payload : [];
      this.updateDom(300);
    } else if (notification === "STATS_ERROR") {
      console.error("[MMM-homeassistant-sensors] STATS_ERROR", payload);
      this.lastError = payload || "Unknown error";
      this.result = [];
      this.updateDom(0);
    }
  }
});
