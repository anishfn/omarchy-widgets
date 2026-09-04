const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const Model = require("../Model.js")

const root = path.join(__dirname, "..")
const read = (f) => fs.readFileSync(path.join(root, f), "utf8")

function qmlFiles() {
  const out = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".qml")) out.push(entry.name)
    if (!entry.isDirectory() || entry.name === "tests" || entry.name.startsWith(".")) continue
    for (const inner of fs.readdirSync(path.join(root, entry.name))) {
      if (inner.endsWith(".qml")) out.push(path.join(entry.name, inner))
    }
  }
  return out
}

// qmllint ships as the Qt5 binary on some distros; only the Qt6 one
// understands the QML this plugin is written in.
function qmllintPath() {
  for (const candidate of ["/usr/lib/qt6/bin/qmllint", "/usr/lib/qt6/bin/qmllint6"]) {
    if (fs.existsSync(candidate)) return candidate
  }
  const found = spawnSync("sh", ["-c", "command -v qmllint6 || true"], { encoding: "utf8" })
  return found.stdout.trim() || null
}

// --------------------------------------------------------------------- QML

test("every QML file parses", () => {
  const linter = qmllintPath()
  if (!linter) return
  for (const file of qmlFiles()) {
    const run = spawnSync(linter, [file], { cwd: root, encoding: "utf8" })
    // Unresolved qs.Commons / qs.Ui imports are expected outside the shell;
    // a parse error is exit 255 with nothing useful on stderr.
    assert.notEqual(run.status, 255, `${file} does not parse\n${run.stderr}`)
  }
})

// A property implicitly declares `<name>Changed`. Declaring that signal by
// hand as well is accepted by the parser and then refused by the QML engine
// at load time, which shows up as the whole plugin silently not appearing.
test("no hand-written signal collides with a property's change signal", () => {
  for (const file of qmlFiles()) {
    const src = read(file)
    const properties = new Set()
    for (const m of src.matchAll(/^\s*(?:readonly\s+)?property\s+\S+\s+(\w+)/gm)) {
      properties.add(m[1])
    }
    for (const m of src.matchAll(/^\s*signal\s+(\w+)\s*\(/gm)) {
      const signal = m[1]
      if (!signal.endsWith("Changed")) continue
      const base = signal.slice(0, -"Changed".length)
      assert.equal(properties.has(base), false,
        `${file}: signal ${signal}() collides with the change signal of property ${base}`)
    }
  }
})

// QML refuses a file that sets the same handler twice on one object with
// "Property value set multiple times", and the plugin then just never
// appears. Depth has to be tracked with braces, not indentation: two sibling
// Timers both saying onTriggered are perfectly fine and look identical to a
// whitespace-only check.
// Nerd Font glyphs live in the Unicode private use area, and a private-use
// character pasted into a source file survives only as long as every tool
// that touches it preserves it. One that does not leaves an empty string,
// which renders as nothing, reports no error, and looks like a font problem.
// Writing them as \uXXXX escapes makes them ordinary ASCII in the file.
test("glyphs are escapes, not literal private-use characters", () => {
  for (const file of qmlFiles()) {
    const src = read(file)
    for (let i = 0; i < src.length; i++) {
      const code = src.codePointAt(i)
      const isPrivate = (code >= 0xe000 && code <= 0xf8ff)
        || (code >= 0xf0000 && code <= 0xffffd)
      if (!isPrivate) continue
      const line = src.slice(0, i).split("\n").length
      assert.fail(`${file}:${line}: literal private-use character U+${code.toString(16).toUpperCase()}`
        + ` — write it as a \\u escape instead`)
    }
  }
})

test("no QML object declares the same handler twice", () => {
  for (const file of qmlFiles()) {
    // Strip line comments and string literals first, so a brace inside
    // either cannot move the depth counter.
    const src = read(file)
      .replace(/\/\/[^\n]*/g, "")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")

    const scopes = [new Map()]
    let line = 1
    for (let i = 0; i < src.length; i++) {
      const ch = src[i]
      if (ch === "\n") { line++; continue }
      if (ch === "{") { scopes.push(new Map()); continue }
      if (ch === "}") { if (scopes.length > 1) scopes.pop(); continue }
      if (ch !== "o") continue

      const m = /^(on[A-Z]\w*)\s*:/.exec(src.slice(i, i + 64))
      if (!m) continue
      // Only a handler if nothing but whitespace precedes it on its line.
      const lineStart = src.lastIndexOf("\n", i) + 1
      if (src.slice(lineStart, i).trim() !== "") continue

      const scope = scopes[scopes.length - 1]
      assert.equal(scope.has(m[1]), false,
        `${file}: ${m[1]} set twice on one object (lines ${scope.get(m[1])} and ${line})`)
      scope.set(m[1], line)
      i += m[0].length - 1
    }
  }
})


// ---------------------------------------------------------------- manifest

test("manifest matches what PluginRegistry requires", () => {
  const manifest = JSON.parse(read("manifest.json"))
  assert.equal(manifest.schemaVersion, 1)
  for (const field of ["id", "name", "version", "kinds", "entryPoints"]) {
    assert.ok(manifest[field] !== undefined, `missing ${field}`)
  }
  assert.ok(Array.isArray(manifest.kinds) && manifest.kinds.length > 0)
  assert.doesNotMatch(manifest.id, /[/]|\.\./)
  for (const [kind, target] of Object.entries(manifest.entryPoints)) {
    assert.ok(!target.startsWith("/"), `${kind} entry point must be relative`)
    assert.ok(!target.includes(".."), `${kind} entry point must stay inside the plugin`)
    assert.ok(fs.existsSync(path.join(root, target)), `${kind} entry point ${target} does not exist`)
  }
  assert.ok(["left", "center", "right"].includes(manifest.barWidget.defaultSection))
  // Every kind the manifest claims needs the entry point the shell looks for.
  const expected = { panel: "panel", "bar-widget": "barWidget", service: "service" }
  for (const kind of manifest.kinds) {
    assert.ok(manifest.entryPoints[expected[kind]], `kind ${kind} has no entry point`)
  }
})

test("the bar widget's moduleName is the manifest id", () => {
  const manifest = JSON.parse(read("manifest.json"))
  const m = read("BarWidget.qml").match(/moduleName:\s*"([^"]+)"/)
  assert.ok(m, "BarWidget.qml declares no moduleName")
  assert.equal(m[1], manifest.id)
})

// --------------------------------------------------------------- catalogue

test("every catalogue entry points at a file that exists", () => {
  for (const entry of Model.catalog()) {
    assert.ok(!entry.source.startsWith("/") && !entry.source.includes(".."),
      `${entry.type}: source must stay inside the plugin`)
    assert.ok(fs.existsSync(path.join(root, entry.source)),
      `${entry.type}: ${entry.source} does not exist`)
    assert.ok(entry.name && entry.description, `${entry.type}: needs a name and description`)
    assert.ok(Array.isArray(entry.sizes) && entry.sizes.length > 0, `${entry.type}: needs sizes`)
    for (const [cols, rows] of entry.sizes) {
      assert.ok(cols >= 1 && cols <= Model.MAX_COLUMNS, `${entry.type}: bad col span ${cols}`)
      assert.ok(rows >= 1 && rows <= Model.MAX_ROWS, `${entry.type}: bad row span ${rows}`)
    }
  }
})

test("catalogue types are unique", () => {
  const types = Model.catalogTypes()
  assert.equal(new Set(types).size, types.length)
})

test("a type's default size is the first it offers, and sizes cycle", () => {
  assert.deepEqual(Model.defaultSize("clock"), Model.sizesFor("clock")[0])
  const sizes = Model.sizesFor("clock")
  let [c, r] = sizes[0]
  for (let i = 0; i < sizes.length; i++) [c, r] = Model.nextSize("clock", c, r)
  assert.deepEqual([c, r], sizes[0], "cycling through every size returns to the start")
})

test("a size the type does not offer is not allowed", () => {
  assert.equal(Model.isAllowedSize("clock", 1, 1), true)
  assert.equal(Model.isAllowedSize("clock", 2, 1), true)
  assert.equal(Model.isAllowedSize("clock", 3, 3), false)
  assert.equal(Model.isAllowedSize("nope", 1, 1), false)
})

// ---------------------------------------------------------------- settings

