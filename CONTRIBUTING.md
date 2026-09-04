# Contributing

Widgets welcome. A widget is one QML file and one entry in a list — the grid,
the editor, the settings panel, the config file and its validation all come
for free once you have described yourself to the catalogue.

Read [DESIGN.md](DESIGN.md) before you write the QML. It is short, and it is
what keeps a hundred contributed widgets looking like one set.

- [Does it belong here?](#does-it-belong-here)
- [Adding a widget](#adding-a-widget)
- [A complete example](#a-complete-example)
- [The catalogue entry](#the-catalogue-entry)
- [What your widget is handed](#what-your-widget-is-handed)
- [Sizes](#sizes)
- [Settings](#settings)
- [Names are a promise](#names-are-a-promise)
- [Changing a widget that people already have](#changing-a-widget-that-people-already-have)
- [Data that comes from outside](#data-that-comes-from-outside)
- [What it may cost](#what-it-may-cost)
- [Running it](#running-it)
- [Tests](#tests)
- [Checklist](#checklist)
- [Opening a pull request](#opening-a-pull-request)
- [How it gets reviewed](#how-it-gets-reviewed)

## Does it belong here?

A widget here is **glanceable, passive, and lives on the wallpaper**. Before
building, check it is the right shape:

| You want | Build |
|---|---|
| Something you read at a glance and never touch | **A widget here.** |
| Something you click, expand, or operate | A bar widget or a panel, in Omarchy itself |
| Something that needs to interrupt you | A notification |
| A full-screen thing | An overlay plugin |

The desktop surface has **no input region at all** — clicks pass straight
through to whatever is underneath. That is deliberate, and it is not
negotiable: a wallpaper decoration that eats clicks is a bug the user cannot
see the cause of. If your idea needs a button, it is not a widget.

Good candidates: a clock in another timezone, the weather, disk or battery
headroom, next calendar event, now playing, a countdown, moon phase, a
sparkline of something slow.

Poor candidates: anything with a scrollbar, anything needing a legend,
anything that is only interesting for two seconds a day.

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

## A complete example

The stub above compiles but teaches nothing. Here is a real one, small but
complete — a widget showing a countdown to a date, with everything the house
style asks for:

```qml
import QtQuick
import qs.Commons
import "../Model.js" as Model

Item {
  id: root

  property var service: null
  property var instance: null
  property var card: null
  readonly property var settings: instance && instance.settings ? instance.settings : ({})

  // Every size derives from the short axis, so the widget is the same
  // drawing whatever cell size it is given.
  readonly property real unit: Math.min(width, height)

  readonly property color foreground: Color.foreground
  readonly property color accent: Color.accent
  readonly property color dim: Util.alpha(Color.foreground, 0.55)

  readonly property string title: String(settings.title || "")
  // The arithmetic lives in Model.js, where a test can reach it.
  readonly property var remaining: Model.countdownParts(now, settings.target)

  property date now: clock.date

  // Days do not change sixty times a minute. Match the timer to what is
  // actually on screen.
  SystemClock {
    id: clock
    precision: SystemClock.Minutes
    onDateChanged: root.now = date
  }

  Column {
    anchors.centerIn: parent
    spacing: Math.round(root.unit * 0.02)

    Text {
      anchors.horizontalCenter: parent.horizontalCenter
      visible: root.title !== ""
      text: root.title
      textFormat: Text.PlainText
      color: root.dim
      font.family: Style.font.family
      font.pixelSize: Math.max(8, Math.round(root.unit * 0.075))
      renderType: Text.NativeRendering
    }

    Text {
      anchors.horizontalCenter: parent.horizontalCenter
      text: root.remaining.big
      textFormat: Text.PlainText
      color: root.foreground
      font.family: Style.font.family
      font.pixelSize: Math.max(12, Math.round(root.unit * 0.21))
      font.weight: Font.Light
      renderType: Text.NativeRendering
    }

    Text {
      anchors.horizontalCenter: parent.horizontalCenter
      text: root.remaining.small
      textFormat: Text.PlainText
      // The one accent on the card.
      color: root.accent
      font.family: Style.font.family
      font.pixelSize: Math.max(8, Math.round(root.unit * 0.065))
      topPadding: Math.round(root.unit * 0.045)
      renderType: Text.NativeRendering
    }
  }
}
```

Note what is *not* there: no background, no border, no `MouseArea`, no hex
colour, no fixed pixel size, and no date arithmetic — `countdownParts` would
live in `Model.js` with a test, because it is the part that can be wrong.

[`widgets/Clock.qml`](widgets/Clock.qml) is the shipped version of exactly
this shape; read it alongside.

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

## Names are a promise

Two things you choose become permanent the moment your widget ships, because
they are written into other people's config files:

- **the `type` id** — every config that has your widget names it
- **every `settings` key** — every config that has configured it names those

Pick them once, carefully. Lowercase, no spaces, descriptive rather than
clever: `weather`, not `wx`. Avoid a name so generic it will collide with the
obvious future widget — `calendar` is fine for a calendar, but do not take
`status` for a thing that shows disk usage.

Widget `type` ids share one namespace across every contributed widget. Check
`catalog()` before you pick.

## Changing a widget that people already have

Once your widget is in, someone has it on their desktop with settings they
chose. The rules that keeps working:

- **Adding a setting is always safe.** It arrives at its `defaultValue` for
  everyone who has not set it.
- **Never repurpose a key.** If `format` used to mean one thing and now means
  another, every existing config is silently wrong. Add a new key instead.
- **Never change what a `defaultValue` means.** Changing the default itself
  changes the widget for everyone who never touched it — sometimes right,
  always worth saying in the PR.
- **Removing a `choice` option** invalidates configs holding it. They fall
  back to the default rather than breaking, but say so in the PR.
- **Removing a setting** is a breaking change. Bring it up in an issue first.
- **Dropping a size** relocates widgets using it. Same: raise it first.

Unknown keys are dropped and out-of-range values are clamped when a config is
read, so a stale config never breaks the shell — but it can quietly stop
saying what its owner meant, which is worse than an error. Prefer additive
changes.

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

## What it may cost

A desktop will run a dozen of these at once, inside the single process that
draws the whole shell. Budget accordingly.

- **Wake as slowly as the display allows.** A widget showing minutes uses
  `SystemClock.Minutes`. One showing a date can wake hourly. A `Timer` with
  `interval: 1000` had better be showing seconds.
- **Nothing runs while it is switched off.** Anchor timers and processes to
  the widget's own lifetime — a widget in the tray is destroyed, so keep
  state in the widget, not in the service.
- **A subprocess is expensive.** Poll in minutes, not seconds, and share one
  call across every instance rather than one per widget — the timezone
  lookup resolves every zone in the config in a single `date` invocation.
- **`Canvas` repaints on every property change.** Give it explicit
  `requestPaint()` triggers, as `widgets/TickRing.qml` does, rather than
  letting it redraw on animation frames.
- **No `Behavior` or running animation.** See DESIGN.md — motion on the
  wallpaper is a distraction the user cannot turn off.

If your widget genuinely needs something expensive, put it behind a setting
that is off by default and say so in the PR.

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

Design (see [DESIGN.md](DESIGN.md)):

- [ ] Colours come from `Color.*` only — no hex anywhere in the widget
- [ ] Sizes come from `unit` / `width` / `height` — no fixed pixel type sizes
- [ ] The widget draws no background and no border of its own
- [ ] One accent per card, at most
- [ ] Three type sizes at most
- [ ] It reads correctly at every size you offer, on a light theme and a dark
      one, and against a busy wallpaper

Behaviour:

- [ ] No `MouseArea`, no `Behavior`, no running animation
- [ ] Timers wake as slowly as what is on screen allows
- [ ] Nothing blocks the shell — no synchronous reads, no waiting on a process
- [ ] Subprocesses go through `timeout` with absolute paths
- [ ] Anything from outside is validated before it reaches a shell or a `Text`
- [ ] Network access, if any, is declared in the PR, the README, and the
      widget's own description

Code:

- [ ] `type` and every `settings` key are names you are happy to keep forever
- [ ] Logic with a right answer lives in `Model.js` and has a test
- [ ] `settings` is a complete schema — every key your QML reads is declared
- [ ] No `if (type === "…")` anywhere outside `widgets/`
- [ ] `node --test tests/` passes
- [ ] `omarchy plugin validate .` passes
- [ ] `qmllint` reports no errors on your QML

## Opening a pull request

One widget per pull request. It makes review possible and it means a widget
that needs discussion does not hold up one that does not.

Include:

- **What it shows, and why it earns space on a wallpaper.** This is the part
  that decides whether it is merged.
- **Screenshots at every size you offer**, on a dark theme and a light one.
  Nothing else communicates a widget as fast.
- **Anything it runs or fetches**, at the top of the description rather than
  in a footnote.
- **What you tested it against** — no data, missing data, stale data, a
  broken network, a value ten times longer than you expected.

If you are unsure whether a widget fits, open an issue describing it before
you build it. That is cheaper for both of us than a finished PR that turns
out to be the wrong shape.

## How it gets reviewed

In roughly this order:

1. **Does it belong on a wallpaper?** Glanceable, passive, worth the space.
2. **Does it look like the rest?** DESIGN.md exists so a hundred contributed
   widgets still read as one set. This is where most changes get asked for,
   and it is not personal taste — it is the thing that makes the set work.
3. **Does it behave?** No input, no blocking, no surprise network, sane
   timers.
4. **Are the names right?** They are permanent, so this is the last cheap
   moment to change them.
5. **Is the logic tested?** Anything with a right answer belongs in
   `Model.js` with a test beside it.

Expect comments on the second point even if the code is perfect. Consistency
is the feature.
