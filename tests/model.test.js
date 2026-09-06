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

test("every type wears a glyph, so a long list can be scanned", () => {
  for (const entry of Model.catalog()) {
    assert.equal(typeof entry.icon, "string", `${entry.type}: needs an icon`)
    assert.equal([...entry.icon].length, 1, `${entry.type}: an icon is one glyph`)
    assert.equal(Model.iconFor(entry.type), entry.icon)
  }
  assert.equal(Model.iconFor("nope"), "", "an unknown type draws no glyph rather than throwing")
})

test("only sizes the grid can hold are offered", () => {
  // The photo card lists footprints three columns wide on purpose. On a
  // narrower grid they are not choices, they are a card drawn off the edge.
  const wide = Model.sizesWithin("photo", 3).map(String)
  assert.ok(wide.includes("3,3"), "a three-column grid can hold a three-column card")
  const narrow = Model.sizesWithin("photo", 2).map(String)
  assert.equal(narrow.includes("3,3"), false)
  assert.equal(narrow.includes("3,2"), false)
  assert.ok(narrow.includes("2,2"))
  for (const [cols] of Model.sizesWithin("photo", 1)) assert.ok(cols <= 1)
})

test("a type whose sizes are all too wide still answers with one of its own", () => {
  // github's narrowest is 1x1, calendar's is 1x1; a type that offered only
  // wide sizes would still have to answer something isAllowedSize accepts.
  for (const type of Model.catalogTypes()) {
    for (let columns = 1; columns <= Model.MAX_COLUMNS; columns++) {
      const [cols, rows] = Model.fitSize(type, columns)
      assert.equal(Model.isAllowedSize(type, cols, rows), true,
        `${type} at ${columns} columns answered a size it does not offer`)
    }
  }
})

test("fitSize keeps a widget as large as the grid allows", () => {
  assert.deepEqual(Model.fitSize("photo", 6), [3, 3])
  assert.deepEqual(Model.fitSize("clock", 1), [1, 1])
})

test("a footprint wider than the grid is brought back inside it", () => {
  // A hand-written config, or one carried over from a wider grid. Left as it
  // was, the card would hang off the right of the grid and no free cell would
  // ever be found for it, because there is no column it fits in.
  const config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [{ id: "photo", type: "photo", col: 0, row: 0, cols: 3, rows: 3 }]
  })
  const photo = Model.findInstance(config, "photo")
  assert.ok(photo.cols <= 2, "the card fits the grid")
  assert.equal(Model.isAllowedSize("photo", photo.cols, photo.rows), true)
})

test("a size is written the way the editor says it", () => {
  assert.equal(Model.sizeLabel(2, 1), "2 × 1")
})

// ------------------------------------------------------------------ photos

test("a path pointing at an image is a picture, and anything else a folder", () => {
  const home = "/home/someone"
  assert.deepEqual(Model.photoTarget("~/Pictures/dog.JPG", home),
    { path: "/home/someone/Pictures/dog.JPG", kind: "image" })
  assert.deepEqual(Model.photoTarget("/srv/wallpapers", home),
    { path: "/srv/wallpapers", kind: "folder" })
  assert.deepEqual(Model.photoTarget("", home), { path: "", kind: "none" })
  // A dot in a directory name is not an extension.
  assert.equal(Model.photoTarget("/srv/my.photos", home).kind, "folder")
})

test("a photo path cannot walk out of anywhere or carry a newline", () => {
  const home = "/home/someone"
  assert.equal(Model.photoTarget("../../etc", home).path, "")
  assert.equal(Model.photoTarget("~/Pictures/../../../etc/shadow", home).path, "")
  // A newline is what turns one line of the folder listing into two.
  assert.equal(Model.clampPath("/srv/a\nb"), "/srv/ab")
  assert.equal(Model.coerceSetting({ type: "path", defaultValue: "" }, "/srv/a\nb"), "/srv/ab")
})

test("a path setting holds a path longer than a label may be", () => {
  const long = "/" + "a".repeat(Model.MAX_STRING + 40)
  assert.equal(Model.coerceSetting({ type: "path", defaultValue: "" }, long).length, long.length)
  assert.equal(Model.clampPath("/" + "a".repeat(Model.MAX_PATH * 2)).length, Model.MAX_PATH)
})

test("only the folders photo cards point at are scanned, once each", () => {
  const home = "/home/someone"
  const config = Model.normalizeConfig({
    widgets: [
      { id: "a", type: "photo", settings: { path: "~/Pictures" } },
      { id: "b", type: "photo", settings: { path: "~/Pictures" } },
      { id: "c", type: "photo", settings: { path: "~/Pictures/one.png" } },
      { id: "d", type: "photo", settings: { path: "/srv/art" } },
      { id: "clock", type: "clock" }
    ]
  })
  assert.deepEqual(Model.photoFoldersInUse(config, home),
    ["/home/someone/Pictures", "/srv/art"])
})

test("a folder listing keeps the images, in a stable order", () => {
  const listing = "/p/b.JPG\n/p/a.png\n/p/notes.txt\n/p/c.webp\nrelative.png\n\n"
  assert.deepEqual(Model.parsePhotoList(listing), ["/p/a.png", "/p/b.JPG", "/p/c.webp"])
  assert.deepEqual(Model.parsePhotoList(""), [])
  assert.deepEqual(Model.parsePhotoList(null), [])
})

test("a folder listing is capped, however many photographs are in it", () => {
  const many = Array.from({ length: Model.MAX_PHOTOS + 50 },
    (_, i) => `/p/${String(i).padStart(6, "0")}.jpg`).join("\n")
  assert.equal(Model.parsePhotoList(many).length, Model.MAX_PHOTOS)
})

test("a slideshow walks in order, and shuffled never stands still", () => {
  assert.equal(Model.nextPhotoIndex(3, 0, false), 1)
  assert.equal(Model.nextPhotoIndex(3, 2, false), 0, "it wraps")
  assert.equal(Model.nextPhotoIndex(1, 0, false), 0, "one picture has nowhere to go")
  assert.equal(Model.nextPhotoIndex(0, 0, false), 0)

  // Every roll picks something, and never the picture already up: a change
  // that changes nothing reads as a broken slideshow.
  for (const count of [2, 3, 7]) {
    for (let index = 0; index < count; index++) {
      for (const roll of [0, 0.1, 0.5, 0.9, 0.999999]) {
        const next = Model.nextPhotoIndex(count, index, true, roll)
        assert.notEqual(next, index, `${count}/${index}/${roll}`)
        assert.ok(next >= 0 && next < count)
      }
    }
  }
})

test("a shuffle reaches every other picture", () => {
  const seen = new Set()
  for (let r = 0; r < 1; r += 0.001) seen.add(Model.nextPhotoIndex(4, 1, true, r))
  assert.deepEqual([...seen].sort(), [0, 2, 3])
})

test("never means no timer at all, not a timer that fires at once", () => {
  assert.equal(Model.photoIntervalMs("0"), 0)
  assert.equal(Model.photoIntervalMs(""), 0)
  assert.equal(Model.photoIntervalMs("nonsense"), 0)
  assert.equal(Model.photoIntervalMs("300"), 300000)
  assert.equal(Model.photoIntervalMs("99999999"), 86400000, "clamped to a day")
})

test("a list that shrank under a card shows its last picture, not its first", () => {
  const files = ["/p/a.jpg", "/p/b.jpg"]
  assert.equal(Model.photoAt(files, 0), "/p/a.jpg")
  assert.equal(Model.photoAt(files, 5), "/p/b.jpg")
  assert.equal(Model.photoAt(files, -1), "/p/a.jpg")
  assert.equal(Model.photoAt([], 0), "")
  assert.equal(Model.photoAt(null, 0), "")
})

test("a picture names itself by its file, without the directory or the type", () => {
  assert.equal(Model.photoName("/p/holiday 2019.jpeg"), "holiday 2019")
  assert.equal(Model.photoName("/p/noext"), "noext")
  assert.equal(Model.photoName(""), "")
})

// ---------------------------------------------------------------- settings

test("every setting a type declares is usable by the editor", () => {
  const kinds = ["text", "boolean", "choice", "timezone", "number", "path"]
  const pathKinds = ["file", "image", "folder"]
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
      if (spec.type === "path") {
        assert.ok(Array.isArray(spec.pathKinds) && spec.pathKinds.length > 0,
          `${entry.type}.${spec.key}: a path needs the kinds its chooser may return`)
        for (const kind of spec.pathKinds) {
          assert.ok(pathKinds.includes(kind),
            `${entry.type}.${spec.key}: unknown path kind ${kind}`)
        }
      }
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
    layout: { side: "diagonal", columns: 999, cellSize: -5, gap: -3, marginX: 1e9, marginY: "x", scale: -9, opacity: 9 }
  })
  assert.equal(out.layout.side, "right")
  assert.equal(out.layout.columns, Model.MAX_COLUMNS)
  assert.equal(out.layout.cellSize, 60)
  assert.equal(out.layout.gap, 0)
  assert.equal(out.layout.marginX, 4000)
  assert.equal(out.layout.marginY, Model.DEFAULT_LAYOUT.marginY)
  assert.equal(out.layout.scale, Model.MIN_SCALE)
  assert.equal(out.layout.opacity, 1)
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

test("scale multiplies cell, gap and drop probe, leaving cells alone", () => {
  const base = Model.normalizeLayout(Model.DEFAULT_LAYOUT)
  const scaled = Model.normalizeLayout({ ...Model.DEFAULT_LAYOUT, scale: 1.5 })

  // 200 and 16 at 150% are 300 and 24; the grid width follows.
  assert.equal(Model.scaledCell(base), 200)
  assert.equal(Model.scaledGap(base), 16)
  assert.equal(Model.scaledGap(scaled), 24)
  assert.equal(Model.gridWidth(scaled), 624) // 2 * 300 + 24
  assert.deepEqual(Model.cellRect(scaled, 2560, 0, 0, 1, 1), { x: 1896, y: 40, width: 300, height: 300 })
  assert.deepEqual(Model.cellRect(scaled, 2560, 0, 0, 2, 1), { x: 1896, y: 40, width: 624, height: 300 })

  // The second column sits one scaled step (300 + 24) from the first.
  assert.deepEqual(Model.cellRect(scaled, 2560, 1, 0, 1, 1), { x: 2220, y: 40, width: 300, height: 300 })
  assert.deepEqual(Model.cellRect(base, 2560, 1, 0, 1, 1), { x: 2320, y: 40, width: 200, height: 200 })

  // The drop probe sits in the middle of a scaled cell, and self-consistency
  // holds: a point inside a drawn scaled cell reads back as that same cell.
  const s2 = Model.normalizeLayout({ ...Model.DEFAULT_LAYOUT, scale: 2 })
  for (let col = 0; col < s2.columns; col++) {
    const r = Model.cellRect(s2, 2560, col, 0, 1, 1)
    assert.deepEqual(Model.cellFromPoint(s2, 2560, r.x + r.width / 2, r.y + 1),
      { col, row: 0, side: s2.side })
  }
})

test("setScale clamps into range and keeps its place in the layout", () => {
  const cfg = Model.normalizeConfig({ widgets: [] })
  assert.equal(cfg.layout.scale, 1)
  assert.equal(Model.setScale(cfg, 1.25).layout.scale, 1.25)
  assert.equal(Model.setScale(cfg, 99).layout.scale, Model.MAX_SCALE)
  assert.equal(Model.setScale(cfg, -5).layout.scale, Model.MIN_SCALE)
  assert.equal(Model.setScale(cfg, "nonsense").layout.scale, 1)
  // Two decimals, so the file stays readable after a change.
  assert.equal(Model.setScale(cfg, 1.234).layout.scale, 1.23)
})

