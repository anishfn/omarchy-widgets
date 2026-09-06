<p align="center">
  <img src="assets/logo.svg" alt="Widgets" width="132">
</p>

<h1 align="center">Widgets</h1>

<p align="center">
  <strong>Desktop widgets for Omarchy, in your theme's colors.</strong><br>
  A grid on your wallpaper, arranged by drag and drop.
</p>

<p align="center">
  <a href="#install"><img alt="Install" src="https://img.shields.io/badge/install-omarchy%20plugin%20add-7fbbb3?style=for-the-badge"></a>
  <a href="https://github.com/anishfn/omarchy-widgets/releases"><img alt="Releases" src="https://img.shields.io/github/v/release/anishfn/omarchy-widgets?style=for-the-badge&color=e8845f&label=release"></a>
  <a href="CONTRIBUTING.md"><img alt="Contributing" src="https://img.shields.io/badge/widgets-welcome-dfd8c8?style=for-the-badge"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-8a9a9a?style=for-the-badge"></a>
</p>

<p align="center">
  <img src="assets/desktop.jpg" alt="Widgets on the desktop: a clock, the weather, a todo list and the music card down the left, contributions and two repositories on the right, and the Omate card" width="880">
</p>

<p align="center">
  <sub>Everything here takes its colours from the Omarchy theme. Nothing draws
  a background of its own — the cards are the wallpaper, dimmed.</sub>
</p>

---

## Get it

```bash
omarchy plugin add https://github.com/anishfn/omarchy-widgets.git
omarchy plugin enable anishfn.widgets
```

That is the whole install. Plugins land disabled so you can read the code
before it runs; `enable` puts the **Widgets** button in your bar and the clock
on your desktop.

Or let the script do it, which also offers the companion plugin the Omate card
needs and restarts the shell at the end:

```bash
curl -fsSL https://raw.githubusercontent.com/anishfn/omarchy-widgets/main/install | bash -s -- --yes
```

| | |
|---|---|
| **Clone URL** | `https://github.com/anishfn/omarchy-widgets.git` |
| **Plugin id** | `anishfn.widgets` |
| **Requires** | Omarchy 4 (the Quickshell shell) |
| **Update** | `~/.config/omarchy/plugins/anishfn.widgets/update` |
| **Remove** | `omarchy plugin remove anishfn.widgets` |

<sub>Removing the plugin leaves `~/.config/omarchy/widgets.json` alone.</sub>

> **`omarchy plugin add` does not upgrade.** It refuses when the plugin is
> already installed, so running the install line a second time reports an
> error rather than pulling anything. Use `update` — either the script above
> or `omarchy plugin update anishfn.widgets`.

> **The id changed in 0.2.0.** It was `io.github.anishfn.widgets`. An id is
> also a directory name, so an install made before the change sits under the
> old one and none of the commands above will find it. Remove it and add it
> again:
>
> ```bash
> omarchy plugin remove io.github.anishfn.widgets
> omarchy plugin add https://github.com/anishfn/omarchy-widgets.git
> omarchy plugin enable anishfn.widgets
> ```
>
> Your desktop survives the round trip — `remove` leaves
> `~/.config/omarchy/widgets.json` where it is, and the new install reads it
> back.

---

## The widgets

| | | |
|---|---|---|
| **Clock** | The time in any timezone, and how far that is from your own | local |
| **Weather** | Now, today's range, and the condition | `wttr.in` |
| **GitHub** | A year of contributions, as many weeks as the card holds | `github.com` |
| **Repo pulse** | Stars, forks, issues and open PRs; the name opens the repo | `api.github.com` |
| **Calendar** | What is next in your Google Calendar, and when | `calendar.google.com` |
| **Todos** | Today's list, from a text file. Tick things off; the title opens it | local (a file) |
| **Music** | What is playing, how far in, and the transport for it | local (MPRIS) |
| **Omate** | The desktop pet: show and hide it, pick its skin, size it, set the cursor chase | local (Omate plugin) |
| **Photos** | A picture of your own, or a folder of them shown one at a time | local (your files) |

<table>
<tr>
<td width="50%" valign="top" align="center">
  <img src="assets/cards.png" alt="The clock, weather, todo and music cards" width="380"><br>
  <sub>Type sizes are fractions of the card, so a widget scaled up is the same drawing at a different size — never a small drawing in a big box.</sub>
</td>
<td width="50%" valign="top" align="center">
  <img src="assets/omate.png" alt="The Omate card: a power switch, a scrolling row of skins, and the pet's dials" width="380"><br>
  <sub>The Omate card, with each skin chip playing that pack's own idle animation. It owns nothing: every control writes through to the pet's plugin.</sub>
</td>
</tr>
</table>

```
   ┌─────────┬─────────┐        side: left | right
   │   BLR   │  London │        columns: 1-6
   │  13:15  │   12°   │
   ├─────────┴─────────┤        drag to move
   │ ▪▫▪▪▫▪▪▫▪▪▫▪▪▫▪▪ │        drag to the tray to take one off
   ├───────────────────┤
   │ 09:00  standup    │        some widgets span two columns
   │ 14:00  review     │
   ├─────────┬─────────┤
   │  omara  │ ♪ track │        ...and some span two rows
   └─────────┴─────────┘
```

No account, no telemetry. The clock, the todo list and the music widget touch
nothing outside your machine. Four widgets do make requests, **each only while
it is switched on**, each to one host and no third party — the table above
says which.

---

## Contents