test("every setting a type declares is usable by the editor", () => {
  const kinds = ["text", "boolean", "choice", "timezone", "number"]
  for (const entry of Model.catalog()) {
    assert.ok(Array.isArray(entry.settings), `${entry.type}: settings must be a schema`)
    const keys = new Set()
    for (const spec of entry.settings) {
      assert.ok(spec.key, `${entry.type}: a setting with no key`)
      assert.equal(keys.has(spec.key), false, `${entry.type}: duplicate setting ${spec.key}`)
      keys.add(spec.key)
      assert.ok(kinds.includes(spec.type), `${entry.type}.${spec.key}: unknown type ${spec.type}`)
      assert.ok(spec.label, `${entry.type}.${spec.key}: needs a label to render`)
      assert.notEqual(spec.defaultValue, undefined, `${entry.type}.${spec.key}: needs a default`)
      if (spec.type === "choice") {
        assert.ok(Array.isArray(spec.options) && spec.options.length > 0,
          `${entry.type}.${spec.key}: a choice needs options`)
        const values = spec.options.map((o) => (o && o.value !== undefined ? o.value : o))
        assert.ok(values.includes(spec.defaultValue),
          `${entry.type}.${spec.key}: the default is not one of the options`)
      }
    }
  }
})

test("defaults come from the schema, so there is one place they live", () => {
  const defaults = Model.defaultsFor("clock")
  const schema = Model.settingsSchema("clock")
  assert.deepEqual(Object.keys(defaults).sort(), schema.map((s) => s.key).sort())
  for (const spec of schema) assert.equal(defaults[spec.key], spec.defaultValue)
  assert.deepEqual(Model.defaultsFor("nope"), {})
})

test("a setting is coerced to the kind its schema promises", () => {
  const spec = (key) => Model.settingSpec("clock", key)
  assert.equal(Model.coerceSetting(spec("ticks"), "yes"), false)
  assert.equal(Model.coerceSetting(spec("ticks"), true), true)
  assert.equal(Model.coerceSetting(spec("label"), 12), "")
  assert.equal(Model.coerceSetting(spec("label"), "BLR"), "BLR")
  // A choice outside the offered options falls back rather than sticking.
  assert.equal(Model.coerceSetting(spec("format"), "nonsense"), "HH:mm")
  assert.equal(Model.coerceSetting(spec("format"), "hh:mm AP"), "hh:mm AP")
  // Absent means "use the default", not "use empty".
  assert.equal(Model.coerceSetting(spec("format"), undefined), "HH:mm")
})

test("a timezone that could reach a command line is refused as a setting too", () => {
  const spec = Model.settingSpec("clock", "timezone")
  assert.equal(Model.coerceSetting(spec, "Asia/Kolkata"), "Asia/Kolkata")
  assert.equal(Model.coerceSetting(spec, ""), "", "empty means your own clock")
  for (const bad of ["../../etc/passwd", "Asia/Kolkata; rm -rf ~", "$(id)", "/etc/localtime"]) {
    assert.equal(Model.coerceSetting(spec, bad), "", `${bad} should be refused`)
  }
})

test("setting a value goes through the same gate as loading one", () => {
  let config = Model.defaultConfig()
  config = Model.setSetting(config, "clock", "timezone", "Asia/Tokyo")
  assert.equal(Model.findInstance(config, "clock").settings.timezone, "Asia/Tokyo")

  config = Model.setSetting(config, "clock", "timezone", "not a zone")
  assert.equal(Model.findInstance(config, "clock").settings.timezone, "",
    "a refused value falls back to the default rather than being stored")

  // A key the type does not have changes nothing at all.
  const before = JSON.stringify(config)
  assert.equal(JSON.stringify(Model.setSetting(config, "clock", "nonsense", "x")), before)
  assert.equal(JSON.stringify(Model.setSetting(config, "ghost", "timezone", "UTC")), before)
})

test("a zone names itself when the user has not", () => {
  assert.equal(Model.zoneLabel("America/New_York"), "New York")
  assert.equal(Model.zoneLabel("Asia/Kolkata"), "Kolkata")
  assert.equal(Model.zoneLabel("America/Argentina/Buenos_Aires"), "Buenos Aires")
  assert.equal(Model.zoneLabel("UTC"), "UTC")
  assert.equal(Model.zoneLabel(""), "")
  assert.equal(Model.zoneLabel(null), "")
})

// ------------------------------------------------------------------ config

test("the default config is one clock, on, in a two-column grid", () => {
  const config = Model.defaultConfig()
  assert.equal(config.version, Model.SCHEMA_VERSION)
  assert.equal(config.layout.columns, 2)
  assert.equal(config.layout.side, "right")
  assert.equal(config.widgets.length, 1)
  assert.equal(config.widgets[0].type, "clock")
  assert.equal(config.widgets[0].enabled, true)
  assert.deepEqual([config.widgets[0].col, config.widgets[0].row], [0, 0])
})

test("normalize survives junk without throwing", () => {
  for (const junk of [null, undefined, 4, "text", [], {}, { widgets: null }, { widgets: [null, 7, "x"] },
                      { layout: "nope", widgets: [] }, { layout: { columns: "many" } }]) {
    const out = Model.normalizeConfig(junk)
    assert.equal(out.version, Model.SCHEMA_VERSION)
    assert.ok(Array.isArray(out.widgets))
    assert.ok(Model.SIDES.includes(out.layout.side))
    assert.ok(out.layout.columns >= 1)
  }
})

test("normalize clamps the layout into range", () => {
  const out = Model.normalizeConfig({
    layout: { side: "diagonal", columns: 999, cellSize: -5, gap: -3, marginX: 1e9, marginY: "x" }
  })
  assert.equal(out.layout.side, "right")
  assert.equal(out.layout.columns, Model.MAX_COLUMNS)
  assert.equal(out.layout.cellSize, 60)
  assert.equal(out.layout.gap, 0)
  assert.equal(out.layout.marginX, 4000)
  assert.equal(out.layout.marginY, Model.DEFAULT_LAYOUT.marginY)
})

test("normalize drops unknown types and unknown settings keys", () => {
  const out = Model.normalizeConfig({
    widgets: [
      { id: "a", type: "clock", col: 0, row: 0, settings: { label: "BLR", nonsense: "drop me" } },
      { id: "b", type: "not-a-widget", col: 0, row: 1 }
    ]
  })
  assert.equal(out.widgets.length, 1)
  assert.equal(out.widgets[0].settings.label, "BLR")
  assert.equal(out.widgets[0].settings.nonsense, undefined)
  assert.equal(out.widgets[0].settings.format, "HH:mm")
})

test("normalize refuses a footprint the type does not offer", () => {
  const out = Model.normalizeConfig({
    widgets: [{ id: "a", type: "clock", col: 0, row: 0, cols: 5, rows: 4 }]
  })
  assert.deepEqual([out.widgets[0].cols, out.widgets[0].rows], Model.defaultSize("clock"))
})

test("normalize keeps the first of two widgets sharing an id", () => {
  const out = Model.normalizeConfig({
    widgets: [
      { id: "dupe", type: "clock", col: 0, row: 0, settings: { label: "first" } },
      { id: "dupe", type: "clock", col: 1, row: 0, settings: { label: "second" } }
    ]
  })
  assert.equal(out.widgets.length, 1)
  assert.equal(out.widgets[0].settings.label, "first")
})

test("normalize caps the widget count", () => {
  const widgets = []
  for (let i = 0; i < Model.MAX_WIDGETS + 40; i++) widgets.push({ id: "w" + i, type: "clock", col: 0, row: i })
  assert.equal(Model.normalizeConfig({ widgets }).widgets.length, Model.MAX_WIDGETS)
})

test("normalize is idempotent", () => {
  const once = Model.normalizeConfig(Model.defaultConfig())
  assert.deepEqual(Model.normalizeConfig(once), once)
})

test("a widget type added later arrives switched off", () => {
  const out = Model.ensureCatalogCoverage({ widgets: [] })
  assert.equal(out.widgets.length, Model.catalogTypes().length)
  for (const w of out.widgets) assert.equal(w.enabled, false)
})

test("coverage leaves widgets that are already configured alone", () => {
  const out = Model.ensureCatalogCoverage({
    widgets: [{ id: "clock", type: "clock", col: 1, row: 2, enabled: true, settings: { label: "BLR" } }]
  })
  assert.equal(out.widgets.filter((w) => w.type === "clock").length, 1)
  assert.equal(out.widgets[0].enabled, true)
  assert.deepEqual([out.widgets[0].col, out.widgets[0].row], [1, 2])
})