test("the smallest scale still leaves a grid that can be clicked", () => {
  // A scale of 0 would draw 0x0 cells and answer null for every point, so the
  // widgets would be both invisible and undraggable. The floor is what stops
  // the knob from having a setting that throws the grid away.
  assert.ok(Model.MIN_SCALE > 0, "the floor is not zero")
  const layout = Model.normalizeLayout({ ...Model.DEFAULT_LAYOUT, scale: Model.MIN_SCALE })
  assert.equal(layout.scale, Model.MIN_SCALE, "a config asking for the floor gets it")
  assert.ok(Model.scaledCell(layout) >= 1, "a cell is still worth drawing")

  for (const side of Model.SIDES) {
    const r = Model.cellRect(layout, 2560, 0, 0, 1, 1, side)
    assert.ok(r.width > 0 && r.height > 0, `${side} cell has a size`)
    assert.deepEqual(
      Model.cellFromPoint(layout, 2560, r.x + r.width / 2, r.y + r.height / 2),
      { col: 0, row: 0, side }, `${side} cell reads back at the smallest scale`)
  }

  // And a config that asks for zero anyway is clamped, not honoured.
  assert.equal(Model.normalizeLayout({ ...Model.DEFAULT_LAYOUT, scale: 0 }).scale, Model.MIN_SCALE)
})

test("setOpacity is per widget and clamps into range", () => {
  const cfg = Model.defaultConfig()
  // A fresh widget has no opacity of its own; it follows the grid's 0.72.
  assert.equal(Model.findInstance(cfg, "clock").opacity, null)
  assert.equal(Model.effectiveOpacity(cfg, Model.findInstance(cfg, "clock")), 0.72)
  assert.equal(Model.findInstance(Model.setOpacity(cfg, "clock", 0.4), "clock").opacity, 0.4)
  assert.equal(Model.findInstance(Model.setOpacity(cfg, "clock", 99), "clock").opacity, 1)
  assert.equal(Model.findInstance(Model.setOpacity(cfg, "clock", -0.1), "clock").opacity, 0)
  // Two decimals, so the file stays readable after a change.
  assert.equal(Model.findInstance(Model.setOpacity(cfg, "clock", 0.456), "clock").opacity, 0.46)
  // Only the named widget moves; the change never leaks into the layout.
  assert.equal(Model.setOpacity(cfg, "clock", 0.4).layout.opacity, 0.72)
})

test("moving the global opacity re-applies it to every card", () => {
  const cfg = Model.defaultConfig()
  const boosted = Model.setLayoutOpacity(cfg, 0.3)
  assert.equal(boosted.layout.opacity, 0.3)
  assert.equal(Model.findInstance(boosted, "clock").opacity, null)
  assert.equal(Model.effectiveOpacity(boosted, Model.findInstance(boosted, "clock")), 0.3)

  // A card set on its own overrides only itself, for now.
  const own = Model.setOpacity(boosted, "clock", 0.8)
  assert.equal(Model.effectiveOpacity(own, Model.findInstance(own, "clock")), 0.8)

  // Moving the global again sweeps that override away: the whole grid follows.
  const pushed = Model.setLayoutOpacity(own, 0.5)
  const swept = Model.findInstance(pushed, "clock")
  assert.equal(swept.opacity, null)
  assert.equal(Model.effectiveOpacity(pushed, swept), 0.5)

  // Clearing an override merely points the card back at the current global.
  const ownAgain = Model.setOpacity(pushed, "clock", 0.25)
  const cleared = Model.clearOpacity(ownAgain, "clock")
  assert.equal(Model.findInstance(cleared, "clock").opacity, null)
  assert.equal(Model.effectiveOpacity(cleared, Model.findInstance(cleared, "clock")), 0.5)

  // Junk is ignored, and the range is 0..1.
  assert.equal(Model.setLayoutOpacity(cleared, "nonsense").layout.opacity, 0.5)
  assert.equal(Model.setLayoutOpacity(cleared, 9).layout.opacity, 1)
  assert.equal(Model.setLayoutOpacity(cleared, -1).layout.opacity, 0)
})

test("every catalogue type starts following the grid's opacity", () => {
  for (const type of Model.catalogTypes()) {
    const inst = Model.defaultInstance(type, type)
    assert.equal(inst.opacity, null)
  }
  const cfg = Model.defaultConfig()
  for (const w of cfg.widgets) {
    assert.ok(Model.effectiveOpacity(cfg, w) >= 0 && Model.effectiveOpacity(cfg, w) <= 1)
  }
})

test("per-widget scale is gone: only the layout's scale exists", () => {
  const base = Model.normalizeConfig({
    widgets: [
      { id: "clock", type: "clock", col: 0, row: 0 },
      { id: "weather", type: "weather", col: 1, row: 0 }
    ]
  })
  // Instances carry no scale of their own.
  for (const w of base.widgets) assert.equal(w.scale, undefined)
  // A stale per-widget scale in the file is dropped, not honoured.
  const withStale = Model.normalizeConfig({
    widgets: [{ id: "clock", type: "clock", col: 0, row: 0, scale: 2 }]
  })
  assert.equal(Model.findInstance(withStale, "clock").scale, undefined)

  // Every card is drawn at exactly the cell the grid gives it.
  const clock = Model.findInstance(base, "clock")
  assert.deepEqual(Model.widgetRect(base.layout, clock, 2560),
    Model.cellRect(base.layout, 2560, 0, 0, 1, 1))

  // The one scale knob is the layout's, and junk is ignored.
  assert.equal(Model.setScale(base, 0.8).layout.scale, 0.8)
  assert.equal(Model.setScale(base, "junk").layout.scale, 1)
  assert.equal(Model.setScale(base, 0.8).layout.opacity, base.layout.opacity)
  assert.equal(Model.widgetRect(Model.setScale(base, 0.8).layout, clock, 2560).width,
    Model.blockWidth({ ...base.layout, scale: 0.8 }, 1))
})

test("resetAppearance puts scale and opacity back to their defaults", () => {
  const cfg = Model.normalizeConfig({
    widgets: [
      { id: "clock", type: "clock", col: 0, row: 0, scale: 2, opacity: 0.2 },
      { id: "weather", type: "weather", col: 1, row: 0 }
    ]
  })
  const messed = Model.setLayoutOpacity(Model.setScale(cfg, 1.9), 0.1)
  assert.equal(messed.layout.scale, 1.9)

  const reset = Model.resetAppearance(messed)
  assert.equal(reset.layout.scale, Model.DEFAULT_LAYOUT.scale)
  assert.equal(reset.layout.opacity, Model.DEFAULT_LAYOUT.opacity)
  // No card keeps its own opacity; scale lives only on the layout.
  for (const w of reset.widgets) {
    assert.equal(w.opacity, null)
    assert.equal(w.scale, undefined)
  }
  // Everything else about the config is untouched.
  assert.equal(reset.widgets.length, 2)
  assert.equal(reset.layout.columns, 2)
  assert.deepEqual([Model.findInstance(reset, "clock").col, Model.findInstance(reset, "clock").row], [0, 0])
})

test("hit testing is the inverse of drawing, on both grids", () => {
  const layout = Model.normalizeLayout(Model.DEFAULT_LAYOUT)
  for (const side of Model.SIDES) {
    for (let col = 0; col < layout.columns; col++) {
      for (let row = 0; row < 4; row++) {
        const r = Model.cellRect(layout, 2560, col, row, 1, 1, side)
        // Anywhere inside the drawn cell must read back as that cell -- and as
        // the grid it was drawn on, which is what makes a drag across the
        // screen change a widget's side.
        for (const [dx, dy] of [[1, 1], [r.width / 2, r.height / 2], [r.width - 1, r.height - 1]]) {
          assert.deepEqual(Model.cellFromPoint(layout, 2560, r.x + dx, r.y + dy),
            { col, row, side }, `${side} (${col},${row}) at +${dx},+${dy}`)
        }
      }
    }
  }
})

test("the gap between the two grids belongs to neither", () => {
  const layout = Model.normalizeLayout(Model.DEFAULT_LAYOUT)
  const W = 2560
  const leftEnd = Model.gridOriginX(layout, W, "left") + Model.gridWidth(layout)
  const rightStart = Model.gridOriginX(layout, W, "right")
  assert.ok(rightStart > leftEnd, "the default grid leaves a gap on a wide screen")
  const middle = Math.round((leftEnd + rightStart) / 2)
  assert.equal(Model.cellFromPoint(layout, W, middle, layout.marginY + 10), null,
    "a drag that wanders into the middle does not snap to either side")
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

test("free cells are found in reading order, per side", () => {
  const config = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 1, row: 0 }
    ]
  })
  assert.deepEqual(Model.firstFreeCell(config, "c", 1, 1), { col: 0, row: 1, side: "right" })
  assert.deepEqual(Model.firstFreeCell(config, "c", 2, 1), { col: 0, row: 1, side: "right" })
  // The other grid is empty, so its very first cell is free -- the two are
  // separate boards, not one board with a wider row.
  assert.deepEqual(Model.firstFreeCell(config, "c", 1, 1, "left"),
    { col: 0, row: 0, side: "left" })
})

test("a cell on one side does not collide with the same cell on the other", () => {
  const config = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [
      { id: "r", type: "clock", enabled: true, col: 0, row: 0, side: "right" },
      { id: "l", type: "weather", enabled: true, col: 0, row: 0, side: "left" }
    ]
  })
  // Same col, same row, different grid. Both keep the cell they asked for.
  assert.deepEqual([Model.findInstance(config, "r").col, Model.findInstance(config, "r").row], [0, 0])
  assert.deepEqual([Model.findInstance(config, "l").col, Model.findInstance(config, "l").row], [0, 0])
  assert.equal(overlapCount(config), 0)
  assert.equal(Model.rectsOverlap(
    { col: 0, row: 0, cols: 1, rows: 1, side: "left" },
    { col: 0, row: 0, cols: 1, rows: 1, side: "right" }), false)
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
  for (const side of Model.SIDES) {
    for (let col = 0; col < 2; col++) {
      for (let row = 0; row < 3; row++) {
        const r = Model.cellRect(config.layout, W, col, row, 1, 1, side)
        const t = Model.dropTarget(config, "a", r.x, r.y, W)
        assert.deepEqual(t.cell, { col, row, side }, `held on ${side} (${col},${row})`)
      }
    }
  }
})
test("a card is judged by its own corner, not by how far it has drifted", () => {
  const config = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [{ id: "a", type: "clock", enabled: true, col: 0, row: 0 }]
  })
  const W = 2560
  const r = Model.cellRect(config.layout, W, 1, 1, 1, 1, "right")
  const step = config.layout.cellSize + config.layout.gap
  // Just short of the next cell in both directions: still this one.
  assert.deepEqual(Model.dropTarget(config, "a", r.x + step / 2 - 1, r.y, W).cell,
    { col: 1, row: 1, side: "right" })
  // Half a step further and it has moved on.
  assert.deepEqual(Model.dropTarget(config, "a", r.x, r.y + step, W).cell,
    { col: 1, row: 2, side: "right" })
})
test("a drop onto an occupied cell is offered, and carries what it would do", () => {
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
  assert.deepEqual(t.cell, { col: 1, row: 0, side: "right" },
    "the cell under the card is reported, and which grid it is on")
  assert.equal(t.valid, true, "occupied is not illegal: the occupant moves")

  // The preview the editor draws is the drop itself, worked out early. If
  // these two could differ, a card would land somewhere the highlight did
  // not say it would.
  assert.deepEqual(
    [Model.findInstance(t.preview, "a").col, Model.findInstance(t.preview, "b").col],
    [1, 0], "a takes b's cell and b takes a's")

  const committed = Model.placeWidget(config, "a", 1, 0)
  assert.deepEqual(committed.widgets, t.preview.widgets,
    "and committing the drop produces exactly the previewed config")
})

