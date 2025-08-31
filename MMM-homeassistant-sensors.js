/* MagicMirror² - MMM-homeassistant-sensors (front-end)
 * Token-auth compliant, with precision/map/unit overrides and robust logging
 */
"use strict";

Module.register("MMM-homeassistant-sensors", {
  // ----- Public state -----
  result: [],
  lastError: null,
  updateTimer: null,

  // ----- Defaults -----
  defaults: {
    title: "Home Assistant",
    host: "homeassistant.local", // or your HA IP
    port: "8123",
    https: false,
    token: "",                   // Long-Lived Access Token from HA
    updateInterval: 300000,      // 5 min
    displaySymbol: true,
    prettyName: false,
    stripName: false,
    showUnit: true,
    debuglogging: true,          // turn off when happy
    values: [
      // Example item:
      // {
      //   sensor: "sensor.living_room_temperature",
      //   name: "Living Room",
      //   precision: 1,                     // format numeric state to N decimals
      //   unitOverride: "°F",               // force a unit on screen
      //   map: { on: "On", off: "Off" },    // map raw state strings to labels
      //   icons: {
      //     default: "thermometer",
      //     state_on: "toggle-switch",
      //     state_off: "toggle-switch-off",
      //     state_open: "door-open",
      //     state_closed: "door-closed"
      //   },
      //   attributes: [],                   // e.g., ["battery_level"] or ["state"]
      //   alertThreshold: 80                // row blinks if numeric value > threshold
      // }
    ]
  },

  // ----- Styles -----
  getStyles() {
    // Ensure these paths exist in your module, or set displaySymbol:false in your config.
    return [
      "modules/MMM-homeassistant-sensors/MaterialDesign-Webfont-master/css/materialdesignicons.min.css",
      "modules/MMM-homeassistant-sensors/hassio.css"
    ];
  },

  // ----- Startup -----
  start() {
    this._log("front-end start()");
    if (!this.config.token || !String(this.config.token).trim()) {
      this.lastError = "Missing Home Assistant long-lived access token in config.";
    }
    this.getStats();        // immediate fetch
    this.scheduleUpdate();  // periodic fetch
  },

  // ----- Logging helper -----
  _log() {
    if (!this.config.debuglogging) return;
    const args = Array.prototype.slice.call(arguments);
    args.unshift("[MMM-homeassistant-sensors]");
    // eslint-disable-next-line no-console
    console.log.apply(console, args);
  },

  // ----- Utilities -----
  _formatName(name) {
    var out = name || "";
    if (this.config.stripName) {
      var parts = out.split(".");
      out = parts[parts.length - 1];
    }
    if (this.config.prettyName) {
      out = out.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/_/g, " ");
      out = out.replace(/\w\S*/g, function (t) { return t.charAt(0).toUpperCase() + t.substr(1); });
    }
    return out;
  },

  _applyMap: function (val, map) {
    if (!map || typeof map !== "object") return val;
    var key = String(val).toLowerCase();
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : val;
  },

  _formatNumber: function (val, prec) {
    if (typeof prec !== "number") return val;
    var n = Number(val);
    return Number.isFinite(n) ? n.toFixed(prec) : val;
  },

  _getEntity(data, entityId) {
    if (!Array.isArray(data)) return null;
    for (var i = 0; i < data.length; i++) {
      if (data[i] && data[i].entity_id === entityId) return data[i];
    }
    return null;
  },

  _getValue(data, entityId, attributes) {
    attributes = attributes || [];
    var entity = this._getEntity(data, entityId);
    if (!entity) return null;
    if (!attributes || attributes.length === 0) return entity.state;

    var pieces = [];
    for (var j = 0; j < attributes.length; j++) {
      var attr = attributes[j];
      if (attr === "state") pieces.push(entity.state);
      else if (entity.attributes && typeof entity.attributes[attr] !== "undefined")
        pieces.push(String(entity.attributes[attr]));
    }
    return pieces.join(" | ");
  },

  _getUnit(data, entityId) {
    if (!this.config.showUnit) return "";
    var entity = this._getEntity(data, entityId);
    if (!entity || !entity.attributes) return "";
    return (typeof entity.attributes.unit_of_measurement !== "undefined")
      ? entity.attributes.unit_of_measurement
      : "";
  },

  _getFriendlyName(data, valueConfig) {
    if (valueConfig && valueConfig.name) return valueConfig.name;
    var entity = this._getEntity(data, valueConfig.sensor);
    if (entity && entity.attributes && entity.attributes.friendly_name) {
      return entity.attributes.friendly_name;
    }
    return valueConfig.sensor || "Unknown";
  },

  _resolveIcons(value, iconsConfig) {
    if (!iconsConfig || typeof iconsConfig !== "object") return null;
    var v = String(value).toLowerCase();
    var i = iconsConfig;
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
      var num = parseFloat(value);
      return !Number.isNaN(num) && num > alertThreshold;
    }
    return false;
  },

  // ----- DOM -----
  getDom() {
    var wrapper = document.createElement("div");

    var header = document.createElement("header");
    header.textContent = this.config.title || "Home Assistant";
    wrapper.appendChild(header);

    if (this.lastError) {
      var e = document.createElement("div");
      e.className = "small dimmed";
      e.textContent = "Error: " + this.lastError;
      wrapper.appendChild(e);
      return wrapper;
    }

    if (!this.result || this.result.length === 0) {
      var l = document.createElement("div");
      l.className = "small dimmed";
      l.textContent = "Loading…";
      wrapper.appendChild(l);
      return wrapper;
    }

    var table = document.createElement("table");
    table.className = "small";

    if (Array.isArray(this.config.values) && this.config.values.length > 0) {
      for (var i = 0; i < this.config.values.length; i++) {
        var cfg = this.config.values[i];
        if (!cfg || !cfg.sensor) continue;

        var icons = cfg.icons;
        if (Array.isArray(icons) && icons.length > 0) icons = icons[0];

        var nameRaw = this._getFriendlyName(this.result, cfg);
        var rawUnit = this._getUnit(this.result, cfg.sensor);
        var rawValue = this._getValue(this.result, cfg.sensor, cfg.attributes || []);
        if (rawValue === null || rawValue === "unknown" || rawValue === "unavailable") continue;

        // blink based on raw numeric
        var blink = this._shouldBlink(rawValue, cfg.alertThreshold);

        // format value → map → unit override
        var displayValue = this._formatNumber(rawValue, cfg.precision);
        displayValue = this._applyMap(displayValue, cfg.map);

        var displayUnit = this.config.showUnit ? rawUnit : "";
        if (cfg.unitOverride) displayUnit = cfg.unitOverride;

        var name = this._formatName(nameRaw);
        var iconName = this._resolveIcons(rawValue, icons); // raw state for icon selection

        table.appendChild(this._buildRow(name, displayValue, displayUnit, iconName, blink));
      }
    } else {
      // No filters: show the first 20 entities as a sanity list
      var data = this.result.slice(0, 20);
      for (var k = 0; k < data.length; k++) {
        var ent = data[k];
        if (!ent || !ent.entity_id) continue;

        var fname = (ent.attributes && ent.attributes.friendly_name)
          ? ent.attributes.friendly_name
          : ent.entity_id;
        var name2 = this._formatName(fname);

        var val = ent.state;
        if (val === "unknown" || val === "unavailable") continue;

        var unit2 = (ent.attributes && ent.attributes.unit_of_measurement)
          ? ent.attributes.unit_of_measurement
          : "";

        table.appendChild(this._buildRow(name2, val, this.config.showUnit ? unit2 : "", null, false));
      }
    }

    if (table.children.length === 0) {
      var empty = document.createElement("div");
      empty.className = "small dimmed";
      empty.textContent = "No sensors to display.";
      wrapper.appendChild(empty);
    } else {
      wrapper.appendChild(table);
    }

    return wrapper;
  },

  _buildRow(name, value, unit, mdiIconName, blink) {
    var tr = document.createElement("tr");
    if (blink) tr.classList.add("blink");

    // Icon
    var iconTd = tr.insertCell(-1);
    iconTd.className = "align-left";
    if (this.config.displaySymbol && mdiIconName) {
      var i = document.createElement("i");
      i.className = "mdi mdi-" + mdiIconName;
      iconTd.appendChild(i);
    }

    // Name
    var nameTd = tr.insertCell(-1);
    nameTd.textContent = name;

    // Value
    var valTd = tr.insertCell(-1);
    valTd.className = "align-right";
    valTd.textContent = value;

    // Unit
    var unitTd = tr.insertCell(-1);
    unitTd.className = "align-left";
    unitTd.textContent = unit || "";

    return tr;
  },

  // ----- Scheduling -----
  scheduleUpdate(delayMs) {
    var interval = (typeof delayMs === "number" && delayMs >= 0) ? delayMs : this.config.updateInterval;
    if (this.updateTimer) clearInterval(this.updateTimer);
    var self = this;
    this.updateTimer = setInterval(function () { self.getStats(); }, interval);
  },

  // ----- IPC to node_helper -----
  getStats() {
    var payload = {
      host: this.config.host,
      port: this.config.port,
      https: !!this.config.https,
      token: this.config.token,
      values: this.config.values,
      debuglogging: !!this.config.debuglogging
    };
    this._log("sending GET_STATS", payload.host, payload.port, payload.https);
    this.sendSocketNotification("GET_STATS", payload);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "STATS_RESULT") {
      this._log("STATS_RESULT len=", Array.isArray(payload) ? payload.length : "n/a");
      this.lastError = null;
      this.result = Array.isArray(payload) ? payload : [];
      this.updateDom(300);
    } else if (notification === "STATS_ERROR") {
      // eslint-disable-next-line no-console
      console.error("[MMM-homeassistant-sensors] STATS_ERROR", payload);
      this.lastError = payload || "Unknown error";
      this.result = [];
      this.updateDom(0);
    }
  }
});
