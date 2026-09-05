
// Pure logic for the Widgets plugin: the widget catalogue, config parsing and
// normalization, the grid the widgets are laid out on, and the clock math that
// has to be right. No Qt and no Quickshell in here, which is what lets tests/
// run it under node.

// ---------------------------------------------------------------- constants

var SCHEMA_VERSION = 2

// Ceilings on anything that arrives as a document rather than as a click. The
// config is a file a person edits by hand, so it is parsed, cloned and drawn;
// an unbounded one would exhaust the shell long before anyone could read it.
var MAX_WIDGETS = 64
var MAX_STRING = 256
var MAX_COLUMNS = 6
var MAX_ROWS = 24
var MAX_MARGIN = 4000
// Bounds of the global scale. `cellSize` stays base px at scale 1, so the
// two read cleanly: a 200px cell at 1.5 is 300px.
var MIN_SCALE = 0
var MAX_SCALE = 2

// The opacity every card starts at; a widget can override it on its own.
var DEFAULT_OPACITY = 0.72

// Which edge of the screen the grid hugs.
var SIDES = ["left", "right"]

// --------------------------------------------------------------- the grid
//
// Widgets sit in a grid of square cells, the way the phone home screens this
// borrows from lay theirs out. A widget occupies a whole number of cells in
// each direction, so two of them can never half-overlap, and a drag has a
// finite set of places it can land — which is what makes dropping one
// predictable rather than a game of pixels.
//
// `cellSize` is the side of one cell in px at scale 1. `columns` is how many
// cells wide the whole grid is, so widening the grid adds room rather than
// shrinking what is already in it. `scale` multiplies cell and gap together,
// so one knob resizes every widget at once.

var DEFAULT_LAYOUT = {
  side: "right",
  columns: 2,
  cellSize: 200,
  gap: 16,
  marginX: 40,
  marginY: 40,
  scale: 1,
  opacity: DEFAULT_OPACITY
}

// ---------------------------------------------------------------- catalogue
//
// Adding a widget type is: drop a QML file in widgets/, add an entry here.
// Everything else — the bar popup, the editor, the config file, the layout on
// screen — is driven off this list, so nothing else has to learn the new name.
//
// `sizes` is every footprint the type is allowed to take, as [cols, rows] in
// cells, first one being its default. The editor offers exactly these, which
// is how a type says "I read well wide" without anything else having to know
// why.
//
// `settings` is the type's whole tunable surface, and it is a schema rather
// than a bag of defaults: each entry carries the key, how to edit it, and
// what it starts as. The editor builds its controls straight off this list,
// so a new widget gets a working settings panel by describing itself — and a
// key that is not in the list is a key the config cannot set.
//
// `multiple: true` says the type is worth having more than one of, and is
// what puts a "Duplicate" button on it in the editor and a "+" beside it in
// the bar popup. It is opt-in rather than the default because for some types
// a second copy is the same card twice: the weather reads one location and
// the music card follows one player, so duplicating either would produce a
// widget that can never say anything different from the one beside it.
//
// Supported setting types: "text", "boolean", "choice" (needs `options`),
// and "timezone" (an IANA zone name, offered as a searchable list).

function catalog() {
  return [
    {
      type: "clock",
      name: "Clock",
      description: "The time, in any timezone, and how far that is from your own.",
      source: "widgets/Clock.qml",
      // Several is the point: the widget exists to show a zone that is not
      // yours, and one of those is rarely the only one you care about.
      multiple: true,
      sizes: [[1, 1], [2, 1]],
      settings: [
        {
          key: "timezone",
          type: "timezone",
          label: "Timezone",
          help: "Leave empty for your own clock",
          defaultValue: ""
        },
        {
          key: "label",
          type: "text",
          label: "Label",
          help: "Empty follows the timezone",
          defaultValue: ""
        },
        {
          key: "format",
          type: "choice",
          label: "Format",
          defaultValue: "HH:mm",
          options: [
            { value: "HH:mm", label: "13:15" },
            { value: "hh:mm AP", label: "1:15 PM" },
            { value: "HH:mm:ss", label: "13:15:42" },
            { value: "HH mm", label: "13 15" }
          ]
        },
        {
          key: "ticks",
          type: "boolean",
          label: "Tick ring",
          defaultValue: true
        }
      ]
    },
    {
      type: "weather",
      name: "Weather",
      description: "Now, and today's range, for wherever Omarchy points.",
      source: "widgets/Weather.qml",
      sizes: [[1, 1], [2, 1]],
      // The one widget here that talks to the network. It uses wttr.in,
      // which is what the rest of Omarchy already uses for weather, and it
      // takes its location from the same file `omarchy-weather-location`
      // writes -- so there is one place to set it, and no second service
      // learning where you live.
      network: "wttr.in",
      settings: [
        {
          key: "units",
          type: "choice",
          label: "Units",
          defaultValue: "celsius",
          options: [
            { value: "celsius", label: "°C" },
            { value: "fahrenheit", label: "°F" }
          ]
        },
        {
          key: "label",
          type: "text",
          label: "Label",
          help: "Empty follows the location",
          defaultValue: ""
        },
        {
          key: "showRange",
          type: "boolean",
          label: "High and low",
          defaultValue: true
        }
      ]
    },
    {
      type: "github",
      name: "GitHub",
      description: "A year of contributions, as many weeks as the card can hold.",
      source: "widgets/Github.qml",
      // Wide first: seven rows of squares want length, and a square card can
      // only hold a couple of months of them.
      // One per person whose year you want on the wall.
      multiple: true,
      sizes: [[2, 1], [1, 1]],
      network: "github.com",
      settings: [
        {
          key: "login",
          type: "text",
          label: "Username",
          help: "GitHub username",
          defaultValue: ""
        },
        {
          key: "showLegend",
          type: "boolean",
          label: "Legend",
          defaultValue: true
        }
      ]
    },
    {
      type: "repo-pulse",
      name: "Repo pulse",
      description: "Stars, forks, issues and open pull requests for a repository.",
      source: "widgets/RepoPulse.qml",
      sizes: [[1, 1], [2, 1]],
      // One per repository. Nobody watches exactly one.
      multiple: true,
      network: "api.github.com",
      // The name opens the repository. Same exception the music card takes,
      // and the same justification: the action is about the thing on the
      // card, and there is exactly one of it.
      interactive: true,
      settings: [
        {
          key: "repo",
          type: "text",
          label: "Repository",
          help: "owner/name",
          defaultValue: ""
        },
        {
          key: "showStats",
          type: "boolean",
          label: "Stars and issues",
          defaultValue: true
        }
      ]
    },
    {
      type: "calendar",
      name: "Calendar",
      description: "What is next, from your Google Calendar's secret iCal address.",
      source: "widgets/Calendar.qml",
      // Wide first: an event is a time and a sentence, and a square card can
      // hold one of them at a time. The tall size is the day's agenda.
      sizes: [[2, 1], [1, 1], [2, 2]],
      // Google publishes every calendar as an iCalendar file at a private
      // address, which is the one way to read a calendar without a wallpaper
      // decoration holding an OAuth token. One GET to Google's own host, no
      // third party, nothing sent but the address itself.
      // One per calendar: work and personal are two addresses, not one.
      multiple: true,
      network: "calendar.google.com",
      settings: [
        {
          key: "icsUrl",
          type: "text",
          label: "Secret iCal address",
          help: "calendar.google.com/calendar/ical/\u2026/basic.ics",
          defaultValue: ""
        },
        {
          key: "label",
          type: "text",
          label: "Label",
          help: "Empty says today's date",
          defaultValue: ""
        },
        {
          key: "format",
          type: "choice",
          label: "Clock",
          defaultValue: "24h",
          options: [
            { value: "24h", label: "14:30" },
            { value: "12h", label: "2:30 PM" }
          ]
        },
        {
          key: "showAllDay",
          type: "boolean",
          label: "All-day events",
          defaultValue: true
        },
        {
          key: "showLocation",
          type: "boolean",
          label: "Location",
          defaultValue: false
        }
      ]
    },
    {
      type: "todos",
      name: "Todos",
      description: "Today's list, from a text file. Tick things off; the title opens it.",
      source: "widgets/Todos.qml",
      sizes: [[2, 1], [1, 1], [2, 2]],
      // The third type that takes clicks, and the one that stretches the rule
      // furthest: a tick per row, plus a title that opens the file, plus a
      // list that scrolls. The justification is that all of it is about the
      // thing already on the card, and a list is the one subject on a
      // wallpaper that genuinely has more content than a card can hold. See
      // One per list. A file each is how people keep lists apart.
      multiple: true,
      // DESIGN.md, which records this as an exception rather than a licence.
      interactive: true,
      settings: [
        {
          key: "file",
          type: "text",
          label: "List file",
          help: "~/.config/omarchy/todos.txt",
          defaultValue: ""
        },
        {
          key: "title",
          type: "text",
          label: "Title",
          help: "Empty uses the file's first heading",
          defaultValue: ""
        },
        {
          key: "showDone",
          type: "boolean",
          label: "Finished items",
          defaultValue: true
        },
        {
          key: "showProgress",
          type: "boolean",
          label: "Progress",
          defaultValue: true
        },
        {
          key: "canTick",
          type: "boolean",
          label: "Tick items off",
          defaultValue: true
        }
      ]
    },
    {
      type: "music",
      name: "Music",
      description: "What is playing, how far in, and the transport for it.",
      source: "widgets/Music.qml",
      sizes: [[2, 1], [1, 1]],
      // The one widget in the set that takes a click. Everything else is
      // read, and the desktop surface has no input region at all; this opts
      // its own rectangle back in so play/pause can be pressed. See
      // DESIGN.md -- it is an exception with a reason, not the new default.
      interactive: true,
      settings: [
        {
          key: "showArt",
          type: "boolean",
          label: "Album art",
          defaultValue: true
        },
        {
          key: "showProgress",
          type: "boolean",
          label: "Progress",
          defaultValue: true
        },
        {
          key: "showSkip",
          type: "boolean",
          label: "Skip tracks",
          defaultValue: true
        },
        {
          // Empty follows whatever is playing, which is what most desktops
          // want. Naming one is for the desktop that always has two: a
          // browser tab open beside the player it actually means.
          key: "player",
          type: "text",
          label: "Player",
          help: "Spotify, Firefox, mpv - blank follows whatever is playing",
          defaultValue: ""
        }
      ]
    }
  ]
}

// The settings schema for a type, always an array.
function settingsSchema(type) {
  var entry = catalogEntry(type)
  return entry && Array.isArray(entry.settings) ? entry.settings : []
}

function settingSpec(type, key) {
  var schema = settingsSchema(type)
  for (var i = 0; i < schema.length; i++) if (schema[i].key === String(key)) return schema[i]
  return null
}

// The starting value of every setting a type has, derived from the schema so
// there is one place a default can live.
function defaultsFor(type) {
  var schema = settingsSchema(type)
  var out = {}
  for (var i = 0; i < schema.length; i++) out[schema[i].key] = schema[i].defaultValue
  return out
}

// The name a zone wears when the user has not written one: the last part of
// the path, which is the city. "America/New_York" -> "New York".
function zoneLabel(zone) {
  var z = String(zone || "")
  if (!z) return ""
  var parts = z.split("/")
  return parts[parts.length - 1].replace(/_/g, " ")
}

function catalogEntry(type) {
  var list = catalog()
  var key = String(type || "")
  for (var i = 0; i < list.length; i++) if (list[i].type === key) return list[i]
  return null
}

function catalogTypes() {
  var list = catalog()
  var out = []
  for (var i = 0; i < list.length; i++) out.push(list[i].type)
  return out
}

// Footprints a type allows, always at least one and always sane.
function sizesFor(type) {
  var entry = catalogEntry(type)
  if (!entry || !Array.isArray(entry.sizes) || entry.sizes.length === 0) return [[1, 1]]
  var out = []
  for (var i = 0; i < entry.sizes.length; i++) {
    var s = entry.sizes[i]
    if (!Array.isArray(s) || s.length < 2) continue
    var cols = Math.round(clampNumber(s[0], 1, MAX_COLUMNS, 1))
    var rows = Math.round(clampNumber(s[1], 1, MAX_ROWS, 1))
    out.push([cols, rows])
  }
  return out.length ? out : [[1, 1]]
}

function defaultSize(type) {
  return sizesFor(type)[0]
}

function isAllowedSize(type, cols, rows) {
  // An unknown type does not offer sizes; `sizesFor` only falls back to 1x1 so
  // that drawing code always has something to work with.
  if (!catalogEntry(type)) return false
  var sizes = sizesFor(type)
  for (var i = 0; i < sizes.length; i++) {
    if (sizes[i][0] === cols && sizes[i][1] === rows) return true
  }
  return false
}

// The next footprint in the type's list, wrapping. This is what the editor's
// size control steps through.
function nextSize(type, cols, rows) {
  var sizes = sizesFor(type)
  for (var i = 0; i < sizes.length; i++) {
    if (sizes[i][0] === cols && sizes[i][1] === rows) return sizes[(i + 1) % sizes.length]
  }
  return sizes[0]
}

// ------------------------------------------------------------------ helpers

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function clampString(value) {
  if (typeof value !== "string") return ""
  return value.length > MAX_STRING ? value.slice(0, MAX_STRING) : value
}