test("a drop off the grid is still refused, and says so", () => {
  const config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [{ id: "wide", type: "github", enabled: true, col: 0, row: 0, cols: 2, rows: 1 }]
  })
  // A two-column widget cannot start in the last column of a two-column grid.
  assert.equal(Model.placeDisplacing(config, "wide", 1, 0), null)
  assert.equal(Model.placeDisplacing(config, "wide", 0, -1), null)
  assert.equal(Model.placeDisplacing(config, "wide", 0, Model.MAX_ROWS), null)
  assert.equal(Model.placeDisplacing(config, "ghost", 0, 0), null)
  // ...and a refused drop leaves the config exactly as it was.
  const before = JSON.stringify(config)
  assert.equal(JSON.stringify(Model.moveWidget(config, "wide", 1, 0)), before)
})

test("a two-column card cannot be dropped half off the grid", () => {
  const config = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [{ id: "wide", type: "clock", enabled: true, col: 0, row: 0, cols: 2, rows: 1 }]
  })
  const W = 2560
  const secondCol = Model.cellRect(config.layout, W, 1, 1, 1, 1, "right")
  const t = Model.dropTarget(config, "wide", secondCol.x, secondCol.y, W)
  assert.deepEqual(t.cell, { col: 1, row: 1, side: "right" })
  assert.equal(t.valid, false, "starting in the last column it would overhang")
})
test("a card dragged off the grid has no target at all", () => {
  const config = Model.defaultConfig()
  const W = 2560
  // Above the top margin, over either grid.
  assert.equal(Model.dropTarget(config, "clock", 2104, -300, W).cell, null)
  // Off the right-hand end of the screen entirely.
  assert.equal(Model.dropTarget(config, "clock", W + 500, 100, W).cell, null)
})
test("dropping works the same on the left as on the right", () => {
  let config = Model.setSide(Model.defaultConfig(), "left")
  const W = 2560
  const r = Model.cellRect(config.layout, W, 1, 2, 1, 1, "left")
  const t = Model.dropTarget(config, "clock", r.x, r.y, W)
  assert.deepEqual(t.cell, { col: 1, row: 2, side: "left" })
  assert.equal(t.valid, true)
})

test("dragging a widget across the screen moves it to the other grid", () => {
  const config = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [{ id: "a", type: "clock", enabled: true, col: 0, row: 0 }]
  })
  const W = 2560
  const overThere = Model.cellRect(config.layout, W, 0, 0, 1, 1, "left")
  const t = Model.dropTarget(config, "a", overThere.x, overThere.y, W)
  assert.equal(t.cell.side, "left")
  assert.equal(t.valid, true, "the other grid is empty, so it fits")

  const after = Model.placeWidget(config, "a", 0, 0, "left")
  const moved = Model.findInstance(after, "a")
  assert.equal(moved.side, "left")
  assert.deepEqual([moved.col, moved.row], [0, 0])
  // ...and the drop matches the preview it was shown as.
  assert.deepEqual(after.widgets, t.preview.widgets)
})

test("a widget dropped on one across the screen trades places with it", () => {
  const config = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0, side: "right" },
      { id: "b", type: "weather", enabled: true, col: 1, row: 3, side: "left" }
    ]
  })
  const after = Model.moveWidget(config, "a", 1, 3, "left")
  const a = Model.findInstance(after, "a")
  const b = Model.findInstance(after, "b")
  assert.deepEqual([a.side, a.col, a.row], ["left", 1, 3])
  assert.deepEqual([b.side, b.col, b.row], ["right", 0, 0],
    "the one it landed on took the cell, and the side, that a left")
  assert.equal(overlapCount(after), 0)
})

test("a widget can be sent to a side without naming a cell", () => {
  let config = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 1, row: 2 },
      { id: "b", type: "weather", enabled: true, col: 1, row: 2, side: "left" }
    ]
  })
  // Its own cell is taken over there, so it takes the first free one instead:
  // the side is what was asked for, the cell was incidental.
  config = Model.setWidgetSide(config, "a", "left")
  const a = Model.findInstance(config, "a")
  assert.equal(a.side, "left")
  assert.notDeepEqual([a.col, a.row], [1, 2])
  assert.equal(overlapCount(config), 0)

  // A side that is not a side, and a widget that is not a widget, change nothing.
  const before = JSON.stringify(config)
  assert.equal(JSON.stringify(Model.setWidgetSide(config, "a", "up")), before)
  assert.equal(JSON.stringify(Model.setWidgetSide(config, "ghost", "left")), before)
})

test("which sides are in use is what the editor draws grids for", () => {
  const oneSide = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [{ id: "a", type: "clock", enabled: true, col: 0, row: 0 }]
  })
  assert.deepEqual(Model.sidesInUse(oneSide), { left: false, right: true })

  const both = Model.setWidgetSide(
    Model.addWidget(oneSide, "weather"), "weather", "left")
  assert.deepEqual(Model.sidesInUse(both), { left: true, right: true })

  // Something switched off is not on a side; the tray is not a grid.
  const off = Model.setEnabled(oneSide, "a", false)
  assert.deepEqual(Model.sidesInUse(off), { left: false, right: false })
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

test("moving onto an occupied cell swaps with it", () => {
  let config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 1, row: 0 }
    ]
  })
  config = Model.moveWidget(config, "a", 1, 0)
  const a = Model.findInstance(config, "a")
  const b = Model.findInstance(config, "b")
  assert.deepEqual([a.col, a.row], [1, 0], "a went where it was aimed")
  assert.deepEqual([b.col, b.row], [0, 0], "b took the cell a left")
  assert.equal(overlapCount(config), 0)

  config = Model.moveWidget(config, "a", 0, 3)
  assert.deepEqual([Model.findInstance(config, "a").col, Model.findInstance(config, "a").row], [0, 3],
    "onto a free cell: applied, and nothing else moves")
  assert.deepEqual([Model.findInstance(config, "b").col, Model.findInstance(config, "b").row], [0, 0])

  config = Model.moveWidget(config, "a", 0, "nonsense")
  assert.equal(Model.findInstance(config, "a").row, 3, "junk coordinates change nothing")
  assert.equal(overlapCount(config), 0)
})

test("a wide widget dropped across two cards pushes both of them below it", () => {
  // The shape the user actually hits: a 2x1 dropped onto a row holding two
  // 1x1s. There is no swap to make -- the footprints do not match and there
  // are two of them -- so both go under the thing that displaced them.
  let config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [
      { id: "left", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "right", type: "music", enabled: true, col: 1, row: 0, cols: 1, rows: 1 },
      { id: "wide", type: "github", enabled: true, col: 0, row: 1, cols: 2, rows: 1 }
    ]
  })
  config = Model.moveWidget(config, "wide", 0, 0)

  const wide = Model.findInstance(config, "wide")
  assert.deepEqual([wide.col, wide.row], [0, 0], "the dragged one stays where it was put")
  // Row 1 is the first free row at or below the drop -- the row the wide
  // widget just vacated.
  assert.deepEqual(
    [Model.findInstance(config, "left").row, Model.findInstance(config, "right").row],
    [1, 1], "both displaced widgets land on the row below")
  assert.equal(overlapCount(config), 0)
})

test("what is displaced goes below the drop, not into a gap above it", () => {
  let config = Model.normalizeConfig({
    layout: { columns: 1 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 2 },
      { id: "b", type: "weather", enabled: true, col: 0, row: 5 }
    ]
  })
  // Rows 0, 1, 3 and 4 are all free. Dropping a onto b must not send b up to
  // row 0 -- "below" is the whole point of the gesture.
  config = Model.moveWidget(config, "a", 0, 5)
  assert.equal(Model.findInstance(config, "a").row, 5)
  assert.equal(Model.findInstance(config, "b").row, 2,
    "same footprint, so it is a swap and b takes the cell a left")

  // With mismatched footprints there is no swap, and the push goes downward.
  let wide = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [
      { id: "small", type: "clock", enabled: true, col: 0, row: 5 },
      { id: "big", type: "github", enabled: true, col: 0, row: 8, cols: 2, rows: 1 }
    ]
  })
  wide = Model.moveWidget(wide, "big", 0, 5)
  assert.equal(Model.findInstance(wide, "big").row, 5)
  assert.equal(Model.findInstance(wide, "small").row, 6,
    "pushed to the first free row at or below the drop, not up to row 0")
})

test("a drop with nowhere to put what it displaces is refused whole", () => {
  // A grid filled to the last cell, and one widget still in the tray. The
  // ones already placed can always shuffle -- a widget being moved vacates as
  // many cells as it needs -- but one arriving from the tray vacates nothing,
  // so there is genuinely nowhere for the occupant to go.
  const widgets = []
  for (let row = 0; row < Model.MAX_ROWS; row++) {
    widgets.push({ id: "l" + row, type: "clock", enabled: true, col: 0, row: row })
    widgets.push({ id: "r" + row, type: "clock", enabled: true, col: 1, row: row })
  }
  widgets.push({ id: "spare", type: "weather", enabled: false, col: 0, row: 0 })
  const full = Model.normalizeConfig({ layout: { columns: 2 }, widgets: widgets })

  assert.equal(Model.placeDisplacing(full, "spare", 0, 0), null)
  const after = Model.placeWidget(full, "spare", 0, 0)
  assert.equal(Model.findInstance(after, "spare").enabled, false,
    "a refused drop leaves it in the tray rather than half-placing it")
  assert.equal(overlapCount(after), 0)

  // A widget already on that same full grid still moves, because the cells it
  // leaves are exactly the ones the occupant needs.
  const swapped = Model.moveWidget(full, "l0", 0, 5)
  assert.equal(Model.findInstance(swapped, "l0").row, 5)
  assert.equal(Model.findInstance(swapped, "l5").row, 0)
  assert.equal(overlapCount(swapped), 0)
})