// ---------------------------------------------------------------- migration

test("a config from the free-placement model is repacked, not discarded", () => {
  const legacy = {
    version: 1,
    widgets: [
      { id: "a", type: "clock", enabled: true, anchor: "top-right", offsetX: 40, offsetY: 40,
        scale: 1.5, opacity: 0.9, radius: 30, settings: { label: "BLR", timezone: "Asia/Kolkata" } },
      { id: "b", type: "clock", enabled: true, anchor: "bottom-left", offsetX: 10, offsetY: 10,
        scale: 1, opacity: 0.5, radius: -1, settings: { label: "NYC" } }
    ]
  }
  const out = Model.normalizeConfig(legacy)
  assert.equal(out.version, Model.SCHEMA_VERSION)
  assert.equal(out.widgets.length, 2)
  // What still means something survives.
  assert.equal(out.widgets[0].settings.label, "BLR")
  assert.equal(out.widgets[0].settings.timezone, "Asia/Kolkata")
  assert.equal(out.widgets[0].opacity, 0.9)
  assert.equal(out.widgets[1].radius, -1)
  // Both got a cell, and they are not the same cell.
  assert.equal(overlapCount(out), 0)
  assert.ok(out.widgets.every((w) => w.col >= 0 && w.row >= 0))
})

// ------------------------------------------------------------------- grid

function overlapCount(config) {
  const live = Model.occupants(config)
  let n = 0
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) if (Model.rectsOverlap(live[i], live[j])) n++
  }
  return n
}

test("the grid hugs the side it is told to", () => {
  const layout = Model.normalizeLayout({ side: "right", columns: 2, cellSize: 200, gap: 16, marginX: 40, marginY: 40 })
  assert.equal(Model.gridWidth(layout), 416)
  assert.equal(Model.gridOriginX(layout, 2560), 2560 - 40 - 416)
  assert.equal(Model.gridOriginX({ ...layout, side: "left" }, 2560), 40)
})

test("a cell rect is the block it draws, gaps included", () => {
  const layout = Model.normalizeLayout(Model.DEFAULT_LAYOUT)
  assert.deepEqual(Model.cellRect(layout, 2560, 0, 0, 1, 1), { x: 2104, y: 40, width: 200, height: 200 })
  // Second column is one cell plus one gap along.
  assert.deepEqual(Model.cellRect(layout, 2560, 1, 0, 1, 1), { x: 2320, y: 40, width: 200, height: 200 })
  // Second row likewise, down.
  assert.deepEqual(Model.cellRect(layout, 2560, 0, 1, 1, 1), { x: 2104, y: 256, width: 200, height: 200 })
  // A two-column block swallows the gap between them.
  assert.deepEqual(Model.cellRect(layout, 2560, 0, 0, 2, 1), { x: 2104, y: 40, width: 416, height: 200 })
})

test("hit testing is the inverse of drawing", () => {
  const layout = Model.normalizeLayout(Model.DEFAULT_LAYOUT)
  for (const side of Model.SIDES) {
    const l = { ...layout, side }
    for (let col = 0; col < l.columns; col++) {
      for (let row = 0; row < 4; row++) {
        const r = Model.cellRect(l, 2560, col, row, 1, 1)
        // Anywhere inside the drawn cell must read back as that cell.
        for (const [dx, dy] of [[1, 1], [r.width / 2, r.height / 2], [r.width - 1, r.height - 1]]) {
          assert.deepEqual(Model.cellFromPoint(l, 2560, r.x + dx, r.y + dy), { col, row },
            `${side} (${col},${row}) at +${dx},+${dy}`)
        }
      }
    }
  }
})

test("a point outside the grid is not a cell", () => {
  const layout = Model.normalizeLayout(Model.DEFAULT_LAYOUT)
  assert.equal(Model.cellFromPoint(layout, 2560, 0, 100), null, "left of a right-hand grid")
  assert.equal(Model.cellFromPoint(layout, 2560, 2104, 0), null, "above the top margin")
  assert.equal(Model.cellFromPoint(layout, 2560, 2555, 100), null, "past the last column")
})

test("a block cannot overhang the grid or land on another widget", () => {
  const config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [{ id: "a", type: "clock", enabled: true, col: 0, row: 0 }]
  })
  assert.equal(Model.canPlace(config, "b", 1, 0, 1, 1), true, "free cell beside it")
  assert.equal(Model.canPlace(config, "b", 0, 0, 1, 1), false, "straight onto it")
  assert.equal(Model.canPlace(config, "b", 0, 0, 2, 1), false, "a wide block across it")
  assert.equal(Model.canPlace(config, "b", 1, 0, 2, 1), false, "a wide block off the right edge")
  assert.equal(Model.canPlace(config, "b", -1, 0, 1, 1), false, "off the left edge")
  // A widget is allowed to occupy the cell it is already standing in.
  assert.equal(Model.canPlace(config, "a", 0, 0, 1, 1), true)
})

test("a widget that is off takes up no room", () => {
  const config = Model.normalizeConfig({
    widgets: [{ id: "a", type: "clock", enabled: false, col: 0, row: 0 }]
  })
  assert.equal(Model.canPlace(config, "b", 0, 0, 1, 1), true)
})

test("free cells are found in reading order", () => {
  const config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 1, row: 0 }
    ]
  })
  assert.deepEqual(Model.firstFreeCell(config, "c", 1, 1), { col: 0, row: 1 })
  assert.deepEqual(Model.firstFreeCell(config, "c", 2, 1), { col: 0, row: 1 })
})

test("two widgets given the same cell by hand are separated", () => {
  const out = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "c", type: "clock", enabled: true, col: 0, row: 0 }
    ]
  })
  assert.equal(overlapCount(out), 0)
  // The first one in the file keeps the cell it asked for.
  assert.deepEqual([out.widgets[0].col, out.widgets[0].row], [0, 0])
})

// ------------------------------------------------------------------ drops
//
// A drag is only two things that can be wrong: which cell a card at some
// pixel position is over, and whether it is allowed to land there. Both come
// out of dropTarget, so these are the tests that stand in for a pointer.

test("a card dropped over a cell lands in that cell", () => {
  const config = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [{ id: "a", type: "clock", enabled: true, col: 0, row: 0 }]
  })
  const W = 2560
  // Held exactly over each cell in turn, the card reads back as that cell.
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 3; row++) {
      const r = Model.cellRect(config.layout, W, col, row, 1, 1)
      const t = Model.dropTarget(config, "a", r.x, r.y, W)
      assert.deepEqual(t.cell, { col, row }, `held on (${col},${row})`)
    }
  }
})

test("a card is judged by its own corner, not by how far it has drifted", () => {
  const config = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [{ id: "a", type: "clock", enabled: true, col: 0, row: 0 }]
  })
  const W = 2560
  const r = Model.cellRect(config.layout, W, 1, 1, 1, 1)
  // Just short of the next cell in both directions: still this one.
  const step = config.layout.cellSize + config.layout.gap
  assert.deepEqual(Model.dropTarget(config, "a", r.x + step / 2 - 1, r.y, W).cell, { col: 1, row: 1 })
  // Half a step further and it has moved on.
  assert.deepEqual(Model.dropTarget(config, "a", r.x, r.y + step, W).cell, { col: 1, row: 2 })
})

test("a drop onto an occupied cell is offered and refused, not silently moved", () => {
  const config = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 1, row: 0 }
    ]
  })
  const W = 2560
  const onB = Model.cellRect(config.layout, W, 1, 0, 1, 1)
  const t = Model.dropTarget(config, "a", onB.x, onB.y, W)
  assert.deepEqual(t.cell, { col: 1, row: 0 }, "the cell under the card is still reported")
  assert.equal(t.valid, false, "and it is reported as illegal, so the editor can say so")
})

test("a two-column card cannot be dropped half off the grid", () => {
  const config = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [{ id: "wide", type: "clock", enabled: true, col: 0, row: 0, cols: 2, rows: 1 }]
  })
  const W = 2560
  const secondCol = Model.cellRect(config.layout, W, 1, 1, 1, 1)
  const t = Model.dropTarget(config, "wide", secondCol.x, secondCol.y, W)
  assert.deepEqual(t.cell, { col: 1, row: 1 })
  assert.equal(t.valid, false, "starting in the last column it would overhang")
})