function clampNumber(value, min, max, fallback) {
  var n = Number(value)
  if (!isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// ------------------------------------------------------------------- layout

function normalizeLayout(raw) {
  var source = isPlainObject(raw) ? raw : {}
  var side = clampString(source.side)
  return {
    side: SIDES.indexOf(side) === -1 ? DEFAULT_LAYOUT.side : side,
    columns: Math.round(clampNumber(source.columns, 1, MAX_COLUMNS, DEFAULT_LAYOUT.columns)),
    cellSize: Math.round(clampNumber(source.cellSize, 60, 600, DEFAULT_LAYOUT.cellSize)),
    gap: Math.round(clampNumber(source.gap, 0, 120, DEFAULT_LAYOUT.gap)),
    marginX: Math.round(clampNumber(source.marginX, 0, MAX_MARGIN, DEFAULT_LAYOUT.marginX)),
    marginY: Math.round(clampNumber(source.marginY, 0, MAX_MARGIN, DEFAULT_LAYOUT.marginY)),
    scale: Math.round(clampNumber(source.scale, MIN_SCALE, MAX_SCALE, DEFAULT_LAYOUT.scale) * 100) / 100,
    opacity: Math.round(clampNumber(source.opacity, 0, 1, DEFAULT_LAYOUT.opacity) * 100) / 100
  }
}

// The cell and the gap at the layout's current scale. Everything that measures
// the grid — width, rects, hit testing, the drop probe — reads these, so a
// scale change takes effect everywhere at once.
function scaledCell(layout) {
  return layout.cellSize * layout.scale
}

function scaledGap(layout) {
  return layout.gap * layout.scale
}

// Pixel size of an `n`-block run at the layout's own scale, gaps included.
// Widths and heights both read this, so a scale change takes effect
// everywhere at once.
function blockRunAt(layout, n) {
  return n * layout.cellSize * layout.scale + (n - 1) * layout.gap * layout.scale
}

function blockWidth(layout, cols) {
  return blockRunAt(layout, Math.max(1, Math.round(cols)))
}

function blockHeight(layout, rows) {
  return blockRunAt(layout, Math.max(1, Math.round(rows)))
}

function gridWidth(layout) {
  return blockWidth(layout, layout.columns)
}

// Left edge of the grid inside a `screenWidth`-wide usable area.
// Left edge of a grid inside a `screenWidth`-wide usable area. `side` names
// which of the two; omitting it asks for the layout's own, which is what every
// caller that predates two grids wants.
function gridOriginX(layout, screenWidth, side) {
  var where = SIDES.indexOf(String(side)) === -1 ? layout.side : String(side)
  if (where === "left") return layout.marginX
  return Math.round(screenWidth - layout.marginX - gridWidth(layout))
}

// The widest grid that still fits on a `screenWidth` screen, given the cell
// size and the margin it is held off its edge by. Offering a column count
// that runs off the screen would be offering a widget you cannot see, so the
// editor asks this before it offers anything.
// The widest grid that still fits, given the cell size and the margin it is
// held off the edge by.
//
// Both grids have to fit, not just one, and that is deliberate even for a
// desktop using a single side: the other side is always one drag away, and a
// column count that only works while you have not used it yet is a trap rather
// than a setting. `columnOptions` still offers whatever a config already holds,
// so nobody's grid narrows underneath them.
function maxColumnsFor(layout, screenWidth) {
  var w = Number(screenWidth)
  if (!isFinite(w) || w <= 0) return MAX_COLUMNS
  for (var n = MAX_COLUMNS; n > 1; n--) {
    if (2 * (layout.marginX + blockWidth(layout, n)) <= w) return n
  }
  return 1
}

// Column counts the editor should offer: every one that fits, always
// including the one already in use so a grid configured wider than the screen
// can still be seen and narrowed rather than silently re-labelled.
function columnOptions(layout, screenWidth) {
  var max = Math.max(maxColumnsFor(layout, screenWidth), layout.columns)
  var out = []
  for (var n = 1; n <= max; n++) out.push(n)
  return out
}

// Screen rectangle of a cell block at the layout's scale. The grid's own
// origin is folded in, so this is what both the drawing and the hit testing
// use — they cannot drift.
function cellRect(layout, screenWidth, col, row, cols, rows, side) {
  var step = scaledCell(layout) + scaledGap(layout)
  return {
    x: Math.round(gridOriginX(layout, screenWidth, side) + col * step),
    y: Math.round(layout.marginY + row * step),
    width: blockWidth(layout, cols),
    height: blockHeight(layout, rows)
  }
}

// Screen rectangle of one widget, which is always the cell it occupies: scale
// is the grid's alone, so there is nothing but the grid to measure.
function widgetRect(layout, instance, screenWidth) {
  return cellRect(layout, screenWidth, instance.col, instance.row,
    instance.cols, instance.rows, sideOf(instance, layout))
}

// Which cell of which grid a screen point falls in. Both are tried, and the
// answer carries the side it came from, so a drag across the screen changes
// which grid a widget belongs to without the caller having to ask.
//
// Returns null outside either grid's columns or above its top, so a drag that
// wanders into the gap between them does not silently snap to one.
function cellFromPoint(layout, screenWidth, x, y) {
  var step = scaledCell(layout) + scaledGap(layout)
  if (step <= 0) return null
  var localY = y - layout.marginY
  if (localY < 0) return null
  var row = Math.floor(localY / step)
  if (row < 0 || row >= MAX_ROWS) return null

  for (var i = 0; i < SIDES.length; i++) {
    var localX = x - gridOriginX(layout, screenWidth, SIDES[i])
    if (localX < 0) continue
    var col = Math.floor(localX / step)
    if (col < 0 || col >= layout.columns) continue
    return { col: col, row: row, side: SIDES[i] }
  }
  return null
}

// Where a card held with its top-left corner at (cardX, cardY) would land,
// and whether it may. The probe is the middle of the block's *first* cell
// rather than the pointer: what should decide the drop is the corner of the
// card you are holding, not the point of the finger holding it.
//
// This lives here rather than in the editor because it is the whole of the
// drag that can be wrong — the pixels-to-cells conversion and the legality of
// the result. Left in a QML delegate it would be reachable only by an actual
// pointer; here it is reachable by a test.
function dropTarget(config, id, cardX, cardY, screenWidth) {
  var target = findInstance(config, id)
  if (!target) return { cell: null, valid: false, preview: null }
  var layout = config.layout
  var cell = cellFromPoint(layout, screenWidth,
    cardX + scaledCell(layout) / 2, cardY + scaledCell(layout) / 2)
  if (!cell) return { cell: null, valid: false, preview: null }

  // The preview *is* the drop, computed early. The editor lays the grid out
  // from it while the pointer is down and commits the same cell on release,
  // so what you are shown and what you get cannot come apart.
  var preview = placeDisplacing(config, id, cell.col, cell.row, cell.side)
  return { cell: cell, valid: preview !== null, preview: preview }
}

// What names an instance apart from its siblings, or "" when nothing does.
//
// By convention a setting called `label` or `title` is the user's own name for
// the thing on the card, so it is also the best name for it in a list of them.
// Read by name rather than by type: a widget that offers one gets this for
// free, and nothing here has to learn what a clock is.
//
// Deliberately only those two keys. The obvious generalisation -- "the first
// non-empty text setting" -- would put a calendar's secret address in the
// editor's tray.
function instanceLabel(instance) {
  var settings = instance && isPlainObject(instance.settings) ? instance.settings : {}
  return clampString(settings.label || settings.title || "").replace(/^\s+|\s+$/g, "")
}

// The name to put on a widget in the popup and in the editor's tray. The
// type's name is enough until there is more than one of that type, at which
// point every row would read the same and something has to tell them apart:
// the name you gave it if you gave it one, and its id if you did not.
//
// The id is worth knowing about -- it is yours, it is what the command line
// takes, and editing it in the config file renames the widget everywhere.
function displayName(config, instance) {
  if (!instance) return ""
  var entry = catalogEntry(instance.type)
  var typeName = entry ? entry.name : String(instance.type)
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var sameType = 0
  for (var i = 0; i < list.length; i++) if (list[i].type === instance.type) sameType++
  if (sameType <= 1) return typeName
  return typeName + " · " + (instanceLabel(instance) || instance.id)
}

// ------------------------------------------------------- more than one of a type
//
// The config has always held any number of instances -- every widget carries
// its own id and its own settings, and the grid never cared how many there
// were. What was missing was a way to make one without opening the file, which
// meant three timezones was a feature only the people who read the JSON knew
// they had.

function allowsMultiple(type) {
  var entry = catalogEntry(type)
  return !!(entry && entry.multiple === true)
}

// How many of a type are configured, on the grid or in the tray.
function countOfType(config, type) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var key = String(type || "")
  var n = 0
  for (var i = 0; i < list.length; i++) if (list[i].type === key) n++
  return n
}

// The next free id for a type: "clock", then "clock-2", "clock-3". Numbered
// rather than random because it is a name a person types at a command line and
// writes in a config file, and because the first one keeps the bare type name
// it has always had -- an update that renamed everyone's "clock" to "clock-1"
// would break every config that mentions it.
function nextInstanceId(config, type) {
  var key = String(type || "")
  if (!findInstance(config, key)) return key
  for (var n = 2; n <= MAX_WIDGETS + 1; n++) {
    var candidate = key + "-" + n
    if (!findInstance(config, candidate)) return candidate
  }
  return key + "-" + Date.now()
}

// Somewhere to put a new widget: the first free cell on the side it belongs
// to, or the row below everything if that side is packed. Never nowhere -- a
// widget you asked for and cannot find is worse than one in an awkward cell.
function landingCell(config, cols, rows, side) {
  var where = SIDES.indexOf(String(side)) === -1 ? config.layout.side : String(side)
  var others = occupants(config)
  for (var row = 0; row < MAX_ROWS; row++) {
    for (var col = 0; col + cols <= config.layout.columns; col++) {
      var block = { col: col, row: row, cols: cols, rows: rows, side: where }
      if (fitsAmong(config.layout, block, others)) return { col: col, row: row, side: where }
    }
  }
  return { col: 0, row: Math.min(MAX_ROWS - rows, usedRows(config)), side: where }
}

// Add another of a type, at its defaults.
function addWidget(config, type, side) {
  var next = normalizeConfig(config)
  var entry = catalogEntry(type)
  if (!entry) return next
  if (next.widgets.length >= MAX_WIDGETS) return next
  // The first of a type is always allowed -- that is what puts a type on the
  // list at all. Only the second and beyond ask whether it makes sense.
  if (countOfType(next, entry.type) > 0 && !allowsMultiple(entry.type)) return next

  var instance = defaultInstance(entry.type, nextInstanceId(next, entry.type))
  instance.enabled = true
  var cell = landingCell(next, instance.cols, instance.rows, side)
  instance.col = cell.col
  instance.row = cell.row
  instance.side = cell.side
  next.widgets.push(instance)
  return next
}

// Copy one, settings and shape and all, and put it beside the original.
//
// The useful shape of "another one of these": a second repository card is a
// first one with the name changed, not something you configure from nothing.
function duplicateWidget(config, id) {
  var next = normalizeConfig(config)
  var source = findInstance(next, id)
  if (!source) return next
  if (next.widgets.length >= MAX_WIDGETS) return next
  if (!allowsMultiple(source.type)) return next

  var copy = defaultInstance(source.type, nextInstanceId(next, source.type))
  copy.enabled = true
  copy.monitor = source.monitor
  copy.cols = source.cols
  copy.rows = source.rows
  copy.opacity = source.opacity
  copy.radius = source.radius
  // Through the same gate a config file goes through, so a copy can never hold
  // a value the original was only getting away with.
  copy.settings = normalizeSettings(catalogEntry(source.type), source.settings)

  var cell = landingCell(next, copy.cols, copy.rows, source.side)
  copy.col = cell.col
  copy.row = cell.row
  copy.side = cell.side
  next.widgets.push(copy)
  return next
}

// Whether a widget can be deleted outright, as opposed to switched off.
//
// The last of a type cannot: every type in the catalogue has a row in the bar
// popup, and that row is an instance. Deleting it would only mean the next
// config read put a fresh one back, switched off -- which looks exactly like
// the delete failing. Switching it off is the operation that was wanted.
function canRemove(config, id) {
  var target = findInstance(config, id)
  return !!target && countOfType(config, target.type) > 1
}

function removeWidget(config, id) {
  var next = normalizeConfig(config)
  if (!canRemove(next, id)) return next
  var key = String(id)
  var kept = []
  for (var i = 0; i < next.widgets.length; i++) {
    if (next.widgets[i].id !== key) kept.push(next.widgets[i])
  }
  next.widgets = kept
  return next
}

// ------------------------------------------------------------------- config

function defaultInstance(type, id) {
  var entry = catalogEntry(type)
  if (!entry) return null
  var settings = defaultsFor(entry.type)
  var size = defaultSize(type)
  return {
    id: String(id),
    type: entry.type,
    enabled: true,
    monitor: "",
    // Overwritten with a real side the moment this goes through
    // `normalizeInstance`, which everything reaching the config does.
    side: "",
    col: 0,
    row: 0,
    cols: size[0],
    rows: size[1],
    // null means "follow the layout's global opacity"; a number overrides the
    // layout for this card alone.
    opacity: null,
    // -1 follows the theme's Hyprland rounding; anything else is literal px.
    // The default is a shape rather than the theme's because a desktop card is
    // an order of magnitude larger than the bar chrome `decoration:rounding`
    // was chosen for, and a 0 there should not square off a 200px card.
    radius: 20,
    settings: settings
  }
}

// The first config anyone gets: one clock, on, top of the right-hand grid.
function defaultConfig() {
  var layout = normalizeLayout(DEFAULT_LAYOUT)
  var clock = defaultInstance("clock", "clock")
  clock.side = layout.side
  return { version: SCHEMA_VERSION, layout: layout, widgets: [clock] }
}

function normalizeSettings(entry, raw) {
  var source = isPlainObject(raw) ? raw : {}
  var schema = Array.isArray(entry.settings) ? entry.settings : []
  var out = {}
  // Driven by the schema, not by the file: an unknown key is dropped, and
  // every known key lands as the kind of value its type promises.
  for (var i = 0; i < schema.length; i++) {
    var spec = schema[i]
    var value = source[spec.key]
    out[spec.key] = coerceSetting(spec, value)
  }
  return out
}

function coerceSetting(spec, value) {
  var fallback = spec.defaultValue
  if (value === undefined || value === null) return fallback

  if (spec.type === "boolean") return value === true
  if (spec.type === "number") return clampNumber(value, -1e6, 1e6, fallback)

  if (spec.type === "choice") {
    var wanted = clampString(value)
    var options = Array.isArray(spec.options) ? spec.options : []
    for (var i = 0; i < options.length; i++) {
      var candidate = isPlainObject(options[i]) ? options[i].value : options[i]
      if (String(candidate) === wanted) return wanted
    }
    return fallback
  }

  if (spec.type === "timezone") {
    // A zone that is not a zone would reach a command line as one. Empty is
    // always allowed and means "my own clock".
    var zone = clampString(value)
    return zone === "" || isSafeZone(zone) ? zone : fallback
  }

  return clampString(value)
}

function normalizeInstance(raw, index, layout) {
  if (!isPlainObject(raw)) return null
  var entry = catalogEntry(clampString(raw.type))
  if (!entry) return null

  var id = clampString(raw.id) || (entry.type + "-" + (index + 1))
  var out = defaultInstance(entry.type, id)

  if (typeof raw.enabled === "boolean") out.enabled = raw.enabled
  out.monitor = clampString(raw.monitor)
  // Resolved to one of the two sides here, once, rather than left as "follow
  // the layout" for everything downstream to work out.
  //
  // That matters more than it looks: `rectsOverlap` is handed bare blocks with
  // no layout in reach, so an unresolved side there has to guess -- and a
  // guess means two widgets on what it thinks are different grids, quietly
  // drawn on top of each other. Making it explicit at the door means nothing
  // below this line can get it wrong.
  //
  // A file that says nothing, or says something that is not a side, still
  // means "wherever the rest of them are", which is what every config written
  // before widgets had sides means.
  var side = clampString(raw.side)
  out.side = SIDES.indexOf(side) === -1 ? sideOf(null, layout) : side

  // A footprint the type does not offer is not a footprint. Falling back to
  // the default keeps a hand-edited file from producing a widget that the
  // editor cannot represent or resize back.
  var cols = Math.round(clampNumber(raw.cols, 1, MAX_COLUMNS, out.cols))
  var rows = Math.round(clampNumber(raw.rows, 1, MAX_ROWS, out.rows))
  if (isAllowedSize(entry.type, cols, rows)) { out.cols = cols; out.rows = rows }

  // Clamped so a widget can never begin off the right of the grid; overlaps
  // are resolved later, once every widget's footprint is known.
  var maxCol = Math.max(0, layout.columns - out.cols)
  out.col = Math.round(clampNumber(raw.col, 0, maxCol, 0))
  out.row = Math.round(clampNumber(raw.row, 0, MAX_ROWS - 1, 0))

  // Absent or null keeps "follow the layout's global opacity"; anything else
  // is a per-card override.
  out.opacity = (raw.opacity === undefined || raw.opacity === null)
    ? null
    : Math.round(clampNumber(raw.opacity, 0, 1, DEFAULT_OPACITY) * 100) / 100
  out.radius = Math.round(clampNumber(raw.radius, -1, 400, out.radius))
  out.settings = normalizeSettings(entry, raw.settings)
  return out
}

// Configs written against the free-placement model that came before the grid
// carry an `anchor` and pixel offsets and no cell at all. Rather than drop
// them, keep everything that still means something and let the packer below
// find each widget a cell.
function isLegacyInstance(raw) {
  return isPlainObject(raw) && raw.col === undefined && raw.row === undefined
    && (raw.anchor !== undefined || raw.offsetX !== undefined || raw.scale !== undefined)
}

function normalizeConfig(raw) {
  var source = isPlainObject(raw) ? raw : {}
  var layout = normalizeLayout(source.layout)
  var list = Array.isArray(source.widgets) ? source.widgets : []

  var widgets = []
  var seen = {}
  var unplaced = []
  for (var i = 0; i < list.length && widgets.length < MAX_WIDGETS; i++) {
    var legacy = isLegacyInstance(list[i])
    var inst = normalizeInstance(list[i], widgets.length, layout)
    if (!inst || seen[inst.id]) continue
    seen[inst.id] = true
    widgets.push(inst)
    if (legacy) unplaced.push(inst.id)
  }

  var config = { version: SCHEMA_VERSION, layout: layout, widgets: widgets }

  // Anything migrated in has no opinion about where it goes, so it is packed
  // rather than trusted. Everything else keeps the cell it was given unless it
  // collides with something already placed.
  for (var u = 0; u < unplaced.length; u++) relocate(config, unplaced[u])
  resolveOverlaps(config)
  return config
}

// ----------------------------------------------------------------- packing

// Do two blocks collide? Sides first: the left grid and the right grid are two
// separate boards, and a cell on one has nothing to do with the same cell on
// the other.
//
// Folding the side in here rather than filtering by it at each call site is
// what lets the whole placement system -- fitting, packing, displacing,
// resolving -- stay exactly as it was. Nothing above this line had to learn
// that there are two grids.
function rectsOverlap(a, b) {
  if (sideOf(a) !== sideOf(b)) return false
  return a.col < b.col + b.cols && b.col < a.col + a.cols
    && a.row < b.row + b.rows && b.row < a.row + a.rows
}

// The side a widget or a block belongs to. Absent means the layout's own side,
// which is what every config written before widgets had sides means -- and why
// one of those still draws exactly where it always did.
function sideOf(block, layout) {
  var value = block ? clampString(block.side) : ""
  // Called with a null block to mean "whatever the layout calls home", which
  // is what an unset side resolves to.
  if (SIDES.indexOf(value) !== -1) return value
  return layout && SIDES.indexOf(clampString(layout.side)) !== -1
    ? clampString(layout.side) : DEFAULT_LAYOUT.side
}

// Only enabled widgets take up room. One that is switched off keeps its cell
// recorded so turning it back on puts it where it was, but it does not stop
// anything else moving in meanwhile.
function occupants(config, exceptId) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (!list[i].enabled) continue
    if (exceptId !== undefined && list[i].id === exceptId) continue
    out.push(list[i])
  }
  return out
}

