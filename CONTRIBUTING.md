# Contributing

Widgets welcome. A widget is one QML file and one entry in a list — the grid,
the editor, the settings panel, the config file and its validation all come
for free once you have described yourself to the catalogue.

Read [DESIGN.md](DESIGN.md) before you write the QML. It is short, and it is
what keeps a hundred contributed widgets looking like one set.

- [Adding a widget](#adding-a-widget)
- [The catalogue entry](#the-catalogue-entry)
- [What your widget is handed](#what-your-widget-is-handed)
- [Sizes](#sizes)
- [Settings](#settings)
- [Data that comes from outside](#data-that-comes-from-outside)
- [Running it](#running-it)
- [Tests](#tests)
- [Checklist](#checklist)
- [Opening a pull request](#opening-a-pull-request)

## Adding a widget

Two steps.

**1. Write `widgets/YourWidget.qml`.** An `Item` that draws into whatever
rectangle it is given.

```qml
import QtQuick
import qs.Commons

Item {
  id: root

  // Handed to you. See "What your widget is handed" below.
  property var service: null
  property var instance: null
  property var card: null
  readonly property var settings: instance && instance.settings ? instance.settings : ({})

  // Size everything from the short axis, never from fixed pixels, so the
  // widget is the same drawing at every cell size.
  readonly property real unit: Math.min(width, height)

  Text {
    anchors.centerIn: parent
    text: "hello"
    color: Color.foreground
    font.family: Style.font.family
    font.pixelSize: Math.round(root.unit * 0.2)
    renderType: Text.NativeRendering
  }
}
```

**2. Add it to `catalog()` in [`Model.js`](Model.js).**

```js
{
  type: "yourwidget",
  name: "Your widget",
  description: "One line, in the popup and the editor tray.",
  source: "widgets/YourWidget.qml",
  sizes: [[1, 1], [2, 1]],
  settings: [
    { key: "greeting", type: "text", label: "Greeting", defaultValue: "hello" }
  ]
}
```

That is the whole registration. Nothing else in the plugin should need to
learn your widget's name — if you find yourself adding `if (type === "…")`
anywhere outside `widgets/`, that is a sign the catalogue needs a new field
instead.

A type added by an update arrives **switched off**, so nobody's desktop
changes because they pulled.

## The catalogue entry

| Field | |
|---|---|
| `type` | Stable id, lowercase, no spaces. Config files refer to it forever, so pick once |
| `name` | What the popup and the editor call it |
| `description` | One line. Shown under the name in the popup |
| `source` | Path to your QML, relative to the plugin root. Must stay inside it |
| `sizes` | Footprints you allow, `[cols, rows]` in cells. First is the default |
| `settings` | Your whole tunable surface, as a schema. See [Settings](#settings) |

## What your widget is handed

Three properties are injected. Declare them; leave them `null`-safe.

| Property | |
|---|---|
| `service` | The plugin service. `service.zoneOffsets` is the resolved timezone table; treat the rest as read-only |
| `instance` | Your configured instance: `id`, `cols`, `rows`, `opacity`, `radius`, and `settings` |
| `card` | The `WidgetCard` you are drawn on. Read `card.radius` if you need to follow its corners |

Your widget is inside the card, filling it. **Do not draw your own background
or border** — the card is the background, and it is what makes every widget in
the set look related.

## Sizes

Cells are square. A `[2, 1]` widget is two cells wide and one tall, gap
included. Offer a size only if the widget genuinely reads better at it: the
editor's size button steps through exactly what you list, and a size that is
just "the same thing but stretched" is a worse option, not an extra one.

Your QML is given the pixel rectangle for the footprint in use. Read `width`
and `height` and lay out from them; do not assume square.

## Settings

`settings` is a schema, not a bag of defaults. Each entry gets a control in
the editor automatically.

| `type` | Control | Notes |
|---|---|---|
| `text` | Text field | `help` becomes the placeholder |
| `boolean` | Switch | |
| `choice` | Dropdown | Needs `options: [{ value, label }]`; `defaultValue` must be one of them |
| `timezone` | Searchable city list | Value is an IANA name, or `""` for local |
| `number` | Text field | Clamped to a sane range |

Every value the user or the config file supplies is coerced to the kind you
declared before your QML sees it, so `settings.ticks` is always a boolean and
`settings.format` is always one of your options. You never have to defend
against a config file. A key you do not declare cannot be set.

Adding a setting type means teaching `coerceSetting()` in `Model.js` and
adding a control to the editor's schema `Repeater`. Both are short; say so in
the PR.

## Data that comes from outside

Most interesting widgets want something the shell does not already have.

- **Nothing may block.** The shell is one process for the whole desktop. No
  synchronous file reads, no waiting on a subprocess.
- **Subprocesses go through `timeout`** and are given absolute paths, the way
  the timezone lookup in `Service.qml` does. A wedged helper must not be able
  to outlive its refresh.
- **Anything from outside is untrusted.** Validate it before it reaches a
  command line or a `Text`. `isSafeZone()` is the pattern: a strict allowlist
  pattern, not an attempt to escape what arrived.
- **Network access must be obvious.** This plugin makes none today. If your
  widget needs it, say so in the PR, in the README, and in the widget's own
  description — an unexpected outbound request from a wallpaper decoration is
  not something anyone should have to discover.
- **Poll slowly.** A clock that shows minutes wakes once a minute, not sixty
  times. Match the timer to what is actually on screen.

## Running it

```bash
dev/preview          # draw the widgets, no shell restart needed
dev/preview --edit   # ...with the layout editor open
```

The preview runs a second Quickshell containing only this plugin, against your
real `~/.config/omarchy/widgets.json`. Use it — the installed plugin needs
`omarchy-restart-shell` for every code change, because the shell does not
re-instantiate a `keepLoaded` panel on hot-reload.

## Tests

```bash
node --test tests/
```

`Model.js` holds everything that does not need Qt, which is what lets it be
tested under plain node. **Put your widget's logic there**, not in the QML:
parsing, formatting, unit conversion, anything with a right answer. The
timezone arithmetic is the worked example — the QML draws, `Model.js` decides.

The suite already checks, for every widget in the catalogue, that its source
file exists, its sizes are sane, and its settings schema is complete and
internally consistent. Adding your entry puts you under those checks with no
work. Add your own tests for whatever your widget actually computes.

It also parses every QML file and catches the two mistakes that make a plugin
silently fail to load: a handler set twice on one object, and a hand-written
signal colliding with a property's generated `<name>Changed`.

## Checklist

- [ ] Colors come from `Color.*` only — no hex anywhere in the widget
- [ ] Sizes come from `unit`/`width`/`height` — no fixed pixel type sizes
- [ ] The widget draws no background and no border of its own
- [ ] It takes no input (the desktop surface has no input region; a click
      handler there is dead code)
- [ ] It reads correctly at every size you offer, on a light and a dark theme
- [ ] Logic with a right answer lives in `Model.js` and has a test
- [ ] `node --test tests/` passes
- [ ] `omarchy plugin validate .` passes
- [ ] Nothing blocks, nothing unvalidated reaches a shell

## Opening a pull request

Say what the widget shows and why it earns a place on someone's wallpaper.
Include a screenshot on a dark theme and a light one — that is the fastest way
for anyone to see whether it belongs in the set.

If the widget talks to the network, or runs anything, put that at the top of
the description rather than in a footnote.
