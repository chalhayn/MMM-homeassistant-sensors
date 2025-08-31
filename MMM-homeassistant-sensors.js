/* MagicMirror² - MMM-homeassistant-sensors (front-end)
 * Token-auth compliant, with precision/map/unit overrides, composite-value handling,
 * robust logging, and column classes for clean CSS control.
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
    debuglogging: false,         // turn on while debugging
    // For self-signed HA certs when https:true (less secure):
    // rejectUnauthorized: true,
    values: [
      // Example:
      // {
      //   sensor: "sensor.living_room_temperature",
      //   name: "Living Room",
      //   attributes: [],                   // e.g., ["state"] or ["battery_level"]
      //   precision: 1,                     // format numeric state to N decimals (accepts "1" or 1)
      //   unitOverride: "°F",               // force unit on screen
      //   map: { on: "On", off: "Off" },    // map states (per-piece if composite)
      //   icons: {
      //     default: "thermometer",
      //     state_on: "toggle-switch",
      //     state_off: "toggle-switch-off",
      //     state_open: "door-open",
      //     state_closed: "door-closed"
      //   },
      //   alertThreshold: 80                // row blinks if FIRST numeric piece > threshold (accepts "80" or 80)
      // }
    ]
  },

  // ----- Styles -----
getStyles() {
  return [
    "modules/MMM-homeassistant-sensors/mdi/css/materialdesignicons.min.css",
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
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[MMM-homeassistant-sensors]");
    // eslint-disable-next-line no-console
    console.log.apply(console, args);
  },

  // ----- Utilities -----
  _formatName: function(name) {
    var out = name || "";
    if (this.config.stripName) {
      var parts = out.split(".");
      out = parts[parts.length - 1];
    }
    if (this.config.prettyName) {
      out = out.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/_/g, " ");
      out = out.replace(/\w\S*/g, function(t) { return t.charAt(0).toUpperCase() + t.substr(1); });
    }
    return out;
  },

  _splitPieces: function(val) {
    // Split "a | b | c" or "a|b|c" into trimmed parts
    if (val == null) return [];
    var s = String(val);
    if (s.indexOf("|") === -1) return [s.trim()];
    return s.split("|").map(function(p){ return String(p).trim(); });
  },

  _firstPiece: function(val) {
    var parts = this._splitPieces(val);
    return parts.length ? parts[0] : "";
  },

  _parseNumeric: function(val) {
    // Use FIRST numeric piece for blink/threshold/icon-state decisions
    var first = this._firstPiece(val);
    var n = Number(first);
    return Number.isFinite(n) ? n : NaN;
  },

  _applyMap: function(val, map) {
    // Map each piece; accept composite values
    if (!map || typeof map !== "object" || val == null) return val;

    var mapOne = function(s) {
      var key = String(s).trim().toLowerCase();
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : String(s).trim();
    };

    var s = String(val);
    if (s.indexOf("|") === -1) return mapOne(s);
    return s.split("|").map(mapOne).join(" | ");
  },

  _formatPrecision: function(val, prec) {
    // Accept numeric or string precision (e.g., 1 or "1")
    if (prec === undefined || prec === null) return val;
    var p = Number(prec);
    if (!Number.isFinite(p)) return val;

    var formatOne = function(x) {
      var n = Number(String(x).trim());
      return Number.isFinite(n) ? n.toFixed(p) : String(x).trim();
    };

    var s = String(val);
    if (s.indexOf("|") === -1) return formatOne(s);
    return s.split("|").map(formatOne).join(" | ");
  },

  _getEntity: function(data, entityId) {
    if (!Array.isArray(data)) return null;
    for (var i = 0; i < data.length; i++) {
      if (data[i] && data[i].entity_id === entityId) return data[i];
    }
    return null;
  },

  _getValue: function(data, entityId, attributes) {
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

  _getUnit: function(data, entityId) {
    if (!this.config.showUnit) return "";
    var entity = this._getEntity(data, entityId);
    if (!entity || !entity.attributes) return "";
    return (typeof entity.attributes.unit_of_measurement !== "undefined")
      ? entity.attributes.unit_of_measurement
      : "";
  },

  _getFriendlyName: function(data, valueConfig) {
    if (valueConfig && valueConfig.name) return valueConfig.name;
    var entity = this._getEntity(data, valueConfig.sensor);
    if (entity && entity.attributes && entity.attributes.friendly_name) {
      return entity.attributes.friendly_name;
    }
    return valueConfig.sensor || "Unknown";
  },

  _resolveIcons: function(value, iconsConfig) {
    // Resolve icon using FIRST piece of the value (so "on | 72" → "on")
    if (!iconsConfig || typeof iconsConfig !== "object") return null;
    var v = String(this._firstPiece(value)).toLowerCase();
    var i = iconsConfig;
    if (v === "on" && typeof i.state_on === "string") return i.state_on;
    if (v === "off" && typeof i.state_off === "string") return i.state_off;
    if (v === "open" && typeof i.state_open === "string") return i.state_open;
    if (v === "closed" && typeof i.state_closed === "string") return i.state_closed;
    if (typeof i.default === "string") return i.default;
    return null;
  },

  _shouldBlink: function(value, alertThreshold) {
    if (alertThreshold === undefined || alertThreshold === null) return false;
    var thr = Number(alertThreshold);
    if (!Number.isFinite(thr)) return false;
    var num = this._parseNumeric(value);
    return Number.isFinite(num) && num > thr;
  },

  _isUnavailable: function(val) {
    if (val == null) return true;
    var s = String(val).toLowerCase();
    return (s === "unknown" || s === "unavailable");
  },

  // ----- DOM -----
  getDom() {
    var wrapper = document.createElement("div");
    wrapper.className = "mmm-ha-wrapper"; // for CSS targeting

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
        if (this._isUnavailable(rawValue)) continue;

        // Blink uses FIRST numeric piece from the RAW value
        var blink = this._shouldBlink(rawValue, cfg.alertThreshold);

        // MAP first (per-piece), then apply PRECISION to each numeric piece
        var mapped = this._applyMap(rawValue, cfg.map);
        var displayValue = this._formatPrecision(mapped, cfg.precision);

        // Units
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
        if (this._isUnavailable(val)) continue;

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

  _buildRow: function(name, value, unit, mdiIconName, blink) {
    var tr = document.createElement("tr");
    if (blink) tr.classList.add("blink");

    // Icon column (only if we actually want to show icons or have an icon name)
    if (this.config.displaySymbol) {
      var iconTd = tr.insertCell(-1);
      iconTd.classList.add("col-icon");
      if (mdiIconName) {
        var i = document.createElement("i");
        i.className = "mdi mdi-" + mdiIconName;
        iconTd.appendChild(i);
      }
    }

    // Name
    var nameTd = tr.insertCell(-1);
    nameTd.classList.add("col-name");
    nameTd.textContent = name;

    // Value
    var valTd = tr.insertCell(-1);
    valTd.classList.add("col-value");
    valTd.textContent = value;

    // Unit
    var unitTd = tr.insertCell(-1);
    unitTd.classList.add("col-unit");
    unitTd.textContent = unit || "";

    return tr;
  },

  // ----- Scheduling -----
  scheduleUpdate: function(delayMs) {
    var interval = (typeof delayMs === "number" && delayMs >= 0) ? delayMs : this.config.updateInterval;
    if (this.updateTimer) clearInterval(this.updateTimer);
    var self = this;
    this.updateTimer = setInterval(function () { self.getStats(); }, interval);
  },

  // ----- IPC to node_helper -----
  getStats: function() {
    var payload = {
      host: this.config.host,
      port: this.config.port,
      https: !!this.config.https,
      token: this.config.token,
      values: this.config.values,
      debuglogging: !!this.config.debuglogging
    };
    if (typeof this.config.rejectUnauthorized !== "undefined") {
      payload.rejectUnauthorized = !!this.config.rejectUnauthorized;
    }
    this._log("sending GET_STATS", payload.host, payload.port, payload.https);
    this.sendSocketNotification("GET_STATS", payload);
  },

  socketNotificationReceived: function(notification, payload) {
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