// Does a block sit inside the grid and clear of everything in `others`? The
// list is passed in rather than read off the config so the caller decides who
// has to give way — which is the whole difference between "this widget is in
// conflict" and "this widget arrived later".
function fitsAmong(layout, block, others) {
  if (block.col < 0 || block.row < 0) return false
  if (block.col + block.cols > layout.columns) return false
  if (block.row + block.rows > MAX_ROWS) return false
  for (var i = 0; i < others.length; i++) {
    if (rectsOverlap(block, others[i])) return false
  }
  return true
}

// First cell a block fits in, scanning left to right then down — the reading
// order, so a widget dropped into a full grid lands where the eye expects the
// next one to go.
function firstFreeCellAmong(layout, cols, rows, others, side) {
  var where = SIDES.indexOf(String(side)) === -1 ? layout.side : String(side)
  for (var row = 0; row < MAX_ROWS; row++) {
    for (var col = 0; col + cols <= layout.columns; col++) {
      var block = { col: col, row: row, cols: cols, rows: rows, side: where }
      if (fitsAmong(layout, block, others)) return { col: col, row: row, side: where }
    }
  }
  return null
}

// Can a `cols` x `rows` block sit at (col, row) without leaving the grid or
// landing on any other live widget?
function canPlace(config, id, col, row, cols, rows, side) {
  var target = findInstance(config, id)
  var where = SIDES.indexOf(String(side)) === -1
    ? sideOf(target, config.layout) : String(side)
  return fitsAmong(config.layout,
    { col: col, row: row, cols: cols, rows: rows, side: where },
    occupants(config, id))
}

// The first free cell at or below `startRow`, then wrapping to the top. Where
// something pushed out of the way should land: a widget displaced by a drop
// belongs under the thing that displaced it, not back at the top of the grid
// in a cell that happened to be empty.
function firstFreeCellFrom(layout, cols, rows, others, startRow, side) {
  var where = SIDES.indexOf(String(side)) === -1 ? layout.side : String(side)
  var begin = Math.max(0, Math.round(Number(startRow) || 0))
  var offset, row, col
  for (offset = 0; offset < MAX_ROWS; offset++) {
    // Below first, then round the top for the rows already passed.
    row = begin + offset
    if (row >= MAX_ROWS) row = row - MAX_ROWS
    for (col = 0; col + cols <= layout.columns; col++) {
      var block = { col: col, row: row, cols: cols, rows: rows, side: where }
      if (fitsAmong(layout, block, others)) return { col: col, row: row, side: where }
    }
  }
  return null
}

function firstFreeCell(config, id, cols, rows, side) {
  return firstFreeCellAmong(config.layout, cols, rows, occupants(config, id), side)
}

// Put a widget somewhere legal, wherever that turns out to be.
function relocate(config, id) {
  var target = findInstance(config, id)
  if (!target) return false
  var cell = firstFreeCell(config, id, target.cols, target.rows,
    sideOf(target, config.layout))
  if (!cell) return false
  target.col = cell.col
  target.row = cell.row
  return true
}

// A hand-edited file can put two widgets on the same cell. Settle them in the
// order they appear, each one only having to clear the widgets already
// settled: that way the first entry keeps the cell it asked for and the later
// duplicate is the one that moves. Checking against the whole config instead
// would find the first widget "in conflict" too, and move it out from under
// itself.
function resolveOverlaps(config) {
  var list = config.widgets
  var settled = []
  for (var i = 0; i < list.length; i++) {
    var w = list[i]
    if (!w.enabled) continue
    if (!fitsAmong(config.layout, w, settled)) {
      var cell = firstFreeCellAmong(config.layout, w.cols, w.rows, settled,
        sideOf(w, config.layout))
      if (cell) { w.col = cell.col; w.row = cell.row }
    }
    settled.push(w)
  }
  return config
}

// How many rows the grid actually uses, for drawing an editor that is as tall
// as the content plus one empty row to drop into.
// The lowest row anything reaches, on either side. The editor draws one row
// past this so there is always somewhere new to drop, and both grids are drawn
// to the same depth so they read as one surface rather than two lists.
function usedRows(config) {
  var list = occupants(config)
  var max = 0
  for (var i = 0; i < list.length; i++) max = Math.max(max, list[i].row + list[i].rows)
  return max
}

// A config a widget type added later has never been in. It arrives switched
// off, so an update never puts something on the desktop unasked.
function ensureCatalogCoverage(config) {
  var next = normalizeConfig(config)
  var present = {}
  for (var i = 0; i < next.widgets.length; i++) present[next.widgets[i].type] = true

  var types = catalogTypes()
  for (var t = 0; t < types.length; t++) {
    if (present[types[t]]) continue
    if (next.widgets.length >= MAX_WIDGETS) break
    var added = defaultInstance(types[t], types[t])
    added.enabled = false
    next.widgets.push(added)
  }
  return next
}

function findInstance(config, id) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var key = String(id || "")
  for (var i = 0; i < list.length; i++) if (list[i].id === key) return list[i]
  return null
}

// --------------------------------------------------------------- mutations
//
// Every one of these takes a config and returns a new normalized one, so a
// caller can never half-apply a change or leave the grid in a state the
// drawing code has to defend against.

function setEnabled(config, id, enabled) {
  var next = normalizeConfig(config)
  var target = findInstance(next, id)
  if (!target) return next
  var wasEnabled = target.enabled
  target.enabled = enabled === true
  // Coming back on, its old cell may have been taken while it was away.
  if (target.enabled && !wasEnabled
    && !canPlace(next, id, target.col, target.row, target.cols, target.rows)) relocate(next, id)
  return next
}

function toggleEnabled(config, id) {
  var current = findInstance(config, id)
  return setEnabled(config, id, !(current && current.enabled))
}

// Move a widget to a cell. A drop that does not fit is refused rather than
// nudged: the editor shows whether the cell under the pointer is legal, so a
// refusal is something the user already saw coming.
// Drop a widget on a cell, moving whatever was there out of the way.
//
// This is the whole of what a drop means, and it is here rather than in the
// editor because the editor needs to answer it twice: once every time the
// pointer moves, to show what *would* happen, and once on release to make it
// happen. Two implementations of that would be two chances to disagree, and
// the disagreement would be a card landing somewhere the preview did not say.
//
// Occupied is not the same as illegal. A cell with something in it is the
// most natural place to aim for -- it is where you can see a widget already
// fits -- so the thing already there moves rather than the drop being
// refused. Two rules, in this order:
//
//   - **Swap**, when exactly one widget is in the way and it has the same
//     footprint. It takes the cell the dragged one just left, which is the
//     shortest distance anything has to travel and the only outcome that
//     leaves the grid as full as it found it.
//   - **Push down**, otherwise. Everything in the way is relocated to the
//     first free cell at or below the drop, in reading order, so the widgets
//     you displaced end up under the one you moved rather than scattered
//     into whatever gaps existed above it.
//
// Returns null when the drop cannot happen at all: off the grid, wider than
// the grid, or a grid so full there is nowhere for a displaced widget to go.
// Null means "the highlight should say no"; anything else is the new config.
function placeDisplacing(config, id, col, row, side) {
  var next = normalizeConfig(config)
  var target = findInstance(next, id)
  if (!target) return null

  var c = Math.round(Number(col))
  var r = Math.round(Number(row))
  if (!isFinite(c) || !isFinite(r)) return null
  if (c < 0 || r < 0) return null
  if (c + target.cols > next.layout.columns) return null
  if (r + target.rows > MAX_ROWS) return null

  // Which grid it is being dropped on. Omitted means "the one it is already
  // on", so every caller that predates two grids still means what it said.
  var toSide = SIDES.indexOf(String(side)) === -1
    ? sideOf(target, next.layout) : String(side)

  // Where it came from, before anything moves. A widget coming in from the
  // tray has no cell to give back, which is what rules the swap out for it.
  var wasEnabled = target.enabled === true
  var fromCol = target.col
  var fromRow = target.row
  var fromSide = sideOf(target, next.layout)

  target.enabled = true
  target.col = c
  target.row = r
  target.side = toSide

  var block = { col: c, row: r, cols: target.cols, rows: target.rows, side: toSide }
  var others = occupants(next, id)
  var displaced = []
  var settled = [target]
  var i
  for (i = 0; i < others.length; i++) {
    if (rectsOverlap(block, others[i])) displaced.push(others[i])
    else settled.push(others[i])
  }

  if (displaced.length === 0) return next

  // The swap. Only for a widget that had a cell to swap into, and only when
  // the footprints match -- a 2x1 cannot take a 1x1's cell, and pretending
  // otherwise would be an overlap dressed up as a swap.
  if (displaced.length === 1 && wasEnabled
    && displaced[0].cols === target.cols && displaced[0].rows === target.rows) {
    displaced[0].col = fromCol
    displaced[0].row = fromRow
    // Across the screen as well as across the grid: dropping a left-hand card
    // onto a right-hand one trades their places, which is what "swap" means
    // when the two are not on the same board.
    displaced[0].side = fromSide
    return next
  }

  // The push. Nearest first, so the widget closest to the top of the drop is
  // the one that gets the cell closest under it.
  displaced.sort(function (a, b) { return a.row - b.row || a.col - b.col })
  for (i = 0; i < displaced.length; i++) {
    var cell = firstFreeCellFrom(next.layout,
      displaced[i].cols, displaced[i].rows, settled, r, toSide)
    // Nowhere at all to put it. Refuse the whole drop rather than leave a
    // widget stacked on another one: a half-applied move is worse than none.
    if (!cell) return null
    displaced[i].col = cell.col
    displaced[i].row = cell.row
    settled.push(displaced[i])
  }
  return next
}

// Move a widget already on the grid. A cell with something in it is not a
// refusal any more -- the occupant moves. See placeDisplacing.
function moveWidget(config, id, col, row, side) {
  var target = findInstance(config, id)
  // Still a no-op for something in the tray: "move" is about rearranging what
  // is on the desktop, and `place` is the one that puts a widget there.
  if (!target || !target.enabled) return normalizeConfig(config)
  var next = placeDisplacing(config, id, col, row, side)
  return next === null ? normalizeConfig(config) : next
}

// Drop a widget onto a cell, switching it on if it was in the tray. Enabling
// and moving are one step on purpose: a widget that arrived on the grid but
// landed nowhere legal, or moved but stayed off, are both states the editor
// would then have to explain.
function placeWidget(config, id, col, row, side) {
  var next = placeDisplacing(config, id, col, row, side)
  return next === null ? normalizeConfig(config) : next
}

// Change one setting on one widget. The value goes through exactly the same
// coercion a value read from the config file does, so nothing the editor can
// send differs from something the file could have said.
function setSetting(config, id, key, value) {
  var next = normalizeConfig(config)
  var target = findInstance(next, id)
  if (!target) return next
  var spec = settingSpec(target.type, key)
  if (!spec) return next
  target.settings[spec.key] = coerceSetting(spec, value)
  return next
}

// Resize to one of the footprints the type offers. If the new one does not fit
// where the widget is standing, it is moved rather than refused — the size is
// what was asked for, the cell was not.
function resizeWidget(config, id, cols, rows) {
  var next = normalizeConfig(config)
  var target = findInstance(next, id)
  if (!target) return next
  var c = Math.round(Number(cols))
  var r = Math.round(Number(rows))
  if (!isAllowedSize(target.type, c, r)) return next
  target.cols = c
  target.rows = r
  if (target.col + c > next.layout.columns) target.col = Math.max(0, next.layout.columns - c)
  if (!canPlace(next, id, target.col, target.row, c, r)) relocate(next, id)
  return next
}

function cycleSize(config, id) {
  var current = findInstance(config, id)
  if (!current) return normalizeConfig(config)
  var size = nextSize(current.type, current.cols, current.rows)
  return resizeWidget(config, id, size[0], size[1])
}

// Put everything on one side.
//
// `layout.side` is where a widget goes when it has not said otherwise -- which
// is every widget in every config written before sides existed. Setting it also
// moves what is already placed, because that is what the button saying "Left"
// looks like it does, and because for a desktop using one side it is exactly
// what this always did.
function setSide(config, side) {
  var next = normalizeConfig(config)
  var value = clampString(side)
  if (SIDES.indexOf(value) === -1) return next
  next.layout.side = value
  for (var i = 0; i < next.widgets.length; i++) next.widgets[i].side = value
  return resolveOverlaps(next)
}

