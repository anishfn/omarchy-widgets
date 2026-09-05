import QtQuick
import Quickshell
import qs.Commons
import "../Model.js" as Model

// What is next in your calendar, and when.
//
// The card is a list of times against sentences, which is what a calendar is
// once you take the week grid away. A grid of squares on a wallpaper tells you
// that Thursday is busy; it does not tell you what you are late for.
//
// Three sizes, three compositions rather than one stretched:
//
//   1x1   the next thing, on its own, big enough to read across a room
//   2x1   a couple of rows -- time, what it is, how far off
//   2x2   the agenda, broken by day, as far ahead as the card holds
Item {
  id: root

  // Injected by Surface.qml.
  property var service: null
  property var instance: null
  property var card: null
  readonly property var settings: instance && instance.settings ? instance.settings : ({})

  readonly property color foreground: Color.foreground
  readonly property color accent: Color.accent
  readonly property color dim: Util.alpha(Color.foreground, 0.55)
  readonly property color faint: Util.alpha(Color.foreground, 0.3)
  readonly property string fontFamily: Style.font.family

  // ------------------------------------------------------------- the scale
  //
  // One grid cell, whatever footprint the card is wearing -- not the card's
  // own short axis, which is what every other widget here uses.
  //
  // The difference only shows up on a size taller than one row, and it is the
  // whole point of offering one: a card given a second row should hold twice
  // as much agenda, not the same agenda in letters twice the size. Sizing
  // from the cell keeps the type identical at 1x1, 2x1 and 2x2 and spends the
  // extra area on rows, which is what the reader wanted the bigger card for.
  readonly property int spanCols: instance && instance.cols > 0 ? instance.cols : 1
  readonly property int spanRows: instance && instance.rows > 0 ? instance.rows : 1
  readonly property real unit: Math.min(width / spanCols, height / spanRows)

  readonly property real pad: Math.round(unit * 0.11)
  readonly property real smallSize: Math.max(8, Math.round(unit * 0.068))
  readonly property real bodySize: Math.max(9, Math.round(unit * 0.083))
  readonly property real bigSize: Math.max(11, Math.round(unit * 0.115))
  readonly property real rowHeight: Math.round(unit * 0.175)
  readonly property real dayHeight: Math.round(unit * 0.16)

  // The rectangle the list gets, worked out from the type rather than from
  // the things drawn in it. Measuring the header instead would make the row
  // count depend on a label that is itself inside the header, which is a
  // binding that chases its own tail.
  readonly property real headerHeight: Math.round(smallSize * 1.5)

  // The tall card dates every group it draws, so a date across the top would
  // be the card saying "Today" twice. It keeps the line only when there is a
  // label on it, which is the one thing the day headings cannot say.
  readonly property bool showHeader: !tall || String(settings.label || "") !== ""
  readonly property real listTop: pad + (showHeader ? headerHeight + Math.round(unit * 0.05) : 0)
  readonly property real listHeight: Math.max(0, height - pad - listTop)

  // A card is "wide" once it has more than one column, and "tall" once it has
  // more than one row. Measured off the rectangle rather than the config so
  // the editor's drag preview is the same drawing as the desktop.
  readonly property bool wide: width > unit * 1.4
  readonly property bool tall: height > unit * 1.4

  // --------------------------------------------------------------- the data

  readonly property string icsUrl: String(settings.icsUrl || "")
  readonly property bool configured: Model.isSafeIcsUrl(icsUrl)
  readonly property bool twelveHour: String(settings.format || "24h") === "12h"
  readonly property bool showAllDay: settings.showAllDay !== false
  readonly property bool showLocation: settings.showLocation === true

  readonly property var calendar: service && service.calendars && configured
    ? service.calendars[icsUrl] : null
  readonly property string error: service ? String(service.calendarError || "") : ""
  readonly property bool ready: calendar !== null && calendar !== undefined

  // Minutes, because that is the finest thing on the card: a countdown reading
  // "in 24m" has nothing to say sixty times a second.
  property date now: clock.date
  readonly property real nowMs: now.getTime()

  SystemClock {
    id: clock
    precision: SystemClock.Minutes
    onDateChanged: root.now = date
  }

  // How many rows there is actually room for, rather than a number picked to
  // suit one cell size. The tall card gets what it can hold; the wide one
  // usually gets three.
  readonly property int capacity: Math.max(1, Math.min(8, Math.floor(listHeight / rowHeight)))

  readonly property var events: ready
    ? Model.upcomingEvents(calendar.events, nowMs, capacity, showAllDay) : []
  readonly property var nextEvent: events.length > 0 ? events[0] : null

  // The list, flattened. The tall card breaks it by day, because a column of
  // times with no dates against it is a column you have to date yourself; the
  // wide card has room for two or three rows and says the day in the margin
  // instead.
  readonly property var entries: {
    var out = []
    var i
    if (!tall) {
      // Two or three rows, so the day goes in the margin rather than into a
      // heading of its own -- and only where it changes. Every other row
      // spends that width on the sentence instead, which is the part you
      // cannot guess.
      for (i = 0; i < events.length; i++) {
        var note = ""
        if (i === 0) note = Model.eventUntilLabel(events[i], nowMs)
        else if (Model.startOfDay(events[i].start) !== Model.startOfDay(events[i - 1].start))
          note = Model.dayHeading(events[i].start, nowMs)
        // Flagged here rather than compared by identity in the delegate: what
        // reaches `modelData` is a copy, and `===` against the original would
        // be false on every row.
        out.push({ day: "", event: events[i], next: i === 0, note: note })
      }
      return out
    }

    var groups = Model.groupEventsByDay(events, nowMs)
    var seen = 0
    for (var g = 0; g < groups.length; g++) {
      out.push({ day: groups[g].heading, event: null, next: false, note: "" })
      for (var e = 0; e < groups[g].events.length; e++) {
        out.push({ day: "", event: groups[g].events[e], next: seen === 0, note: "" })
        seen++
      }
    }

    // The headings take room the row count knew nothing about, so the tail is
    // trimmed here rather than drawn past the bottom of the card. A day left
    // with no events under it goes with them: a heading on its own is a
    // promise the card cannot keep.
    var used = 0
    for (i = 0; i < out.length; i++) {
      used += out[i].day === "" ? rowHeight : dayHeight
      if (used > listHeight) { out = out.slice(0, i); break }
    }
    while (out.length > 0 && out[out.length - 1].day !== "") out.pop()
    return out
  }

  // What the card says when it has nothing to show, and why. "No address" and
  // "nothing on" want different things done about them.
  readonly property string emptyText: {
    if (!configured) return icsUrl === "" ? "Add your calendar" : "That is not an iCal address"
    if (!ready) return error === "unavailable" ? "Calendar unavailable" : "Loading…"
    return "Nothing scheduled"
  }

  readonly property bool empty: events.length === 0

  // ---------------------------------------------------------------- paint

  Text {
    anchors.centerIn: parent
    width: parent.width - root.pad * 2
    visible: root.empty
    horizontalAlignment: Text.AlignHCenter
    wrapMode: Text.Wrap
    textFormat: Text.PlainText
    text: root.emptyText
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: root.smallSize
    renderType: Text.NativeRendering
  }

  // The header: what the user called this calendar, or simply what day it is.
  // Kept out of the empty branch so the card still says something while it
  // waits, rather than going blank between a restart and the first fetch.
  Item {
    id: headerRow
    x: root.pad
    y: root.pad
    width: Math.max(0, parent.width - root.pad * 2)
    // Measured off the type rather than off the text in it: the row's height
    // feeds the row count, the row count feeds the "n ahead" label, and that
    // label is inside this row. Sizing from the font keeps that a line rather
    // than a circle.
    height: root.headerHeight
    visible: !root.empty && root.showHeader

    Text {
      id: headerText
      anchors.verticalCenter: parent.verticalCenter
      anchors.left: parent.left
      anchors.right: countText.left
      anchors.rightMargin: Math.round(root.unit * 0.04)
      textFormat: Text.PlainText
      text: root.settings.label ? String(root.settings.label) : Model.todayHeading(root.nowMs)
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    // How much is left, opposite the header. Only where there is width for it
    // to be a second thing on the line rather than a competitor to the first.
    Text {
      id: countText
      anchors.right: parent.right
      anchors.baseline: headerText.baseline
      // Only where the list is not already showing you the answer: on the
      // tall card every one of them is on screen, and counting them out loud
      // is the card talking about itself.
      visible: root.wide && !root.tall && root.events.length > 1
      textFormat: Text.PlainText
      text: root.events.length + " ahead"
      color: root.faint
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      renderType: Text.NativeRendering
    }
  }

  // ------------------------------------------------------------ the square
  //
  // One event, and the three things you want about it: what it is, when it
  // starts, and how long you have. Anchored to the bottom so the header stays
  // where it is however many lines the title takes.

  Column {
    id: squareBody
    visible: !root.empty && !root.wide
    x: root.pad
    width: Math.max(0, parent.width - root.pad * 2)
    y: Math.max(headerRow.y + headerRow.height + Math.round(root.unit * 0.06),
      parent.height - root.pad - height)
    spacing: Math.round(root.unit * 0.035)

    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: root.nextEvent ? root.nextEvent.summary : ""
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: root.bigSize
      font.weight: Font.Light
      wrapMode: Text.Wrap
      maximumLineCount: 2
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    Row {
      width: parent.width
      spacing: Math.round(root.unit * 0.04)

      Text {
        textFormat: Text.PlainText
        text: root.nextEvent ? Model.eventTimeLabel(root.nextEvent, root.twelveHour) : ""
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: root.smallSize
        renderType: Text.NativeRendering
      }

      // The one accent on the card: how long you have is the only thing here
      // you could not have worked out from the clock beside it.
      Text {
        textFormat: Text.PlainText
        text: root.nextEvent ? Model.eventUntilLabel(root.nextEvent, root.nowMs) : ""
        color: root.accent
        font.family: root.fontFamily
        font.pixelSize: root.smallSize
        renderType: Text.NativeRendering
      }
    }
  }

  // -------------------------------------------------------------- the list
  //
  // Rows of time against sentence. The next one carries a short accent rule
  // in the margin, which is the whole of the card's emphasis: everything
  // below it is simply what comes after.

  Item {
    id: list
    visible: !root.empty && root.wide
    x: root.pad
    y: root.listTop
    width: Math.max(0, parent.width - root.pad * 2)
    // Explicit, and clipping: a Column grows to whatever is inside it, so a
    // row too many would be drawn past the bottom of the card rather than
    // cut off by it. The trimming above is what keeps that from happening;
    // this is what makes a mistake in it visible as a cut row instead of as
    // text floating on the wallpaper.
    height: root.listHeight
    clip: true

    Column {
      id: listColumn
      width: parent.width

      Repeater {
        model: root.entries

        delegate: Item {
          id: row
          required property var modelData
          readonly property bool isDay: modelData.day !== ""
          readonly property bool isNext: !isDay && modelData.next === true

          width: listColumn.width
          height: isDay ? root.dayHeight : root.rowHeight

          // A day heading, on the tall card only.
          Text {
            anchors.left: parent.left
            anchors.bottom: parent.bottom
            anchors.bottomMargin: Math.round(root.unit * 0.02)
            visible: row.isDay
            textFormat: Text.PlainText
            text: row.modelData.day
            color: root.faint
            font.family: root.fontFamily
            font.pixelSize: root.smallSize
            renderType: Text.NativeRendering
          }

          // The next thing, marked. A rule rather than a dot: it sits in the
          // margin the times are already ragged against, so it points at the
          // row without adding a column.
          Rectangle {
            id: marker
            visible: row.isNext
            x: 0
            anchors.verticalCenter: timeText.verticalCenter
            width: Math.max(2, Math.round(root.unit * 0.014))
            height: Math.round(root.rowHeight * 0.5)
            radius: width / 2
            color: root.accent
          }

          Text {
            id: timeText
            visible: !row.isDay
            x: Math.round(root.unit * 0.05)
            y: Math.round((parent.height - implicitHeight) / 2)
            width: Math.round(root.unit * 0.36)
            textFormat: Text.PlainText
            text: row.isDay ? "" : Model.eventTimeLabel(row.modelData.event, root.twelveHour)
            color: row.isNext ? root.foreground : root.dim
            font.family: root.fontFamily
            font.pixelSize: root.bodySize
            elide: Text.ElideRight
            renderType: Text.NativeRendering
          }

          Text {
            id: titleText
            visible: !row.isDay
            anchors.left: timeText.right
            anchors.leftMargin: Math.round(root.unit * 0.05)
            anchors.right: untilText.left
            anchors.rightMargin: Math.round(root.unit * 0.05)
            anchors.baseline: timeText.baseline
            textFormat: Text.PlainText
            text: row.isDay ? "" : root.rowTitle(row.modelData.event)
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: root.bodySize
            elide: Text.ElideRight
            renderType: Text.NativeRendering
          }

          // How far off, or which day it moved to, in the right margin. Faint on
          // every row: the accent is already spent on the marker, and two of
          // them would leave the eye with no instruction about where to land.
          Text {
            id: untilText
            visible: !row.isDay
            anchors.right: parent.right
            anchors.baseline: timeText.baseline
            textFormat: Text.PlainText
            text: row.isDay ? "" : String(row.modelData.note || "")
            color: root.faint
            font.family: root.fontFamily
            font.pixelSize: root.smallSize
            renderType: Text.NativeRendering
          }
        }
      }
    }
  }

  // Where an event is, folded into its own line rather than given a column of
  // its own: a room name is worth a few words when it is there and nothing at
  // all when it is not, which is exactly what a column cannot express.
  function rowTitle(event) {
    if (!event) return ""
    if (!root.showLocation || !event.location) return event.summary
    return event.summary + "  ·  " + event.location
  }
}
