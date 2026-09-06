# Design guide

These widgets sit on a wallpaper, under the windows someone is actually
working in. They are read at a glance, from across a desk, and they are never
the thing being used. Everything below follows from that.

The goal is that a hundred widgets from a hundred people still look like one
set.

- [The one rule](#the-one-rule)
- [Color](#color)
- [The card](#the-card)
- [Type](#type)
- [Layout inside a widget](#layout-inside-a-widget)
- [Sizes](#sizes)
- [Decoration](#decoration)
- [Motion](#motion)
- [What a widget is not](#what-a-widget-is-not)

## The one rule

**Every colour and every dimension comes from the theme.** Omarchy users
switch themes constantly, and a widget with one hardcoded value is the one
that looks broken on every theme but the author's.

```qml
// yes
color: Color.foreground
font.pixelSize: Math.round(root.unit * 0.21)

// no
color: "#d3c6aa"
font.pixelSize: 42
```

If you cannot express something in terms of `Color`, `Style`, or the widget's
own `width`/`height`, that is usually a sign the design wants simplifying
rather than that the system needs an exception.

## Color

Four roles, from `qs.Commons.Color`. That is the whole palette.

| | | |
|---|---|---|
| `Color.foreground` | The reading colour | The number, the value, the thing you came for |
| `Color.accent` | One thing per card | The single detail that earns attention |
| `Color.urgent` | Something is wrong | Errors and alerts only. Not "important" |
| `Color.background` | The card, already drawn for you | You will rarely name it |

Everything else is `foreground` at reduced alpha:

```qml
readonly property color dim: Util.alpha(Color.foreground, 0.55)   // labels
readonly property color faint: Util.alpha(Color.foreground, 0.3)  // decoration
```

**Use the accent exactly once.** On the clock it is the line saying how far
that zone is from yours — the only thing on the card you could not get from
the bar. Two accents on one card and neither is a highlight; the eye gets no
instruction about where to land.

Do not tint by meaning — no green for good, no red for hot. A theme's palette
is not a semantic scale, and a widget that invents one fights every theme it
did not anticipate. `urgent` is the single exception, for actual failure.

## The card

`WidgetCard` draws a translucent background, a hairline border, and the corner
radius. **Your widget draws none of that.** You are handed the inside of a
card; fill it.

The border is `foreground` at 0.14 alpha, not the accent, deliberately: the
card should read as a pane resting on the wallpaper. An accent outline turns
every widget into a notification.

The background is translucent — the wallpaper is meant to come through. Do not
add an opaque fill behind your content to make it easier to read. If your
content is not legible at the default opacity, it is too dense or too small.

## Type

One family: `Style.font.family`, the theme's font. Do not ship a font.

Size is a **fraction of the widget**, never a fixed number of pixels, so the
same widget is the same drawing whether its cell is 160px or 260px:

```qml
readonly property real unit: Math.min(width, height)

// the value you came for
font.pixelSize: Math.max(12, Math.round(root.unit * 0.21))
// the label above it
font.pixelSize: Math.max(8, Math.round(root.unit * 0.075))
// the detail below it
font.pixelSize: Math.max(8, Math.round(root.unit * 0.065))
```

Three sizes on a card is plenty. Two is usually better. A card with four type
sizes is a card that has not decided what it is for.

Weight: `Font.Light` for a large value reads calmer at size and is what makes
these look like faces rather than readouts. Leave everything else at normal —
never bold a whole card.

Set `renderType: Text.NativeRendering` and `textFormat: Text.PlainText`.
Plain text is not a style preference: anything you interpolate could come from
a config file or a network response, and rich text would render it.

## Layout inside a widget

The shape almost every widget wants:

```
┌──────────────────┐
│      LABEL       │   what this is        dim, small, letter-spaced
│                  │
│      13:15       │   the value           foreground, large
│                  │
│      +9:30       │   one detail          accent, small
└──────────────────┘
```

Centred, three lines, generous space. Space is the main tool: these are read
from far away, and crowding is what makes a card unreadable long before small
type does.

Derive gaps from `unit` too (`Math.round(unit * 0.02)`), so the whole
composition scales together.

## Sizes

Offer a size only when the widget is genuinely a **different composition** at
that size, not the same one stretched.

- `[1, 1]` — one value and its label. The default shape.
- `[2, 1]` — room for a second value beside the first, a sparkline, a range.
- `[2, 2]` — a list long enough to be worth reading. Rare, and only for a
  widget that genuinely has more to say than a row can hold.

If your `[2, 1]` is your `[1, 1]` with more whitespace, do not offer it. The
size list should read as a set of choices, not a set of stretches.

**`photo` is the one type that offers seven, and it is the rule being met
rather than waived.** A card of a different shape is a different *crop* of the
photograph — a portrait in a `1 × 2` and the same portrait in a `2 × 1` are
two pictures, not one picture at two sizes. Nothing else in the set has that
property, and a widget offering five sizes for a number and a label has not
decided what it is for. If you find yourself wanting the photo card's licence,
the question to answer first is whether your content really changes shape or
whether you are only offering more room.

A `sizes` list may hold a footprint wider than the two-column grid most people
have; the editor only offers what the user's grid can actually hold, and a
config asking for one too wide is brought back to the widest that fits.

**A size taller than one row sizes its type from a cell, not from the card.**
`Math.min(width, height)` is the right unit while every size you offer is one
row tall — it is the cell size, and it is what keeps the drawing identical at
160px and at 260px. On a `[2, 2]` it is suddenly twice as large, and a widget
that sized type from it would answer a bigger card with bigger letters. What
the reader asked a second row for is more content:

```qml
readonly property int spanCols: instance && instance.cols > 0 ? instance.cols : 1
readonly property int spanRows: instance && instance.rows > 0 ? instance.rows : 1
readonly property real unit: Math.min(width / spanCols, height / spanRows)
```

That is still one number, still derived from the rectangle, and identical to
`Math.min(width, height)` at every single-row size. `widgets/Calendar.qml` and
`widgets/Todos.qml` are the worked examples: both work out how many rows fit
and draw that many, rather than fixing a count that suits one cell size.

## Decoration

The clock's ring of tick marks is decoration, and it is the most decorated
thing here. Take that as the ceiling.

Decoration must be `foreground` at low alpha (~0.3), must carry no
information, and must be switchable off by a setting. It is texture, not
content — a widget whose ticks you had to read would be a broken widget.

No drop shadows, no gradients, no glows. The card is flat on the wallpaper.

## Motion

Almost none. A desktop widget that animates in the corner of your eye while
you are working is a distraction you cannot turn off without deleting it.

- Values change by simply becoming the new value.
- No transitions on appearance — a widget switched on is just there.
- The only motion worth having is in the editor, where you are looking at it
  on purpose.

The editor is where that last line is spent, and only twice. Dropping a widget
onto an occupied cell moves the occupant, and the occupant *slides* — 130ms,
and only while the editor is open. A card that teleported out from under the
one you were holding would read as a glitch; the same card sliding down reads
as the grid making room, which is the one thing the gesture has to
communicate.

The inspector crossing the screen is the other: it docks to the side its
widget is not on, so selecting a card on the other side moves it. Sliding says
the panel followed your selection; appearing says a second panel exists. Same
130ms, same reason.

A slideshow is not motion in this sense. A photo card changing picture is a
value becoming the new value, and it is a cut with nothing animated across it
— what it must not do is blink through an empty card while the next file
loads, which is why the settled picture stays underneath until the new one is
ready.

## What a widget is not

- **Not interactive, unless it has to be.** The desktop surface has an empty
  input region by default, so clicks reach the desktop underneath and a
  `MouseArea` in your widget is dead code. A type can opt its own rectangle
  back in with `interactive: true` in the catalogue — and only its own; every
  other widget stays click-through.

  The test a click has to pass: **one obvious action, about the thing already
  on the card.** Play/pause what is playing. Open the repository being
  described. Both are the single thing you would reach for while looking at
  that card, and neither needs anything drawn to explain it.

  What fails the test: a settings button, a menu, anything that opens more
  interface. That is a bar widget or a panel. A wallpaper is not somewhere to
  put controls.

  **`todos` is the exception, and it is recorded here so it stays one.** It
  takes a tick per row, a title that opens the file, and a list that scrolls
  in both directions — three things, where the rule says one. What earns it:
  every one of them is about an item already on the card, a tick is the only
  thing anybody ever does to a list, and a list is the single subject on a
  wallpaper that genuinely holds more than a card can show. Eliding the
  eleventh item into a card that cannot reach it is worse than letting it be
  reached.

  **`omate` is the second exception, and it is the widest one.** It is a
  power switch, a scrolling row of skins, a roaming toggle, two steppers, a
  size slider and a row of cadence chips — a panel's worth of controls on a
  card, against a rule that asks for one. What earns it: the pet is *already
  on the desktop*, so its controls are the one case where the card and the
  thing it controls are looking at each other, and every one of them writes
  through to the omate plugin's own settings rather than owning any state of
  its own. It is not a settings button opening more interface; it is the
  interface, in place.

  It is also the limit. A third card of this shape is a panel, and the answer
  to the next one is no.

  Do not read either of those as the rule loosening. A scrolling list is still
  the wrong shape for almost everything: it is content you read a line at a
  time, and a wallpaper is read at a glance. If your widget wants one, the
  question to answer first is whether it wants to be a panel.

  Three things follow, and all three are on you:

  - **The whole card becomes an input region,** not just your control. So make
    the part that does something *look* like it does — a hover state is the
    only thing telling the user which bit is live.
  - **Clicks only land where no window covers the widget.** These sit under
    your windows; that is the point of them.
  - **Targets have to be hittable without aiming.** This is a wallpaper, not a
    toolbar.

  Where a card does take a click, **the hover state is the whole of the
  affordance**: it is the only thing telling the user which part of a
  click-through desktop is live. A link underlines and takes the accent; a
  checkbox fills faintly. Nothing is drawn to explain it in words.

- **Not a notification.** No demands for attention, no urgent colour for
  things that are merely notable.
- **Not a dashboard.** One idea per card. If it needs a legend, it is the
  wrong shape for a wallpaper.
- **Not a window.** No title bars, no close buttons, no chrome. The card is
  all the frame there is.