test("a card dragged off the grid has no target at all", () => {
  const config = Model.defaultConfig()
  const W = 2560
  // Far to the left of a right-hand grid.
  assert.equal(Model.dropTarget(config, "clock", 100, 100, W).cell, null)
  // Above the top margin.
  assert.equal(Model.dropTarget(config, "clock", 2104, -300, W).cell, null)
})

test("dropping works the same on the left as on the right", () => {
  let config = Model.setSide(Model.defaultConfig(), "left")
  const W = 2560
  const r = Model.cellRect(config.layout, W, 1, 2, 1, 1)
  const t = Model.dropTarget(config, "clock", r.x, r.y, W)
  assert.deepEqual(t.cell, { col: 1, row: 2 })
  assert.equal(t.valid, true)
})

test("what dropTarget calls legal is what placeWidget accepts", () => {
  const config = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 1, row: 0 },
      { id: "tray", type: "clock", enabled: false, col: 0, row: 0 }
    ]
  })
  const W = 2560
  for (const id of ["a", "b", "tray"]) {
    for (let col = 0; col < 2; col++) {
      for (let row = 0; row < 3; row++) {
        const r = Model.cellRect(config.layout, W, col, row, 1, 1)
        const t = Model.dropTarget(config, id, r.x, r.y, W)
        const after = Model.placeWidget(config, id, col, row)
        const moved = Model.findInstance(after, id)
        const landed = moved.enabled && moved.col === col && moved.row === row
        assert.equal(landed, t.valid,
          `${id} onto (${col},${row}): editor said ${t.valid}, config did ${landed}`)
      }
    }
  }
})

// ------------------------------------------------------------------- names

test("widgets are named by type until there are two of a type", () => {
  const one = Model.normalizeConfig({
    widgets: [{ id: "clock", type: "clock", enabled: true, col: 0, row: 0 }]
  })
  assert.equal(Model.displayName(one, one.widgets[0]), "Clock")

  const two = Model.normalizeConfig({
    widgets: [
      { id: "blr", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "nyc", type: "clock", enabled: true, col: 1, row: 0 }
    ]
  })
  assert.equal(Model.displayName(two, two.widgets[0]), "Clock · blr")
  assert.equal(Model.displayName(two, two.widgets[1]), "Clock · nyc")
  assert.equal(Model.displayName(two, null), "")
})

test("moving is refused when it does not fit, and applied when it does", () => {
  let config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 1, row: 0 }
    ]
  })
  config = Model.moveWidget(config, "a", 1, 0)
  assert.deepEqual([Model.findInstance(config, "a").col, Model.findInstance(config, "a").row], [0, 0],
    "onto an occupied cell: refused")

  config = Model.moveWidget(config, "a", 0, 3)
  assert.deepEqual([Model.findInstance(config, "a").col, Model.findInstance(config, "a").row], [0, 3],
    "onto a free cell: applied")

  config = Model.moveWidget(config, "a", 0, "nonsense")
  assert.equal(Model.findInstance(config, "a").row, 3, "junk coordinates change nothing")
  assert.equal(overlapCount(config), 0)
})

test("dropping from the tray switches the widget on and places it in one step", () => {
  let config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: false, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 0, row: 0 }
    ]
  })
  // Onto the cell b is standing on: refused, and a stays in the tray rather
  // than ending up on the grid at the wrong place or on top of b.
  config = Model.placeWidget(config, "a", 0, 0)
  assert.equal(Model.findInstance(config, "a").enabled, false)
  assert.equal(overlapCount(config), 0)

  config = Model.placeWidget(config, "a", 1, 0)
  const a = Model.findInstance(config, "a")
  assert.equal(a.enabled, true)
  assert.deepEqual([a.col, a.row], [1, 0])
  assert.equal(overlapCount(config), 0)
})

test("resizing moves the widget when the new size does not fit where it stands", () => {
  let config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 1, row: 0 }
    ]
  })
  config = Model.resizeWidget(config, "a", 2, 1)
  const a = Model.findInstance(config, "a")
  assert.deepEqual([a.cols, a.rows], [2, 1], "the size asked for is the size given")
  assert.equal(overlapCount(config), 0, "and it moved off b rather than onto it")
  assert.ok(a.col + a.cols <= config.layout.columns)
})

test("a size the type does not offer is refused", () => {
  let config = Model.defaultConfig()
  config = Model.resizeWidget(config, "clock", 4, 4)
  assert.deepEqual([config.widgets[0].cols, config.widgets[0].rows], Model.defaultSize("clock"))
})

test("widening the grid leaves every widget where it was", () => {
  let config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 1, row: 0 },
      { id: "wide", type: "clock", enabled: true, col: 0, row: 1, cols: 2, rows: 1 }
    ]
  })
  const before = JSON.parse(JSON.stringify(config.widgets))
  for (const n of [3, 4, 5]) {
    config = Model.setColumns(config, n)
    assert.equal(config.layout.columns, n)
    assert.deepEqual(config.widgets, before, `widening to ${n} moved something`)
    assert.equal(overlapCount(config), 0)
  }
})

test("widening the grid grows it from the side it is anchored to", () => {
  const two = Model.normalizeLayout({ side: "right", columns: 2 })
  const five = Model.normalizeLayout({ side: "right", columns: 5 })
  // Anchored right, the far edge stays put and the grid grows leftward.
  assert.equal(Model.gridOriginX(two, 2560) + Model.gridWidth(two),
    Model.gridOriginX(five, 2560) + Model.gridWidth(five))
  assert.ok(Model.gridOriginX(five, 2560) < Model.gridOriginX(two, 2560))

  // Anchored left, the near edge stays put and it grows rightward.
  assert.equal(Model.gridOriginX({ ...two, side: "left" }, 2560),
    Model.gridOriginX({ ...five, side: "left" }, 2560))
})

test("only column counts that fit the screen are offered", () => {
  const layout = Model.normalizeLayout(Model.DEFAULT_LAYOUT)  // 200px cells, 16 gap, 40 margin
  // Six columns need 40 + 6*200 + 5*16 = 1320.
  assert.equal(Model.maxColumnsFor(layout, 1320), 6)
  assert.equal(Model.maxColumnsFor(layout, 1319), 5)
  // Three need 40 + 600 + 32 = 672.
  assert.equal(Model.maxColumnsFor(layout, 672), 3)
  assert.equal(Model.maxColumnsFor(layout, 671), 2)
  // Never zero, however cramped: one column is always offered.
  assert.equal(Model.maxColumnsFor(layout, 10), 1)
  assert.deepEqual(Model.columnOptions(layout, 672), [1, 2, 3])
})

test("a grid already wider than the screen can still be narrowed", () => {
  // Configured by hand at 5 columns on a display only wide enough for 2: the
  // current count has to stay on offer or there is no way back from it.
  const layout = Model.normalizeLayout({ columns: 5 })
  const options = Model.columnOptions(layout, 600)
  assert.ok(options.includes(5), "the count in use is always offered")
  assert.ok(options.includes(2))
})

test("narrowing the grid shrinks and repacks what no longer fits", () => {
  let config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0, cols: 2, rows: 1 },
      { id: "b", type: "clock", enabled: true, col: 0, row: 1 }
    ]
  })
  config = Model.setColumns(config, 1)
  assert.equal(config.layout.columns, 1)
  for (const w of config.widgets) {
    assert.ok(w.cols <= 1, `${w.id} is still ${w.cols} wide`)
    assert.ok(w.col + w.cols <= 1, `${w.id} hangs off the grid`)
  }
  assert.equal(overlapCount(config), 0)
})

test("switching sides moves the grid and nothing else", () => {
  const before = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [{ id: "a", type: "clock", enabled: true, col: 1, row: 2 }]
  })
  const after = Model.setSide(before, "left")
  assert.equal(after.layout.side, "left")
  assert.deepEqual(after.widgets, before.widgets, "cells are untouched")
  assert.notEqual(Model.gridOriginX(after.layout, 2560), Model.gridOriginX(before.layout, 2560))
  // A side that is not a side is ignored rather than accepted.
  assert.equal(Model.setSide(before, "up").layout.side, "right")
})

test("a widget switched back on finds a cell when its old one was taken", () => {
  let config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: false, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 1, row: 0 }
    ]
  })
  // Something moves into a's cell while a is away.
  config = Model.moveWidget(config, "b", 0, 0)
  assert.deepEqual([Model.findInstance(config, "b").col, Model.findInstance(config, "b").row], [0, 0])

  config = Model.setEnabled(config, "a", true)
  assert.equal(Model.findInstance(config, "a").enabled, true)
  assert.equal(overlapCount(config), 0, "a landed somewhere free instead of on top of b")
})

