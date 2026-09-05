
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
  // The opacity every card starts at. A widget can override it on its own.
  opacity: 0.72
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
// Supported setting types: "text", "boolean", "choice" (needs `options`),
// and "timezone" (an IANA zone name, offered as a searchable list).

function catalog() {
  return [
    {
      type: "clock",
      name: "Clock",
      description: "The time, in any timezone, and how far that is from your own.",
      source: "widgets/Clock.qml",
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
      type: "music",
      name: "Music",
      description: "What is playing, how far in, and a button to stop it.",
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

// Pixel size of an `n`-block run at a given scale, gaps included. Everything
// else measures the global grid at `layout.scale`; a card with an override
// measures itself at its own.
function blockRunAt(layout, n, scale) {
  return n * layout.cellSize * scale + (n - 1) * layout.gap * scale
}

// The scale this card actually renders at: its own override when it set one,
// otherwise the layout's global. Geometry and hit testing both read this, so
// a card that breaks the grid reads the same broken size everywhere.
function effectiveScale(layout, instance) {
  if (instance && typeof instance.scale === "number") return instance.scale
  return layout ? layout.scale : DEFAULT_LAYOUT.scale
}

// Pixel size of a `cols` x `rows` block, gaps included.
function blockWidth(layout, cols) {
  var n = Math.max(1, Math.round(cols))
  return blockRunAt(layout, n, layout.scale)
}

// Pixel size of a `rows`-row block, gaps included, at the layout's scale. The
// editor's per-cell outline and the grid's height both read this.
function blockHeight(layout, rows) {
  var n = Math.max(1, Math.round(rows))
  return blockRunAt(layout, n, layout.scale)
}

// Grid cell size (horizontal spacing in px) at the given scale. The cells
// before an `effectiveScale`-scaled card are laid out with the layout's own
// scale — an override is that card's own business, not the neighbours'.
function cellRunStep(layout, scale) {
  return layout.cellSize * scale + layout.gap * scale
}

function gridWidth(layout) {
  return blockWidth(layout, layout.columns)
}

// Left edge of the grid inside a `screenWidth`-wide usable area.
function gridOriginX(layout, screenWidth) {
  if (layout.side === "left") return layout.marginX
  return Math.round(screenWidth - layout.marginX - gridWidth(layout))
}

// The widest grid that still fits on a `screenWidth` screen, given the cell
// size and the margin it is held off its edge by. Offering a column count
// that runs off the screen would be offering a widget you cannot see, so the
// editor asks this before it offers anything.
function maxColumnsFor(layout, screenWidth) {
  var w = Number(screenWidth)
  if (!isFinite(w) || w <= 0) return MAX_COLUMNS
  for (var n = MAX_COLUMNS; n > 1; n--) {
    if (layout.marginX + blockWidth(layout, n) <= w) return n
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

// Screen rectangle of a cell block at the grid's own scale. The editor's cell
// outline, the drop probe and the grid's overall height all draw the *grid*,
// so they use the layout scale on every cell and never see an override.
function cellRect(layout, screenWidth, col, row, cols, rows) {
  var step = scaledCell(layout) + scaledGap(layout)
  return {
    x: Math.round(gridOriginX(layout, screenWidth) + col * step),
    y: Math.round(layout.marginY + row * step),
    width: blockWidth(layout, cols),
    height: blockHeight(layout, rows)
  }
}

// Screen rectangle of one widget: its own scale when it overrides the grid,
// the cell's exact rectangle otherwise. This is what actually draws the card,
// so `scale` on a widget dwarfs that card but leaves its neighbours alone.
// The cell edge may carry the round (or a card down to an empty cell), but the
// placement math above always reads the grid, so an override cannot make a
// card start mid-cell or land where it overlaps another.
function widgetRect(layout, instance, screenWidth) {
  var scale = effectiveScale(layout, instance)
  if (scale === null || Math.round(scale * 100) / 100 === Math.round(layout.scale * 100) / 100) {
    return cellRect(layout, screenWidth, instance.col, instance.row, instance.cols, instance.rows)
  }
  var step = scaledCell(layout) + scaledGap(layout)
  return {
    x: Math.round(gridOriginX(layout, screenWidth) + Math.round(instance.col) * step),
    y: Math.round(layout.marginY + Math.round(instance.row) * step),
    width: blockRunAt(layout, instance.cols, scale),
    height: blockRunAt(layout, instance.rows, scale)
  }
}

// Which cell a screen point falls in. Returns null outside the grid's columns
// or above its top, so a drag that wanders off does not silently snap back to
// column zero.
function cellFromPoint(layout, screenWidth, x, y) {
  var step = scaledCell(layout) + scaledGap(layout)
  if (step <= 0) return null
  var localX = x - gridOriginX(layout, screenWidth)
  var localY = y - layout.marginY
  if (localX < 0 || localY < 0) return null
  var col = Math.floor(localX / step)
  var row = Math.floor(localY / step)
  if (col < 0 || col >= layout.columns) return null
  if (row < 0 || row >= MAX_ROWS) return null
  return { col: col, row: row }
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
  if (!target) return { cell: null, valid: false }
  var layout = config.layout
  var cell = cellFromPoint(layout, screenWidth,
    cardX + scaledCell(layout) / 2, cardY + scaledCell(layout) / 2)
  if (!cell) return { cell: null, valid: false }
  return {
    cell: cell,
    valid: canPlace(config, id, cell.col, cell.row, target.cols, target.rows)
  }
}

// The name to put on a widget in the popup and in the editor's tray. The
// type's name is enough until there is more than one of that type, at which
// point every row would read the same and the id is what tells them apart.
function displayName(config, instance) {
  if (!instance) return ""
  var entry = catalogEntry(instance.type)
  var typeName = entry ? entry.name : String(instance.type)
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var sameType = 0
  for (var i = 0; i < list.length; i++) if (list[i].type === instance.type) sameType++
  return sameType > 1 ? typeName + " · " + instance.id : typeName
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
    col: 0,
    row: 0,
    cols: size[0],
    rows: size[1],
    // scale: null means "render at the layout's global scale"; a number
    // overrides the layout for this card alone.
    scale: null,
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
  return {
    version: SCHEMA_VERSION,
    layout: normalizeLayout(DEFAULT_LAYOUT),
    widgets: [defaultInstance("clock", "clock")]
  }
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

  // Absent or null keeps "follow the layout's global scale"; anything else is
  // a per-card multiplier, clamped to the same range the global accepts.
  out.scale = (raw.scale === undefined || raw.scale === null)
    ? null
    : Math.round(clampNumber(raw.scale, MIN_SCALE, MAX_SCALE, DEFAULT_LAYOUT.scale) * 100) / 100
  // Absent or null keeps "follow the layout's global opacity"; anything else
  // is a per-card override.
  out.opacity = (raw.opacity === undefined || raw.opacity === null)
    ? null
    : Math.round(clampNumber(raw.opacity, 0, 1, 0.72) * 100) / 100
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

function rectsOverlap(a, b) {
  return a.col < b.col + b.cols && b.col < a.col + a.cols
    && a.row < b.row + b.rows && b.row < a.row + a.rows
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
function firstFreeCellAmong(layout, cols, rows, others) {
  for (var row = 0; row < MAX_ROWS; row++) {
    for (var col = 0; col + cols <= layout.columns; col++) {
      if (fitsAmong(layout, { col: col, row: row, cols: cols, rows: rows }, others))
        return { col: col, row: row }
    }
  }
  return null
}

// Can a `cols` x `rows` block sit at (col, row) without leaving the grid or
// landing on any other live widget?
function canPlace(config, id, col, row, cols, rows) {
  return fitsAmong(config.layout, { col: col, row: row, cols: cols, rows: rows },
    occupants(config, id))
}

function firstFreeCell(config, id, cols, rows) {
  return firstFreeCellAmong(config.layout, cols, rows, occupants(config, id))
}

// Put a widget somewhere legal, wherever that turns out to be.
function relocate(config, id) {
  var target = findInstance(config, id)
  if (!target) return false
  var cell = firstFreeCell(config, id, target.cols, target.rows)
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
      var cell = firstFreeCellAmong(config.layout, w.cols, w.rows, settled)
      if (cell) { w.col = cell.col; w.row = cell.row }
    }
    settled.push(w)
  }
  return config
}

// How many rows the grid actually uses, for drawing an editor that is as tall
// as the content plus one empty row to drop into.
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
function moveWidget(config, id, col, row) {
  var next = normalizeConfig(config)
  var target = findInstance(next, id)
  if (!target) return next
  var c = Math.round(Number(col))
  var r = Math.round(Number(row))
  if (!isFinite(c) || !isFinite(r)) return next
  if (!canPlace(next, id, c, r, target.cols, target.rows)) return next
  target.col = c
  target.row = r
  return next
}

// Drop a widget onto a cell, switching it on if it was in the tray. Enabling
// and moving are one step on purpose: a widget that arrived on the grid but
// landed nowhere legal, or moved but stayed off, are both states the editor
// would then have to explain.
function placeWidget(config, id, col, row) {
  var next = normalizeConfig(config)
  var target = findInstance(next, id)
  if (!target) return next
  var c = Math.round(Number(col))
  var r = Math.round(Number(row))
  if (!isFinite(c) || !isFinite(r)) return next

  // Checked as though it were already on, because that is what is being
  // asked for; a widget in the tray takes up no room and would otherwise
  // never collide with anything.
  var wasEnabled = target.enabled
  target.enabled = true
  var block = { col: c, row: r, cols: target.cols, rows: target.rows }
  if (!fitsAmong(next.layout, block, occupants(next, id))) {
    target.enabled = wasEnabled
    return next
  }
  target.col = c
  target.row = r
  return next
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

function setSide(config, side) {
  var next = normalizeConfig(config)
  var value = clampString(side)
  if (SIDES.indexOf(value) === -1) return next
  next.layout.side = value
  return next
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

// The layout's global scale. The global is authoritative: moving it re-applies
// it to every card, bringing any that had set their own back in line with the
// rest. A card only earns an override again by being edited on its own.
function setScale(config, scale) {
  var n = Number(scale)
  if (!isFinite(n)) return normalizeConfig(config)
  var next = normalizeConfig(config)
  next.layout.scale = Math.round(clampNumber(n, MIN_SCALE, MAX_SCALE, 1) * 100) / 100
  dropPerWidget(next, "scale")
  return next
}

// The layout's global opacity, the same deal as `setScale`: moving it writes
// over any per-card opacity so the whole grid matches again. Opaque is 1 and
// the default is 0.72.
function setLayoutOpacity(config, opacity) {
  var n = Number(opacity)
  if (!isFinite(n)) return normalizeConfig(config)
  var next = normalizeConfig(config)
  next.layout.opacity = Math.round(clampNumber(n, 0, 1, DEFAULT_LAYOUT.opacity) * 100) / 100
  dropPerWidget(next, "opacity")
  return next
}

// With the global changed, a card that had its own value keeps it no longer:
// the point of touching the global is the whole grid moving together.
function dropPerWidget(config, key) {
  for (var i = 0; i < config.widgets.length; i++) config.widgets[i][key] = null
}

// Back to the sizes and solidities the plugin ships with: the grid's default
// scale and opacity, and no card overriding either. The field a widget was
// edited to is lost — this is the "I moved too many knobs" button.
function resetAppearance(config) {
  var next = normalizeConfig(config)
  next.layout.scale = DEFAULT_LAYOUT.scale
  next.layout.opacity = DEFAULT_LAYOUT.opacity
  dropPerWidget(next, "scale")
  dropPerWidget(next, "opacity")
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
  target.opacity = Math.round(clampNumber(n, 0, 1, 0.72) * 100) / 100
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

// One widget's scale on its own, so a card can break the grid's uniform size
// the way an accent card breaks its opacity.
function setWidgetScale(config, id, scale) {
  var n = Number(scale)
  if (!isFinite(n)) return normalizeConfig(config)
  var next = normalizeConfig(config)
  var target = findInstance(next, id)
  if (!target) return next
  target.scale = Math.round(clampNumber(n, MIN_SCALE, MAX_SCALE, DEFAULT_LAYOUT.scale) * 100) / 100
  return next
}

// Give a card back to the layout's scale after it had its own.
function clearScale(config, id) {
  var next = normalizeConfig(config)
  var target = findInstance(next, id)
  if (!target) return next
  target.scale = null
  return next
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
    effectiveScale: effectiveScale,
    blockRunAt: blockRunAt,
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
    defaultInstance: defaultInstance,
    defaultConfig: defaultConfig,
    normalizeSettings: normalizeSettings,
    normalizeInstance: normalizeInstance,
    isLegacyInstance: isLegacyInstance,
    normalizeConfig: normalizeConfig,
    rectsOverlap: rectsOverlap,
    occupants: occupants,
    fitsAmong: fitsAmong,
    firstFreeCellAmong: firstFreeCellAmong,
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
    setWidgetScale: setWidgetScale,
    clearScale: clearScale,
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
    offsetLabel: offsetLabel
  }
}