// Move one widget to a side, keeping its cell if that cell is free over there.
function setWidgetSide(config, id, side) {
  var next = normalizeConfig(config)
  var target = findInstance(next, id)
  var value = clampString(side)
  if (!target || SIDES.indexOf(value) === -1) return next
  if (sideOf(target, next.layout) === value) return next
  var was = target.side
  target.side = value
  if (fitsAmong(next.layout, target, occupants(next, id))) return next
  // Taken over there. Fall back to the first free cell on that side rather
  // than refusing: the side is what was asked for, the cell was incidental.
  var cell = landingCell(next, target.cols, target.rows, value)
  if (!cell) { target.side = was; return next }
  target.col = cell.col
  target.row = cell.row
  return next
}

// Which sides actually have something on them. The editor draws both grids
// regardless -- that is how you discover you can use the other one -- but the
// empty one is drawn as an invitation rather than as a peer.
function sidesInUse(config) {
  var list = occupants(config)
  var layout = config && config.layout ? config.layout : normalizeLayout(null)
  var out = {}
  for (var i = 0; i < SIDES.length; i++) out[SIDES[i]] = false
  for (var w = 0; w < list.length; w++) out[sideOf(list[w], layout)] = true
  return out
}

function setColumns(config, columns) {
  var next = normalizeConfig(config)
  var n = Math.round(clampNumber(columns, 1, MAX_COLUMNS, next.layout.columns))
  next.layout.columns = n
  // Narrowing the grid can strand a widget off its right edge, or leave one
  // wider than the grid itself. Shrink what no longer fits, then repack.
  for (var i = 0; i < next.widgets.length; i++) {
    var w = next.widgets[i]
    if (w.cols > n) {
      var sizes = sizesFor(w.type)
      var best = sizes[0]
      for (var s = 0; s < sizes.length; s++) if (sizes[s][0] <= n && sizes[s][0] >= best[0]) best = sizes[s]
      w.cols = Math.min(n, best[0])
      w.rows = best[1]
    }
    if (w.col + w.cols > n) w.col = Math.max(0, n - w.cols)
  }
  return resolveOverlaps(next)
}

// The layout's global scale: one knob for every card. Scale is global only, so
// the grid is the whole story — a card is exactly as big as its cell.
function setScale(config, scale) {
  var n = Number(scale)
  if (!isFinite(n)) return normalizeConfig(config)
  var next = normalizeConfig(config)
  next.layout.scale = Math.round(clampNumber(n, MIN_SCALE, MAX_SCALE, DEFAULT_LAYOUT.scale) * 100) / 100
  return next
}

// The layout's global opacity, the same deal as `setScale`: moving it writes
// over any per-card opacity so the whole grid matches again. Opaque is 1, and
// an invalid value falls back to the default opacity.
function setLayoutOpacity(config, opacity) {
  var n = Number(opacity)
  if (!isFinite(n)) return normalizeConfig(config)
  var next = normalizeConfig(config)
  next.layout.opacity = Math.round(clampNumber(n, 0, 1, DEFAULT_LAYOUT.opacity) * 100) / 100
  dropOpacityOverrides(next)
  return next
}

// With the global opacity changed, a card that had its own keeps it no longer:
// the point of touching the global is the whole grid moving together.
function dropOpacityOverrides(config) {
  for (var i = 0; i < config.widgets.length; i++) config.widgets[i].opacity = null
}

// Back to what the plugin ships with: the grid's default scale and opacity,
// with no card keeping its own opacity. What was edited is lost — this is the
// "I moved too many knobs" button.
function resetAppearance(config) {
  var next = normalizeConfig(config)
  next.layout.scale = DEFAULT_LAYOUT.scale
  next.layout.opacity = DEFAULT_LAYOUT.opacity
  dropOpacityOverrides(next)
  return next
}

// One widget's opacity on its own, so a card can sit over the wallpaper in a
// way the rest of the grid does not need to follow.
function setOpacity(config, id, opacity) {
  var n = Number(opacity)
  if (!isFinite(n)) return normalizeConfig(config)
  var next = normalizeConfig(config)
  var target = findInstance(next, id)
  if (!target) return next
  target.opacity = Math.round(clampNumber(n, 0, 1, DEFAULT_OPACITY) * 100) / 100
  return next
}

// Give a card back to the layout's opacity after it had its own.
function clearOpacity(config, id) {
  var next = normalizeConfig(config)
  var target = findInstance(next, id)
  if (!target) return next
  target.opacity = null
  return next
}

// What the card actually renders: its own override when it set one, otherwise
// the layout's global opacity.
function effectiveOpacity(config, instance) {
  if (instance && typeof instance.opacity === "number") return instance.opacity
  var global = config && config.layout ? config.layout.opacity : undefined
  return typeof global === "number" ? global : DEFAULT_LAYOUT.opacity
}

// Instances that should be drawn on the output named `screenName`. An empty
// `monitor` means every output, which is what a desktop widget usually wants.
function widgetsForScreen(config, screenName) {
  var list = occupants(config)
  var name = String(screenName || "")
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].monitor && list[i].monitor !== name) continue
    out.push(list[i])
  }
  return out
}

// Does this type ask to be clickable? Only a type that says so, and only
// over its own rectangle -- everything else stays click-through.
function isInteractiveType(type) {
  var entry = catalogEntry(type)
  return !!(entry && entry.interactive === true)
}

// The widgets on a screen that want input. The desktop surface turns exactly
// these rectangles back into an input region and leaves the rest alone.
function interactiveWidgetsForScreen(config, screenName) {
  var list = widgetsForScreen(config, screenName)
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (isInteractiveType(list[i].type)) out.push(list[i])
  }
  return out
}

// Everything switched off, in catalogue order. This is the editor's tray.
function offWidgets(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var out = []
  for (var i = 0; i < list.length; i++) if (!list[i].enabled) out.push(list[i])
  return out
}

// ------------------------------------------------------------ repo pulse
//
// The public REST API, unauthenticated: sixty requests an hour per address,
// which two repositories refreshed every half hour is comfortably inside.

// "owner/name", to GitHub's own rules for both halves. This becomes two path
// segments, so it is checked rather than trusted.
function isSafeRepo(value) {
  if (typeof value !== "string") return false
  var parts = value.split("/")
  if (parts.length !== 2) return false
  if (!isSafeLogin(parts[0])) return false
  var name = parts[1]
  if (name.length === 0 || name.length > 100) return false
  return /^[A-Za-z0-9._-]+$/.test(name) && name !== "." && name !== ".."
}

function reposInUse(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].type !== "repo-pulse") continue
    var repo = list[i].settings ? clampString(list[i].settings.repo) : ""
    if (!repo || seen[repo] || !isSafeRepo(repo)) continue
    seen[repo] = true
    out.push(repo)
  }
  return out
}

function parseRepo(raw) {
  var data = raw
  if (typeof raw === "string") {
    try { data = JSON.parse(raw) } catch (e) { return null }
  }
  if (!isPlainObject(data)) return null
  if (typeof data.full_name !== "string" || data.full_name === "") return null
  return {
    fullName: clampString(data.full_name),
    description: clampString(typeof data.description === "string" ? data.description : ""),
    stars: Math.max(0, Math.round(clampNumber(data.stargazers_count, 0, 1e9, 0))),
    forks: Math.max(0, Math.round(clampNumber(data.forks_count, 0, 1e9, 0))),
    issues: Math.max(0, Math.round(clampNumber(data.open_issues_count, 0, 1e9, 0))),
    pushedAt: clampString(typeof data.pushed_at === "string" ? data.pushed_at : "")
  }
}

// GitHub's `open_issues_count` counts pull requests as issues, which is a
// long-standing quirk of the API and not what anybody means by "issues". The
// search endpoint gives the pull request count on its own, so the two can be
// told apart and shown as the two different things they are.
function parsePullCount(raw) {
  var data = raw
  if (typeof raw === "string") {
    try { data = JSON.parse(raw) } catch (e) { return null }
  }
  if (!isPlainObject(data)) return null
  var n = Number(data.total_count)
  if (!isFinite(n) || n < 0) return null
  return Math.round(n)
}

// The four numbers the card shows. `issues` is what is left once the pull
// requests are taken back out of GitHub's combined count; until that count
// has arrived the combined figure is shown rather than a wrong smaller one.
function repoStats(info, pulls) {
  if (!isPlainObject(info)) return null
  // Checked for absence before coercion: Number(null) is 0, which is a
  // perfectly finite number and would report "no open pull requests" for a
  // repository whose count has simply not arrived yet.
  var known = pulls !== null && pulls !== undefined && isFinite(Number(pulls)) && Number(pulls) >= 0
  var prs = known ? Number(pulls) : 0
  return {
    stars: info.stars,
    forks: info.forks,
    issues: known ? Math.max(0, info.issues - Math.round(prs)) : info.issues,
    pulls: known ? Math.round(prs) : null
  }
}

// Where the name on the card points. GitHub's own `full_name` is preferred
// over whatever was typed into the config: it is canonical, so a repository
// that has since been renamed resolves to where it actually lives rather than
// to a redirect. Either way it is checked again before becoming a URL — this
// one arrives over the network.
function repoUrl(info, configured) {
  var candidates = []
  if (isPlainObject(info) && typeof info.fullName === "string") candidates.push(info.fullName)
  if (typeof configured === "string") candidates.push(configured)
  for (var i = 0; i < candidates.length; i++) {
    if (isSafeRepo(candidates[i])) return "https://github.com/" + candidates[i]
  }
  return ""
}

// 46148 -> "46.1k". Counts on this card are for scale, not for arithmetic.
function compactCount(value) {
  var n = Number(value)
  if (!isFinite(n) || n < 0) return "0"
  if (n < 1000) return String(Math.round(n))
  if (n < 1000000) {
    var k = n / 1000
    return (k < 10 ? k.toFixed(1).replace(/\.0$/, "") : String(Math.round(k))) + "k"
  }
  var m = n / 1000000
  return (m < 10 ? m.toFixed(1).replace(/\.0$/, "") : String(Math.round(m))) + "M"
}

// "2026-09-04T16:07:18Z" against now, as the coarsest true thing: "3h",
// "2d", "5w". A repository's last push does not want a clock.
function sinceLabel(iso, nowMs) {
  var then = Date.parse(String(iso || ""))
  if (!isFinite(then)) return ""
  var now = Number(nowMs)
  if (!isFinite(now)) return ""
  var seconds = Math.floor((now - then) / 1000)
  if (seconds < 0) return "now"
  if (seconds < 3600) return Math.max(1, Math.floor(seconds / 60)) + "m"
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h"
  if (seconds < 604800) return Math.floor(seconds / 86400) + "d"
  if (seconds < 2592000) return Math.floor(seconds / 604800) + "w"
  if (seconds < 31536000) return Math.floor(seconds / 2592000) + "mo"
  return Math.floor(seconds / 31536000) + "y"
}

// ----------------------------------------------------------------- music

// Seconds to "3:45", and past an hour to "1:03:45".
function trackTime(seconds) {
  var n = Number(seconds)
  if (!isFinite(n) || n < 0) return "0:00"
  var total = Math.floor(n)
  var s = total % 60
  var m = Math.floor(total / 60) % 60
  var h = Math.floor(total / 3600)
  var mm = h > 0 && m < 10 ? "0" + m : String(m)
  var ss = s < 10 ? "0" + s : String(s)
  return h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss
}

// How far through, clamped, and zero rather than NaN when the player has not
// said how long the track is.
function trackFraction(position, length) {
  var pos = Number(position)
  var len = Number(length)
  if (!isFinite(pos) || !isFinite(len) || len <= 0) return 0
  return Math.min(1, Math.max(0, pos / len))
}

// playerctld mirrors whatever else is on the bus. It answers as a player in
// its own right, and it lags the thing it is mirroring, so picking it is the
// difference between a card that updates when the track changes and one that
// updates a moment later. Omarchy's own media widget deprioritises it for the
// same reason; this follows its rules so the bar and the card agree.
function isProxyPlayer(player) {
  var bus = String((player && player.dbusName) || "").toLowerCase()
  var entry = String((player && player.desktopEntry) || "").toLowerCase()
  return bus.indexOf("playerctld") !== -1 || entry === "playerctld"
}

// Something worth drawing a card about.
function hasTrackMetadata(player) {
  return !!(player && (player.trackTitle || player.trackArtist
    || player.trackAlbum || player.trackArtUrl))
}

function playerCanControl(player) {
  return !!(player && (player.canTogglePlaying || player.canPlay
    || player.canPause || player.canControl))
}

// Anything at all that identifies a player, which is a lower bar than having
// a track. It is what a name the user asked for is matched against: a player
// they named by hand should be followed even before it says what is loaded.
function hasAnyMetadata(player) {
  return !!(player && (hasTrackMetadata(player) || player.identity || player.desktopEntry))
}

// How good a candidate a player is, highest wins. The weights encode the
// order Omarchy's media service resolves in: something playing beats
// something with a track, which beats something merely controllable, and a
// real player beats a proxy at equal rank.
function playerScore(player) {
  if (!player) return -1
  var score = 0
  if (player.isPlaying === true) score += 8
  if (hasTrackMetadata(player)) score += 4
  if (playerCanControl(player)) score += 2
  if (!isProxyPlayer(player)) score += 1
  return score
}

// Which player the widget should follow, given what is registered. A name the
// user asked for wins as long as it has anything to show; otherwise the best
// scoring candidate, and the first of them on a tie so the choice does not
// flicker between two equals.
//
// Takes plain objects so it can be tested without a session bus.
function pickPlayerIndex(players, preferred) {
  // Length-and-index rather than Array.isArray: what arrives at runtime is
  // Mpris.players.values, a QML list that indexes and measures like an array
  // but is not one, so Array.isArray says false and every player vanishes.
  // Tests hand it a real array and would never have caught that.
  if (!players) return -1
  var count = Number(players.length)
  if (!isFinite(count) || count <= 0) return -1

  var wanted = clampString(preferred).toLowerCase()
  if (wanted !== "") {
    for (var p = 0; p < count; p++) {
      var identity = String((players[p] && players[p].identity) || "").toLowerCase()
      var bus = String((players[p] && players[p].dbusName) || "").toLowerCase()
      if ((identity.indexOf(wanted) !== -1 || bus.indexOf(wanted) !== -1)
        && hasAnyMetadata(players[p])) return p
    }
  }

  var best = -1
  var bestScore = -1
  for (var i = 0; i < count; i++) {
    var score = playerScore(players[i])
    if (score > bestScore) { bestScore = score; best = i }
  }
  return best
}

// Enough to draw a card: a title or an artist. Some players publish one a
// moment before the other, and waiting for the title means the card says
// "nothing playing" while the desktop is plainly playing something.
function hasPlayable(player) {
  return !!(player && (player.trackTitle || player.trackArtist))
}

// Which transport controls a player will actually answer. MPRIS publishes a
// flag per control and they are not decoration: a browser tab has somewhere
// to pause and nowhere to skip to, and a button that does nothing when it is
// pressed is worse than no button. Only an explicit true counts — these
// arrive over a bus, so an absent flag is not a no by accident.
function playerTransport(player) {
  return {
    toggle: !!player && player.canTogglePlaying === true,
    previous: !!player && player.canGoPrevious === true,
    next: !!player && player.canGoNext === true
  }
}