test("enable and toggle only touch the widget named", () => {
  let config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 1, row: 0 }
    ]
  })
  config = Model.setEnabled(config, "a", false)
  assert.equal(Model.findInstance(config, "a").enabled, false)
  assert.equal(Model.findInstance(config, "b").enabled, true)

  config = Model.toggleEnabled(config, "a")
  assert.equal(Model.findInstance(config, "a").enabled, true)

  const before = JSON.stringify(config)
  assert.equal(JSON.stringify(Model.setEnabled(config, "ghost", true)), before)
})

test("the tray is what is switched off, the grid is what is not", () => {
  const config = Model.normalizeConfig({
    widgets: [
      { id: "on", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "off", type: "clock", enabled: false, col: 1, row: 0 }
    ]
  })
  assert.deepEqual(Model.offWidgets(config).map((w) => w.id), ["off"])
  assert.deepEqual(Model.widgetsForScreen(config, "DP-1").map((w) => w.id), ["on"])
})

test("screen filtering honours an empty monitor as every monitor", () => {
  const config = Model.normalizeConfig({
    widgets: [
      { id: "everywhere", type: "clock", enabled: true, col: 0, row: 0, monitor: "" },
      { id: "pinned", type: "clock", enabled: true, col: 1, row: 0, monitor: "DP-1" },
      { id: "off", type: "clock", enabled: false, col: 0, row: 1, monitor: "" }
    ]
  })
  assert.deepEqual(Model.widgetsForScreen(config, "DP-1").map((w) => w.id), ["everywhere", "pinned"])
  assert.deepEqual(Model.widgetsForScreen(config, "HDMI-A-1").map((w) => w.id), ["everywhere"])
})

test("used rows counts what is on the grid, not what is configured", () => {
  const config = Model.normalizeConfig({
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 0, row: 2 },
      { id: "c", type: "clock", enabled: false, col: 1, row: 9 }
    ]
  })
  assert.equal(Model.usedRows(config), 3)
})

// ------------------------------------------------------------- repo pulse

test("a repository name is checked as the two path segments it becomes", () => {
  for (const good of ["cli/cli", "omarchy/omarchy", "a/b", "user-name/repo.name_1", "o/" + "x".repeat(100)]) {
    assert.equal(Model.isSafeRepo(good), true, `${good} should be allowed`)
  }
  for (const bad of ["", "noslash", "a/b/c", "/leading", "trailing/", "../../etc/passwd",
                     "o/..", "o/.", "a b/c", "o/re po", "$(id)/x", "o/" + "x".repeat(101),
                     "-bad/repo", null, undefined, 7]) {
    assert.equal(Model.isSafeRepo(bad), false, `${bad} should be refused`)
  }
})

test("repositories in use are unique, safe, and include the ones switched off", () => {
  const config = Model.normalizeConfig({
    widgets: [
      { id: "a", type: "repo-pulse", enabled: true, col: 0, row: 0, settings: { repo: "cli/cli" } },
      { id: "b", type: "repo-pulse", enabled: false, col: 0, row: 1, settings: { repo: "cli/cli" } },
      { id: "c", type: "repo-pulse", enabled: false, col: 0, row: 2, settings: { repo: "o/two" } },
      { id: "d", type: "repo-pulse", enabled: true, col: 0, row: 3, settings: { repo: "../../etc" } },
      { id: "e", type: "clock", enabled: true, col: 1, row: 0 }
    ]
  })
  assert.deepEqual(Model.reposInUse(config), ["cli/cli", "o/two"])
})

test("a repository response becomes the numbers the card shows", () => {
  const r = Model.parseRepo({
    full_name: "cli/cli", description: "GitHub's official CLI",
    stargazers_count: 46148, forks_count: 8965, open_issues_count: 1076,
    pushed_at: "2026-09-04T16:07:18Z"
  })
  assert.equal(r.fullName, "cli/cli")
  assert.equal(r.stars, 46148)
  assert.equal(r.forks, 8965)
  assert.equal(r.issues, 1076)
  assert.equal(r.pushedAt, "2026-09-04T16:07:18Z")
})

test("a response that is not a repository is refused", () => {
  for (const junk of [null, undefined, "", "not json", "[]", 7, {},
                      { message: "Not Found" }, { full_name: "" }]) {
    assert.equal(Model.parseRepo(junk), null, `${JSON.stringify(junk)} should be refused`)
  }
})

// GitHub's open_issues_count counts pull requests as issues. Showing it as
// "issues" is wrong by however many pull requests are open, which on a busy
// repository is a lot.
test("pull requests are taken back out of the issue count", () => {
  const info = { stars: 46148, forks: 8965, issues: 1076 }
  const s = Model.repoStats(info, 66)
  assert.equal(s.issues, 1010, "1076 combined minus 66 pull requests")
  assert.equal(s.pulls, 66)
  assert.equal(s.stars, 46148)
})

test("an unknown pull request count is unknown, not zero", () => {
  const info = { stars: 1, forks: 2, issues: 10 }
  for (const missing of [null, undefined]) {
    const s = Model.repoStats(info, missing)
    assert.equal(s.pulls, null, "Number(null) is 0, which would read as 'none open'")
    assert.equal(s.issues, 10, "and the combined count is shown until the real one arrives")
  }
  // A genuine zero is a genuine zero.
  assert.equal(Model.repoStats(info, 0).pulls, 0)
  assert.equal(Model.repoStats(null, 5), null)
})

test("the pull request count is read out of the search response", () => {
  assert.equal(Model.parsePullCount({ total_count: 66 }), 66)
  assert.equal(Model.parsePullCount('{"total_count":0}'), 0)
  for (const junk of [null, undefined, "", "{}", "junk", [], { total_count: -1 },
                      { total_count: "many" }]) {
    assert.equal(Model.parsePullCount(junk), null, `${JSON.stringify(junk)} should be refused`)
  }
})

test("the repo card is square by default", () => {
  assert.deepEqual(Model.defaultSize("repo-pulse"), [1, 1],
    "four numbers do not need a wide card")
})

test("counts are shortened for scale, not for arithmetic", () => {
  assert.equal(Model.compactCount(0), "0")
  assert.equal(Model.compactCount(999), "999")
  assert.equal(Model.compactCount(1000), "1k")
  assert.equal(Model.compactCount(1500), "1.5k")
  assert.equal(Model.compactCount(46148), "46k")
  assert.equal(Model.compactCount(1250000), "1.3M")
  assert.equal(Model.compactCount(-5), "0")
  assert.equal(Model.compactCount("nonsense"), "0")
})

test("how long ago is the coarsest true thing", () => {
  const now = Date.parse("2026-09-05T00:00:00Z")
  const ago = (iso) => Model.sinceLabel(iso, now)
  assert.equal(ago("2026-09-04T23:30:00Z"), "30m")
  assert.equal(ago("2026-09-04T16:07:18Z"), "7h")
  assert.equal(ago("2026-09-02T00:00:00Z"), "3d")
  assert.equal(ago("2026-08-20T00:00:00Z"), "2w")
  assert.equal(ago("2026-06-05T00:00:00Z"), "3mo")
  assert.equal(ago("2024-09-05T00:00:00Z"), "2y")
  // Under a minute still reads as a minute rather than as zero.
  assert.equal(ago("2026-09-04T23:59:50Z"), "1m")
  // A clock ahead of ours is not a negative age.
  assert.equal(ago("2026-09-06T00:00:00Z"), "now")
  assert.equal(ago("nonsense"), "")
  assert.equal(ago(""), "")
})

// ------------------------------------------------------------------ music

test("track times read as times", () => {
  assert.equal(Model.trackTime(0), "0:00")
  assert.equal(Model.trackTime(9), "0:09")
  assert.equal(Model.trackTime(65), "1:05")
  assert.equal(Model.trackTime(600), "10:00")
  assert.equal(Model.trackTime(3725), "1:02:05", "past an hour the minutes pad")
  assert.equal(Model.trackTime(-5), "0:00")
  assert.equal(Model.trackTime("nonsense"), "0:00")
})