- [What it does](#what-it-does)
- [Install](#install)
  - [The scripts](#the-scripts)
  - [Updating](#updating)
  - [From a local copy](#from-a-local-copy)
- [Turning widgets on and off](#turning-widgets-on-and-off)
  - [More than one of the same widget](#more-than-one-of-the-same-widget)
- [Arranging them](#arranging-them)
  - [The bar, the tray and the inspector](#the-bar-the-tray-and-the-inspector)
  - [Two sides](#two-sides)
  - [The grid](#the-grid)
  - [Dragging](#dragging)
    - [Dropping onto an occupied cell](#dropping-onto-an-occupied-cell)
- [The clock](#the-clock)
- [The weather](#the-weather)
- [The contribution graph](#the-contribution-graph)
- [Repo pulse](#repo-pulse)
- [The calendar](#the-calendar)
  - [Connecting your Google Calendar](#connecting-your-google-calendar)
  - [Three sizes](#three-sizes)
- [Todos](#todos)
  - [The file](#the-file)
  - [Ticking things off](#ticking-things-off)
  - [Scrolling, and opening the file](#scrolling-and-opening-the-file)
- [Music](#music)
- [Omate](#omate)
- [Photos](#photos)
  - [One picture, or a folder of them](#one-picture-or-a-folder-of-them)
  - [Every size there is](#every-size-there-is)
- [Config file](#config-file)
  - [The layout block](#the-layout-block)
  - [Each widget](#each-widget)
  - [Widget settings](#widget-settings)
- [Command line](#command-line)
- [Adding a widget type](#adding-a-widget-type)
- [Contributing](#contributing)
- [How it behaves on the desktop](#how-it-behaves-on-the-desktop)
- [Development](#development)

---

## What it does

Draws widget cards on the desktop:

| | |
|---|---|
| **Where** | A grid down the left edge, the right, or both, on the Bottom layer — above the wallpaper, beneath every window |
| **Colors** | From the active theme's palette; switching themes re-colors them live |
| **Input** | None, unless a widget asks for it — [Music](#music), [Repo pulse](#repo-pulse), [Todos](#todos) |
| **Space** | Reserves none, and stays inside the area the bar has already claimed |
| **Screens** | Every output by default, or one you name |
| **Network** | Only the weather, GitHub and calendar widgets, only while they are on |

Nothing here is a window. You cannot focus a widget or click it — it is
something you see when you clear the screen. Arranging them happens in an
editor of its own, so the widgets themselves never have to take input.

## Install

The two lines at the [top of this page](#get-it) are the whole install. The
rest of this section is for when they are not enough.

### The scripts

Two scripts ship with the plugin. Neither replaces `omarchy plugin` — both
call it — and both are safe to run twice.

```bash
./install            # add or update, offer companions, restart the shell
./update             # update this and its companions, restart if anything moved
```

`install` does four things a bare `omarchy plugin add` does not:

- **Picks `add` or `update` for you.** `add` *refuses* when the plugin is
  already installed — a second clone over a checkout is not an upgrade — so
  re-running the install line to upgrade reports an error and pulls nothing.
- **Offers the companion plugin.** The Omate card is inert without
  [`palccod.omate`](https://github.com/Palccod/Omate), and nothing in `add`
  knows that, so a fresh install draws a card that says "not loaded" without
  saying what would load it.
- **Restarts the shell.** A rescan tells the registry about new files; it does
  not re-instantiate a panel that is already mounted, and this plugin is
  `keepLoaded`. Without a restart the install appears to have done nothing.
- **Checks what the cards shell out to** — `curl` for weather, the
  contribution graph, repo pulse and the calendar; `timedatectl` for timezone
  offsets. A missing one is not an install failure, it is a card that never
  stops saying "fetching", which is a much worse way to find out.

| Flag | |
|---|---|
| `--yes` | answer every prompt; required when piping to `bash` |
| `--no-companions` | this plugin only, leave the Omate card inert |
| `--this-only` | (`update`) skip the companions |

Both skip the restart when nothing actually changed — a restart you did not
need costs you every panel you had open. Both end by printing the manifest
version and the commit each plugin is on:

```
Updated
  anishfn.widgets              0.1.0 → 0.2.0         3374b22 → 5b634fe
  palccod.omate                0.4.0 (unchanged)     742a67b → 9c1d004
```

A version that stayed put while the commits moved is shown as `(unchanged)`
rather than hidden — it means the author shipped without bumping the
manifest, which is a thing worth knowing about a plugin you just pulled.

### Updating

```bash
~/.config/omarchy/plugins/anishfn.widgets/update
```

Or by hand, which is the same thing without the companions or the restart:

```bash
omarchy plugin update anishfn.widgets
omarchy restart shell
```

`omarchy plugin update` shows you the diff before it applies it, fast-forwards
only, and rolls back if the result fails validation.

### From a local copy

Put the folder at `~/.config/omarchy/plugins/anishfn.widgets/` and
enable the same id. A folder that is not a git checkout has nothing to pull
from, so `update` will say so rather than pretending.

```bash
omarchy plugin disable anishfn.widgets   # off, config kept
omarchy plugin remove anishfn.widgets    # gone
```

## Turning widgets on and off

Click the **Widgets** button in the bar. Every widget in the catalogue gets a
row and a switch; flip one and the desktop follows immediately. The button
dims when nothing is on, so the bar answers "are my widgets up?" without a
click, and its tooltip counts what is showing.

The list is grouped: what is **on the desktop** first, what is **off** below
it, with a count at the top saying how many of how many. A row is one line —
a glyph for the type, the widget's name, and the switch — and the sentence
describing the type is the row's tooltip rather than a third line printed
under every one of them. If there are more rows than fit, the list scrolls
inside the panel instead of running off the bottom of the screen.

That shape is deliberate and it is the reason for the glyphs: this list is as
long as the catalogue, and the catalogue grows every time somebody contributes
a widget. A list you scan by shape stays usable at thirty rows; a list of
paragraphs does not.

Arrow keys move down the rows, Enter flips the one under the cursor, Escape
closes. Switching a widget off moves its row to the second group, and the
cursor goes with it rather than staying on a row number that now belongs to
something else.

A widget you switch off is off, not gone: its settings stay in the config
file, and switching it back on brings them back — in its old cell if it is
still free, and in the next free one if it is not.

### More than one of the same widget

Three timezones, two repositories, a work list and a personal one. Open the
layout editor, click a widget, and press **Duplicate** — you get a copy with
the same settings and the same shape, already selected so you can change the
one field that differs. **Remove** deletes a spare and its settings.

The button only appears for types where a second one can say something
different. The weather reads one location and the music card follows one
player, so duplicating either would be the same card twice; those two show no
Duplicate button, and there is nothing to configure to change that.

**The last of a type cannot be deleted, only switched off.** Every type in the
catalogue has a row in the bar popup, and that row *is* an instance — deleting
the last one would only mean the next config read put a fresh one back,
switched off, which looks exactly like the delete failing.

Copies are named `clock-2`, `clock-3`, and so on, and the editor tells them
apart by the **Label** (or **Title**) you give them, falling back to the id.
The id is yours: rename it in the config file and it changes everywhere,
including on the command line.

## Arranging them

**Arrange…** in the same popup opens the layout editor: the desktop dims, the
grid appears under your widgets, and you can drag them around. Escape or
**Done** closes it.

<p align="center">
  <img src="assets/editor.jpg" alt="The layout editor: the grid under the widgets, and the chrome in one bottom-centred column — the inspector for the selected widget with its settings flowing four to a line, the tray of switched-off widgets, and the bar of layout controls" width="880">
</p>

<p align="center">
  <sub>The grid under the cards, and the editor's chrome as one column: the
  inspector for whatever is selected, the tray of widgets that are off, and
  the layout bar.</sub>
</p>

### The bar, the tray and the inspector

Three panels, each about one thing.

- **The bar**, along the bottom: **Side**, **Columns**, **Scale**,
  **Opacity**, **Reset** and **Done**. These are about the grid, not about any
  one widget, so the bar is the same size whatever is selected.
- **The tray**, just above it: every widget that is off. Drag one out onto a
  cell to put it up, and drag one back down onto the tray to take it off. The
  tray is the only part of the editor's chrome a drag may end on — a card
  dropped on the bar or the inspector goes back where it came from rather than
  landing in the cell hidden underneath.
- **The inspector**, stacked over the other two and the same width as them:
  everything about the widget you have selected. Its name and id, its
  **Size**, its own **Opacity**, every setting its type declares, and
  **Duplicate** / **Remove**. It appears when you click a widget and goes away
  when you click empty grid. The settings flow across the width rather than
  down it, four to a line on a wide bar, so the panel is as tall as the widget
  needs and no taller — and the two panels under it do not move when it comes
  and goes.

**Size** is a list rather than a button that cycles. It offers exactly the
footprints the widget's type declares and the current grid can hold — a card
three columns wide is not offered on a two-column grid — so picking `2 × 2` is
one click rather than four presses of the same button.

### Two sides

Widgets can sit on the **left edge, the right edge, or both at once**. The
editor draws both grids whether or not you are using them — the unused one
fainter, as an invitation — and dragging a card from one to the other is all
it takes to move it across. Nothing to switch on first.

Each widget remembers its own side, so the two grids are two independent
boards: the same cell on the left and on the right are different places, and a
widget on one can never collide with a widget on the other.

The **Side** buttons in the toolbar put *everything* on one side, which is what
they have always done and what they look like they do. `layout.side` is also
where a new widget goes when it has no opinion of its own.

> [!NOTE]
> Both grids have to fit the screen, so the **Columns** ceiling is now what
> fits *twice*, not once — five columns a side on a 2560px display rather than
> six. The other side is always one drag away, and a column count that only
> works until you use it is a trap rather than a setting. A config that already
> holds a wider grid keeps it and can still be narrowed.

### The grid

Widgets sit in a grid of square cells down one edge of the screen, the way the
phone home screens this borrows from lay theirs out. A widget takes a whole
number of cells, so two of them can never half-overlap and a drag has a finite
set of places it can land.

| | |
|---|---|
| **Side** | `left` or `right`. The buttons in the editor, or `side` in the config |
| **Columns** | How many cells wide the grid is, 1–6. Two by default. The buttons in the editor, or `columns` in the config |
| **Scale** | Grows or shrinks every card at once, 25–200% in the editor's field, or `scale` in the config. Global only: every card is exactly as big as its cell |
| **Opacity** | How solid every card is over the wallpaper, 0–100% in the editor's field, or `opacity` in the config. The global re-applies to every card; any card can break away with its own (see below) |
| **Cell** | 200px square by default. Widening the grid adds room, it does not shrink what is in it |
| **Spans** | A widget takes one or more columns. The clock is square or double-width |

Individual cards can drift from the grid's opacity. Select a widget and its
own **Opacity** field appears — the value it shows is the card's own when one
is set, the grid's otherwise — and **↺** sends the card back to following the
grid. In the config the same is a per-widget `opacity` (see [Each
widget](#each-widget)): a value is that card's own, omitting it means "follow
the layout's". Nothing can do this to **Scale**, which is grid-wide and stays
that way.

The grid starts below the bar, not behind it: the surface asks the compositor
for the area the bar has already claimed, so the top row lines up under it on
any bar position.

**Changing the column count** is the **Columns** row of buttons in the editor.
Only counts that actually fit your display are offered — six 200px cells plus
their gaps and margin need 1320px, so a narrower screen is offered fewer. The
count already in use always stays on offer, so a grid configured wider than
the screen can still be narrowed rather than being stuck.

Widening grows the grid away from the edge it is anchored to and leaves every
widget in the cell it was already in — a right-hand grid keeps its right edge
and grows leftward, a left-hand one keeps its left edge and grows rightward.
Narrowing is the only direction that has to move anything: a widget too wide
for the new grid is shrunk to the largest size its type offers that fits, one
hanging off the right edge is pulled back in, and anything that then collides
is repacked in reading order.

### Dragging

- **Move one** — drag it to another cell, on either side of the screen. The
  cell you are over lights up in the accent color when the drop is legal and
  in the urgent color when it is not, so a refused drop is refused before it
  happens.
- **Send one across** — drag it to the other side's grid. The grid you are
  over brightens as you cross, so you can see which board you are aiming at.
- **Drop it on another widget** — the other one moves out of the way. See
  below.
- **Take one off** — drag it down into the tray, the strip of chips above the
  bar. Dropping on the bar or the inspector does nothing.
- **Put one back** — drag it out of the tray onto a cell.
- **Resize one** — click it and pick from **Size** in the inspector. It offers
  the footprints that widget type declares, and moves the widget if the new
  size does not fit where it was standing.
- **Reshape the grid** — the **Side** and **Columns** buttons change the grid
  itself rather than any one widget.

What decides a drop is the corner of the card you are holding, not the point
of the pointer — the same rule the highlight draws, so the two can never
disagree.

#### Dropping onto an occupied cell

An occupied cell is the most natural place to aim for — it is where you can
*see* a widget already fits — so the thing already there moves rather than the
drop being refused. Two rules, in this order:

- **Same footprint: they swap.** Drop the clock on the weather and the weather
  takes the clock's cell. Shortest distance anything has to travel, and the
  grid stays as full as it was.
- **Anything else: it goes below.** Drop a two-column calendar onto a row
  holding music and a repo card, and both of them move to the first free row
  at or below the drop. Not up into whatever gap happened to exist above it —
  below is the direction the gesture means.

The grid rearranges **while you are still holding the card**, so you see what
the drop will do before you commit to it, and the displaced widgets slide
rather than teleport. What you are shown is not an approximation of the drop:
it *is* the drop, worked out early by the same code that will apply it on
release. Escape still cancels the whole thing.

A drop is only ever refused for running off the grid — or, in the one corner
case, when a widget coming in from the tray lands on a grid so full that the
occupant has nowhere to go. Then nothing moves at all, because half a
rearrangement is worse than none.

## The clock

The time, large, with two smaller lines:

- **above** — a label you write yourself (`BLR`, `NYC`, anything, or nothing)
- **below** — how far this clock is from your own (`+9:30`), or today's date
  when it *is* your own

Click the clock in the editor and pick a **Timezone** from the searchable
city list — that is the only thing you need to do to turn it into a world
clock, and the label follows the zone unless you write your own. Leave the
timezone empty and it is your own clock with the date under it.

Ask for seconds in the **Format** and it ticks once a second; leave them out
and it wakes once a minute.

The ring of small marks around the edge is decoration. Turn it off with
`"ticks": false`.

## The weather

Where you are, what it is doing, and today's range.

Click it in the editor for **Units** (°C or °F), a **Label** to override the
place name, and whether to show the **high and low**.

### Where it gets the weather

From [wttr.in](https://wttr.in), the same source the rest of Omarchy uses,
and only while a weather widget is on. One request serves every weather
widget on every screen, refreshed every fifteen minutes.

**Location** comes from the file Omarchy already keeps it in, so there is one
place to set it and this plugin never learns your address separately:

```bash
omarchy-weather-location                       # what it is now
omarchy-weather-location --set "Bengaluru"     # set it
omarchy-weather-location --clear               # back to IP auto-detect
```

With nothing set, wttr.in detects the location from your IP address — that is
Omarchy's documented default, not a choice this plugin makes. If you would
rather it not, set a location explicitly.

The condition icon uses the same glyphs `omarchy-weather-icon` picks, and
switches between its day and night forms using the sunrise and sunset at the
place being reported, so a rainy midnight does not get a sun.

If a request fails, the card keeps showing the last reading rather than going
blank — ten-minute-old weather beats no weather.

## The contribution graph

Your GitHub year: seven rows of squares, one column a week, as many weeks
back as the card can hold.

Click it in the editor and set a **Username**. That is the only required
setting; **Legend** turns the scale and week count along the bottom on and
off.

Cell size comes from the height, because seven rows have to fit exactly, and
the number of weeks then follows from the width. So a wide card shows most of
a year and a square one shows a couple of months — the same widget at a
different length, rather than a squashed version of itself. The most recent
week is at the right edge, where you look for it.

The heatmap is the one place in this set where the accent is the data rather
than a detail, so the squares get the whole accent budget and every letter on
the card stays neutral.

### Where it gets the graph

GitHub does not publish the contribution calendar through its REST API, but
the page that draws it is served on its own at `/users/<login>/contributions`
and needs no token. That is the whole source: **github.com directly**, with no
third-party proxy standing between your desktop and it, and no credentials to
set up.

It shows **public contributions**, which is what that page shows. One request
per username, refreshed every half hour, and only while a GitHub widget is on.

## Repo pulse

A repository at a glance: stars, forks, issues, open pull requests, and how
long since anything was pushed to it.

Click it in the editor and set a **Repository** as `owner/name`. **Stars and
issues** turns the figures underneath on and off.

Four numbers and no chart. A sparkline on a card this size says less than the
numbers do — you cannot read a week off it — so the space goes to figures you
can act on. The time since the last push takes the accent, because it is the
one thing on the card that says whether the project is alive.

Each figure is written out — `6 stars`, `0 forks` — rather than shown as an
icon. A star is recognisable, but a fork and an open issue are two small
outlines that look alike at this size, and a bare `0` beside a shape you have
to decode is worse than `0 forks`.

**`issues` is the count with pull requests taken back out of it.** GitHub's
`open_issues_count` includes them, which is a quirk of the API and not what
anybody means by the word — `cli/cli` reports 1076 "issues" of which 66 are
pull requests. Getting that right costs a second request to the search
endpoint; until it answers, the card shows GitHub's combined figure rather
than a wrong smaller one.

**The name opens the repository.** Click it and GitHub opens in your browser
— it underlines and takes the accent colour on hover, so you can see which
part of the card is live. The link uses GitHub's canonical name once it has
been fetched, so a repository that has since been renamed opens where it
actually lives rather than at a redirect.

That makes this the second widget you can click, after [Music](#music). The
whole card is an input region while a widget is interactive, so clicks
anywhere on it are caught — only the name does anything with them.

Data comes from the public REST API, unauthenticated: sixty requests an hour
per address, two per repository every half hour.

## The calendar

What is next, and when. The card is a list of times against sentences, which
is what a calendar is once you take the week grid away — a grid of squares on
a wallpaper tells you that Thursday is busy; it does not tell you what you are
late for.

Recurring events, all-day events, moved instances and cancelled ones are all
handled, and times are shown in your own clock however the event was written.

### Connecting your Google Calendar

Google publishes every calendar as an iCalendar file at a private address.
That address is the whole connection: **there is no OAuth client to register
and no token for the shell to hold.**

1. Google Calendar → hover the calendar in the left sidebar → **⋮** →
   **Settings and sharing**
2. Scroll to **Integrate calendar**
3. Copy **Secret address in iCal format**
4. Paste it into the widget's **Secret iCal address** in the layout editor

The plugin fetches that URL and nothing else, every 15 minutes, only while a
calendar widget is switched on, straight to `calendar.google.com`. Nothing is
sent but the address itself, and no third-party proxy is involved. Only
addresses matching Google's own iCal shape are accepted; anything else is
refused rather than fetched.

> [!IMPORTANT]
> **That address is a read-only copy of your calendar to anyone who has it,**
> and it goes into `~/.config/omarchy/widgets.json` in plain text. Do not
> commit that file to a public dotfiles repo. Google can revoke and reissue
> the address from the same settings page (**Reset private URLs**) if it gets
> out.

If you would rather not put a secret in the file at all, a **public** iCal
address works too — for a calendar you have already shared publicly, or one of
Google's holiday calendars.

### Three sizes

| | |
|---|---|
| **1×1** | The next thing on its own: what it is, when it starts, how long you have |
| **2×1** | Two or three rows — time, event, and the day in the margin where it changes |
| **2×2** | The agenda, broken into days, as far ahead as the card holds |

The next event carries a short accent rule in the margin. That is the whole of
the card's emphasis: everything below it is simply what comes after.

The tall card dates every group it draws, so it drops the date across the top
— that line would be saying "Today" twice. It keeps the line if you have given
the widget a **Label**, which is the one thing the day headings cannot say.

Times are shown on a 24-hour clock by default; **Clock** switches to 12-hour.
**All-day events** and **Location** can each be turned off.

## Todos

Today's list, read from a text file.

The file is the interface. There is no todo service worth making a wallpaper
depend on, and the thing every editor, every dotfiles repo and every sync tool
already handles is a file with a line in it per thing to do. So the card
reads, and ticking something off is a keystroke in the editor you already have
open — which is also why this widget takes no clicks. A checkbox on a card
that lives under your windows is a checkbox you have to clear the screen to
reach.

### The file

`~/.config/omarchy/todos.txt` by default; set **List file** to point somewhere
else. It is watched, so the card follows the file as you save it.

```
# Friday
- [ ] ship the calendar widget
- [x] reply to the issue
! call the bank
* buy milk
x 2026-09-04 restart the shell
plain lines work too
```

The grammar is deliberately forgiving, because it is meant to accept what you
already type:

| | |
|---|---|
| `- [ ]` / `- [x]` | A markdown checkbox. Anything but a space between the brackets means done |
| `x ` at the start | todo.txt's done marker. A completion date after it is dropped |
| `-` `*` `+` `•` | A bullet, optional |
| `!` at the start | Important. It goes to the top of the card |
| `# heading` | The first one names the list; the rest are comments |
| `---` | A divider. Not something to do |
| anything else | An item |

**What is left comes first**, marked items ahead of it, and finished ones
last — a list drawn in file order puts three things you have already done at
the top of a card with room for four. Inside each band the file's own order
survives.

| | |
|---|---|
| **1×1** | How much is left, and the one thing to do next |
| **2×1** | The top of the list |
| **2×2** | The list |

### Ticking things off

**Click the ring beside an item.** It rewrites that one line of the file and
leaves every other byte alone — your indentation, your bullet, your wording,
your other lines. A card that reformatted the whole list every time you ticked
something off would be a card that fights the editor you wrote it in.

What it writes depends on what is already there:

| The line says | Ticking it gives |
|---|---|
| `- [ ] thing` | `- [x] thing` |
| `x 2026-09-04 thing` | `thing` — unticking drops the completion date with the mark |
| `* thing` | `* [x] thing` — it gains a checkbox and keeps its bullet |
| `thing` | `[x] thing` |

A line that gains a checkbox keeps it: unticking leaves `[ ] thing` rather
than guessing its way back to a bare line. That round-trips; guessing would
not.

Turn **Tick items off** off in the editor if you would rather the card were
read-only.

> [!NOTE]
> The card and your editor are two writers on one file. If you have the list
> open with unsaved changes and tick something on the card, whichever saves
> last wins — the same as any two editors on one file.

### Scrolling, and opening the file

**The list scrolls, vertically and horizontally.** The card shows what fits
and you flick or wheel to the rest, so a list longer than the card is still a
list you can read. Long items are *not* elided — an ellipsis promises the rest
is unreachable, and here it is not; scroll sideways instead. A thin indicator
appears on the right while there is more below, and along the bottom while you
are actually moving sideways.

**Clicking the title opens the list in your editor** — whichever one
`omarchy default editor` names, in a terminal if that is what it is. On a
first run, before the file exists, the path in the middle of the empty card
does the same thing, so making the list is one click.

This is the third widget you can click, after [Music](#music) and
[Repo pulse](#repo-pulse), and the one that stretches the rule furthest.
[DESIGN.md](DESIGN.md) records why. The usual caveat applies twice over here:
the card sits *under* your windows, so it can only be ticked, scrolled or
opened where nothing is covering it.

**Finished items** can be hidden, and **Progress** turns off the hairline
along the bottom. Nothing here leaves your machine.

## Music

What is playing, from **MPRIS** — so it is whatever is actually playing,
Spotify or a browser tab or mpv, rather than any one application. Album art,
title, artist, a progress bar, and the transport: back, play or pause,
forward.

**This is one of the widgets you can click** — the others are
[Repo pulse](#repo-pulse), [Todos](#todos) and [Omate](#omate). Every other card here is click-through: the desktop surface has no input region, so a click lands on
whatever is underneath it. A type that needs a control declares `interactive`
in the catalogue and gets *its own rectangle* back, and nothing else changes.
A play/pause you have to go somewhere else to reach is not a play/pause; that
is the whole justification, and it is meant to be a hard one to meet.

Two things follow from widgets living under your windows: the buttons are only
clickable where no window is covering the card, and they are drawn big enough
to hit without aiming.

Play/pause is the one drawn as a target; back and forward sit quietly either
side of it, because a wallpaper should still have one obvious action on it.
Each button appears only if the player says it will answer — a stream has
somewhere to pause and nowhere to skip to, so it gets no skip buttons rather
than two that do nothing.

**Album art**, **Progress** and **Skip tracks** can each be turned off in the
editor. Nothing here leaves your machine.

### Two shapes, not one stretched

A **wide** card puts the art down the left and the words beside it, with the
elapsed and total times under a progress bar. A **square** card has no room
for that — the art alone would take the whole thing — so the cover fills the
card, the title and artist sit over a scrim along the bottom, and the progress
becomes a hairline at the very edge.

### Which player it follows

Whatever is actually playing, preferring a real player over `playerctld` —
that proxy mirrors the others and lags behind them, so following it is the
difference between a card that changes with the track and one that changes a
moment later. Omarchy's own media widget deprioritises it for the same reason,
and this follows the same rules so the bar and the card agree.

A card is drawn as soon as there is a title **or** an artist, rather than
waiting for both, for the same reason: some players publish one slightly
before the other.

If you always have two players running and the card keeps choosing the wrong
one, the **Player** setting names the one to follow — `spotify`, `firefox`,
`mpv`. It is matched against the player's own name and its bus name, and a
blank value goes back to following whatever is playing.

## Omate

The desktop pet, if you run Omate — its power switch, its skins, and its
dials, on one card instead of in a panel.

The card does not own anything about the pet. Every control writes through to
the Omate plugin's own settings, reached in-process, so the card and the pet's
own panel are two views of one state: flip the switch here and the panel's
status line changes with it. If Omate is not loaded the card says so and goes
inert rather than drawing controls that answer to nothing.

- **The switch** shows and hides the pet — the very power button from
  Omate's own panel (same component, same glyph), not the plugin's
  enable/disable.
- **The skin row** is every character pack Omate can see, each chip playing
  that pack's idle animation with the pet's own sprite component; a tap makes
  it the pet. The row flicks sideways when the packs do not fit, and the two
  arrows under it step one skin per click — the second widget here to scroll
  (the todo list was the first).
- **Roaming** is the same switch as the panel's: whether the pet wanders or
  stays where you put it.
- **Naps / chatter** are the two cadences in minutes, stepped with `−` and `+`
  rather than typed — the desktop layer never takes the keyboard. Same ranges
  the panel offers: 0–120 and 1–60.
- **Size** is the pet's scale, one to six. The slider commits when you let go,
  not per pixel; a drag across six sizes is not six writes to disk.
- **Chase cursor** is off, or one of four cadences — 10s, 1 min, 5 min,
  30 min — in the panel's own wording. A cooldown set over the IPC that has no
  chip of its own is spelled out beside the row rather than leaving it looking
  unset.

The pet's name is not set here — pets have names of their own, in their packs.
The **Owner name** field in the editor is yours, and it is what the pet calls
you. Nothing here leaves your machine, and nothing here talks to anything but
the Omate plugin.

## Photos

A picture of your own on the wallpaper. Point it at a file and that is the
card; point it at a folder and it shows what is in it, one at a time.

It is the only card here whose content is not a reading, and it is drawn to
say so: the picture fills the card edge to edge and takes the card's own
corners with it, rather than sitting inset inside a translucent pane. A
photograph in a frame inside a frame reads as a screenshot of a photograph.

### One picture, or a folder of them

There is one **Picture** setting and it holds one path, because the choice
between a photograph and a slideshow is a choice you already made when you
picked one. A path ending in an image extension is that picture. Anything else
is a folder, and the card walks the images in it.

Two buttons open the desktop's own file chooser — the same dialog every other
application on your machine opens, with your places and your recent folders
already in it:

- **Image…** picks one file, filtered to `jpg`, `jpeg`, `png`, `webp`, `gif`
  and `bmp`.
- **Folder…** picks a directory.

You can also just type or paste a path into the field, which is faster when
you already have one in a terminal. `~/` and a bare name resolve against your
home directory.

> [!NOTE]
> The editor closes while the chooser is up and opens again when you answer
> it. That is not politeness: the editor is a layer-shell overlay and every
> ordinary window is below it, so a dialog opened underneath would be one you
> could neither see nor click. The widget stays selected, so you come back to
> exactly the panel you left.

For a folder, **Change every** is how long each picture stays up — *Never*,
30 seconds, 5 minutes, 30 minutes or an hour — and **Shuffle** picks at random
instead of walking the folder in order. A shuffle never lands on the picture
already up: a change that changes nothing reads as a broken slideshow.

The folder is read once per directory however many cards share it, and re-read
every ten minutes so a photograph dropped in during a session turns up. Only
the top level is read, not the folders inside it, and a listing stops at 400
pictures. Nothing about any of this leaves your machine.

**Fit** is *Fill the card* — the picture is cropped to the card's shape, which
is what you want almost always — or *Whole picture*, which fits the whole
image inside the card and lets the card's translucent background show around
it.

**Caption** writes a line along the bottom of the picture, over a soft floor of
the card's own background colour so it stays legible over anything. Empty
draws nothing. It is also the name that tells two photo cards apart in the
bar popup and the editor's tray.

### Every size there is

This type offers seven footprints — `1 × 1`, `2 × 1`, `1 × 2`, `2 × 2`,
`3 × 2`, `2 × 3` and `3 × 3` — where every other widget offers two or three.

That is not this card ignoring the house rule, it is the rule's own test being
met: a size is worth offering when it is a genuinely different composition
rather than the same one stretched, and a different-shaped card is a different
*crop* of the photograph. A portrait in a `1 × 2` and the same portrait in a
`2 × 1` are two pictures.

The ones wider than your grid are simply not offered. Widen the grid with
**Columns** and they appear.

Pictures are decoded no larger than the card can show them, so a folder of
twenty-megapixel camera JPEGs costs the same as a folder of thumbnails.

## Config file

`~/.config/omarchy/widgets.json`, created with sensible defaults the first
time the plugin runs. It is watched: save it and the desktop updates. A file
that does not parse is left strictly alone — nothing is overwritten while you
are halfway through an edit — and the reason is logged.

```json
{
  "version": 2,
  "layout": {
    "side": "right",
    "columns": 2,
    "cellSize": 200,
    "gap": 16,
    "marginX": 40,
    "marginY": 40,
    "scale": 1,
    "opacity": 0.72
  },
  "widgets": [
    {
      "id": "blr",
      "type": "clock",
      "enabled": true,
      "monitor": "",
      "col": 0,
      "row": 0,
      "cols": 1,
      "rows": 1,
      "radius": 20,
      "settings": {
        "timezone": "Asia/Kolkata",
        "label": "",
        "format": "HH:mm",
        "ticks": true
      }
    }
  ]
}
```

Add a second entry with a different `id` to get a second widget — several
clocks in different timezones is the obvious one. Values out of range are
clamped rather than rejected and unknown keys are dropped, so a typo costs you
that key and not the file. Two widgets given the same cell are separated, with
the first one in the file keeping the cell it asked for.

A config written for the version before this one — which placed widgets by
anchor and pixel offsets — is migrated rather than discarded: labels,
timezones, colors and rounding all survive, and each widget is given a cell.

### The layout block

| Key | Meaning |
|---|---|
| `side` | `left` or `right`: the side a widget goes to when it has not named one of its own |
| `columns` | How many cells wide the grid is, 1–6 |
| `cellSize` | The side of one cell in px at scale 1 |
| `gap` | Space between cells |
| `marginX` | Distance from the edge named by `side` |
| `marginY` | Distance from the top of the usable desktop |
| `scale` | Multiplies cell and gap together, `0.25`–`2` (25–200%). Global only: every card follows it |
| `opacity` | How solid cards are over the wallpaper, `0`–`1`. Moving it applies to every card and clears the field below on each |

### Each widget

| Key | Meaning |
|---|---|
| `id` | Yours, and unique. The name the popup, the editor and the CLI use. Rename it and the widget is renamed everywhere |
| `type` | Which widget: `clock`, `weather`, `github`, `repo-pulse`, `calendar`, `todos`, `music` |
| `enabled` | Whether it is on the desktop. The popup switch writes this |
| `monitor` | Output name (`hyprctl monitors`), or `""` for all of them |
| `side` | `left` or `right`. Omit it (or write anything else) and it is filled in with the layout's own side when the file is read |
| `col` | Which column it starts in, counting from the grid's left |
| `row` | Which row it starts in, counting from the top |
| `cols` | How many columns it spans. Must be a size the type offers |
| `rows` | How many rows it spans. Must be a size the type offers |
| `opacity` | This card's own solidity, `0`–`1`. Omit it (or the **Opacity ↺** button) to follow the layout's `opacity`; the next grid-wide change re-applies over it |
| `radius` | Corner rounding in px, or `-1` to follow Hyprland's `decoration:rounding` |

`radius` defaults to `20` rather than to the theme, because a desktop card is
much larger than the bar chrome that value was chosen for, and a sharp theme
should not square off a 200px card unless you ask it to. Set `-1` if you want
the widget to match your windows exactly.

### Widget settings

#### Clock

| Key | Meaning |
|---|---|
| `timezone` | IANA name, e.g. `Asia/Kolkata`. `""` is your own clock |
| `label` | The small line above the time. `""` follows the timezone — `Asia/Kolkata` becomes `Kolkata` |
| `format` | Qt date/time format. `HH:mm`, `hh:mm AP`, `HH:mm:ss` |
| `ticks` | The ring of marks around the edge |

An unrecognized `timezone` shows `unknown zone` under the time rather than
quietly showing you the wrong hour, and one that is not a plain zoneinfo name
is refused outright.

#### Weather

| Key | Meaning |
|---|---|
| `units` | `celsius` or `fahrenheit` |
| `label` | Overrides the place name. `""` follows the report |
| `showRange` | Today's high and low |

#### GitHub

| Key | Meaning |
|---|---|
| `login` | GitHub username |
| `showLegend` | The week count and the Less–More scale |

#### Repo pulse

| Key | Meaning |
|---|---|
| `repo` | `owner/name` |
| `showStats` | The figures along the bottom |

#### Calendar

| Key | Meaning |
|---|---|
| `icsUrl` | The secret iCal address from Google Calendar's **Integrate calendar** panel. Only `calendar.google.com` addresses are fetched |
| `label` | The line across the top. `""` says today's date, and the tall card drops it |
| `format` | `24h` or `12h` |
| `showAllDay` | Whether all-day events appear at all |
| `showLocation` | Append the event's location to its line |

#### Todos

| Key | Meaning |
|---|---|
| `file` | Path to the list. `""` means `~/.config/omarchy/todos.txt`; `~/` and a bare name resolve against home. The editor offers **Choose…** for it |
| `title` | The name on the card. `""` uses the file's first `#` heading, then `Todo` |
| `showDone` | Whether finished items appear |
| `showProgress` | The hairline along the bottom |
| `canTick` | Whether clicking a ring marks the item done. Off makes the card read-only |

#### Music

| Key | Meaning |
|---|---|
| `showArt` | Album art |
| `showProgress` | The progress bar and times |
| `showSkip` | The back and forward buttons |
| `player` | The player to follow. `""` follows whatever is playing |

#### Photos

| Key | Meaning |
|---|---|
| `path` | An image file, or a folder of them. `~/` and a bare name resolve against home. A path that walks upwards is refused |
| `interval` | Seconds a picture stays up, as a string: `"0"` (never), `"30"`, `"300"`, `"1800"`, `"3600"`. Only read for a folder |
| `shuffle` | Pick at random rather than walking the folder in order |
| `fit` | `fill` crops to the card, `contain` fits the whole picture inside it |
| `label` | A caption along the bottom. `""` draws none |

## Command line

The shell owns the config file, so everything goes through it:

```bash
omarchy-shell widgets list          # the grid, and where every widget sits
omarchy-shell widgets json          # the whole config
omarchy-shell widgets enable blr
omarchy-shell widgets disable blr
omarchy-shell widgets toggle blr

omarchy-shell widgets move blr 1 2  # move to column 1, row 2
omarchy-shell widgets move blr 1 2 left   # ...on the left-hand grid
omarchy-shell widgets place blr 1 2 # same, but switch it on if it was off
omarchy-shell widgets size blr      # step to the next size the type offers
omarchy-shell widgets select blr    # what the editor's controls act on
omarchy-shell widgets set blr timezone Asia/Kolkata
omarchy-shell widgets set blr format 'hh:mm AP'
omarchy-shell widgets side left     # move everything to the left
omarchy-shell widgets side left blr # ...or just this one
omarchy-shell widgets add clock     # another one, at its defaults
omarchy-shell widgets duplicate blr # ...or a copy of one you configured
omarchy-shell widgets remove blr-2  # delete a spare and its settings
omarchy-shell widgets columns 4     # 1-6, whatever fits both grids
omarchy-shell widgets edit          # open the layout editor
omarchy-shell widgets done          # close it
omarchy-shell widgets weather       # the current reading
omarchy-shell widgets github        # the fetched graphs
omarchy-shell widgets repos         # the fetched repositories
omarchy-shell widgets calendar      # the next few events, per calendar
omarchy-shell widgets todos         # the list, as it was parsed
omarchy-shell widgets todo '' 3 true # tick line 3 of the only list off
omarchy-shell widgets reload        # re-read the file now

omarchy-shell shell toggle anishfn.widgets   # open the bar popup
```

`add` and `duplicate` answer with the id of the widget they made, so a script
can configure it in the next line. `move` and `place` take an optional side;
without one they stay on whichever grid the widget is already on.

`move` and `place` answer `ok` unless the cell is off the grid — a cell with
something in it is not a refusal, because the occupant moves. That is the same
judgement the editor's highlight makes; see [Dragging](#dragging).

`todo` takes the list's path (or `''` when only one list is on), the line
number as `widgets todos` prints it, and `true` or `false`. It answers `ok`,
or says the line is not a task or is already in that state. `set` answers with the
value that was actually stored, which is not always the one you sent: a
setting is coerced to the kind its widget declared, so a bad value comes back
as the default rather than being kept.

## Adding a widget type

The catalogue in [`Model.js`](Model.js) is the only place that knows what
widgets exist. Adding one is two steps:

1. Write `widgets/YourWidget.qml`. It is handed `service`, `instance` and
   `card`, and draws into the card it is given.
2. Add an entry to `catalog()` with its `type`, `name`, `description`, `icon`,
   `source`, the `sizes` it may take as `[cols, rows]` in cells, and a
   `settings` schema.

`settings` is a schema rather than a bag of defaults — each entry says how it
is edited (`text`, `boolean`, `choice`, `timezone`, `path`) and what it starts
as — so the editor builds a working settings panel for your widget without
knowing anything about it. Values are coerced to the kind you declared before
your QML sees them, so you never have to defend against a config file.

`icon` is one glyph from the theme's Nerd Font, and it is what makes the bar
popup and the editor's tray scannable once there are more than a handful of
widgets. `sizes` may list a footprint wider than the default grid; the editor
only offers the ones the user's grid can actually hold.

The bar popup, the editor, the grid and the config validation all read that
one list, so nothing else has to learn the new name. A type added by an update
arrives **switched off**, so upgrading never puts something on your desktop
you did not ask for.

[CONTRIBUTING.md](CONTRIBUTING.md) walks through it properly.

## Contributing

Widgets welcome — [CONTRIBUTING.md](CONTRIBUTING.md) is the how, and
[DESIGN.md](DESIGN.md) is the house style that keeps a hundred contributed
widgets looking like one set.

## How it behaves on the desktop

The desktop surface is layer-shell on `WlrLayer.Bottom` with an empty input
mask and `exclusiveZone: 0`. The editor is a second surface on
`WlrLayer.Overlay` that takes input and the keyboard, and the desktop one
stands down while it is up. In practice:

- widgets are painted over the wallpaper and under every window
- they never take focus, never take a click, and never appear in a switcher
- they do not push your windows around
- they sit inside the space the bar left, so the top row lines up under it
- arranging them happens on the editor's surface, never on theirs

## Development

```bash
node --test tests/          # config, placement and clock math
omarchy plugin validate .   # manifest against the Omarchy schema
dev/preview                 # draw the widgets without the shell (Ctrl-C to stop)
dev/preview --edit          # ...with the layout editor already open
```

`dev/preview` exists because the shell's hot-reload only goes so far: the
plugin registry notices a changed file, but it does not re-instantiate a
panel already mounted with `keepLoaded`, so a code change in the desktop
surface is not visible until `omarchy-restart-shell`. The preview runs a
second Quickshell containing nothing but this plugin's service and surface,
against the same config file, so a widget you are working on appears in
seconds. The bar popup is not part of it — that needs a real bar.

The tests also parse every QML file and check for the two mistakes the QML
engine reports as a plugin that silently fails to appear: a handler set twice
on one object, and a hand-written signal colliding with a property's
generated `<name>Changed`.

[`Model.js`](Model.js) holds every piece of logic that does not need Qt —
the catalogue, config normalization, the grid, and the timezone arithmetic —
which is what lets the test suite run it under plain node.

The drag is in there too, which is the point of it being there. A drag is only
two things that can be wrong: which cell a card at some pixel position is
over, and whether it may land there. Both come out of `dropTarget`, so both
are tested against real pixel coordinates rather than needing a pointer. One
of those tests walks every widget over every cell and asserts that what the
editor's highlight *says* is legal is exactly what the config *does* — the
highlight cannot lie about a drop that would then be refused.

### Why timezones go through `date`

The QML JavaScript engine has no `Intl`, and it accepts the `timeZone` option
on `toLocaleString` and then ignores it — every zone renders as local time,
with no error. So zone offsets are resolved by `date` against the zoneinfo
database, refreshed every fifteen minutes, and applied here as arithmetic.
Zone names are matched against a strict pattern before they reach a command
line, and the lookup names the zoneinfo file directly instead of letting the
C library search for it.

## License

MIT. See [LICENSE](LICENSE).