// -------------------------------------------------------- contributions
//
// GitHub does not publish the contribution calendar through its REST API,
// but the page that draws it is served on its own at
// /users/<login>/contributions and needs no token. That is the whole source:
// github.com directly, no third party standing between the desktop and it.

// A login is a path segment, so it is checked against GitHub's own rule
// before it can become one: alphanumerics and single hyphens, not starting
// or ending with one, 39 characters at most.
function isSafeLogin(login) {
  // The type is checked, not just coerced. A GitHub login may be all digits,
  // so unlike a timezone — whose pattern has to start with a letter and
  // rejects a stray number on the way past — the pattern here would happily
  // accept one. Anything that is not a string got here by mistake.
  if (typeof login !== "string") return false
  var value = login
  if (value.length === 0 || value.length > 39) return false
  return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(value)
}

// Every distinct login the config names, enabled or not, so switching a
// widget on does not have to wait for a request.
function loginsInUse(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].type !== "github") continue
    var login = list[i].settings ? clampString(list[i].settings.login) : ""
    if (!login || seen[login] || !isSafeLogin(login)) continue
    seen[login] = true
    out.push(login)
  }
  return out
}

var MAX_CONTRIBUTION_BYTES = 4194304

// Pull the calendar out of the page. Every day is a `<td>` carrying both a
// date and a level; the legend swatches carry a level and no date, which is
// why the date is what the pattern leads with — matching on level alone
// picks up five squares that are not days.
function parseContributions(raw) {
  var html = String(raw || "")
  if (html.length === 0 || html.length > MAX_CONTRIBUTION_BYTES) return null

  var pattern = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*?data-level="(\d)"/g
  var days = []
  var match
  while ((match = pattern.exec(html)) !== null) {
    days.push({ date: match[1], level: parseInt(match[2], 10) })
  }
  if (days.length === 0) return null

  // The page lays the calendar out a row at a time — every seventh day, not
  // every day — so what arrives is in reading order for a grid, not in date
  // order. Sort before anything downstream assumes otherwise.
  days.sort(function(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0) })

  var total = ""
  var totalMatch = html.match(/([\d,]+)\s+contributions?\s+in\s+the\s+last\s+year/i)
  if (totalMatch) total = totalMatch[1]

  return { total: total, days: days, at: Date.now() }
}

function dayOfWeekUTC(date) {
  var parts = String(date || "").split("-")
  if (parts.length !== 3) return -1
  var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
  return isFinite(d.getTime()) ? d.getUTCDay() : -1
}

function dateMs(date) {
  var parts = String(date || "").split("-")
  if (parts.length !== 3) return NaN
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
}

var DAY_MS = 86400000

// The most recent `weeks` columns, as flat cells the drawing can place
// without doing any date arithmetic of its own. Columns are weeks, rows are
// days of the week, Sunday first, which is the shape GitHub's own grid has.
function contributionGrid(contributions, weeks) {
  var days = contributions && Array.isArray(contributions.days) ? contributions.days : []
  var wanted = Math.max(1, Math.round(Number(weeks) || 1))
  if (days.length === 0) return { columns: 0, cells: [], from: "", to: "", shown: 0 }

  // Weeks are counted from the Sunday on or before the first day, so a run
  // that starts mid-week still lands in the right row.
  var firstMs = dateMs(days[0].date)
  var firstDow = dayOfWeekUTC(days[0].date)
  if (!isFinite(firstMs) || firstDow < 0) return { columns: 0, cells: [], from: "", to: "", shown: 0 }
  var originMs = firstMs - firstDow * DAY_MS

  var placed = []
  var lastColumn = 0
  for (var i = 0; i < days.length; i++) {
    var ms = dateMs(days[i].date)
    var dow = dayOfWeekUTC(days[i].date)
    if (!isFinite(ms) || dow < 0) continue
    var column = Math.floor((ms - originMs) / (7 * DAY_MS))
    if (column > lastColumn) lastColumn = column
    placed.push({ column: column, row: dow, level: days[i].level, date: days[i].date })
  }
  if (placed.length === 0) return { columns: 0, cells: [], from: "", to: "", shown: 0 }

  var firstWanted = Math.max(0, lastColumn - wanted + 1)
  var cells = []
  var from = ""
  var to = ""
  for (var c = 0; c < placed.length; c++) {
    if (placed[c].column < firstWanted) continue
    cells.push({
      col: placed[c].column - firstWanted,
      row: placed[c].row,
      level: placed[c].level,
      date: placed[c].date
    })
    if (from === "" || placed[c].date < from) from = placed[c].date
    if (to === "" || placed[c].date > to) to = placed[c].date
  }

  return {
    columns: lastColumn - firstWanted + 1,
    cells: cells,
    from: from,
    to: to,
    shown: cells.length
  }
}

// How many week columns fit in `width` at a given cell and gap. At least one,
// so a card too narrow to hold anything still draws a column rather than
// dividing by nothing.
function weeksThatFit(width, cell, gap) {
  var step = Number(cell) + Number(gap)
  if (!isFinite(step) || step <= 0) return 1
  return Math.max(1, Math.floor((Number(width) + Number(gap)) / step))
}

// "23 weeks", and the singular when it is one.
function weeksLabel(columns) {
  var n = Math.max(0, Math.round(Number(columns) || 0))
  return n === 1 ? "1 week" : n + " weeks"
}

// ----------------------------------------------------------- weather math
//
// wttr.in's j1 response, turned into the handful of values a card draws.
// It is the source the rest of Omarchy already uses, so the condition codes
// here are its codes (WWO's 113/116/119...), not WMO's.

// The glyphs Omarchy's own `omarchy-weather-icon` picks, so a widget and the
// bar agree about what overcast looks like. Codes not in the table fall back
// to the plain cloud rather than to nothing.
var WEATHER_ICONS = [
  { codes: [113], day: "\ue30d", night: "\ue32b" },
  { codes: [116], day: "\ue302", night: "\ue32e" },
  { codes: [119, 122], day: "\ue33d", night: "\ue33d" },
  { codes: [143, 248, 260], day: "\ue313", night: "\ue313" },
  { codes: [176, 263, 353], day: "\ue308", night: "\ue333" },
  { codes: [179, 227, 230, 323, 326, 368], day: "\ue30a", night: "\ue327" },
  { codes: [182, 185, 281, 284, 311, 314, 317, 320, 350, 362, 365, 374, 377],
    day: "\ue3ad", night: "\ue3ad" },
  { codes: [200, 386, 389, 392, 395], day: "\ue31d", night: "\ue31d" },
  { codes: [266, 293, 296, 299, 302, 305, 308, 356, 359], day: "\ue318", night: "\ue318" },
  { codes: [329, 332, 335, 338, 371], day: "\ue31a", night: "\ue31a" }
]

var WEATHER_ICON_FALLBACK = "\ue33d"

function weatherIcon(code, night) {
  var n = parseInt(code, 10)
  if (!isFinite(n)) return WEATHER_ICON_FALLBACK
  for (var i = 0; i < WEATHER_ICONS.length; i++) {
    if (WEATHER_ICONS[i].codes.indexOf(n) !== -1)
      return night ? WEATHER_ICONS[i].night : WEATHER_ICONS[i].day
  }
  return WEATHER_ICON_FALLBACK
}

// "06:18 AM" -> minutes since midnight. Anything else -> null, which the
// caller reads as "cannot tell", and a clock that cannot tell says day.
function parseClockTime(value) {
  var m = String(value || "").match(/^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i)
  if (!m) return null
  var rawHour = parseInt(m[1], 10)
  var minutes = parseInt(m[2], 10)
  // Checked before the wrap, not after: 25 % 12 is 1, which would make
  // "25:00 AM" a perfectly good one in the morning.
  if (rawHour < 1 || rawHour > 12 || minutes > 59) return null
  var hour = rawHour % 12
  if (m[3].toUpperCase() === "PM") hour += 12
  return hour * 60 + minutes
}

// Before sunrise or after sunset. Both are wall-clock times at the location,
// and `minutesNow` is too, so no timezone arithmetic is involved.
function isNight(minutesNow, sunrise, sunset) {
  var up = parseClockTime(sunrise)
  var down = parseClockTime(sunset)
  if (up === null || down === null) return false
  var now = Number(minutesNow)
  if (!isFinite(now)) return false
  // Somewhere the sun does not set on a given day, the two can invert.
  if (up >= down) return false
  return now < up || now >= down
}

function firstValue(list) {
  if (!Array.isArray(list) || list.length === 0) return ""
  var entry = list[0]
  if (isPlainObject(entry) && entry.value !== undefined) return String(entry.value)
  return String(entry)
}

function roundedTemp(value) {
  var n = Number(value)
  return isFinite(n) ? String(Math.round(n)) : ""
}

// The whole card, from one response. Returns null when the payload is not a
// weather report at all, so the caller can hold the last good one rather
// than draw an empty card over it.
function parseWeather(raw) {
  var data = raw
  if (typeof raw === "string") {
    try { data = JSON.parse(raw) } catch (e) { return null }
  }
  if (!isPlainObject(data)) return null

  var current = Array.isArray(data.current_condition) ? data.current_condition[0] : null
  if (!isPlainObject(current)) return null

  var today = Array.isArray(data.weather) ? data.weather[0] : null
  var area = Array.isArray(data.nearest_area) ? data.nearest_area[0] : null
  var astronomy = isPlainObject(today) && Array.isArray(today.astronomy) ? today.astronomy[0] : null

  var tempC = roundedTemp(current.temp_C)
  if (tempC === "") return null

  return {
    // wttr pads some descriptions with a trailing space.
    condition: clampString(String(firstValue(current.weatherDesc)).replace(/^\s+|\s+$/g, "")),
    code: parseInt(current.weatherCode, 10),
    tempC: tempC,
    tempF: roundedTemp(current.temp_F),
    highC: isPlainObject(today) ? roundedTemp(today.maxtempC) : "",
    highF: isPlainObject(today) ? roundedTemp(today.maxtempF) : "",
    lowC: isPlainObject(today) ? roundedTemp(today.mintempC) : "",
    lowF: isPlainObject(today) ? roundedTemp(today.mintempF) : "",
    place: clampString(isPlainObject(area) ? firstValue(area.areaName) : ""),
    sunrise: clampString(isPlainObject(astronomy) ? String(astronomy.sunrise || "") : ""),
    sunset: clampString(isPlainObject(astronomy) ? String(astronomy.sunset || "") : ""),
    at: Date.now()
  }
}

function isFahrenheit(units) { return String(units) === "fahrenheit" }

// A temperature the way a weather card writes one: the number and a degree
// sign, no unit letter. The card is not a conversion table.
function tempLabel(observation, units, field) {
  if (!isPlainObject(observation)) return ""
  var key = field + (isFahrenheit(units) ? "F" : "C")
  var value = observation[key]
  return value === undefined || value === "" ? "" : String(value) + "°"
}

// "H:26° L:11°", or nothing when the forecast did not carry a range.
function rangeLabel(observation, units) {
  var high = tempLabel(observation, units, "high")
  var low = tempLabel(observation, units, "low")
  if (high === "" || low === "") return ""
  return "H:" + high + "  L:" + low
}

// ------------------------------------------------------------- clock math
//
// The QML JS engine has no Intl and ignores the `timeZone` option on
// toLocaleString — it silently renders local time for every zone — so zone
// offsets are resolved outside, by `date`, and applied as arithmetic here.

// Refuse anything that isn't a plain zoneinfo name before it reaches a
// command line: no "..", no leading slash, no separators of our own.
function isSafeZone(zone) {
  var z = String(zone || "")
  if (z.length === 0 || z.length > 64) return false
  return /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(z)
}

// Every distinct zone the config names, enabled or not: toggling a widget on
// should not have to wait for a subprocess to answer.
function zonesInUse(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    var zone = list[i].settings ? clampString(list[i].settings.timezone) : ""
    if (!zone || seen[zone] || !isSafeZone(zone)) continue
    seen[zone] = true
    out.push(zone)
  }
  return out
}

// "+0530" -> 330. Anything else -> null, which the caller reads as "unknown".
function parseOffsetToken(token) {
  var m = String(token || "").match(/^([+-])(\d{2})(\d{2})$/)
  if (!m) return null
  var minutes = parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
  return m[1] === "-" ? -minutes : minutes
}

// One "zone<TAB>+0530" line per zone. A zone whose line carries no offset was
// not found in the zoneinfo database and is left out, so the caller can tell
// "not resolved yet" from "resolved to UTC".
function parseZoneOffsets(raw) {
  var out = {}
  var lines = String(raw || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var parts = lines[i].split("\t")
    if (parts.length < 2) continue
    var zone = parts[0]
    var minutes = parseOffsetToken(parts[1])
    if (zone && minutes !== null) out[zone] = minutes
  }
  return out
}

// `Date.getTimezoneOffset()` is the minutes for which UTC = local + offset,
// so it reads -330 in IST. A zone offset from `date +%z` is minutes east of
// UTC, so it reads +330 for the same zone. Their sum is two things at once:
// the shift that makes `now` read as that zone's wall clock off the local
// calendar, and the difference between that zone and yours. One number, so
// the big time and the line under it can never disagree.
function zoneShiftMinutes(localOffsetMinutes, zoneOffsetMinutes) {
  var local = Number(localOffsetMinutes)
  var zone = Number(zoneOffsetMinutes)
  if (!isFinite(local) || !isFinite(zone)) return 0
  return local + zone
}

// 570 -> "+9:30". Hours are unpadded and minutes are not, which is how a
// timezone difference is written.
function offsetLabel(minutes) {
  var n = Number(minutes)
  if (!isFinite(n)) return ""
  var abs = Math.abs(Math.round(n))
  var h = Math.floor(abs / 60)
  var m = abs % 60
  return (n < 0 ? "-" : "+") + h + ":" + (m < 10 ? "0" + m : String(m))
}

// ------------------------------------------------------------------ exports

// ---------------------------------------------------------------- calendar
//
// Google Calendar publishes every calendar as an iCalendar file at a secret
// address: Settings -> Integrate calendar -> "Secret address in iCal format".
// That address *is* the connection. There is no OAuth client to register, no
// refresh token for a wallpaper decoration to hold, and no third party in the
// middle -- one GET to Google's own host, on the same schedule as the weather.
//
// The cost of that is a URL in the config file that is worth as much as a
// read-only copy of your calendar, which is said plainly in the README.
//
// Everything below is the part of the widget that can be wrong -- unfolding,
// the date grammar, the VTIMEZONE rules and the slice of RRULE a calendar of
// meetings actually uses -- so it lives here, where a test can reach it.

var CALENDAR_HOST = "calendar.google.com"

// A day, in milliseconds. Used as a step and as the length of an all-day
// event, both of which are calendar days rather than physical ones; the
// arithmetic that has to survive a DST boundary is done in the wall-clock
// domain below, where a day really is 24 hours.
var DAY_MS = 86400000