test("progress is a fraction, and never a division by nothing", () => {
  assert.equal(Model.trackFraction(30, 120), 0.25)
  assert.equal(Model.trackFraction(0, 120), 0)
  assert.equal(Model.trackFraction(120, 120), 1)
  // A player that has not said how long the track is gets no progress bar
  // rather than an infinite one.
  assert.equal(Model.trackFraction(30, 0), 0)
  assert.equal(Model.trackFraction(30, -1), 0)
  assert.equal(Model.trackFraction(NaN, 120), 0)
  // Past the end, which players do report, stays at the end.
  assert.equal(Model.trackFraction(200, 120), 1)
})

test("the player followed is the one actually playing", () => {
  const players = [
    { identity: "Firefox", isPlaying: false, canControl: true },
    { identity: "Spotify", isPlaying: true, canControl: true }
  ]
  assert.equal(Model.pickPlayerIndex(players, ""), 1, "playing wins over order")

  // Nothing playing: the first that can be controlled.
  const idle = [
    { identity: "A", isPlaying: false, canControl: false },
    { identity: "B", isPlaying: false, canControl: true }
  ]
  assert.equal(Model.pickPlayerIndex(idle, ""), 1)

  // A named preference beats both.
  assert.equal(Model.pickPlayerIndex(players, "firefox"), 0, "matched case-insensitively")
  assert.equal(Model.pickPlayerIndex(players, "spot"), 1, "and on a prefix")
  // A name nobody answers to falls back rather than showing nothing.
  assert.equal(Model.pickPlayerIndex(players, "vlc"), 1)

  assert.equal(Model.pickPlayerIndex([], ""), -1)
  assert.equal(Model.pickPlayerIndex(null, ""), -1)
})

// What arrives at runtime is Mpris.players.values — a QML list that indexes
// and measures like an array but is not one. Array.isArray says false for it,
// so a guard written that way finds no players at all while the desktop is
// quite plainly playing something. A test fed only real arrays never sees it.
test("an array-like list of players works as well as an array", () => {
  const arrayLike = {
    length: 2,
    0: { identity: "Firefox", isPlaying: false, canControl: true },
    1: { identity: "Spotify", isPlaying: true, canControl: true }
  }
  assert.equal(Array.isArray(arrayLike), false, "this is the shape Qt hands us")
  assert.equal(Model.pickPlayerIndex(arrayLike, ""), 1)
  assert.equal(Model.pickPlayerIndex(arrayLike, "firefox"), 0)
  assert.equal(Model.pickPlayerIndex({ length: 0 }, ""), -1)
  assert.equal(Model.pickPlayerIndex({ length: "two" }, ""), -1)
  assert.equal(Model.pickPlayerIndex({}, ""), -1)
})

// ------------------------------------------------------------ interactivity

// The desktop surface has no input region, so a click lands on whatever is
// underneath. A widget type opts its own rectangle back in, and only its own.
test("only a type that asks for input is interactive", () => {
  assert.equal(Model.isInteractiveType("music"), true)
  for (const passive of ["clock", "weather", "github", "repo-pulse", "nope"]) {
    assert.equal(Model.isInteractiveType(passive), false, `${passive} must stay click-through`)
  }
})

test("the input region covers interactive widgets and nothing else", () => {
  const config = Model.normalizeConfig({
    widgets: [
      { id: "clock", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "music", type: "music", enabled: true, col: 0, row: 1, cols: 2, rows: 1 },
      { id: "off", type: "music", enabled: false, col: 0, row: 3, cols: 2, rows: 1 },
      { id: "other", type: "music", enabled: true, col: 0, row: 2, cols: 2, rows: 1, monitor: "DP-9" }
    ]
  })
  assert.deepEqual(Model.interactiveWidgetsForScreen(config, "DP-1").map((w) => w.id), ["music"],
    "not the clock, not the one switched off, not the one on another screen")
  assert.deepEqual(Model.interactiveWidgetsForScreen(config, "DP-9").map((w) => w.id).sort(),
    ["music", "other"])
})

test("the widgets that reach the network each name where they go", () => {
  assert.equal(Model.catalogEntry("repo-pulse").network, "api.github.com")
  assert.equal(Model.catalogEntry("github").network, "github.com")
  assert.equal(Model.catalogEntry("weather").network, "wttr.in")
  // Music is local and must not claim otherwise.
  assert.equal(Model.catalogEntry("music").network, undefined)
  assert.equal(Model.catalogEntry("clock").network, undefined)
})

// ----------------------------------------------------- github contributions

// The page GitHub serves at /users/<login>/contributions, built to the same
// shape a live response has. Two details are load-bearing and both are here
// on purpose:
//
//   - the calendar is emitted a ROW at a time, so consecutive cells are a
//     week apart and the markup is not in date order
//   - the legend carries five squares with a data-level and no data-date,
//     which a pattern keying off the level alone happily counts as days
//
// Verified against a real 234 KB response while writing the parser; kept
// synthetic here so the suite does not carry a quarter megabyte of somebody's
// profile around.
function contributionsPage(options) {
  const opts = options || {}
  const weeks = opts.weeks === undefined ? 4 : opts.weeks
  const total = opts.total === undefined ? "1,763" : opts.total
  // 2026-01-04 is a Sunday, so the calendar starts on a week boundary the way
  // GitHub's does.
  const start = Date.UTC(2026, 0, 4)
  const level = (row, col) => (row + col) % 5

  let cells = ""
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < weeks; col++) {
      const d = new Date(start + (col * 7 + row) * 86400000)
      const date = d.toISOString().slice(0, 10)
      cells += `<td data-ix="${col}" style="width: 10px" data-date="${date}"`
        + ` id="contribution-day-component-${row}-${col}" data-level="${level(row, col)}"`
        + ` role="gridcell" class="ContributionCalendar-day"></td>\n`
    }
  }

  let legend = ""
  for (let i = 0; i < 5; i++) {
    legend += `<td style="width: 10px; height: 10px"`
      + ` id="contribution-graph-legend-level-${i}" data-level="${i}"`
      + ` class="ContributionCalendar-day rounded-1"></td>\n`
  }

  return `<div class="js-yearly-contributions">
    <h2 class="f4 text-normal mb-2">
      ${total}
      contributions
        in the last year
    </h2>
    <table class="ContributionCalendar-grid">${cells}</table>
    <div class="legend">Less ${legend} More</div>
  </div>`
}

test("the contribution calendar is read out of the page", () => {
  const c = Model.parseContributions(contributionsPage({ weeks: 4 }))
  assert.equal(c.total, "1,763")
  assert.equal(c.days.length, 28, "four weeks of seven days")
  assert.ok(c.at > 0)
})

test("the legend's five squares are not counted as days", () => {
  // They carry a data-level and no data-date. A pattern keyed off the level
  // reads 33 days here instead of 28, and every graph is then five days long.
  const page = contributionsPage({ weeks: 4 })
  assert.equal((page.match(/data-level=/g) || []).length, 33, "28 days plus 5 legend squares")
  assert.equal(Model.parseContributions(page).days.length, 28)
})

test("days come back in date order, whatever order the page emits them", () => {
  const c = Model.parseContributions(contributionsPage({ weeks: 4 }))
  const dates = c.days.map((d) => d.date)
  assert.deepEqual(dates, [...dates].sort(), "the page emits a row at a time, not a day at a time")
  assert.equal(dates[0], "2026-01-04")
  assert.equal(dates[dates.length - 1], "2026-01-31")
})

test("a page that is not a contribution calendar is refused", () => {
  for (const junk of ["", null, undefined, "<html>nope</html>", "<h2>1,763 contributions in the last year</h2>"]) {
    assert.equal(Model.parseContributions(junk), null, `${junk} should be refused`)
  }
})

test("a calendar with no total still gives its days", () => {
  const page = contributionsPage({ weeks: 2 }).replace(/<h2[\s\S]*?<\/h2>/, "")
  const c = Model.parseContributions(page)
  assert.equal(c.days.length, 14)
  assert.equal(c.total, "", "no headline is not a reason to lose the graph")
})

test("a response past the ceiling is refused rather than parsed", () => {
  const huge = "x".repeat(Model.MAX_CONTRIBUTION_BYTES + 1)
  assert.equal(Model.parseContributions(huge), null)
})

