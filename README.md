# MMM-homeassistant-sensors

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/tree/develop).
It can display information from [Home Assistant](https://www.home-assistant.io/) using the Home Assistant REST API (token-based).

## Installation

Navigate into your MagicMirror's `modules` folder and clone this repository:  
`cd ~/MagicMirror/modules && git clone https://github.com/chalhayn/MMM-homeassistant-sensors.git`

If you want to use icons for the sensors, download the **MaterialDesignIcons** webfont and unzip it into the module folder:  
`cd ~/MagicMirror/modules/MMM-homeassistant-sensors && wget -O mdi.zip https://github.com/Templarian/MaterialDesign-Webfont/archive/refs/heads/master.zip && unzip mdi.zip`

> Ensure your module’s `getStyles()` path matches the extracted folder, e.g.  
> `modules/MMM-homeassistant-sensors/MaterialDesign-Webfont-master/css/materialdesignicons.min.css`

If your `node_helper.js` uses `node-fetch`, install it inside the module folder:

## Configuration

It is very simple to set up this module; a sample configuration looks like this further below.

## Configuration Options

| Option               | Description                                                                                                   |
|----------------------|---------------------------------------------------------------------------------------------------------------|
| `prettyName`         | Pretty print the name of each entity (split camelCase/underscores). <br><br> **Default:** `false`             |
| `stripName`          | Remove the domain prefix (e.g., show `temperature` instead of `sensor.temperature`). <br><br> **Default:** `false` |
| `title`              | Title to display at the top of the module. <br><br> **Default:** `Home Assistant`                             |
| `host`               | The hostname or IP address of the Home Assistant instance. <br><br> **Default:** `homeassistant.local`        |
| `port`               | Port of Home Assistant (use `8123` for default). <br><br> **Default:** `8123`                                 |
| `https`              | Whether HTTPS is used to reach Home Assistant (`true`/`false`). <br><br> **Default:** `false`                 |
| `token`              | **Required.** Long-Lived Access Token (create in HA user profile). <br><br> **Default:** `""`                 |
| `apipassword`        | **Deprecated** legacy API password. Do not use. <br><br> **Default:** `""`                                    |
| `updateInterval`     | Time between updates (milliseconds). <br><br> **Default:** `300000` (5 minutes)                               |
| `rejectUnauthorized` | When `https: true`, set to `false` to allow self-signed certs (**less secure**). <br><br> **Default:** `true` |
| `debuglogging`       | Verbose logging to console (`true`/`false`). <br><br> **Default:** `false`                                    |
| `values`             | Array selecting specific entities/attributes to display (see table below).                                    |

## values option

| Option           | Description                                                                                                                                                                                                  |
|------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `sensor`         | The Home Assistant `entity_id`. Use Developer Tools → “States” to copy the exact id.                                                                                                                         |
| `name`           | The label to display. If omitted, the entity’s `friendly_name` is used.                                                                                                                                       |
| `alertThreshold` | If the numeric **state** exceeds this value, the row will add a `blink` class. <br><br> **Default:** _off_                                                                                                    |
| `attributes`     | Array of attributes to display instead of the plain state. Include `"state"` in the list if you also want to show the state. <br><br> **Default:** `[]`                                                      |
| `icons`          | Icon hints for stateful rows. See: [MaterialDesignIcons](https://materialdesignicons.com/).                                                                                                                  |
| `precision`      | If the state is numeric, format to `N` decimals (e.g., `1` → `74.3`).                                                                                                                                        |
| `unitOverride`   | Force a unit string regardless of HA’s unit (e.g., `"°F"`, `"kWh"`).                                                                                                                                          |
| `map`            | Map raw states to prettier labels (e.g., `{ "on": "Locked", "off": "Unlocked" }`).                                                                                                                           |

## icons option

| Option         | Description                                                                 |
|----------------|-----------------------------------------------------------------------------|
| `default`      | Default icon (used if no state match).                                      |
| `state_on`     | Icon when the state is `on`.                                                |
| `state_off`    | Icon when the state is `off`.                                               |
| `state_open`   | Icon when the state is `open`.                                              |
| `state_closed` | Icon when the state is `closed`.                                            |

Here is an example of an entry in `config.js`:

  values: [
    {
      sensor: "sensor.processor_use",
      alertThreshold: 50,
      icons: { "default": "chip" }
    },
    {
      sensor: "binary_sensor.hallway_presence",
      name: "Hallway Sensor",
      map: { "off": "No Motion", "on": "Motion" },
      icons: { "state_off": "run", "state_on": "run-fast" }
    },
    {
      sensor: "switch.reception_spot",
      icons: { "state_off": "lightbulb-outline", "state_on": "lightbulb-on-outline" }
    }
  ]
}

**Result** example:

![Alt text](https://image.ibb.co/b8edjx/dynamic_icons.png "dynamic icons example")

## Special Thanks

- [Michael Teeuw](https://github.com/MichMich) for creating the awesome [MagicMirror²](https://github.com/MichMich/MagicMirror/tree/develop) project that made this module possible.
- Thanks to the community modules that inspired this fork and to everyone helping keep HA integrations current.
