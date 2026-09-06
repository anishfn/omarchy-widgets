import QtQuick
import Quickshell
import qs.Commons
import "../Model.js" as Model

// Today, and tomorrow's first line.
//
// The card is a dashboard for the day it is standing in rather than an
// agenda for the week: one big time against the next thing, and under it a
// line of how far the day has got. A grid of squares on a wallpaper tells
// you that Thursday is busy; it does not tell you what you are late for.
//
// The hierarchy, top to bottom, is always the same:
//
//   the label     -- which calendar, small and uppercased, at the head
//   the time      -- what starts, big enough to read across a room
//   the countdown -- how long you have, tucked into the same line
//   the title     -- what it actually is, directly under the time
//   the timeline  -- today as a thin line, the event as a block on it
//   the foot      -- when it ends, and what is left
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
  // One grid cell, whatever footprint the card is wearing. Text sizes climb
  // from it rather than from the card's own short axis -- which for a card
  // one cell tall is the same thing -- so a taller card spends the extra
  // area on what the lower rows have room to say, not on letters twice the
  // size.
  readonly property int spanCols: instance && instance.cols > 0 ? instance.cols : 1
  readonly property int spanRows: instance && instance.rows > 0 ? instance.rows : 1
  readonly property real unit: Math.min(width / spanCols, height / spanRows)

  readonly property real pad: Math.round(unit * 0.11)
  readonly property real gap: Math.round(unit * 0.04)
  readonly property real stackSpacing: Math.round(unit * 0.05)
  readonly property real smallSize: Math.max(8, Math.round(unit * 0.068))
  readonly property real timeSize: Math.max(18, Math.round(unit * 0.24))
  readonly property real titleSize: Math.max(10, Math.round(unit * 0.085))

  // The timeline: a hairline the whole day long, and the event as a stub of
  // accent standing on it. Both are rectangles with the smallest rounding,
  // because a pill on the line reads as a gauge and this is a schedule.
  readonly property real trackH: Math.max(2, Math.round(unit * 0.024))
  readonly property real blockH: Math.max(5, Math.round(trackH * 2.2))
  readonly property real minBlockW: Math.max(6, Math.round(trackH * 2.6))

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

  // Minutes, because that is the finest thing on the card: a countdown
  // reading "in 24m" has nothing to say sixty times a second.
  property date now: clock.date
  readonly property real nowMs: now.getTime()

  SystemClock {
    id: clock
    precision: SystemClock.Minutes
    onDateChanged: root.now = date
  }

  // Today's agenda, and the one further fact the card keeps: tomorrow's
  // earliest, in the smallest type at the foot. Everything else on the card
  // answers only for today, and that line is what becomes "today's event"
  // when the calendar turns over.
  readonly property var events: ready
    ? Model.todayEvents(calendar.events, nowMs, 12, showAllDay) : []
  readonly property var nextEvent: events.length > 0 ? events[0] : null
  readonly property var tomorrowEvent: ready
    ? Model.nextDayEvent(calendar.events, nowMs, 1, showAllDay) : null

  readonly property string modLabel: String(settings.label || "").toUpperCase()

  readonly property string tomorrowText: {
    var ev = root.tomorrowEvent
    if (!ev) return ""
    var when = Model.eventTimeLabel(ev, root.twelveHour)
    return when === "all day"
      ? "Tomorrow · " + root.rowTitle(ev)
      : "Tomorrow · " + when + " · " + root.rowTitle(ev)
  }

  // Where the next event sits across today's timeline, as fractions of the
  // day: its start and its span. Clamped to this day, so a meeting that
  // began last night or runs past midnight still reads as the part of it
  // that is today's, and an all-day event owns the whole line.
  readonly property real evStartMs: {
    var ev = root.nextEvent
    if (!ev) return 0
    return Math.max(Number(ev.start), Model.startOfDay(root.nowMs))
  }
  readonly property real evEndMs: {
    var ev = root.nextEvent
    if (!ev) return 0
    var end = ev.end > ev.start ? Number(ev.end) : Number(ev.start) + 60000
    return Math.min(end, Model.startOfDay(root.nowMs) + Model.DAY_MS)
  }
  readonly property real evOffset: root.evEndMs > root.evStartMs
    ? (root.evStartMs - Model.startOfDay(root.nowMs)) / Model.DAY_MS : 0
  readonly property real evSpan: root.evEndMs > root.evStartMs
    ? (root.evEndMs - root.evStartMs) / Model.DAY_MS : 0

  // The two facts the foot earns: when the current event ends, and how much
  // of today is left after it. Nothing about which calendar this is or what
  // it is called -- the head of the card has already said all of that once.
  readonly property string footEnd: {
    var ev = root.nextEvent
    if (!ev) return ""
    if (ev.allDay) return "All day"
    return "Ends in " + Model.clockLabel(ev.end)
  }
  readonly property string footLeft: {
    var n = root.events.length
    if (n <= 0) return ""
    return n === 1 ? "1 event left" : n + " events left"
  }

  // What the card says when it has nothing to show, and why. "No address"
  // and "nothing on" want different things done about them.
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

  Item {
    id: hero
    anchors.fill: parent
    visible: !root.empty

    // ------------------------------------------- label, time, then title
    // The head of the card reads top to bottom: which calendar this event
    // belongs to first, then the time it starts with the wait beside it,
    // then what it actually is. Each line in its own space, stacked by the
    // column on its real rendered height, so nothing threads on top of the
    // next.
    Column {
      id: topStack
      x: root.pad
      y: root.pad 
      width: Math.max(0, parent.width - root.pad * 2)
      spacing: root.stackSpacing

      Text {
        id: labelText
        visible: root.modLabel !== ""
        text: root.modLabel
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: root.smallSize
        font.letterSpacing: Math.max(0, Math.round(root.smallSize * 0.1))
        renderType: Text.NativeRendering
      }

      Item {
        id: topRow
        width: parent.width
        height: timeText.implicitHeight

        Text {
          id: countdown
          anchors.right: topRow.right
          anchors.baseline: timeText.baseline
          width: Math.min(implicitWidth, topRow.width * 0.5)
          text: root.nextEvent ? Model.eventUntilLabel(root.nextEvent, root.nowMs) : ""
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: root.smallSize
          horizontalAlignment: Text.AlignRight
          elide: Text.ElideRight
          renderType: Text.NativeRendering
        }

        Text {
          id: timeText
          anchors.left: topRow.left
          anchors.right: countdown.left
          anchors.rightMargin: root.gap
          text: {
            var ev = root.nextEvent
            if (!ev) return ""
            return ev.allDay ? "All day" : Model.clockLabel(ev.start, root.twelveHour)
          }
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: root.timeSize
          font.weight: Font.Bold
          elide: Text.ElideRight
          renderType: Text.NativeRendering
        }
      }

      Text {
        id: titleText
        width: Math.max(0, parent.width)
        text: root.nextEvent ? root.rowTitle(root.nextEvent) : ""
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: root.titleSize
        font.weight: Font.Bold
        wrapMode: Text.Wrap
        maximumLineCount: 2
        elide: Text.ElideRight
        renderType: Text.NativeRendering
      }
    }

    // --------------------------------------------- timeline, then the foot
    // The schedule line and its footnote are moored to the bottom of the
    // card, so the head and the line only meet through empty space: on a
    // short card they sit close, on a tall one the middle breathes.
    Column {
      id: bottomStack
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.leftMargin: root.pad
      anchors.rightMargin: root.pad
      anchors.bottom: parent.bottom
      anchors.bottomMargin: root.pad
      spacing: root.gap

      // The whole day as a thin line, and the event as a small accent block
      // standing on it where the schedule puts it. The line stays visible on
      // both sides of the block, so it reads as a calendar and not a gauge.
      Item {
        id: timeline
        width: parent.width
        height: root.blockH

        Rectangle {
          y: (parent.height - root.trackH) / 2
          width: parent.width
          height: root.trackH
          radius: Math.max(1, Math.round(root.trackH / 2))
          color: Util.alpha(Color.foreground, 0.15)
        }

        Rectangle {
          id: evBlock
          y: (parent.height - height) / 2
          x: Math.max(0, Math.min(parent.width - width,
            root.evOffset * parent.width))
          width: Math.max(root.minBlockW,
            Math.min(parent.width * root.evSpan, parent.width))
          height: root.blockH
          radius: 2
          color: root.accent
        }
      }

      // The foot only reports what the rest of the card has not said
      // already: when it ends, and how many more are waiting.
      Item {
        id: footRow
        width: parent.width
        height: Math.max(footEnd.implicitHeight, footCount.implicitHeight)

        Text {
          id: footEnd
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          text: root.footEnd
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: root.smallSize
          elide: Text.ElideRight
          renderType: Text.NativeRendering
        }

        Text {
          id: footCount
          anchors.right: parent.right
          anchors.baseline: footEnd.baseline
          text: root.footLeft
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: root.smallSize
          elide: Text.ElideRight
          renderType: Text.NativeRendering
        }
      }
    }
  }

  // -------------------------------------------------------------- the morrow
  //
  // The one future fact the card keeps, in the smallest type at the foot.
  // Kept out of the hero so a day with nothing on still says what is coming.
  Text {
    id: tomorrowLine
    visible: root.tomorrowEvent !== null
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.leftMargin: root.pad
    anchors.rightMargin: root.pad
    y: root.empty
      ? parent.height - height - root.pad
      : footRow.y + footRow.height + Math.round(root.unit * 0.035)
    text: root.tomorrowText
    textFormat: Text.PlainText
    color: root.faint
    font.family: root.fontFamily
    font.pixelSize: root.smallSize
    elide: Text.ElideRight
    renderType: Text.NativeRendering
  }

  // Where an event is, folded into its own line rather than given a column
  // of its own: a room name is worth a few words when it is there and
  // nothing at all when it is not, which is exactly what a column cannot
  // express.
  function rowTitle(event) {
    if (!event) return ""
    if (!root.showLocation || !event.location) return event.summary
    return event.summary + "  ·  " + event.location
  }
}