test("the grid puts every day in the right row and column", () => {
  const c = Model.parseContributions(contributionsPage({ weeks: 4 }))
  const g = Model.contributionGrid(c, 4)
  assert.equal(g.columns, 4)
  assert.equal(g.shown, 28)
  assert.equal(g.from, "2026-01-04")
  assert.equal(g.to, "2026-01-31")

  // Sunday the 4th is row 0 of column 0; Saturday the 10th is row 6.
  const at = (date) => g.cells.find((cell) => cell.date === date)
  assert.deepEqual([at("2026-01-04").col, at("2026-01-04").row], [0, 0])
  assert.deepEqual([at("2026-01-10").col, at("2026-01-10").row], [0, 6])
  assert.deepEqual([at("2026-01-11").col, at("2026-01-11").row], [1, 0], "next Sunday is the next column")
  assert.deepEqual([at("2026-01-31").col, at("2026-01-31").row], [3, 6])

  // Every cell lands inside the grid it reports.
  for (const cell of g.cells) {
    assert.ok(cell.col >= 0 && cell.col < g.columns, `col ${cell.col} outside ${g.columns}`)
    assert.ok(cell.row >= 0 && cell.row < 7, `row ${cell.row} outside a week`)
  }
})

test("asking for fewer weeks keeps the most recent ones", () => {
  const c = Model.parseContributions(contributionsPage({ weeks: 8 }))
  const g = Model.contributionGrid(c, 3)
  assert.equal(g.columns, 3)
  assert.equal(g.to, "2026-02-28", "the last day stays the last day")
  assert.equal(g.from, "2026-02-08", "and the window starts three weeks before it")
  // Columns are renumbered from zero so the drawing does not have to know
  // which slice of the year it was handed.
  assert.equal(Math.min(...g.cells.map((cell) => cell.col)), 0)
  assert.equal(Math.max(...g.cells.map((cell) => cell.col)), 2)
})

test("asking for more weeks than exist gives what there is", () => {
  const c = Model.parseContributions(contributionsPage({ weeks: 2 }))
  const g = Model.contributionGrid(c, 53)
  assert.equal(g.columns, 2)
  assert.equal(g.shown, 14)
})

test("a grid of nothing is empty rather than broken", () => {
  for (const junk of [null, undefined, {}, { days: [] }, { days: [{ date: "nonsense", level: 1 }] }]) {
    const g = Model.contributionGrid(junk, 10)
    assert.equal(g.columns, 0)
    assert.deepEqual(g.cells, [])
  }
})

test("a calendar starting mid-week still lands in the right rows", () => {
  // 2026-01-07 is a Wednesday, day three of GitHub's Sunday-first week.
  const c = { days: [
    { date: "2026-01-07", level: 1 },
    { date: "2026-01-08", level: 2 },
    { date: "2026-01-11", level: 3 }
  ] }
  const g = Model.contributionGrid(c, 4)
  const at = (date) => g.cells.find((cell) => cell.date === date)
  assert.equal(at("2026-01-07").row, 3, "Wednesday")
  assert.equal(at("2026-01-08").row, 4, "Thursday")
  assert.deepEqual([at("2026-01-11").col, at("2026-01-11").row], [1, 0], "the following Sunday")
})

test("how many weeks fit is a whole number, and never zero", () => {
  // A 13px cell with a 3px gap: the last column needs no trailing gap.
  assert.equal(Model.weeksThatFit(376, 13, 3), 23)
  assert.equal(Model.weeksThatFit(13, 13, 3), 1, "exactly one cell")
  assert.equal(Model.weeksThatFit(0, 13, 3), 1, "never zero columns")
  assert.equal(Model.weeksThatFit(376, 0, 0), 1, "never divides by nothing")
})

test("the week count reads as a sentence", () => {
  assert.equal(Model.weeksLabel(23), "23 weeks")
  assert.equal(Model.weeksLabel(1), "1 week")
  assert.equal(Model.weeksLabel(0), "0 weeks")
})

test("a username that could become something else in a URL is refused", () => {
  for (const good of ["anishfn", "a", "a-b", "torvalds", "x".repeat(39), "user-name-1"]) {
    assert.equal(Model.isSafeLogin(good), true, `${good} should be allowed`)
  }
  for (const bad of ["", "-lead", "trail-", "two--hyphens", "has space", "has/slash",
                     "../../etc", "a".repeat(40), "semi;colon", "$(id)", null, undefined, 7]) {
    assert.equal(Model.isSafeLogin(bad), false, `${bad} should be refused`)
  }
})

test("logins in use are unique, safe, and include the ones switched off", () => {
  const config = Model.normalizeConfig({
    widgets: [
      { id: "a", type: "github", enabled: true, col: 0, row: 0, settings: { login: "anishfn" } },
      { id: "b", type: "github", enabled: false, col: 0, row: 1, settings: { login: "anishfn" } },
      { id: "c", type: "github", enabled: false, col: 0, row: 2, settings: { login: "torvalds" } },
      { id: "d", type: "github", enabled: true, col: 0, row: 3, settings: { login: "../../etc" } },
      { id: "e", type: "github", enabled: true, col: 0, row: 4, settings: { login: "" } },
      { id: "f", type: "clock", enabled: true, col: 1, row: 0 }
    ]
  })
  assert.deepEqual(Model.loginsInUse(config), ["anishfn", "torvalds"])
})

test("the github widget declares where it goes, and is wide by default", () => {
  const gh = Model.catalogEntry("github")
  assert.equal(gh.network, "github.com")
  assert.deepEqual(Model.defaultSize("github"), [2, 1],
    "seven rows of squares want length; a square card is the fallback, not the default")
})

// ----------------------------------------------------------------- weather

// The shape wttr.in's j1 endpoint actually returns, trimmed to the fields
// the card reads. Captured from a live response rather than imagined.
const wttrSample = {
  current_condition: [{
    temp_C: "20", temp_F: "68", weatherCode: "122",
    weatherDesc: [{ value: "Overcast " }]
  }],
  nearest_area: [{
    areaName: [{ value: "London" }],
    region: [{ value: "City of London Greater London" }],
    country: [{ value: "United Kingdom" }]
  }],
  weather: [{
    maxtempC: "22", mintempC: "16", maxtempF: "72", mintempF: "61",
    astronomy: [{ sunrise: "06:18 AM", sunset: "07:41 PM" }]
  }]
}

test("a weather report becomes the handful of values a card draws", () => {
  const w = Model.parseWeather(wttrSample)
  assert.equal(w.place, "London")
  assert.equal(w.tempC, "20")
  assert.equal(w.tempF, "68")
  assert.equal(w.code, 122)
  assert.equal(w.condition, "Overcast", "wttr pads some descriptions; the padding goes")
  assert.equal(w.highC, "22")
  assert.equal(w.lowC, "16")
  assert.equal(w.sunrise, "06:18 AM")
  assert.ok(w.at > 0)
})

test("a report also parses from the raw string curl hands back", () => {
  const w = Model.parseWeather(JSON.stringify(wttrSample))
  assert.equal(w.place, "London")
  assert.equal(w.tempC, "20")
})

test("temperatures are rounded, not passed through", () => {
  const w = Model.parseWeather({
    current_condition: [{ temp_C: "20.6", temp_F: "69.1", weatherCode: "113", weatherDesc: [] }],
    weather: [{ maxtempC: "22.4", mintempC: "15.5" }]
  })
  assert.equal(w.tempC, "21")
  assert.equal(w.tempF, "69")
  assert.equal(w.highC, "22")
  assert.equal(w.lowC, "16")
})

test("a response that is not a weather report is refused, not half-drawn", () => {
  for (const junk of [null, undefined, "", "not json", "[]", 7, {}, { current_condition: [] },
                      { current_condition: [{}] },
                      { current_condition: [{ temp_C: "nonsense" }] }]) {
    assert.equal(Model.parseWeather(junk), null, `${JSON.stringify(junk)} should be refused`)
  }
})

test("a report missing its forecast still gives a temperature", () => {
  // The card can lose the range without losing the number it exists for.
  const w = Model.parseWeather({
    current_condition: [{ temp_C: "20", temp_F: "68", weatherCode: "113", weatherDesc: [] }]
  })
  assert.equal(w.tempC, "20")
  assert.equal(w.highC, "")
  assert.equal(Model.rangeLabel(w, "celsius"), "", "no range means no range line, not a broken one")
})

test("temperatures are written the way a weather card writes them", () => {
  const w = Model.parseWeather(wttrSample)
  assert.equal(Model.tempLabel(w, "celsius", "temp"), "20°")
  assert.equal(Model.tempLabel(w, "fahrenheit", "temp"), "68°")
  assert.equal(Model.rangeLabel(w, "celsius"), "H:22°  L:16°")
  assert.equal(Model.rangeLabel(w, "fahrenheit"), "H:72°  L:61°")
  assert.equal(Model.tempLabel(null, "celsius", "temp"), "")
})

