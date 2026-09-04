
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
// `cellSize` is the side of one cell. `columns` is how many cells wide the
// whole grid is, so widening the grid adds room rather than shrinking what is
// already in it.

var DEFAULT_LAYOUT = {
  side: "right",
  columns: 2,
  cellSize: 200,
  gap: 16,
  marginX: 40,
  marginY: 40
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
    marginY: Math.round(clampNumber(source.marginY, 0, MAX_MARGIN, DEFAULT_LAYOUT.marginY))
  }
}

// Pixel size of a `cols` x `rows` block, gaps included.
function blockWidth(layout, cols) {
  var n = Math.max(1, Math.round(cols))
  return n * layout.cellSize + (n - 1) * layout.gap
}

function blockHeight(layout, rows) {
  var n = Math.max(1, Math.round(rows))
  return n * layout.cellSize + (n - 1) * layout.gap
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

// Screen rectangle of a cell block. The grid's own origin is folded in, so
// this is what both the drawing and the hit testing use — they cannot drift.
function cellRect(layout, screenWidth, col, row, cols, rows) {
  var step = layout.cellSize + layout.gap
  return {
    x: Math.round(gridOriginX(layout, screenWidth) + col * step),
    y: Math.round(layout.marginY + row * step),
    width: blockWidth(layout, cols),
    height: blockHeight(layout, rows)
  }
}

function widgetRect(layout, instance, screenWidth) {
  return cellRect(layout, screenWidth, instance.col, instance.row, instance.cols, instance.rows)
}

// Which cell a screen point falls in. Returns null outside the grid's columns
// or above its top, so a drag that wanders off does not silently snap back to
// column zero.
function cellFromPoint(layout, screenWidth, x, y) {
  var step = layout.cellSize + layout.gap
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
    cardX + layout.cellSize / 2, cardY + layout.cellSize / 2)
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
    opacity: 0.72,
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

  out.opacity = clampNumber(raw.opacity, 0, 1, out.opacity)
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

// Everything switched off, in catalogue order. This is the editor's tray.
function offWidgets(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var out = []
  for (var i = 0; i < list.length; i++) if (!list[i].enabled) out.push(list[i])
  return out
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
    sizesFor: sizesFor,
    defaultSize: defaultSize,
    isAllowedSize: isAllowedSize,
    nextSize: nextSize,
    isPlainObject: isPlainObject,
    clampString: clampString,
    clampNumber: clampNumber,
    normalizeLayout: normalizeLayout,
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
    widgetsForScreen: widgetsForScreen,
    offWidgets: offWidgets,
    isSafeZone: isSafeZone,
    zonesInUse: zonesInUse,
    parseOffsetToken: parseOffsetToken,
    parseZoneOffsets: parseZoneOffsets,
    zoneShiftMinutes: zoneShiftMinutes,
    offsetLabel: offsetLabel
  }
}