// The secret address, to Google's own shape. This becomes a URL handed to
// curl, so it is matched against a pattern rather than escaped -- an
// allowlist, the way `isSafeZone` is, not an attempt to sanitise whatever
// arrived. Anything that is not one of these is not a calendar address.
function isSafeIcsUrl(value) {
  if (typeof value !== "string") return false
  if (value.length === 0 || value.length > MAX_STRING) return false
  return /^https:\/\/calendar\.google\.com\/calendar\/ical\/[A-Za-z0-9%@._~+-]{1,200}\/(?:public|private(?:-[A-Za-z0-9]{1,64})?)\/basic\.ics$/.test(value)
}

// Every distinct calendar the config asks for, so one fetch serves however
// many cards are pointed at it.
function calendarsInUse(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].type !== "calendar") continue
    var url = list[i].settings ? clampString(list[i].settings.icsUrl) : ""
    if (!url || seen[url] || !isSafeIcsUrl(url)) continue
    seen[url] = true
    out.push(url)
  }
  return out
}

// ------------------------------------------------------------ ics grammar

// iCalendar wraps long lines by breaking them and starting the next with a
// space. A summary of any length arrives in pieces, so nothing can be read
// until the pieces are put back.
function unfoldIcs(raw) {
  var text = String(raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  var lines = text.split("\n")
  var out = []
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    var folded = line.length > 0 && (line.charAt(0) === " " || line.charAt(0) === "\t")
    if (folded && out.length > 0) out[out.length - 1] += line.slice(1)
    else out.push(line)
  }
  return out
}

// NAME;PARAM=value;OTHER="quoted:value":the rest of the line. The separating
// colon is the first one outside quotes -- a TZID or an ALTREP is free to
// contain one, and splitting on the first colon in the string would cut a
// line in the wrong place.
function parseIcsLine(line) {
  var s = String(line || "")
  var colon = -1
  var quoted = false
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i)
    if (c === '"') { quoted = !quoted; continue }
    if (c === ":" && !quoted) { colon = i; break }
  }
  if (colon === -1) return null
  var head = s.slice(0, colon)
  var parts = head.split(";")
  var params = {}
  for (var p = 1; p < parts.length; p++) {
    var eq = parts[p].indexOf("=")
    if (eq === -1) continue
    params[parts[p].slice(0, eq).toUpperCase()] =
      parts[p].slice(eq + 1).replace(/^"/, "").replace(/"$/, "")
  }
  return { name: parts[0].toUpperCase(), params: params, value: s.slice(colon + 1) }
}

// Text values escape their commas, semicolons and newlines. Scanned rather
// than run through a chain of replaces, so a literal backslash before an "n"
// cannot be mistaken for a newline.
function unescapeIcsText(value) {
  var s = String(value || "")
  var out = ""
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i)
    if (c !== "\\") { out += c; continue }
    var next = s.charAt(i + 1)
    i++
    if (next === "n" || next === "N") out += " "
    else out += next
  }
  return clampString(out.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""))
}

// "+0530" -> 330, "-0800" -> -480. Seconds are allowed by the spec and are
// dropped: no zone in use has ever needed them, and a partial minute would
// only ever produce a time that looks broken.
function parseUtcOffset(value) {
  var m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(String(value || "").replace(/^\s+|\s+$/g, ""))
  if (!m) return null
  var minutes = Number(m[2]) * 60 + Number(m[3])
  return m[1] === "-" ? -minutes : minutes
}

// A DATE or DATE-TIME, read as a *wall clock* rather than as an instant.
//
// The wall clock is carried in the UTC domain -- Date.UTC of the digits as
// written -- purely so recurrence arithmetic can use the UTC setters and
// never trip over the machine's own daylight saving. `kind` says what has to
// be done to turn it back into a real instant, which is `wallToEpoch`'s job.
function icsWallOf(value, params) {
  var s = String(value || "").replace(/^\s+|\s+$/g, "")
  var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(s)
  if (!m) return null
  var p = params || {}
  var hasTime = m[4] !== undefined
  var isDate = !hasTime || String(p.VALUE || "").toUpperCase() === "DATE"
  var wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    hasTime ? Number(m[4]) : 0, hasTime ? Number(m[5]) : 0, hasTime ? Number(m[6]) : 0)
  if (!isFinite(wall)) return null
  if (isDate) return { wall: wall, kind: "date", tzid: "", allDay: true }
  if (m[7] === "Z") return { wall: wall, kind: "utc", tzid: "", allDay: false }
  var tzid = clampString(p.TZID || "")
  return { wall: wall, kind: tzid ? "tz" : "floating", tzid: tzid, allDay: false }
}

// A wall clock back into an instant on the machine's own timeline.
//
// "utc" is already one. "date" is a whole local day, so it lands at local
// midnight -- an all-day event is on a date, not at an hour. "tz" is offset
// by whatever the file's own VTIMEZONE says was in force. Anything left is
// floating, which the spec defines as local time, and that is what the
// machine's Date constructor gives.
function wallToEpoch(wall, kind, tzid, zones) {
  if (kind === "utc") return wall
  var d = new Date(wall)
  var y = d.getUTCFullYear(), mo = d.getUTCMonth(), day = d.getUTCDate()
  if (kind === "date") return new Date(y, mo, day).getTime()
  if (kind === "tz") {
    var offset = tzOffsetAt(zones, tzid, y, mo + 1, day, d.getUTCHours(), d.getUTCMinutes())
    if (offset !== null) return wall - offset * 60000
  }
  return new Date(y, mo, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime()
}

// "P1DT2H30M" -> milliseconds. Weeks are their own form and cannot be
// combined with the rest, which is why they are matched separately.
function parseIcsDuration(value) {
  var s = String(value || "").replace(/^\s+|\s+$/g, "").toUpperCase()
  var sign = s.charAt(0) === "-" ? -1 : 1
  if (s.charAt(0) === "+" || s.charAt(0) === "-") s = s.slice(1)
  var weeks = /^P(\d+)W$/.exec(s)
  if (weeks) return sign * Number(weeks[1]) * 7 * DAY_MS
  var m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s)
  if (!m) return 0
  var ms = (Number(m[1] || 0) * DAY_MS) + (Number(m[2] || 0) * 3600000)
    + (Number(m[3] || 0) * 60000) + (Number(m[4] || 0) * 1000)
  return sign * ms
}

var ICS_WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

// The day of the month the nth given weekday falls on. `nth` counts from the
// end when negative, which is how every daylight-saving rule and half the
// recurring meetings in the world are written ("the last Sunday", "the first
// Monday"). Returns a day that exists in the month, or 0 when it does not.
function nthWeekdayOfMonth(year, month, weekday, nth) {
  if (!isFinite(year) || month < 1 || month > 12) return 0
  if (weekday < 0 || weekday > 6 || nth === 0) return 0
  var lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (nth > 0) {
    var firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
    var day = 1 + ((weekday - firstWeekday) + 7) % 7 + (nth - 1) * 7
    return day <= lastDay ? day : 0
  }
  var lastWeekday = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay()
  var back = lastDay - ((lastWeekday - weekday) + 7) % 7 + (nth + 1) * 7
  return back >= 1 ? back : 0
}

// FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH, WKST -- which is
// everything a calendar of meetings produces. Anything else is ignored rather
// than refused: an unhandled BYSETPOS gives a series that recurs slightly too
// often, which is a card that says a bit too much, and dropping the event
// entirely would be a card that says nothing.
function parseRrule(value) {
  var out = {
    freq: "", interval: 1, count: 0, until: "", untilWall: null,
    byday: [], bymonthday: [], bymonth: [], wkst: 1
  }
  var parts = String(value || "").split(";")
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf("=")
    if (eq === -1) continue
    var key = parts[i].slice(0, eq).toUpperCase()
    var raw = parts[i].slice(eq + 1)
    if (key === "FREQ") out.freq = raw.toUpperCase()
    else if (key === "INTERVAL") out.interval = Math.max(1, Math.round(clampNumber(raw, 1, 1000, 1)))
    else if (key === "COUNT") out.count = Math.max(0, Math.round(clampNumber(raw, 0, 100000, 0)))
    else if (key === "UNTIL") {
      out.until = raw
      var w = icsWallOf(raw, {})
      out.untilWall = w ? w.wall : null
    } else if (key === "WKST") {
      var start = ICS_WEEKDAYS[raw.toUpperCase()]
      if (start !== undefined) out.wkst = start
    } else if (key === "BYDAY") {
      var days = raw.toUpperCase().split(",")
      for (var d = 0; d < days.length; d++) {
        var m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(days[d])
        if (!m) continue
        out.byday.push({ nth: m[1] ? Number(m[1]) : 0, weekday: ICS_WEEKDAYS[m[2]] })
      }
    } else if (key === "BYMONTHDAY" || key === "BYMONTH") {
      var nums = raw.split(",")
      for (var n = 0; n < nums.length; n++) {
        var value2 = Number(nums[n])
        if (!isFinite(value2) || value2 === 0) continue
        if (key === "BYMONTH") { if (value2 >= 1 && value2 <= 12) out.bymonth.push(value2) }
        else if (value2 >= -31 && value2 <= 31) out.bymonthday.push(value2)
      }
    }
  }
  return out
}

function daysInIcsMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// Every wall clock a series lands on inside [fromWall, toWall].
//
// All of it happens in the wall-clock domain, so a weekly 09:00 stays 09:00
// across a daylight-saving boundary instead of drifting to 08:00 the way
// adding seven times 86400000 to an instant would.
//
// Bounded three ways -- the window, `limit` occurrences, and a hard iteration
// guard -- because this parses a document from the network and a series with
// no COUNT and no UNTIL is a perfectly ordinary thing to write.
function expandWalls(startWall, rule, fromWall, toWall, limit) {
  var out = []
  var cap = limit > 0 ? limit : 200
  if (!rule || !rule.freq) {
    if (startWall >= fromWall && startWall <= toWall) out.push(startWall)
    return out
  }

  var start = new Date(startWall)
  var hours = start.getUTCHours(), minutes = start.getUTCMinutes(), seconds = start.getUTCSeconds()
  var interval = rule.interval > 0 ? rule.interval : 1
  // UNTIL is an instant and this loop is wall clock, so the two are at most a
  // day apart. The slack is spent on stopping late rather than early; the
  // caller filters the tail off precisely, once the offsets are known.
  var untilWall = rule.untilWall === null ? null : rule.untilWall + DAY_MS
  var emitted = 0
  var guard = 0

  function take(when) {
    if (when < startWall) return true
    if (rule.count > 0 && emitted >= rule.count) return false
    if (untilWall !== null && when > untilWall) return false
    emitted++
    if (when >= fromWall && when <= toWall) out.push(when)
    return true
  }

  if (rule.freq === "DAILY") {
    var step = interval * DAY_MS
    var cur = startWall
    // A daily series that began years ago would otherwise be walked one day
    // at a time to get to this week. The skipped occurrences still have to be
    // counted, because COUNT is measured from the first one.
    if (cur < fromWall) {
      var skip = Math.floor((fromWall - cur) / step)
      if (skip > 0) { cur += skip * step; emitted += skip }
    }
    while (guard++ < 4000 && out.length < cap && cur <= toWall) {
      if (!take(cur)) break
      cur += step
    }
    return out
  }

  if (rule.freq === "WEEKLY") {
    var weekdays = []
    if (rule.byday.length) {
      for (var b = 0; b < rule.byday.length; b++) weekdays.push(rule.byday[b].weekday)
    } else weekdays.push(start.getUTCDay())
    weekdays.sort(function (a, b) {
      return ((a - rule.wkst) + 7) % 7 - ((b - rule.wkst) + 7) % 7
    })
    var weekStart = startWall - ((start.getUTCDay() - rule.wkst) + 7) % 7 * DAY_MS
    var week = 0
    while (guard++ < 4000 && out.length < cap) {
      var base = weekStart + week * interval * 7 * DAY_MS
      var stopped = false
      for (var w = 0; w < weekdays.length; w++) {
        if (!take(base + ((weekdays[w] - rule.wkst) + 7) % 7 * DAY_MS)) { stopped = true; break }
      }
      if (stopped || base > toWall) break
      week++
    }
    return out
  }

  if (rule.freq === "MONTHLY") {
    var y0 = start.getUTCFullYear(), m0 = start.getUTCMonth(), dom = start.getUTCDate()
    var k = 0
    while (guard++ < 2000 && out.length < cap) {
      var index = m0 + k * interval
      var year = y0 + Math.floor(index / 12)
      var month = ((index % 12) + 12) % 12 + 1
      var days = monthDaysFor(rule, year, month, [dom])
      var halted = false
      for (var i = 0; i < days.length; i++) {
        if (!take(Date.UTC(year, month - 1, days[i], hours, minutes, seconds))) { halted = true; break }
      }
      if (halted || Date.UTC(year, month - 1, 1) > toWall) break
      k++
    }
    return out
  }

  if (rule.freq === "YEARLY") {
    var baseYear = start.getUTCFullYear()
    var months = rule.bymonth.length ? rule.bymonth : [start.getUTCMonth() + 1]
    var j = 0
    while (guard++ < 400 && out.length < cap) {
      var yr = baseYear + j * interval
      var done = false
      for (var mi = 0; mi < months.length && !done; mi++) {
        var list = monthDaysFor(rule, yr, months[mi], [start.getUTCDate()])
        for (var li = 0; li < list.length; li++) {
          if (!take(Date.UTC(yr, months[mi] - 1, list[li], hours, minutes, seconds))) { done = true; break }
        }
      }
      if (done || Date.UTC(yr, 0, 1) > toWall) break
      j++
    }
    return out
  }

  // A frequency nobody writes -- SECONDLY, MINUTELY, HOURLY. Drawn as the one
  // occurrence it definitely has rather than expanded into a wall of them.
  if (startWall >= fromWall && startWall <= toWall) out.push(startWall)
  return out
}

// Which days of a given month a monthly or yearly rule lands on, in order.
// `fallback` is the day the series started on, which is what the rule means
// when it says nothing else.
function monthDaysFor(rule, year, month, fallback) {
  var last = daysInIcsMonth(year, month)
  var days = []
  var i
  if (rule.byday.length) {
    for (i = 0; i < rule.byday.length; i++) {
      var spec = rule.byday[i]
      var day = spec.nth === 0
        ? nthWeekdayOfMonth(year, month, spec.weekday, 1)
        : nthWeekdayOfMonth(year, month, spec.weekday, spec.nth)
      if (day >= 1 && day <= last) days.push(day)
    }
  } else if (rule.bymonthday.length) {
    for (i = 0; i < rule.bymonthday.length; i++) {
      var md = rule.bymonthday[i]
      var real = md > 0 ? md : last + md + 1
      if (real >= 1 && real <= last) days.push(real)
    }
  } else {
    for (i = 0; i < fallback.length; i++) {
      // A series on the 31st simply has no occurrence in a 30-day month,
      // which is what the spec says and what every calendar app does.
      if (fallback[i] >= 1 && fallback[i] <= last) days.push(fallback[i])
    }
  }
  days.sort(function (a, b) { return a - b })
  return days
}

// ---------------------------------------------------------- ics timezones
//
// The file carries its own timezone definitions, which is the only reason
// this can be right without asking the system anything: each VTIMEZONE gives
// the offsets and the rule that switches between them, so "14:00 in
// Europe/London" can be resolved from the document itself rather than from a
// zoneinfo lookup the shell would have to run a subprocess for.