test("units are the setting's value, and anything else means celsius", () => {
  assert.equal(Model.isFahrenheit("fahrenheit"), true)
  assert.equal(Model.isFahrenheit("celsius"), false)
  assert.equal(Model.isFahrenheit(""), false)
  assert.equal(Model.isFahrenheit(undefined), false)
})

test("condition icons match the ones Omarchy's own weather picks", () => {
  // Pinned to the exact codepoints, not merely asserted to differ. The
  // mapping is transcribed from `omarchy-weather-icon`, whose lines read
  // `[[ $night == true ]] && icon=<A> || icon=<B>` -- so the *first* glyph is
  // the night one. Reading that pair the other way round is exactly the
  // mistake that shipped a sun on a rainy midnight, and "they differ" is a
  // test that passes just as happily when they are swapped.
  assert.equal(Model.weatherIcon(113, false), "\ue30d", "clear by day is the sun")
  assert.equal(Model.weatherIcon(113, true), "\ue32b", "clear by night is the moon")
  assert.equal(Model.weatherIcon(353, false), "\ue308", "rain showers by day carry a sun")
  assert.equal(Model.weatherIcon(353, true), "\ue333", "rain showers by night do not")
  // Overcast has no night variant; the same glyph either way.
  assert.equal(Model.weatherIcon(122, false), Model.weatherIcon(122, true))
  // A code nobody has heard of still draws something.
  assert.equal(Model.weatherIcon(9999, false), Model.weatherIcon(119, false))
  assert.equal(Model.weatherIcon("not a code", false), Model.weatherIcon(119, false))
  // Every glyph in the table is a single character, or the bar would jump.
  for (const row of Model.WEATHER_ICONS) {
    assert.equal(Array.from(row.day).length, 1, `day glyph for ${row.codes[0]}`)
    assert.equal(Array.from(row.night).length, 1, `night glyph for ${row.codes[0]}`)
  }
})

test("every weather code appears in exactly one icon row", () => {
  const seen = new Set()
  for (const row of Model.WEATHER_ICONS) {
    for (const code of row.codes) {
      assert.equal(seen.has(code), false, `code ${code} is in two rows`)
      seen.add(code)
    }
  }
})

test("wall-clock times parse, and anything else does not", () => {
  assert.equal(Model.parseClockTime("06:18 AM"), 378)
  assert.equal(Model.parseClockTime("07:41 PM"), 1181)
  assert.equal(Model.parseClockTime("12:00 AM"), 0, "midnight is hour zero, not twelve")
  assert.equal(Model.parseClockTime("12:30 PM"), 750, "noon is hour twelve, not twenty-four")
  for (const bad of ["", "6:18", "25:00 AM", "06:70 AM", "sunrise", null, undefined]) {
    assert.equal(Model.parseClockTime(bad), null, `${bad} should not parse`)
  }
})

test("night is before sunrise and after sunset", () => {
  const rise = "06:18 AM", set = "07:41 PM"
  assert.equal(Model.isNight(0, rise, set), true, "midnight")
  assert.equal(Model.isNight(377, rise, set), true, "a minute before sunrise")
  assert.equal(Model.isNight(378, rise, set), false, "sunrise itself is day")
  assert.equal(Model.isNight(12 * 60, rise, set), false, "noon")
  assert.equal(Model.isNight(1180, rise, set), false, "a minute before sunset")
  assert.equal(Model.isNight(1181, rise, set), true, "sunset itself is night")
  // Somewhere the sun does not set, the times invert; day is the safe answer.
  assert.equal(Model.isNight(12 * 60, "07:41 PM", "06:18 AM"), false)
  // No astronomy at all is not a reason to claim it is dark.
  assert.equal(Model.isNight(12 * 60, "", ""), false)
})

test("a widget that reaches the network says so in the catalogue", () => {
  const weather = Model.catalogEntry("weather")
  assert.equal(weather.network, "wttr.in",
    "a widget making requests must declare where they go")
  // And one that does not must not claim to.
  assert.equal(Model.catalogEntry("clock").network, undefined)
})

// ------------------------------------------------------------- clock math

test("zone names that could reach a shell or escape zoneinfo are refused", () => {
  for (const good of ["Asia/Kolkata", "America/New_York", "Etc/GMT+5", "UTC", "America/Argentina/Salta"]) {
    assert.equal(Model.isSafeZone(good), true, `${good} should be allowed`)
  }
  for (const bad of ["", "/etc/passwd", "../../etc/passwd", "Asia/../..", "Asia/Kolkata; rm -rf ~",
                     "$(id)", "`id`", "Asia Kolkata", "a".repeat(65), null, undefined, 7]) {
    assert.equal(Model.isSafeZone(bad), false, `${bad} should be refused`)
  }
})

test("zones in use are unique, safe, and include the ones switched off", () => {
  const config = Model.normalizeConfig({
    widgets: [
      { id: "a", type: "clock", enabled: true, settings: { timezone: "Asia/Kolkata" } },
      { id: "b", type: "clock", enabled: false, settings: { timezone: "Asia/Kolkata" } },
      { id: "c", type: "clock", enabled: false, settings: { timezone: "Europe/London" } },
      { id: "d", type: "clock", enabled: true, settings: { timezone: "../../etc/passwd" } },
      { id: "e", type: "clock", enabled: true, settings: { timezone: "" } }
    ]
  })
  assert.deepEqual(Model.zonesInUse(config), ["Asia/Kolkata", "Europe/London"])
})

test("offset tokens parse, and anything else reads as unknown", () => {
  assert.equal(Model.parseOffsetToken("+0530"), 330)
  assert.equal(Model.parseOffsetToken("-0400"), -240)
  assert.equal(Model.parseOffsetToken("+0000"), 0)
  assert.equal(Model.parseOffsetToken("-1200"), -720)
  for (const bad of ["", "0530", "+530", "+05:30", "abcde", null, undefined]) {
    assert.equal(Model.parseOffsetToken(bad), null, `${bad} should not parse`)
  }
})

test("a zone the database does not know is left out, not read as UTC", () => {
  const out = Model.parseZoneOffsets("Asia/Kolkata\t+0530\nNot/AZone\t\nEurope/London\t+0100\n")
  assert.deepEqual(out, { "Asia/Kolkata": 330, "Europe/London": 60 })
  assert.equal("Not/AZone" in out, false)
})

// getTimezoneOffset() is signed the other way round from `date +%z`, which is
// exactly the mistake this plugin would make silently: the clock would read
// twice the difference, or none of it, and still look plausible.
test("the zone shift is the difference between that zone and yours", () => {
  const IST = -330   // what getTimezoneOffset() reads in Asia/Kolkata
  const EDT = 240    // what it reads in America/New_York on DST

  // Sitting in India, looking at New York: 9h30 behind.
  assert.equal(Model.zoneShiftMinutes(IST, -240), -570)
  // Sitting in New York, looking at India: 9h30 ahead, as on the reference card.
  assert.equal(Model.zoneShiftMinutes(EDT, 330), 570)
  // A clock showing your own zone does not move.
  assert.equal(Model.zoneShiftMinutes(IST, 330), 0)
  assert.equal(Model.zoneShiftMinutes(EDT, -240), 0)
})

test("the shift applied to an instant lands on that zone's wall clock", () => {
  // 2026-09-04T16:13:00Z. In India that is 21:43, in New York 12:13.
  const utc = Date.UTC(2026, 8, 4, 16, 13)
  const IST = -330

  const shift = Model.zoneShiftMinutes(IST, -240)          // India -> New York
  const shown = new Date(utc + (-IST) * 60000 + shift * 60000)  // local clock, then shifted
  assert.equal(shown.getUTCHours(), 12)
  assert.equal(shown.getUTCMinutes(), 13)
})

test("the offset label is written the way a timezone difference is written", () => {
  assert.equal(Model.offsetLabel(570), "+9:30")
  assert.equal(Model.offsetLabel(-570), "-9:30")
  assert.equal(Model.offsetLabel(0), "+0:00")
  assert.equal(Model.offsetLabel(60), "+1:00")
  assert.equal(Model.offsetLabel(-45), "-0:45")
  assert.equal(Model.offsetLabel(825), "+13:45")
  assert.equal(Model.offsetLabel("nonsense"), "")
})