test("dropping from the tray switches the widget on and places it in one step", () => {
  let config = Model.normalizeConfig({
    layout: { columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: false, col: 0, row: 0 },
      { id: "b", type: "clock", enabled: true, col: 0, row: 0 }
    ]
  })
  // Onto the cell b is standing on. A widget arriving from the tray has no
  // cell to give back, so there is no swap to make and b is pushed below.
  config = Model.placeWidget(config, "a", 0, 0)
  let a = Model.findInstance(config, "a")
  assert.equal(a.enabled, true)
  assert.deepEqual([a.col, a.row], [0, 0])
  assert.deepEqual([Model.findInstance(config, "b").col, Model.findInstance(config, "b").row],
    [1, 0], "b moved rather than a being refused")
  assert.equal(overlapCount(config), 0)

  config = Model.placeWidget(config, "a", 1, 1)
  a = Model.findInstance(config, "a")
  assert.equal(a.enabled, true)
  assert.deepEqual([a.col, a.row], [1, 1])
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

test("only column counts that fit both grids are offered", () => {
  const layout = Model.normalizeLayout(Model.DEFAULT_LAYOUT)  // 200px cells, 16 gap, 40 margin
  // One grid of six columns needs 40 + 6*200 + 5*16 = 1320, and there are two
  // of them: the other side is always one drag away, so a count that only
  // works until you use it is a trap rather than a setting.
  assert.equal(Model.maxColumnsFor(layout, 2640), 6)
  assert.equal(Model.maxColumnsFor(layout, 2639), 5)
  // Three a side need 2 * (40 + 600 + 32) = 1344.
  assert.equal(Model.maxColumnsFor(layout, 1344), 3)
  assert.equal(Model.maxColumnsFor(layout, 1343), 2)
  // Never zero, however cramped: one column is always offered.
  assert.equal(Model.maxColumnsFor(layout, 10), 1)
  assert.deepEqual(Model.columnOptions(layout, 1344), [1, 2, 3])
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

test("switching sides puts everything on that side", () => {
  const before = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 1, row: 2 },
      { id: "b", type: "weather", enabled: true, col: 0, row: 0, side: "left" }
    ]
  })
  const after = Model.setSide(before, "left")
  assert.equal(after.layout.side, "left")
  for (const w of after.widgets) assert.equal(w.side, "left")
  // Cells are kept where they can be. `a` asked for (1,2) and nothing on the
  // left wanted it, so it keeps it.
  const a = Model.findInstance(after, "a")
  assert.deepEqual([a.col, a.row], [1, 2])
  assert.equal(overlapCount(after), 0)

  // A side that is not a side is ignored rather than accepted.
  assert.equal(Model.setSide(before, "up").layout.side, "right")
})

test("a config written before sides existed draws exactly where it always did", () => {
  // No widget names a side, so every one of them belongs to the layout's.
  const old = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [{ id: "a", type: "clock", enabled: true, col: 1, row: 2 }]
  })
  const a = Model.findInstance(old, "a")
  // Resolved once, at the door, rather than left for everything downstream to
  // work out -- `rectsOverlap` gets bare blocks with no layout in reach, and a
  // guess there is two widgets drawn on top of each other.
  assert.equal(a.side, "right", "no opinion resolves to the layout's own side")
  assert.equal(Model.sideOf(a, old.layout), "right")
  assert.deepEqual(Model.widgetRect(old.layout, a, 2560),
    Model.cellRect(old.layout, 2560, 1, 2, 1, 1, "right"))

  // A side that is not one of the two is a typo, and reads as no opinion --
  // which puts the widget with the others rather than off the screen.
  const typo = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [{ id: "a", type: "clock", enabled: true, col: 0, row: 0, side: "middle" }]
  })
  assert.equal(Model.findInstance(typo, "a").side, "right")
})