function parseIcsTimezones(lines) {
  var zones = {}
  var tzid = ""
  var inZone = false
  var comp = null
  for (var i = 0; i < lines.length; i++) {
    var p = parseIcsLine(lines[i])
    if (!p) continue
    var kind = String(p.value || "").toUpperCase()
    if (p.name === "BEGIN") {
      if (kind === "VTIMEZONE") { inZone = true; tzid = ""; comp = null }
      else if (inZone && (kind === "STANDARD" || kind === "DAYLIGHT")) {
        comp = { offset: null, month: 0, monthday: 0, weekday: -1, nth: 0, hour: 0, minute: 0 }
      }
      continue
    }
    if (p.name === "END") {
      if (kind === "VTIMEZONE") { inZone = false; tzid = ""; comp = null }
      else if (inZone && comp) {
        if (tzid && comp.offset !== null) {
          if (!zones[tzid]) zones[tzid] = []
          zones[tzid].push(comp)
        }
        comp = null
      }
      continue
    }
    if (!inZone) continue
    if (p.name === "TZID" && !comp) { tzid = clampString(p.value); continue }
    if (!comp) continue
    if (p.name === "TZOFFSETTO") comp.offset = parseUtcOffset(p.value)
    else if (p.name === "DTSTART") {
      var w = icsWallOf(p.value, p.params)
      if (w) {
        var d = new Date(w.wall)
        comp.month = d.getUTCMonth() + 1
        comp.monthday = d.getUTCDate()
        comp.hour = d.getUTCHours()
        comp.minute = d.getUTCMinutes()
      }
    } else if (p.name === "RRULE") {
      var rule = parseRrule(p.value)
      if (rule.bymonth.length) comp.month = rule.bymonth[0]
      if (rule.byday.length) {
        comp.weekday = rule.byday[0].weekday
        comp.nth = rule.byday[0].nth || 1
      }
      if (rule.bymonthday.length) comp.monthday = rule.bymonthday[0]
    }
  }
  return zones
}

// When a zone's rule fires in a given year, as a wall clock.
function icsTransitionWall(comp, year) {
  if (!comp || !comp.month) return null
  var day = comp.weekday >= 0 && comp.nth !== 0
    ? nthWeekdayOfMonth(year, comp.month, comp.weekday, comp.nth)
    : comp.monthday
  if (!day) return null
  return Date.UTC(year, comp.month - 1, day, comp.hour, comp.minute, 0)
}

// The offset in force in `tzid` at a given wall clock, or null when the file
// said nothing about that zone.
//
// The comparison is made in wall clock rather than in UTC, which is exact
// everywhere except inside the hour a zone is actually changing over. An
// event scheduled inside its own DST transition is ambiguous by definition;
// every calendar has to pick one, and picking the later offset is what
// Google's own expansion does.
function tzOffsetAt(zones, tzid, year, month, day, hour, minute) {
  var comps = zones ? zones[tzid] : null
  if (!comps || comps.length === 0) return null
  if (comps.length === 1) return comps[0].offset
  var target = Date.UTC(year, month - 1, day, hour, minute, 0)
  var best = null
  var bestAt = null
  for (var i = 0; i < comps.length; i++) {
    // This year and last: the rule in force in January fired the previous
    // autumn, so a year on its own would leave the start of every year with
    // nothing to match.
    for (var back = 0; back <= 1; back++) {
      var at = icsTransitionWall(comps[i], year - back)
      if (at === null || at > target) continue
      if (bestAt === null || at > bestAt) { bestAt = at; best = comps[i] }
    }
  }
  return best ? best.offset : comps[0].offset
}

// ---------------------------------------------------------- ics documents

// Every VEVENT in the file, as the handful of fields a card can show.
// VTIMEZONE has its own DTSTART and its own RRULE, so it is stepped over
// rather than read -- picking those up would put a timezone rule on the
// wallpaper as if it were a meeting.
function collectVevents(lines) {
  var out = []
  var cur = null
  var inZone = false
  for (var i = 0; i < lines.length; i++) {
    var p = parseIcsLine(lines[i])
    if (!p) continue
    var kind = String(p.value || "").toUpperCase()
    if (p.name === "BEGIN") {
      if (kind === "VTIMEZONE") inZone = true
      else if (kind === "VEVENT" && !inZone) cur = { uid: "", summary: "", location: "", status: "", exdates: [] }
      continue
    }
    if (p.name === "END") {
      if (kind === "VTIMEZONE") inZone = false
      else if (kind === "VEVENT" && cur) { out.push(cur); cur = null }
      continue
    }
    if (inZone || !cur) continue
    if (p.name === "UID") cur.uid = clampString(p.value)
    else if (p.name === "SUMMARY") cur.summary = unescapeIcsText(p.value)
    else if (p.name === "LOCATION") cur.location = unescapeIcsText(p.value)
    else if (p.name === "STATUS") cur.status = String(p.value || "").toUpperCase()
    else if (p.name === "DTSTART") cur.dtstart = { value: p.value, params: p.params }
    else if (p.name === "DTEND") cur.dtend = { value: p.value, params: p.params }
    else if (p.name === "DURATION") cur.duration = p.value
    else if (p.name === "RRULE") cur.rrule = p.value
    else if (p.name === "RECURRENCE-ID") cur.recurrenceId = { value: p.value, params: p.params }
    else if (p.name === "EXDATE") cur.exdates.push({ value: p.value, params: p.params })
  }
  return out
}

// How long an event lasts, from whichever of DTEND and DURATION it carries.
// An all-day event with neither is one day; a timed one is a moment, which is
// what a reminder with no end actually is.
function icsEventDuration(record, start) {
  if (record.dtend) {
    var end = icsWallOf(record.dtend.value, record.dtend.params)
    if (end && end.wall > start.wall) return end.wall - start.wall
  }
  if (record.duration) {
    var ms = parseIcsDuration(record.duration)
    if (ms > 0) return ms
  }
  return start.allDay ? DAY_MS : 0
}

// The instants an event's EXDATE lines take out of its series.
function icsExceptions(record, zones) {
  var out = {}
  var list = record && Array.isArray(record.exdates) ? record.exdates : []
  for (var i = 0; i < list.length; i++) {
    var values = String(list[i].value || "").split(",")
    for (var v = 0; v < values.length; v++) {
      var w = icsWallOf(values[v], list[i].params)
      if (w) out[wallToEpoch(w.wall, w.kind, w.tzid, zones)] = true
    }
  }
  return out
}

// An iCalendar document into the occurrences that fall inside a window,
// earliest first. Returns null for anything that is not one, so a failed
// fetch or an error page leaves whatever is already on the card.
//
// `limit` is a ceiling on the whole document, not per series: this is a file
// from the network being turned into objects inside the process that draws
// the desktop, and a calendar with a thousand daily standups in it should
// cost the same as a calendar with ten.
function parseCalendar(raw, windowStartMs, windowEndMs, limit) {
  var text = String(raw || "")
  if (text.indexOf("BEGIN:VCALENDAR") === -1) return null
  var lines = unfoldIcs(text)
  var zones = parseIcsTimezones(lines)
  var records = collectVevents(lines)
  var cap = limit > 0 ? limit : 300
  var from = Number(windowStartMs)
  var to = Number(windowEndMs)
  if (!isFinite(from) || !isFinite(to) || to <= from) return null

  // A day either side, because the loop works in wall clock and the window is
  // in instants; the exact filter happens once each occurrence has an offset.
  var fromWall = from - DAY_MS
  var toWall = to + DAY_MS

  // An instance edited out of a series carries a RECURRENCE-ID naming the
  // occurrence it replaces. Collected first so the series can skip it,
  // whether the edit moved the meeting or cancelled it outright.
  var overridden = {}
  var i
  for (i = 0; i < records.length; i++) {
    var edit = records[i]
    if (!edit.recurrenceId) continue
    var rw = icsWallOf(edit.recurrenceId.value, edit.recurrenceId.params)
    if (rw) overridden[edit.uid + "@" + wallToEpoch(rw.wall, rw.kind, rw.tzid, zones)] = true
  }

  var out = []
  for (i = 0; i < records.length && out.length < cap; i++) {
    var rec = records[i]
    if (!rec.dtstart || rec.status === "CANCELLED") continue
    var start = icsWallOf(rec.dtstart.value, rec.dtstart.params)
    if (!start) continue

    var duration = icsEventDuration(rec, start)
    // An override is one occurrence in its own right; only the master of a
    // series recurs, and reading its RRULE too would draw the series twice.
    var rule = rec.recurrenceId ? null : (rec.rrule ? parseRrule(rec.rrule) : null)
    var untilMs = null
    if (rule && rule.untilWall !== null) {
      var uw = icsWallOf(rule.until, {})
      if (uw) untilMs = wallToEpoch(uw.wall, uw.kind === "floating" ? start.kind : uw.kind, start.tzid, zones)
    }
    var skip = icsExceptions(rec, zones)
    var walls = expandWalls(start.wall, rule, fromWall, toWall, cap)

    for (var w = 0; w < walls.length && out.length < cap; w++) {
      var ms = wallToEpoch(walls[w], start.kind, start.tzid, zones)
      if (ms < from || ms > to) continue
      if (untilMs !== null && ms > untilMs) continue
      if (skip[ms]) continue
      if (rule && overridden[rec.uid + "@" + ms]) continue
      out.push({
        start: ms,
        end: ms + duration,
        allDay: start.allDay,
        summary: rec.summary,
        location: rec.location
      })
    }
  }

  // Earliest first, all-day events ahead of the timed ones they overlap:
  // "today" comes before "today at nine".
  out.sort(function (a, b) {
    if (a.start !== b.start) return a.start - b.start
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    return a.summary < b.summary ? -1 : (a.summary > b.summary ? 1 : 0)
  })
  return { events: out }
}

// ------------------------------------------------------- what the card says

// Everything that has not finished yet, earliest first. An event already
// running is still the one you want on the card -- a meeting you are in the
// middle of is not over -- so this filters on the end, not on the start.
function upcomingEvents(events, nowMs, limit, includeAllDay) {
  var list = Array.isArray(events) ? events : []
  var now = Number(nowMs)
  var max = limit > 0 ? limit : 8
  var out = []
  if (!isFinite(now)) return out
  for (var i = 0; i < list.length && out.length < max; i++) {
    var ev = list[i]
    if (!ev) continue
    if (ev.allDay && includeAllDay === false) continue
    var end = ev.end > ev.start ? ev.end : ev.start + 60000
    if (end <= now) continue
    out.push(ev)
  }
  return out
}

function padTwo(n) { return n < 10 ? "0" + n : String(n) }

// "14:30", or "2:30 PM" on a twelve-hour clock.
function clockLabel(ms, twelveHour) {
  var d = new Date(Number(ms))
  if (isNaN(d.getTime())) return ""
  var h = d.getHours()
  var m = d.getMinutes()
  if (!twelveHour) return padTwo(h) + ":" + padTwo(m)
  var suffix = h < 12 ? "AM" : "PM"
  var hour = h % 12
  return (hour === 0 ? 12 : hour) + ":" + padTwo(m) + " " + suffix
}

// The time column on a row: the clock, or the word for an event that has no
// clock to give.
function eventTimeLabel(event, twelveHour) {
  if (!event) return ""
  if (event.allDay) return "all day"
  return clockLabel(event.start, twelveHour)
}

// How far off it is, as the coarsest true thing. Nobody needs "in 1 hour and
// 47 minutes" from across a desk; they need to know whether to get up.
function untilLabel(startMs, endMs, nowMs) {
  var start = Number(startMs)
  var now = Number(nowMs)
  if (!isFinite(start) || !isFinite(now)) return ""
  var end = Number(endMs)
  if (isFinite(end) && start <= now && end > now) return "now"
  var seconds = Math.round((start - now) / 1000)
  if (seconds <= 60) return "now"
  if (seconds < 3600) return "in " + Math.round(seconds / 60) + "m"
  if (seconds < 86400) {
    var hours = Math.floor(seconds / 3600)
    var mins = Math.round((seconds % 3600) / 60)
    return mins > 0 && hours < 6 ? "in " + hours + "h " + mins + "m" : "in " + hours + "h"
  }
  var days = Math.round(seconds / 86400)
  if (days <= 1) return "tomorrow"
  if (days < 7) return "in " + days + " days"
  return "in " + Math.round(days / 7) + "w"
}

// What the card puts beside an event. An all-day event has no countdown to
// give -- "in 12h" for something that is simply tomorrow is arithmetic where
// a word belongs -- so it says which day it is on instead.
function eventUntilLabel(event, nowMs) {
  if (!event) return ""
  if (!event.allDay) return untilLabel(event.start, event.end, nowMs)
  var end = event.end > event.start ? event.end : event.start + DAY_MS
  if (event.start <= nowMs && end > nowMs) return "Today"
  return dayHeading(event.start, nowMs)
}

// Local midnight of whatever day an instant falls in, which is what makes
// "same day" a question about the calendar rather than about 24 hours.
function startOfDay(ms) {
  var d = new Date(Number(ms))
  if (isNaN(d.getTime())) return 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function daysApart(ms, nowMs) {
  return Math.round((startOfDay(ms) - startOfDay(nowMs)) / DAY_MS)
}

var ICS_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
var ICS_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// The heading a group of events sits under. Named days for the two that have
// names, and a date for everything else -- "Thu 18 Sep" tells you more than
// "in 13 days" once it is past the end of the week.
function dayHeading(ms, nowMs) {
  var delta = daysApart(ms, nowMs)
  if (delta === 0) return "Today"
  if (delta === 1) return "Tomorrow"
  var d = new Date(Number(ms))
  if (isNaN(d.getTime())) return ""
  if (delta > 1 && delta < 7) return ICS_DAY_NAMES[d.getDay()]
  return ICS_DAY_NAMES[d.getDay()] + " " + d.getDate() + " " + ICS_MONTH_NAMES[d.getMonth()]
}

// The line the card wears when nobody has written a label: what day it is.
function todayHeading(nowMs) {
  var d = new Date(Number(nowMs))
  if (isNaN(d.getTime())) return ""
  return ICS_DAY_NAMES[d.getDay()] + " " + d.getDate() + " " + ICS_MONTH_NAMES[d.getMonth()]
}

// Events grouped into days, in order, with the heading each day wears. This
// is what the tall card draws: a list with a rule across it whenever the day
// changes, rather than a run of times you have to date yourself.
function groupEventsByDay(events, nowMs) {
  var list = Array.isArray(events) ? events : []
  var out = []
  var currentKey = null
  for (var i = 0; i < list.length; i++) {
    var key = startOfDay(list[i].start)
    if (key !== currentKey) {
      currentKey = key
      out.push({ day: key, heading: dayHeading(key, nowMs), events: [] })
    }
    out[out.length - 1].events.push(list[i])
  }
  return out
}

// ------------------------------------------------------------------- todos
//
// The list is a text file, and that is the whole design. There is no todo
// service worth making a wallpaper depend on, and the one thing every editor,
// every dotfiles repo and every sync tool already handles is a file with a
// line in it per thing to do:
//
//   # Friday
//   - [ ] ship the calendar widget
//   - [x] reply to the issue
//   ! call the bank
//   buy milk
//
// So the widget reads, and the file is the interface. Ticking something off
// is a keystroke in the editor that is already open, rather than a control on
// a card that sits underneath your windows.
//
// The grammar is deliberately forgiving: markdown checkboxes because that is
// what people already type, todo.txt's leading "x" because that is the other
// thing people already type, a bare line because that is what you write when
// you are in a hurry.

var TODO_MAX_ITEMS = 200
var DEFAULT_TODO_FILE = ".config/omarchy/todos.txt"

// Where a widget's list actually lives. Empty means the default, "~/" and a
// bare name are both resolved against home, and a path that tries to climb
// out with ".." is refused rather than cleaned up -- the same allowlist
// habit the rest of this file has, applied to the one setting here that
// names something on disk.
function todoPath(setting, home) {
  var base = String(home || "").replace(/\/+$/, "")
  var raw = clampString(setting).replace(/^\s+|\s+$/g, "")
  if (raw === "") return base ? base + "/" + DEFAULT_TODO_FILE : ""
  if (raw.indexOf("~/") === 0) raw = base + raw.slice(1)
  else if (raw.charAt(0) !== "/") raw = base + "/" + raw
  var parts = raw.split("/")
  for (var i = 0; i < parts.length; i++) if (parts[i] === "..") return ""
  return raw
}

// Every distinct file the config asks for, so two cards on the same list are
// one watch rather than two.
function todoPathsInUse(config, home) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].type !== "todos") continue
    var path = todoPath(list[i].settings ? list[i].settings.file : "", home)
    if (!path || seen[path]) continue
    seen[path] = true
    out.push(path)
  }
  return out
}

// A file into a list. Blank lines and headings are structure rather than
// items; everything else is something to do.
function parseTodos(raw) {
  // Only a string is a file. Anything else is a failed read, not a list with
  // one line in it.
  var lines = (typeof raw === "string" ? raw : "").split("\n")
  var items = []
  var title = ""
  var done = 0
  for (var i = 0; i < lines.length && items.length < TODO_MAX_ITEMS; i++) {
    var line = lines[i].replace(/^\s+|\s+$/g, "")
    if (line === "") continue
    if (line.charAt(0) === "#") {
      // The first heading names the list, which is how a file that already
      // starts with "# Friday" gets a title without a second place to set it.
      if (title === "") title = clampString(line.replace(/^#+\s*/, ""))
      continue
    }
    var item = parseTodoLine(line)
    if (!item) continue
    // The line it came from, so a tick on the card knows which line of the
    // file to rewrite. Everything else about an item is derived; this is the
    // one thing that ties it back to what the user actually typed.
    item.line = i
    if (item.done) done++
    items.push(item)
  }
  return {
    title: title,
    items: items,
    total: items.length,
    done: done,
    remaining: items.length - done
  }
}

// One line. A bullet is optional, a checkbox is optional, todo.txt's leading
// "x " counts as done, and a leading "!" is the one thing on the list that
// gets to stand out.
function parseTodoLine(line) {
  var rest = String(line || "")
  var done = false

  // todo.txt marks a finished task with a lone "x" at the start of the line,
  // and often a completion date after it that is bookkeeping rather than
  // something to read on a wallpaper.
  var todoTxt = /^x\s+(?:\d{4}-\d{2}-\d{2}\s+)?(.*)$/.exec(rest)
  if (todoTxt) { done = true; rest = todoTxt[1] }

  rest = rest.replace(/^[-*+\u2022]\s+/, "")

  var box = /^\[([ xX\u00d7~-])\]\s*(.*)$/.exec(rest)
  if (box) {
    var mark = box[1]
    if (mark !== " ") done = true
    rest = box[2]
  }

  var important = false
  var bang = /^!+\s*(.*)$/.exec(rest)
  if (bang) { important = true; rest = bang[1] }

  rest = rest.replace(/^\s+|\s+$/g, "")
  if (rest === "") return null
  // A rule drawn across the page -- "---", "***", "===" -- is somebody
  // dividing their file up, and a bare "-" is a bullet with nothing after it.
  // Neither is something to do.
  if (/^[-*+_=~]+$/.test(rest)) return null
  return { text: clampString(rest), done: done, important: important, line: -1 }
}

// One line of the file, ticked or unticked, with everything else about it
// left exactly as it was.
//
// This is a *rewrite*, not a re-serialisation: the file is something a person
// types by hand, and a card that reformatted the whole list every time you
// ticked something off would be a card that fights its own editor. So the
// indentation, the bullet, the wording and every other line are untouched,
// and only the mark itself moves.
//
// Returns null when nothing should change -- an index off the end, a heading,
// a blank line, a divider -- so the caller can tell "no" from "no difference"
// and never writes a file it did not mean to.
function setTodoDone(text, lineIndex, done) {
  if (typeof text !== "string") return null
  var lines = text.split("\n")
  var index = Math.round(Number(lineIndex))
  if (!isFinite(index) || index < 0 || index >= lines.length) return null

  var raw = lines[index]
  var indent = /^[ \t]*/.exec(raw)[0]
  var body = raw.slice(indent.length)
  // Only a line that is an item may be ticked. A heading is not a task.
  if (body === "" || body.charAt(0) === "#") return null
  if (!parseTodoLine(body)) return null

  var wanted = done === true
  var next = rewriteTodoMark(body, wanted)
  if (next === null || next === body) return null
  lines[index] = indent + next
  return lines.join("\n")
}

// The mark on one line's worth of text, moved to `done`. Split out from
// setTodoDone because the three ways a list says "finished" each need undoing
// differently, and that is the part worth reading on its own.
function rewriteTodoMark(body, done) {
  // A markdown checkbox: flip the character between the brackets and touch
  // nothing else. This is the common case and the cheapest edit there is.
  var box = /^(\s*(?:[-*+\u2022]\s+)?)\[([ xX\u00d7~-])\]/.exec(body)
  if (box) {
    if ((box[2] !== " ") === done) return body
    return box[1] + "[" + (done ? "x" : " ") + "]" + body.slice(box[0].length)
  }

  // todo.txt's leading "x", optionally followed by a completion date. Undoing
  // drops the date with it: a date on something unfinished is a date that is
  // no longer true.
  var todoTxt = /^x\s+(?:\d{4}-\d{2}-\d{2}\s+)?/.exec(body)
  if (todoTxt) return done ? body : body.slice(todoTxt[0].length)

  // A line with no mark at all. Ticking it gives it a checkbox, after its
  // bullet if it has one, so unticking later leaves a checkbox rather than
  // trying to guess its way back to a bare line.
  if (!done) return body
  var bullet = /^(\s*[-*+\u2022]\s+)/.exec(body)
  return bullet ? bullet[1] + "[x] " + body.slice(bullet[1].length) : "[x] " + body
}

// What the card should draw, in the order it should draw it: anything marked
// "!" first, then what is left, then what is finished -- and only as many as
// there is room for.
//
// The order is the point. A list drawn in file order puts three things you
// have already done at the top of a card with room for four, which is a card
// that has spent its whole surface on the past.
function visibleTodos(parsed, showDone, limit) {
  var items = parsed && Array.isArray(parsed.items) ? parsed.items : []
  var max = limit > 0 ? limit : TODO_MAX_ITEMS
  var out = []
  var pass, i
  // Three passes rather than a sort, so the file's own order survives inside
  // each band -- the list you wrote is still the list you see.
  for (pass = 0; pass < (showDone === false ? 2 : 3) && out.length < max; pass++) {
    for (i = 0; i < items.length && out.length < max; i++) {
      var done = items[i].done === true
      var urgent = items[i].important === true
      if (pass === 0 && (done || !urgent)) continue
      if (pass === 1 && (done || urgent)) continue
      if (pass === 2 && !done) continue
      out.push(items[i])
    }
  }
  return out
}

// How far through the list you are, 0 to 1. An empty list is not zero percent
// done; the card says so in words rather than drawing an empty bar.
function todoProgress(parsed) {
  if (!parsed || !parsed.total) return 0
  return Math.min(1, Math.max(0, parsed.done / parsed.total))
}

// The name on the card: what the user set, else the file's own first heading,
// else the plain word. Never the file name -- "todos.txt" on a card is the
// path telling you about itself rather than about the list.
function todoTitle(setting, parsed) {
  var chosen = clampString(setting).replace(/^\s+|\s+$/g, "")
  if (chosen) return chosen
  if (parsed && parsed.title) return parsed.title
  return "Todo"
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    MAX_WIDGETS: MAX_WIDGETS,
    MAX_STRING: MAX_STRING,
    MAX_COLUMNS: MAX_COLUMNS,
    MAX_ROWS: MAX_ROWS,
    MIN_SCALE: MIN_SCALE,
    MAX_SCALE: MAX_SCALE,
    SIDES: SIDES,
    DEFAULT_LAYOUT: DEFAULT_LAYOUT,
    catalog: catalog,
    catalogEntry: catalogEntry,
    catalogTypes: catalogTypes,
    settingsSchema: settingsSchema,
    settingSpec: settingSpec,
    defaultsFor: defaultsFor,
    coerceSetting: coerceSetting,
    zoneLabel: zoneLabel,
    WEATHER_ICONS: WEATHER_ICONS,
    isSafeRepo: isSafeRepo,
    reposInUse: reposInUse,
    parseRepo: parseRepo,
    parsePullCount: parsePullCount,
    repoStats: repoStats,
    repoUrl: repoUrl,
    compactCount: compactCount,
    sinceLabel: sinceLabel,
    trackTime: trackTime,
    trackFraction: trackFraction,
    isProxyPlayer: isProxyPlayer,
    hasTrackMetadata: hasTrackMetadata,
    hasAnyMetadata: hasAnyMetadata,
    playerCanControl: playerCanControl,
    playerScore: playerScore,
    pickPlayerIndex: pickPlayerIndex,
    hasPlayable: hasPlayable,
    playerTransport: playerTransport,
    isSafeLogin: isSafeLogin,
    loginsInUse: loginsInUse,
    MAX_CONTRIBUTION_BYTES: MAX_CONTRIBUTION_BYTES,
    parseContributions: parseContributions,
    dayOfWeekUTC: dayOfWeekUTC,
    contributionGrid: contributionGrid,
    weeksThatFit: weeksThatFit,
    weeksLabel: weeksLabel,
    weatherIcon: weatherIcon,
    parseClockTime: parseClockTime,
    isNight: isNight,
    parseWeather: parseWeather,
    isFahrenheit: isFahrenheit,
    tempLabel: tempLabel,
    rangeLabel: rangeLabel,
    sizesFor: sizesFor,
    defaultSize: defaultSize,
    isAllowedSize: isAllowedSize,
    nextSize: nextSize,
    isPlainObject: isPlainObject,
    clampString: clampString,
    clampNumber: clampNumber,
    normalizeLayout: normalizeLayout,
    scaledCell: scaledCell,
    scaledGap: scaledGap,
    blockWidth: blockWidth,
    blockHeight: blockHeight,
    gridWidth: gridWidth,
    gridOriginX: gridOriginX,
    maxColumnsFor: maxColumnsFor,
    columnOptions: columnOptions,
    cellRect: cellRect,
    widgetRect: widgetRect,
    cellFromPoint: cellFromPoint,
    dropTarget: dropTarget,
    displayName: displayName,
    instanceLabel: instanceLabel,
    allowsMultiple: allowsMultiple,
    countOfType: countOfType,
    nextInstanceId: nextInstanceId,
    landingCell: landingCell,
    addWidget: addWidget,
    duplicateWidget: duplicateWidget,
    canRemove: canRemove,
    removeWidget: removeWidget,
    defaultInstance: defaultInstance,
    defaultConfig: defaultConfig,
    normalizeSettings: normalizeSettings,
    normalizeInstance: normalizeInstance,
    isLegacyInstance: isLegacyInstance,
    normalizeConfig: normalizeConfig,
    rectsOverlap: rectsOverlap,
    sideOf: sideOf,
    setWidgetSide: setWidgetSide,
    sidesInUse: sidesInUse,
    occupants: occupants,
    fitsAmong: fitsAmong,
    firstFreeCellAmong: firstFreeCellAmong,
    firstFreeCellFrom: firstFreeCellFrom,
    placeDisplacing: placeDisplacing,
    canPlace: canPlace,
    firstFreeCell: firstFreeCell,
    relocate: relocate,
    resolveOverlaps: resolveOverlaps,
    usedRows: usedRows,
    ensureCatalogCoverage: ensureCatalogCoverage,
    findInstance: findInstance,
    setEnabled: setEnabled,
    toggleEnabled: toggleEnabled,
    moveWidget: moveWidget,
    placeWidget: placeWidget,
    setSetting: setSetting,
    resizeWidget: resizeWidget,
    cycleSize: cycleSize,
    setSide: setSide,
    setColumns: setColumns,
    setScale: setScale,
    setLayoutOpacity: setLayoutOpacity,
    setOpacity: setOpacity,
    clearOpacity: clearOpacity,
    effectiveOpacity: effectiveOpacity,
    resetAppearance: resetAppearance,
    widgetsForScreen: widgetsForScreen,
    offWidgets: offWidgets,
    isInteractiveType: isInteractiveType,
    interactiveWidgetsForScreen: interactiveWidgetsForScreen,
    isSafeZone: isSafeZone,
    zonesInUse: zonesInUse,
    parseOffsetToken: parseOffsetToken,
    parseZoneOffsets: parseZoneOffsets,
    zoneShiftMinutes: zoneShiftMinutes,
    offsetLabel: offsetLabel,
    CALENDAR_HOST: CALENDAR_HOST,
    DAY_MS: DAY_MS,
    isSafeIcsUrl: isSafeIcsUrl,
    calendarsInUse: calendarsInUse,
    unfoldIcs: unfoldIcs,
    parseIcsLine: parseIcsLine,
    unescapeIcsText: unescapeIcsText,
    parseUtcOffset: parseUtcOffset,
    icsWallOf: icsWallOf,
    wallToEpoch: wallToEpoch,
    parseIcsDuration: parseIcsDuration,
    nthWeekdayOfMonth: nthWeekdayOfMonth,
    parseRrule: parseRrule,
    expandWalls: expandWalls,
    monthDaysFor: monthDaysFor,
    parseIcsTimezones: parseIcsTimezones,
    icsTransitionWall: icsTransitionWall,
    tzOffsetAt: tzOffsetAt,
    collectVevents: collectVevents,
    icsEventDuration: icsEventDuration,
    icsExceptions: icsExceptions,
    parseCalendar: parseCalendar,
    upcomingEvents: upcomingEvents,
    clockLabel: clockLabel,
    eventTimeLabel: eventTimeLabel,
    untilLabel: untilLabel,
    startOfDay: startOfDay,
    daysApart: daysApart,
    dayHeading: dayHeading,
    todayHeading: todayHeading,
    eventUntilLabel: eventUntilLabel,
    groupEventsByDay: groupEventsByDay,
    TODO_MAX_ITEMS: TODO_MAX_ITEMS,
    DEFAULT_TODO_FILE: DEFAULT_TODO_FILE,
    todoPath: todoPath,
    todoPathsInUse: todoPathsInUse,
    parseTodos: parseTodos,
    parseTodoLine: parseTodoLine,
    setTodoDone: setTodoDone,
    rewriteTodoMark: rewriteTodoMark,
    visibleTodos: visibleTodos,
    todoProgress: todoProgress,
    todoTitle: todoTitle
  }
}