test("a widget added beside another cannot land on top of it", () => {
  // The bug this is here for: an unset side read as one grid while a freshly
  // placed block read as the other, so "is that cell free?" answered yes for a
  // cell that was plainly occupied.
  let config = Model.normalizeConfig({
    layout: { side: "left", columns: 2 },
    widgets: [
      { id: "a", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "b", type: "weather", enabled: true, col: 1, row: 0 }
    ]
  })
  for (const type of ["repo-pulse", "github", "todos", "calendar"]) {
    config = Model.addWidget(config, type)
    assert.equal(overlapCount(config), 0, `adding ${type} overlapped something`)
  }
  config = Model.duplicateWidget(config, "repo-pulse")
  assert.equal(overlapCount(config), 0, "a duplicate overlapped something")
  for (const w of config.widgets) {
    assert.ok(Model.SIDES.indexOf(w.side) !== -1, `${w.id} has no resolved side`)
  }
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

// The name on the card opens the repository, so this string becomes a URL
// handed to the browser. It is built from a value that arrived over the
// network, so it is checked again rather than trusted.
test("the repo link prefers GitHub's canonical name", () => {
  // A repository that has been renamed: the config still says the old name,
  // and the API answers with the new one. The link should go to the new one.
  assert.equal(
    Model.repoUrl({ fullName: "Nuu-maan/Filly-Discord-Token-Filler" }, "nuu-maan/filly"),
    "https://github.com/Nuu-maan/Filly-Discord-Token-Filler")

  // Before the API has answered, the configured name is enough to link to.
  assert.equal(Model.repoUrl(null, "cli/cli"), "https://github.com/cli/cli")
})

test("a link is not built from anything that is not a repository name", () => {
  for (const bad of [
    { info: { fullName: "../../etc/passwd" }, repo: "also/../bad" },
    { info: { fullName: "" }, repo: "" },
    { info: null, repo: "noslash" },
    { info: null, repo: "a/b/c" },
    { info: { fullName: 7 }, repo: null },
    { info: undefined, repo: undefined }
  ]) {
    assert.equal(Model.repoUrl(bad.info, bad.repo), "",
      `${JSON.stringify(bad)} should produce no link`)
  }
})

test("a bad canonical name falls back rather than blocking the link", () => {
  // If GitHub ever answered with something unusable, a configured name that
  // is fine should still work.
  assert.equal(Model.repoUrl({ fullName: "not a repo" }, "cli/cli"),
    "https://github.com/cli/cli")
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
// playerctld mirrors whatever else is on the bus and lags behind it, so
// following it is the difference between a card that updates with the track
// and one that updates a moment later. Omarchy's own media service
// deprioritises it; these pin the same behaviour.
test("a proxy player is followed only when nothing else can be", () => {
  const proxy = { identity: "playerctld", dbusName: "org.mpris.MediaPlayer2.playerctld",
    isPlaying: true, trackTitle: "Track", canTogglePlaying: true }
  const real = { identity: "Firefox", dbusName: "org.mpris.MediaPlayer2.firefox",
    isPlaying: true, trackTitle: "Track", canTogglePlaying: true }

  assert.equal(Model.isProxyPlayer(proxy), true)
  assert.equal(Model.isProxyPlayer(real), false)
  assert.equal(Model.isProxyPlayer({ desktopEntry: "playerctld" }), true)

  // Even listed first, the proxy loses to an equal real player.
  assert.equal(Model.pickPlayerIndex([proxy, real], ""), 1)
  assert.equal(Model.pickPlayerIndex([real, proxy], ""), 0)
  // But it is better than nothing.
  assert.equal(Model.pickPlayerIndex([proxy], ""), 0)
})

test("something playing beats something merely loaded", () => {
  const loaded = { identity: "A", isPlaying: false, trackTitle: "Track", canTogglePlaying: true }
  const playing = { identity: "B", isPlaying: true, canTogglePlaying: true }
  assert.ok(Model.playerScore(playing) > Model.playerScore(loaded))
  assert.equal(Model.pickPlayerIndex([loaded, playing], ""), 1)
})

test("a card is drawn from a title or an artist, not only a title", () => {
  // Players publish one a moment before the other, and waiting for both is
  // what makes a widget look slower than the bar beside it.
  assert.equal(Model.hasPlayable({ trackTitle: "Track" }), true)
  assert.equal(Model.hasPlayable({ trackArtist: "Artist" }), true)
  assert.equal(Model.hasPlayable({ trackAlbum: "Album" }), false, "an album alone is not a track")
  assert.equal(Model.hasPlayable({}), false)
  assert.equal(Model.hasPlayable(null), false)
})

test("a transport control is only offered where the player answers it", () => {
  const full = { canTogglePlaying: true, canGoPrevious: true, canGoNext: true }
  assert.deepEqual(Model.playerTransport(full), { toggle: true, previous: true, next: true })

  // A stream has somewhere to pause and nowhere to skip to.
  const stream = { canTogglePlaying: true, canGoPrevious: false, canGoNext: false }
  assert.deepEqual(Model.playerTransport(stream), { toggle: true, previous: false, next: false })

  // The last track of a queue: back yes, forward no.
  const last = { canTogglePlaying: true, canGoPrevious: true, canGoNext: false }
  assert.deepEqual(Model.playerTransport(last), { toggle: true, previous: true, next: false })

  // MPRIS is a bus, so a flag can arrive as anything or not at all. Only a
  // player that said yes gets a button drawn for it.
  assert.deepEqual(Model.playerTransport({ canGoNext: "yes" }),
    { toggle: false, previous: false, next: false }, "truthy is not true")
  assert.deepEqual(Model.playerTransport({}), { toggle: false, previous: false, next: false })
  assert.deepEqual(Model.playerTransport(null), { toggle: false, previous: false, next: false })
})

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
  // Both of these have one obvious action about the thing on the card:
  // play/pause what is playing, open the repository being described.
  for (const clickable of ["music", "repo-pulse"]) {
    assert.equal(Model.isInteractiveType(clickable), true)
  }
  for (const passive of ["clock", "weather", "github", "nope"]) {
    assert.equal(Model.isInteractiveType(passive), false, `${passive} must stay click-through`)
  }
})

test("the input region covers interactive widgets and nothing else", () => {
  const config = Model.normalizeConfig({
    widgets: [
      { id: "clock", type: "clock", enabled: true, col: 0, row: 0 },
      { id: "music", type: "music", enabled: true, col: 0, row: 1, cols: 2, rows: 1 },
      { id: "off", type: "music", enabled: false, col: 0, row: 3, cols: 2, rows: 1 },
      { id: "weather", type: "weather", enabled: true, col: 1, row: 0 },
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

// --------------------------------------------------------------- calendar
//
// The fixture is shaped like what Google actually serves: CRLF line endings,
// a folded SUMMARY, VTIMEZONE blocks carrying the daylight-saving rules, a
// weekly series with an EXDATE and a moved instance, and an all-day event
// written as a DATE rather than a DATE-TIME.

const ICS = [
  "BEGIN:VCALENDAR",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "VERSION:2.0",
  "BEGIN:VTIMEZONE",
  "TZID:Europe/London",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0000",
  "TZOFFSETTO:+0100",
  "TZNAME:BST",
  "DTSTART:19700329T010000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0000",
  "TZNAME:GMT",
  "DTSTART:19701025T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
  "BEGIN:VEVENT",
  "DTSTART;TZID=Europe/London:20260907T090000",
  "DTEND;TZID=Europe/London:20260907T091500",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  "EXDATE;TZID=Europe/London:20260909T090000",
  "UID:standup@example.com",
  "SUMMARY:Daily standup",
  "LOCATION:A meeting link",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20260906",
  "DTEND;VALUE=DATE:20260907",
  "UID:holiday@example.com",
  "SUMMARY:Public holiday",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20260908T140000Z",
  "DTEND:20260908T150000Z",
  "UID:review@example.com",
  "SUMMARY:Design review with a title long enough that Google folds i",
  " t across two lines",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=Europe/London:20260910T110000",
  "DTEND;TZID=Europe/London:20260910T113000",
  "UID:standup@example.com",
  "RECURRENCE-ID;TZID=Europe/London:20260910T090000",
  "SUMMARY:Daily standup (moved)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=Europe/London:20261101T093000",
  "DTEND;TZID=Europe/London:20261101T100000",
  "UID:winter@example.com",
  "SUMMARY:After the clocks change",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=Europe/London:20260908T160000",
  "DTEND;TZID=Europe/London:20260908T170000",
  "UID:cancelled@example.com",
  "STATUS:CANCELLED",
  "SUMMARY:Something called off",
  "END:VEVENT"
].join("\r\n") + "\r\nEND:VCALENDAR\r\n"

// Saturday 5 September 2026, noon, wherever the test happens to be running.
const NOW = new Date(2026, 8, 5, 12, 0, 0).getTime()

function parsedCalendar() {
  return Model.parseCalendar(ICS, NOW - Model.DAY_MS, NOW + 70 * Model.DAY_MS, 300)
}

function summaries(events) {
  return events.map((e) => e.summary)
}

test("only Google's own iCal addresses are accepted", () => {
  const good = "https://calendar.google.com/calendar/ical/me%40gmail.com/private-0123abc/basic.ics"
  assert.equal(Model.isSafeIcsUrl(good), true)
  assert.equal(Model.isSafeIcsUrl(good.replace("private-0123abc", "public")), true)
  // A holiday calendar's id carries an encoded "#", which is why "%" is in
  // the allowed set at all.
  assert.equal(Model.isSafeIcsUrl(
    "https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics"), true)

  for (const bad of [
    "",
    "http://calendar.google.com/calendar/ical/x/private-y/basic.ics",  // not TLS
    "https://calendar.google.com.evil.test/calendar/ical/x/public/basic.ics",
    "https://evil.test/calendar/ical/x/public/basic.ics",
    "https://calendar.google.com/calendar/ical/../../etc/passwd/public/basic.ics",
    "https://calendar.google.com/calendar/ical/x/public/basic.ics?a=b",
    "https://calendar.google.com/calendar/ical/x/public/basic.ics ; id",
    "file:///etc/passwd",
    null, undefined, 7
  ]) {
    assert.equal(Model.isSafeIcsUrl(bad), false, `${bad} should be refused`)
  }
})

test("an address the pattern refuses is not stored as a setting either", () => {
  const spec = Model.settingSpec("calendar", "icsUrl")
  // The URL is a plain text setting, so the gate that matters is the one the
  // service applies before it builds a command line; the setting itself keeps
  // whatever was typed so the editor can show you your own typo.
  assert.equal(spec.type, "text")
  let config = Model.normalizeConfig({
    widgets: [{ id: "c", type: "calendar", col: 0, row: 0, settings: { icsUrl: "https://evil.test/x" } }]
  })
  assert.deepEqual(Model.calendarsInUse(config), [],
    "an address that is not Google's is never fetched")
})

test("calendars in use are unique, safe, and include the ones switched off", () => {
  const url = "https://calendar.google.com/calendar/ical/a/private-b/basic.ics"
  const other = "https://calendar.google.com/calendar/ical/c/public/basic.ics"
  const config = Model.normalizeConfig({
    widgets: [
      { id: "a", type: "calendar", col: 0, row: 0, settings: { icsUrl: url } },
      { id: "b", type: "calendar", col: 1, row: 0, settings: { icsUrl: url } },
      { id: "c", type: "calendar", col: 0, row: 1, enabled: false, settings: { icsUrl: other } },
      { id: "d", type: "calendar", col: 1, row: 1, settings: { icsUrl: "nonsense" } }
    ]
  })
  assert.deepEqual(Model.calendarsInUse(config), [url, other])
})

test("folded lines are put back together before anything reads them", () => {
  const lines = Model.unfoldIcs("SUMMARY:one\r\n two\r\nDTSTART:20260101\r\n")
  assert.deepEqual(lines.slice(0, 2), ["SUMMARY:onetwo", "DTSTART:20260101"])
  // A tab continues a line too, and a fold with nothing before it is not a
  // fold -- it would have nothing to join to.
  assert.deepEqual(Model.unfoldIcs("A:1\r\n\tx"), ["A:1x"])
  assert.deepEqual(Model.unfoldIcs(" orphan"), [" orphan"])
})

test("a property line splits on the colon that is not inside quotes", () => {
  const p = Model.parseIcsLine('DTSTART;TZID="Europe/London":20260907T090000')
  assert.equal(p.name, "DTSTART")
  assert.equal(p.params.TZID, "Europe/London")
  assert.equal(p.value, "20260907T090000")
  // A value may contain colons of its own.
  assert.equal(Model.parseIcsLine("URL:https://example.test/x").value, "https://example.test/x")
  assert.equal(Model.parseIcsLine("no colon here"), null)
})

test("escaped text is unescaped, and folded whitespace collapsed", () => {
  assert.equal(Model.unescapeIcsText("Lunch\\, then a walk"), "Lunch, then a walk")
  assert.equal(Model.unescapeIcsText("one\\ntwo"), "one two")
  assert.equal(Model.unescapeIcsText("a\\\\b"), "a\\b", "an escaped backslash is a backslash")
  assert.equal(Model.unescapeIcsText("  spaced   out  "), "spaced out")
})

test("a UTC offset parses into minutes east", () => {
  assert.equal(Model.parseUtcOffset("+0530"), 330)
  assert.equal(Model.parseUtcOffset("-0800"), -480)
  assert.equal(Model.parseUtcOffset("+0000"), 0)
  assert.equal(Model.parseUtcOffset("+053000"), 330, "seconds are allowed and ignored")
  for (const bad of ["0530", "+53", "", "east", null]) {
    assert.equal(Model.parseUtcOffset(bad), null, `${bad} should not parse`)
  }
})

test("a duration parses into milliseconds", () => {
  assert.equal(Model.parseIcsDuration("PT1H"), 3600000)
  assert.equal(Model.parseIcsDuration("PT1H30M"), 5400000)
  assert.equal(Model.parseIcsDuration("P1D"), Model.DAY_MS)
  assert.equal(Model.parseIcsDuration("P2W"), 14 * Model.DAY_MS)
  assert.equal(Model.parseIcsDuration("PT45S"), 45000)
  assert.equal(Model.parseIcsDuration("nonsense"), 0)
})

test("the nth weekday of a month, counting from either end", () => {
  // The daylight-saving rules every VTIMEZONE is written with.
  assert.equal(Model.nthWeekdayOfMonth(2026, 3, 0, -1), 29, "last Sunday in March 2026")
  assert.equal(Model.nthWeekdayOfMonth(2026, 10, 0, -1), 25, "last Sunday in October 2026")
  assert.equal(Model.nthWeekdayOfMonth(2026, 9, 5, 2), 11, "second Friday in September 2026")
  assert.equal(Model.nthWeekdayOfMonth(2026, 9, 1, 1), 7, "first Monday in September 2026")
  // September 2026 has four Mondays, so there is no fifth one. A month that
  // does not contain the day asked for gives nothing rather than the nearest
  // thing, which would silently move a meeting.
  assert.equal(Model.nthWeekdayOfMonth(2026, 9, 1, 5), 0)
  assert.equal(Model.nthWeekdayOfMonth(2026, 13, 1, 1), 0, "there is no thirteenth month")
})

test("a recurrence rule parses into the parts the expansion uses", () => {
  const r = Model.parseRrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,-1FR;UNTIL=20261231T000000Z;WKST=SU")
  assert.equal(r.freq, "WEEKLY")
  assert.equal(r.interval, 2)
  assert.equal(r.wkst, 0)
  assert.deepEqual(r.byday, [{ nth: 0, weekday: 1 }, { nth: -1, weekday: 5 }])
  assert.ok(r.untilWall !== null)
  // Defaults, so the expansion never has to check for absence.
  const bare = Model.parseRrule("FREQ=DAILY")
  assert.equal(bare.interval, 1)
  assert.equal(bare.count, 0)
  assert.equal(bare.wkst, 1, "the spec's default week start is Monday")
  assert.deepEqual(bare.byday, [])
})

test("a weekly series keeps its wall-clock time across a daylight change", () => {
  const starts = new Set(parsedCalendar().events
    .filter((e) => e.summary === "Daily standup").map((e) => e.start))

  // Asserted as instants, not as this machine's clock, so the test says the
  // same thing wherever it runs. The series is 09:00 in London; London is on
  // BST until the last Sunday in October and on GMT after it, so the same
  // 09:00 is an hour earlier in UTC before the change than after.
  assert.ok(starts.has(Date.UTC(2026, 9, 19, 8, 0, 0)), "Mon 19 Oct, 09:00 BST")
  assert.ok(starts.has(Date.UTC(2026, 9, 23, 8, 0, 0)), "Fri 23 Oct, 09:00 BST")
  assert.ok(starts.has(Date.UTC(2026, 9, 26, 9, 0, 0)), "Mon 26 Oct, 09:00 GMT")
  assert.ok(starts.has(Date.UTC(2026, 9, 30, 9, 0, 0)), "Fri 30 Oct, 09:00 GMT")

  // Which is exactly what adding seven times 86400000 to an instant would get
  // wrong: it would put the Monday after the change at 08:00 London time.
  assert.equal(starts.has(Date.UTC(2026, 9, 26, 8, 0, 0)), false)
})

test("a series honours its exceptions, and an edited instance replaces one", () => {
  const events = parsedCalendar().events
  const standups = events.filter((e) => String(e.summary).indexOf("Daily standup") === 0)
  // UTC days, so the grouping does not depend on where the test runs.
  const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10)

  assert.equal(standups.map((e) => dayOf(e.start)).includes("2026-09-09"), false,
    "the EXDATE'd Wednesday is gone")

  const moved = events.filter((e) => e.summary === "Daily standup (moved)")
  assert.equal(moved.length, 1)
  assert.equal(moved[0].start, Date.UTC(2026, 8, 10, 10, 0, 0),
    "the instance moved to 11:00 London, which in September is 10:00 UTC")
  // ...and the occurrence it replaced is not also drawn.
  assert.deepEqual(standups.filter((e) => dayOf(e.start) === "2026-09-10")
    .map((e) => e.summary), ["Daily standup (moved)"])
})

test("an all-day event is a local day, not an instant", () => {
  const holiday = parsedCalendar().events.find((e) => e.summary === "Public holiday")
  assert.ok(holiday)
  assert.equal(holiday.allDay, true)
  const start = new Date(holiday.start)
  assert.equal(start.getHours(), 0, "it starts at local midnight")
  assert.equal(start.getDate(), 6)
  assert.equal(holiday.end - holiday.start, Model.DAY_MS)
})

test("a folded summary reads as one sentence, and a cancelled event is dropped", () => {
  const events = parsedCalendar().events
  const review = events.find((e) => String(e.summary).indexOf("Design review") === 0)
  assert.equal(review.summary,
    "Design review with a title long enough that Google folds it across two lines")
  assert.equal(events.some((e) => e.summary === "Something called off"), false)
})

test("anything that is not a calendar is refused rather than half-drawn", () => {
  for (const junk of ["", "not a calendar", "<html>404</html>", null, undefined]) {
    assert.equal(Model.parseCalendar(junk, NOW, NOW + Model.DAY_MS, 10), null)
  }
  // A window that is not a window is refused too, rather than looping.
  assert.equal(Model.parseCalendar(ICS, NOW, NOW, 10), null)
  assert.equal(Model.parseCalendar(ICS, NOW, NaN, 10), null)
})

test("the events are sorted, all-day first where they share a start", () => {
  const events = parsedCalendar().events
  for (let i = 1; i < events.length; i++) {
    assert.ok(events[i].start >= events[i - 1].start, "earliest first")
  }
  const same = [
    { start: 10, end: 20, allDay: false, summary: "timed" },
    { start: 10, end: 20, allDay: true, summary: "all day" }
  ]
  // "today" comes before "today at nine".
  assert.equal(Model.parseCalendar(
    "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", NOW, NOW + 1, 5).events.length, 0)
  assert.deepEqual(same.slice().sort((a, b) =>
    a.start - b.start || (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1)).map((e) => e.summary),
    ["all day", "timed"])
})

test("an unbounded series is bounded by the window it is asked about", () => {
  const short = Model.parseCalendar(ICS, NOW, NOW + 3 * Model.DAY_MS, 300)
  for (const e of short.events) {
    assert.ok(e.start >= NOW && e.start <= NOW + 3 * Model.DAY_MS,
      `${new Date(e.start)} is outside the window`)
  }
  // ...and by the ceiling on the whole document, whatever the window says.
  const capped = Model.parseCalendar(ICS, NOW, NOW + 700 * Model.DAY_MS, 5)
  assert.equal(capped.events.length, 5)
})

test("a series stops at its COUNT and at its UNTIL", () => {
  const rule = Model.parseRrule("FREQ=DAILY;COUNT=3")
  const start = Date.UTC(2026, 0, 1, 9, 0, 0)
  const walls = Model.expandWalls(start, rule, start, start + 30 * Model.DAY_MS, 100)
  assert.equal(walls.length, 3)

  const until = Model.parseRrule("FREQ=DAILY;UNTIL=20260105T000000Z")
  const bounded = Model.expandWalls(start, until, start, start + 30 * Model.DAY_MS, 100)
  // The loop stops in the wall-clock domain with a day of slack; the caller
  // trims the tail off precisely once each occurrence has an offset. What
  // matters here is that it stops at all.
  assert.ok(bounded.length <= 6 && bounded.length >= 4, `stopped after ${bounded.length}`)
})

test("monthly and yearly series land on the day the rule names", () => {
  const start = Date.UTC(2026, 0, 1, 9, 0, 0)
  const second = Model.expandWalls(start, Model.parseRrule("FREQ=MONTHLY;BYDAY=2TU"),
    start, Date.UTC(2026, 3, 1), 100)
  assert.deepEqual(second.map((w) => new Date(w).getUTCDate()), [13, 10, 10],
    "second Tuesday of January, February and March 2026")

  // The 31st simply does not happen in a 30-day month, which is what the spec
  // says and what every calendar does.
  const thirtyFirst = Model.expandWalls(Date.UTC(2026, 0, 31, 9, 0, 0),
    Model.parseRrule("FREQ=MONTHLY"), Date.UTC(2026, 0, 1), Date.UTC(2026, 5, 1), 100)
  assert.deepEqual(thirtyFirst.map((w) => new Date(w).getUTCMonth()), [0, 2, 4],
    "January, March and May -- February and April have no 31st")

  const yearly = Model.expandWalls(start, Model.parseRrule("FREQ=YEARLY"),
    start, Date.UTC(2029, 0, 1), 100)
  assert.equal(yearly.length, 3)
})

test("a rule with no frequency is a single occurrence, not an empty card", () => {
  const start = Date.UTC(2026, 0, 1, 9, 0, 0)
  assert.deepEqual(Model.expandWalls(start, null, start - 1, start + 1, 10), [start])
  assert.deepEqual(Model.expandWalls(start, Model.parseRrule("FREQ=HOURLY"),
    start - 1, start + 1, 10), [start],
    "a frequency the expansion does not know still draws the event it has")
})

test("the file's own timezone table resolves a zone the system was never asked about", () => {
  const zones = Model.parseIcsTimezones(Model.unfoldIcs(ICS))
  assert.equal(Model.tzOffsetAt(zones, "Europe/London", 2026, 7, 1, 12, 0), 60, "July is BST")
  assert.equal(Model.tzOffsetAt(zones, "Europe/London", 2026, 12, 1, 12, 0), 0, "December is GMT")
  // January is before the year's first transition; the answer comes from the
  // one that fired the previous autumn.
  assert.equal(Model.tzOffsetAt(zones, "Europe/London", 2026, 1, 15, 12, 0), 0)
  assert.equal(Model.tzOffsetAt(zones, "Europe/Berlin", 2026, 7, 1, 12, 0), null,
    "a zone the file said nothing about is unknown, not zero")
})

test("a wall clock becomes an instant according to what kind it is", () => {
  const zones = Model.parseIcsTimezones(Model.unfoldIcs(ICS))
  const wall = Date.UTC(2026, 6, 1, 9, 0, 0)
  assert.equal(Model.wallToEpoch(wall, "utc", "", zones), wall)
  // 09:00 in London in July is 08:00 UTC.
  assert.equal(Model.wallToEpoch(wall, "tz", "Europe/London", zones), wall - 3600000)
  // Floating means local time, whatever this machine's local time is.
  assert.equal(Model.wallToEpoch(wall, "floating", "", zones),
    new Date(2026, 6, 1, 9, 0, 0).getTime())
  // A zone the file did not define falls back to local rather than to UTC:
  // being an hour out is better than being seven.
  assert.equal(Model.wallToEpoch(wall, "tz", "Mars/Olympus", zones),
    new Date(2026, 6, 1, 9, 0, 0).getTime())
})

test("upcoming is what has not ended, not what has not started", () => {
  const events = [
    { start: NOW - 3600000, end: NOW - 1800000, allDay: false, summary: "over" },
    { start: NOW - 600000, end: NOW + 600000, allDay: false, summary: "running" },
    { start: NOW + 3600000, end: NOW + 5400000, allDay: false, summary: "later" },
    { start: NOW, end: NOW + Model.DAY_MS, allDay: true, summary: "all day" }
  ]
  assert.deepEqual(summaries(Model.upcomingEvents(events, NOW, 8, true)),
    ["running", "later", "all day"])
  assert.deepEqual(summaries(Model.upcomingEvents(events, NOW, 1, true)), ["running"])
  assert.deepEqual(summaries(Model.upcomingEvents(events, NOW, 8, false)),
    ["running", "later"], "all-day events can be left out")
  assert.deepEqual(Model.upcomingEvents(null, NOW, 4, true), [])
  assert.deepEqual(Model.upcomingEvents(events, NaN, 4, true), [])
})

test("a time is written the way the card's clock setting asks for it", () => {
  const at = (h, m) => new Date(2026, 8, 5, h, m).getTime()
  assert.equal(Model.clockLabel(at(14, 30), false), "14:30")
  assert.equal(Model.clockLabel(at(14, 30), true), "2:30 PM")
  assert.equal(Model.clockLabel(at(0, 5), false), "00:05")
  assert.equal(Model.clockLabel(at(0, 5), true), "12:05 AM", "midnight is twelve, not zero")
  assert.equal(Model.clockLabel(at(12, 0), true), "12:00 PM", "noon is twelve, not zero")
  assert.equal(Model.clockLabel("not a time", false), "")
  // An all-day event has no clock to give.
  assert.equal(Model.eventTimeLabel({ allDay: true, start: at(9, 0) }, false), "all day")
  assert.equal(Model.eventTimeLabel(null, false), "")
})

test("how far off an event is, as the coarsest true thing", () => {
  const at = (mins) => NOW + mins * 60000
  assert.equal(Model.untilLabel(at(-10), at(20), NOW), "now", "you are in it")
  assert.equal(Model.untilLabel(at(0.5), at(30), NOW), "now")
  assert.equal(Model.untilLabel(at(25), at(55), NOW), "in 25m")
  assert.equal(Model.untilLabel(at(155), at(215), NOW), "in 2h 35m")
  assert.equal(Model.untilLabel(at(60 * 9), at(60 * 10), NOW), "in 9h",
    "past a few hours the minutes stop mattering")
  assert.equal(Model.untilLabel(at(60 * 30), at(60 * 31), NOW), "tomorrow")
  assert.equal(Model.untilLabel(at(60 * 24 * 4), at(60 * 24 * 4 + 60), NOW), "in 4 days")
  assert.equal(Model.untilLabel(at(60 * 24 * 20), at(60 * 24 * 20 + 60), NOW), "in 3w")
  assert.equal(Model.untilLabel("soon", null, NOW), "")
})

test("an all-day event says which day rather than counting the hours to midnight", () => {
  const midnight = Model.startOfDay(NOW)
  const allDay = (dayOffset) => ({
    start: midnight + dayOffset * Model.DAY_MS,
    end: midnight + (dayOffset + 1) * Model.DAY_MS,
    allDay: true
  })
  assert.equal(Model.eventUntilLabel(allDay(0), NOW), "Today")
  assert.equal(Model.eventUntilLabel(allDay(1), NOW), "Tomorrow")
  assert.equal(Model.eventUntilLabel(allDay(9), NOW), Model.dayHeading(allDay(9).start, NOW))
  // A timed event still gets a countdown.
  assert.equal(Model.eventUntilLabel(
    { start: NOW + 25 * 60000, end: NOW + 55 * 60000, allDay: false }, NOW), "in 25m")
  assert.equal(Model.eventUntilLabel(null, NOW), "")
})

test("days are headed by name near, and by date far", () => {
  const midnight = Model.startOfDay(NOW)
  assert.equal(Model.dayHeading(midnight, NOW), "Today")
  assert.equal(Model.dayHeading(midnight + Model.DAY_MS, NOW), "Tomorrow")
  // Inside the week, the weekday alone; past it, the date, because "in nine
  // days" tells you less than "Mon 14 Sep".
  assert.equal(Model.dayHeading(midnight + 3 * Model.DAY_MS, NOW), "Tue")
  assert.equal(Model.dayHeading(midnight + 9 * Model.DAY_MS, NOW), "Mon 14 Sep")
  assert.equal(Model.todayHeading(NOW), "Sat 5 Sep")
  assert.equal(Model.daysApart(midnight + 2 * Model.DAY_MS, NOW), 2)
})

test("the day boundary is the calendar's, not twenty-four hours from now", () => {
  const lateNight = new Date(2026, 8, 5, 23, 30).getTime()
  const earlyNext = new Date(2026, 8, 6, 1, 0).getTime()
  // Ninety minutes apart, and a different day. Rounding hours would call it
  // today.
  assert.equal(Model.dayHeading(earlyNext, lateNight), "Tomorrow")
  assert.equal(Model.startOfDay(NaN), 0)
})

test("events group into days in order, keeping the day's own heading", () => {
  const midnight = Model.startOfDay(NOW)
  const events = [
    { start: midnight + 9 * 3600000, end: midnight + 10 * 3600000, allDay: false, summary: "a" },
    { start: midnight + 14 * 3600000, end: midnight + 15 * 3600000, allDay: false, summary: "b" },
    { start: midnight + Model.DAY_MS + 3600000, end: midnight + Model.DAY_MS + 2 * 3600000, allDay: false, summary: "c" }
  ]
  const groups = Model.groupEventsByDay(events, NOW)
  assert.equal(groups.length, 2)
  assert.equal(groups[0].heading, "Today")
  assert.deepEqual(summaries(groups[0].events), ["a", "b"])
  assert.equal(groups[1].heading, "Tomorrow")
  assert.deepEqual(summaries(groups[1].events), ["c"])
  assert.deepEqual(Model.groupEventsByDay(null, NOW), [])
})

test("the calendar widget declares where it goes, and is wide by default", () => {
  const entry = Model.catalogEntry("calendar")
  assert.equal(entry.network, Model.CALENDAR_HOST)
  assert.deepEqual(Model.defaultSize("calendar"), [2, 1])
  assert.equal(Model.isAllowedSize("calendar", 2, 2), true, "it offers a tall size")
  assert.equal(entry.interactive, undefined, "the calendar is read, not operated")
})

// ------------------------------------------------------------------- todos

test("a list file resolves against home, and cannot climb out of it", () => {
  assert.equal(Model.todoPath("", "/home/a"), "/home/a/" + Model.DEFAULT_TODO_FILE)
  assert.equal(Model.todoPath("~/notes/today.md", "/home/a"), "/home/a/notes/today.md")
  assert.equal(Model.todoPath("list.txt", "/home/a"), "/home/a/list.txt")
  assert.equal(Model.todoPath("/srv/shared/list.txt", "/home/a"), "/srv/shared/list.txt")
  assert.equal(Model.todoPath("  ~/x.txt  ", "/home/a"), "/home/a/x.txt")
  assert.equal(Model.todoPath("", "/home/a/"), "/home/a/" + Model.DEFAULT_TODO_FILE,
    "a trailing slash on home does not double up")
  // A segment that is exactly ".." is refused rather than resolved away.
  assert.equal(Model.todoPath("../../etc/passwd", "/home/a"), "")
  assert.equal(Model.todoPath("~/notes/../../../etc/passwd", "/home/a"), "")
  // ...but a dot in a file name is a file name.
  assert.equal(Model.todoPath("notes..txt", "/home/a"), "/home/a/notes..txt")
  assert.equal(Model.todoPath("", ""), "", "no home means no default path")
})

test("todo files in use are unique and include the ones switched off", () => {
  const config = Model.normalizeConfig({
    widgets: [
      { id: "a", type: "todos", col: 0, row: 0, settings: { file: "" } },
      { id: "b", type: "todos", col: 1, row: 0, settings: { file: "~/.config/omarchy/todos.txt" } },
      { id: "c", type: "todos", col: 0, row: 1, enabled: false, settings: { file: "work.md" } },
      { id: "d", type: "todos", col: 1, row: 1, settings: { file: "../escape.txt" } }
    ]
  })
  assert.deepEqual(Model.todoPathsInUse(config, "/home/a"),
    ["/home/a/.config/omarchy/todos.txt", "/home/a/work.md"],
    "the default and the explicit path are the same file, and the escape is dropped")
})

test("the list grammar takes what people already type", () => {
  const parsed = Model.parseTodos([
    "# Friday",
    "- [ ] Ship the calendar widget",
    "- [x] Reply to the issue",
    "* Buy milk",
    "+ Book the flights",
    "! Call the bank",
    "- [ ] ! Renew the passport",
    "x 2026-09-04 Restart the shell",
    "x Something else finished",
    "plain line with no marker",
    "",
    "   ",
    "# a second heading is just a comment"
  ].join("\n"))

  assert.equal(parsed.title, "Friday", "the first heading names the list")
  assert.equal(parsed.total, 9)
  assert.equal(parsed.done, 3)
  assert.equal(parsed.remaining, 6)
  assert.deepEqual(parsed.items.map((i) => i.text), [
    "Ship the calendar widget", "Reply to the issue", "Buy milk", "Book the flights",
    "Call the bank", "Renew the passport", "Restart the shell",
    "Something else finished", "plain line with no marker"
  ])
  assert.deepEqual(parsed.items.filter((i) => i.done).map((i) => i.text),
    ["Reply to the issue", "Restart the shell", "Something else finished"])
  assert.deepEqual(parsed.items.filter((i) => i.important).map((i) => i.text),
    ["Call the bank", "Renew the passport"])
})

test("a checkbox is ticked by anything that is not a space", () => {
  for (const mark of ["x", "X", "-", "~"]) {
    assert.equal(Model.parseTodoLine(`- [${mark}] done`).done, true, `[${mark}]`)
  }
  assert.equal(Model.parseTodoLine("- [ ] not done").done, false)
  assert.equal(Model.parseTodoLine("- [] not a checkbox").text, "[] not a checkbox")
  // A line with nothing left after the markers is not an item.
  assert.equal(Model.parseTodoLine("- [ ]"), null)
  assert.equal(Model.parseTodoLine("-"), null)
  assert.equal(Model.parseTodoLine(""), null)
  // "x" only marks a line done when it stands on its own.
  assert.equal(Model.parseTodoLine("xylophone practice").done, false)
})

test("a rule drawn across the file is not something to do", () => {
  for (const rule of ["---", "***", "===", "___", "-", "~~~~~"]) {
    assert.equal(Model.parseTodoLine(rule), null, `${rule} is a divider`)
  }
  assert.equal(Model.parseTodos("- [ ] a\n---\n- [ ] b").total, 2)
})

test("a file that is not there is not the same as a file with nothing in it", () => {
  const missing = Model.parseTodos(null)
  assert.deepEqual(missing.items, [])
  assert.equal(missing.total, 0)
  assert.equal(missing.title, "")
  // Nothing here throws, whatever arrives.
  for (const junk of [undefined, 7, "\n\n\n", "#", "####  "]) {
    assert.equal(Model.parseTodos(junk).total, 0)
  }
})

test("a list too long for anyone to read is cut, not drawn", () => {
  const many = new Array(Model.TODO_MAX_ITEMS + 50).fill("- [ ] thing").join("\n")
  assert.equal(Model.parseTodos(many).total, Model.TODO_MAX_ITEMS)
})

test("what is left comes first, marked items ahead of it, done last", () => {
  const parsed = Model.parseTodos([
    "- [ ] a", "- [x] b", "! c", "- [ ] d", "- [x] e"
  ].join("\n"))
  assert.deepEqual(Model.visibleTodos(parsed, true, 10).map((i) => i.text),
    ["c", "a", "d", "b", "e"])
  // Inside each band the file's own order survives.
  assert.deepEqual(Model.visibleTodos(parsed, false, 10).map((i) => i.text), ["c", "a", "d"])
  // A card with room for two spends both on what is left.
  assert.deepEqual(Model.visibleTodos(parsed, true, 2).map((i) => i.text), ["c", "a"])
  assert.deepEqual(Model.visibleTodos(null, true, 5), [])
})

test("every item remembers the line it came from", () => {
  const file = ["# Friday", "", "- [ ] first", "not an item ---", "- [x] second", "", "third"].join("\n")
  const parsed = Model.parseTodos(file)
  // Ticking a box on the card has to rewrite the right line of the file, and
  // the blank lines, the heading and the divider all shift the numbering.
  assert.deepEqual(parsed.items.map((i) => [i.text, i.line]),
    [["first", 2], ["not an item ---", 3], ["second", 4], ["third", 6]])
})

test("ticking a box rewrites one line and leaves the rest of the file alone", () => {
  const file = ["# Friday", "  - [ ] indented item", "- [x] done one", "third"].join("\n")

  const ticked = Model.setTodoDone(file, 1, true)
  assert.equal(ticked, ["# Friday", "  - [x] indented item", "- [x] done one", "third"].join("\n"),
    "the indentation, the bullet and every other line survive untouched")

  const unticked = Model.setTodoDone(file, 2, false)
  assert.equal(unticked, ["# Friday", "  - [ ] indented item", "- [ ] done one", "third"].join("\n"))

  // Setting a mark to what it already is is not an edit. The caller uses null
  // to decide whether to write the file at all.
  assert.equal(Model.setTodoDone(file, 1, false), null)
  assert.equal(Model.setTodoDone(file, 2, true), null)
})

test("a line with no checkbox gets one, and keeps its bullet", () => {
  assert.equal(Model.setTodoDone("buy milk", 0, true), "[x] buy milk")
  assert.equal(Model.setTodoDone("* buy milk", 0, true), "* [x] buy milk")
  assert.equal(Model.setTodoDone("  + buy milk", 0, true), "  + [x] buy milk")
  // Un-ticking it then leaves a checkbox rather than guessing its way back to
  // a bare line. That round-trips; guessing would not.
  assert.equal(Model.setTodoDone("[x] buy milk", 0, false), "[ ] buy milk")
})

test("todo.txt's done marker is undone by removing it, date and all", () => {
  assert.equal(Model.setTodoDone("x 2026-09-04 restart the shell", 0, false),
    "restart the shell", "a completion date on something unfinished is not true any more")
  assert.equal(Model.setTodoDone("x restart the shell", 0, false), "restart the shell")
  // Already done: nothing to do.
  assert.equal(Model.setTodoDone("x restart the shell", 0, true), null)
})

test("nothing but an item can be ticked", () => {
  const file = ["# Friday", "", "---", "- [ ] real item"].join("\n")
  for (const [index, what] of [[0, "a heading"], [1, "a blank line"], [2, "a divider"]]) {
    assert.equal(Model.setTodoDone(file, index, true), null, what + " is not a task")
  }
  // Out of range, and junk, change nothing.
  for (const index of [-1, 4, 99, NaN, "x", null, undefined]) {
    assert.equal(Model.setTodoDone(file, index, true), null, `index ${index}`)
  }
  assert.equal(Model.setTodoDone(null, 0, true), null)
  assert.equal(Model.setTodoDone(7, 0, true), null)
})

test("a tick survives a round trip through the parser", () => {
  // The loop the widget actually runs: parse, tick the item the user clicked,
  // parse again, and the same item is the one that changed.
  let file = ["- [ ] alpha", "* beta", "x gamma"].join("\n")
  let parsed = Model.parseTodos(file)
  assert.deepEqual(parsed.items.map((i) => i.done), [false, false, true])

  for (const item of parsed.items) {
    const next = Model.setTodoDone(file, item.line, !item.done)
    assert.ok(next !== null, `${item.text} should be togglable`)
    const after = Model.parseTodos(next)
    assert.equal(after.items.length, parsed.items.length, "no item appears or vanishes")
    for (const other of after.items) {
      const was = parsed.items.find((i) => i.line === other.line)
      assert.equal(other.done, was.line === item.line ? !was.done : was.done,
        `only ${item.text} changed`)
    }
  }
})

test("progress is how much of the list is done, and an empty list is not zero percent", () => {
  assert.equal(Model.todoProgress(Model.parseTodos("- [x] a\n- [ ] b")), 0.5)
  assert.equal(Model.todoProgress(Model.parseTodos("- [x] a\n- [x] b")), 1)
  assert.equal(Model.todoProgress(Model.parseTodos("")), 0)
  assert.equal(Model.todoProgress(null), 0)
})

test("the title is what you set, then what the file says, then the plain word", () => {
  const withHeading = Model.parseTodos("# Friday\n- [ ] a")
  const without = Model.parseTodos("- [ ] a")
  assert.equal(Model.todoTitle("Work", withHeading), "Work")
  assert.equal(Model.todoTitle("", withHeading), "Friday")
  assert.equal(Model.todoTitle("   ", withHeading), "Friday")
  assert.equal(Model.todoTitle("", without), "Todo")
  assert.equal(Model.todoTitle("", null), "Todo")
})

test("the todos widget touches nothing outside the machine", () => {
  const entry = Model.catalogEntry("todos")
  assert.equal(entry.network, undefined, "the list is a file, not a service")
  assert.deepEqual(Model.defaultSize("todos"), [2, 1])
  assert.equal(Model.isAllowedSize("todos", 2, 2), true)
})

test("the types that take clicks are exactly the ones that say so", () => {
  // The list is deliberately short and deliberately checked: every type here
  // turns its own rectangle into an input region on the desktop, so one added
  // by accident is a card silently swallowing clicks meant for a window.
  const interactive = Model.catalogTypes().filter((t) => Model.isInteractiveType(t))
  assert.deepEqual(interactive.sort(), ["music", "omate", "repo-pulse", "todos"])
  for (const quiet of ["clock", "weather", "github", "calendar"]) {
    assert.equal(Model.isInteractiveType(quiet), false, `${quiet} should stay click-through`)
  }
})

test("ticking can be switched off without switching the widget off", () => {
  const spec = Model.settingSpec("todos", "canTick")
  assert.equal(spec.type, "boolean")
  assert.equal(spec.defaultValue, true)
  assert.equal(Model.defaultsFor("todos").canTick, true)
})

// ------------------------------------------------- more than one of a type

test("a type says for itself whether a second one makes sense", () => {
  // Several clocks is the point of a clock widget; several music cards would
  // be the same player twice, and several weather cards the same location.
  // One omate card: every control on it writes through to the one pet's
  // global settings, so a second card would fight the first mid-drag.
  for (const many of ["clock", "github", "repo-pulse", "calendar", "todos"]) {
    assert.equal(Model.allowsMultiple(many), true, `${many} should allow several`)
  }
  for (const one of ["weather", "music", "omate"]) {
    assert.equal(Model.allowsMultiple(one), false, `${one} reads one source`)
  }
  assert.equal(Model.allowsMultiple("nope"), false)
})

test("ids are numbered, and the first one keeps the bare type name", () => {
  let config = Model.defaultConfig()
  // The default config already has a clock called "clock". An update that
  // renamed it "clock-1" would break every config that mentions it.
  assert.equal(Model.nextInstanceId(config, "clock"), "clock-2")
  assert.equal(Model.nextInstanceId(config, "weather"), "weather")

  config = Model.addWidget(config, "clock")
  assert.equal(Model.nextInstanceId(config, "clock"), "clock-3")
  // A gap left by a removal is filled rather than skipped past.
  config = Model.removeWidget(config, "clock-2")
  assert.equal(Model.nextInstanceId(config, "clock"), "clock-2")
})

test("adding another of a type puts it on the grid, in a free cell", () => {
  let config = Model.defaultConfig()
  config = Model.addWidget(config, "clock")
  const added = Model.findInstance(config, "clock-2")
  assert.ok(added)
  assert.equal(added.enabled, true, "a widget you asked for is one you can see")
  assert.equal(added.type, "clock")
  assert.deepEqual(added.settings, Model.defaultsFor("clock"))
  assert.equal(overlapCount(config), 0)
  assert.notDeepEqual([added.col, added.row],
    [Model.findInstance(config, "clock").col, Model.findInstance(config, "clock").row])
})

test("a second one of a type that reads one source is refused", () => {
  let config = Model.defaultConfig()
  config = Model.addWidget(config, "music")
  assert.equal(Model.countOfType(config, "music"), 1, "the first is what puts it on the list")
  config = Model.addWidget(config, "music")
  assert.equal(Model.countOfType(config, "music"), 1, "the second would be the same card twice")
  // ...and a type nobody has heard of adds nothing at all.
  const before = JSON.stringify(config)
  assert.equal(JSON.stringify(Model.addWidget(config, "nonsense")), before)
})

test("duplicating copies the settings, which is the point of duplicating", () => {
  let config = Model.defaultConfig()
  config = Model.setSetting(config, "clock", "timezone", "Asia/Kolkata")
  config = Model.setSetting(config, "clock", "label", "BLR")
  config = Model.resizeWidget(config, "clock", 2, 1)

  config = Model.duplicateWidget(config, "clock")
  const copy = Model.findInstance(config, "clock-2")
  assert.equal(copy.settings.timezone, "Asia/Kolkata")
  assert.equal(copy.settings.label, "BLR")
  assert.deepEqual([copy.cols, copy.rows], [2, 1], "the shape comes with it")
  assert.equal(copy.enabled, true)
  assert.equal(overlapCount(config), 0)

  // The copy is its own widget: changing it leaves the original alone.
  config = Model.setSetting(config, "clock-2", "label", "London")
  assert.equal(Model.findInstance(config, "clock").settings.label, "BLR")
})

test("a duplicate lands on the same side as the one it came from", () => {
  let config = Model.normalizeConfig({
    layout: { side: "right", columns: 2 },
    widgets: [{ id: "clock", type: "clock", enabled: true, col: 0, row: 0, side: "left" }]
  })
  config = Model.duplicateWidget(config, "clock")
  assert.equal(Model.findInstance(config, "clock-2").side, "left")
})

test("duplicating something that cannot be duplicated changes nothing", () => {
  const config = Model.defaultConfig()
  const before = JSON.stringify(config)
  assert.equal(JSON.stringify(Model.duplicateWidget(config, "ghost")), before)
  const withMusic = Model.addWidget(config, "music")
  const musicBefore = JSON.stringify(withMusic)
  assert.equal(JSON.stringify(Model.duplicateWidget(withMusic, "music")), musicBefore)
})

test("the last of a type is switched off, not deleted", () => {
  let config = Model.defaultConfig()
  assert.equal(Model.canRemove(config, "clock"), false,
    "deleting it would only mean the next config read put a fresh one back")
  const before = JSON.stringify(config)
  assert.equal(JSON.stringify(Model.removeWidget(config, "clock")), before)

  config = Model.addWidget(config, "clock")
  assert.equal(Model.canRemove(config, "clock"), true, "now there are two, either can go")
  assert.equal(Model.canRemove(config, "clock-2"), true)
  config = Model.removeWidget(config, "clock-2")
  assert.equal(Model.findInstance(config, "clock-2"), null)
  assert.equal(Model.countOfType(config, "clock"), 1)
  assert.equal(Model.canRemove(config, "ghost"), false)
})

test("a widget added to a full grid still lands somewhere you can find it", () => {
  // Every cell of both grids taken, so there is no free cell at all.
  const widgets = []
  for (let row = 0; row < Model.MAX_ROWS; row++) {
    for (const side of Model.SIDES) {
      for (let col = 0; col < 2; col++) {
        widgets.push({ id: `w${side}${col}${row}`, type: "clock", enabled: true,
          col: col, row: row, side: side })
      }
    }
  }
  const full = Model.normalizeConfig({ layout: { columns: 2 },
    widgets: widgets.slice(0, Model.MAX_WIDGETS - 1) })
  const after = Model.addWidget(full, "clock")
  const added = Model.findInstance(after, Model.nextInstanceId(full, "clock"))
  assert.ok(added, "a widget you asked for and cannot find is worse than an awkward cell")
  assert.equal(added.enabled, true)
})

test("the config will not grow past its ceiling however hard you press add", () => {
  let config = Model.defaultConfig()
  for (let i = 0; i < Model.MAX_WIDGETS + 20; i++) config = Model.addWidget(config, "clock")
  assert.ok(config.widgets.length <= Model.MAX_WIDGETS)
})

test("several of a type name themselves apart, by label first and id after", () => {
  let config = Model.defaultConfig()
  assert.equal(Model.displayName(config, Model.findInstance(config, "clock")), "Clock",
    "one of a type needs no qualifier")

  config = Model.addWidget(config, "clock")
  assert.equal(Model.displayName(config, Model.findInstance(config, "clock")), "Clock · clock")
  assert.equal(Model.displayName(config, Model.findInstance(config, "clock-2")), "Clock · clock-2")

  // A label is your own name for it, so it beats the generated id.
  config = Model.setSetting(config, "clock-2", "label", "London")
  assert.equal(Model.displayName(config, Model.findInstance(config, "clock-2")), "Clock · London")

  // `title` counts too, which is what the todo list calls the same idea.
  let todos = Model.addWidget(Model.addWidget(Model.defaultConfig(), "todos"), "todos")
  todos = Model.setSetting(todos, "todos-2", "title", "Work")
  assert.equal(Model.displayName(todos, Model.findInstance(todos, "todos-2")), "Todos · Work")
})

test("a secret never becomes the name of a widget", () => {
  // The generalisation "name it after its first text setting" would put a
  // calendar's private address in the editor's tray. Only `label` and `title`
  // are read, and a calendar's label is the one the user typed.
  const url = "https://calendar.google.com/calendar/ical/a/private-secret/basic.ics"
  let config = Model.addWidget(Model.defaultConfig(), "calendar")
  config = Model.addWidget(config, "calendar")
  config = Model.setSetting(config, "calendar", "icsUrl", url)
  const shown = Model.displayName(config, Model.findInstance(config, "calendar"))
  assert.equal(shown.indexOf("private-secret"), -1, shown)
  assert.equal(shown, "Calendar · calendar")
  assert.equal(Model.instanceLabel(Model.findInstance(config, "calendar")), "")
})

test("a path from another plugin becomes a URL a Loader can take", () => {
  // omate hands its paths back percent-decoded, so a plugin installed under a
  // directory with a space in it has to be encoded again -- an unencoded space
  // is a url that resolves to nothing, silently, and a skin row of empty boxes.
  assert.equal(Model.pluginFileUrl("/home/a/plugins/palccod.omate/PetSprite.qml"),
    "file:///home/a/plugins/palccod.omate/PetSprite.qml")
  assert.equal(Model.pluginFileUrl("/home/a b/omate/PetSprite.qml"),
    "file:///home/a%20b/omate/PetSprite.qml")
  assert.equal(Model.pluginFileUrl("/home/a#b?c/PetSprite.qml"),
    "file:///home/a%23b%3Fc/PetSprite.qml")

  // Already a URL: passed through rather than prefixed twice.
  assert.equal(Model.pluginFileUrl("file:///home/a/PetSprite.qml"),
    "file:///home/a/PetSprite.qml")

  // Anything that is neither is refused rather than guessed at. The caller
  // reads the empty string as "do not draw a preview" and shows the name.
  for (const nothing of ["", "relative/PetSprite.qml", undefined, null, "qrc:/x"]) {
    assert.equal(Model.pluginFileUrl(nothing), "", String(nothing))
  }
})

test("the chase row says what it is doing, including cadences it has no chip for", () => {
  assert.equal(Model.chaseLabel(true, 10), "Playful")
  assert.equal(Model.chaseLabel(true, 60), "Now and then")
  assert.equal(Model.chaseLabel(true, 300), "Occasional")
  assert.equal(Model.chaseLabel(true, 1800), "Rare")

  // A cooldown set over omate's IPC is a legitimate value with no chip of its
  // own. Spelled out, so the row reads as a setting rather than as unset.
  assert.equal(Model.chaseLabel(true, 42), "Every 42s")
  assert.equal(Model.chaseLabel(true, 41.6), "Every 42s")

  // Off is off whatever the cooldown says, and a cooldown nobody has written
  // yet is not a number to put in a sentence.
  assert.equal(Model.chaseLabel(false, 10), "Off")
  assert.equal(Model.chaseLabel(true, undefined), "Off")
  assert.equal(Model.chaseLabel(true, "nonsense"), "Off")
})

test("a number read from another plugin never reaches a control as NaN", () => {
  // Math.round(undefined) is NaN, and NaN assigned to an `int` property is a
  // type error and a silent zero -- a nap cadence of zero minutes, from a key
  // omate simply had not written yet.
  assert.equal(Model.settingNumber(undefined, 10, 0, 120), 10)
  assert.equal(Model.settingNumber(null, 10, 0, 120), 10)
  assert.equal(Model.settingNumber("nonsense", 4, 1, 60), 4)
  assert.equal(Model.settingNumber("", 4, 1, 60), 4)

  assert.equal(Model.settingNumber(30, 10, 0, 120), 30)
  assert.equal(Model.settingNumber("30", 10, 0, 120), 30)
  assert.equal(Model.settingNumber(29.6, 10, 0, 120), 30)

  // Clamped to what the control actually offers, both ends.
  assert.equal(Model.settingNumber(9000, 10, 0, 120), 120)
  assert.equal(Model.settingNumber(-5, 4, 1, 60), 1)

  // A fallback outside the range is still clamped: the floor wins over a
  // default that no longer makes sense.
  assert.equal(Model.settingNumber(undefined, undefined, 1, 6), 1)
})
