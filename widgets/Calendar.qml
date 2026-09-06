import QtQuick
import Quickshell
import qs.Commons
import "../Model.js" as Model

// The calendar card: what is happening today, when, how much is left, and
// where on the day it falls.
//
// One hour laid over a day. The time is the headline — hard left, big, in
// light weight like every other headline in the set — and the countdown that
// faces it is the one accent detail, coloured like the block below it so the
// eye lands on it twice: once for "when" and once for "where". The day is
// the pale line under both, with the event drawn as a block along it and a
// dot that rides with the clock.
//
// Every type size is a fraction of a card rather than fixed points, so a
// widget scaled up in the config stays the same drawing at a different size.
// The timeline bar sits low on the card, where a line against a legible gap
// reads as a horizon rather than as a headline of its own.
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
  // One grid cell, whatever footprint the card is wearing, so a calendar
  // given a second column gets more room rather than bigger letters.
  readonly property int spanCols: instance && instance.cols > 0 ? instance.cols : 1
  readonly property int spanRows: instance && instance.rows > 0 ? instance.rows : 1
  readonly property real unit: Math.min(width / spanCols, height / spanRows)

  readonly property real pad: Math.round(unit * 0.11)
  readonly property real gap: Math.round(unit * 0.04)
  readonly property real stackSpacing: Math.round(unit * 0.05)

  readonly property real smallSize: Math.max(8, Math.round(unit * 0.068))
  readonly property real timeSize: Math.max(18, Math.round(unit * 0.24))
  readonly property real titleSize: Math.max(10, Math.round(unit * 0.085))

  // The timeline's own scale. The block is a few times the hairline so the
  // event reads as a shape against the day rather than as a second rule.
  readonly property real trackH: Math.max(2, Math.round(unit * 0.024))
  readonly property real blockH: Math.max(5, Math.round(trackH * 2.2))
  readonly property real minBlockW: Math.max(6, Math.round(trackH * 2.6))

  // How far the whole timeline sits from the top of its slot. The slot is a
  // fixed height that never grows with this number, so moving the bar down
  // does not push the column that holds it down too.
  readonly property real timelineOffset: 14

  // --------------------------------------------------------------- the data

  readonly property string icsUrl: String(settings.icsUrl || "")
  readonly property bool configured: Model.isSafeIcsUrl(icsUrl)
  readonly property bool showAllDay: settings.showAllDay !== false
  readonly property bool showLocation: settings.showLocation === true

  // The clock's own language for a time of day. The calendar reads the same
  // `format` setting the clock card does — "HH:mm", "hh:mm ap", whatever the
  // clock card would take — and the two words the settings panel has always
  // offered still work.
  readonly property string timeFormat: {
    var f = String(settings.format || "HH:mm")
    if (f === "24h") return "HH:mm"
    if (f === "12h") return "hh:mm ap"
    return f
  }

  readonly property var calendar: service && service.calendars && configured
    ? service.calendars[icsUrl] : null
  readonly property string error: service ? String(service.calendarError || "") : ""
  readonly property bool ready: calendar !== null && calendar !== undefined

  property date now: clock.date
  readonly property real nowMs: now.getTime()

  SystemClock {
    id: clock
    precision: SystemClock.Minutes
    onDateChanged: root.now = date
  }

  // Everything today still has to give, until the end of the day. The events
  // are the hero's; the first of them is what the card says it is about.
  readonly property var events: ready
    ? Model.todayEvents(calendar.events, nowMs, 12, showAllDay) : []
  readonly property var nextEvent: events.length > 0 ? events[0] : null

  // The event for the line under the card: the first thing on any later day,
  // never today's own card. "Later" means a later place in the calender, not
  // a later hour — an event still running from yesterday is today's problem,
  // not the line's.
  readonly property var nextLineEvent: {
    if (!ready) return null
    var list = Model.upcomingEvents(calendar.events, root.nowMs, 8, showAllDay)
    var today = Model.startOfDay(root.nowMs)
    for (var i = 0; i < list.length; i++)
      if (Model.startOfDay(list[i].start) > today) return list[i]
    return null
  }

  readonly property string modLabel: String(settings.label || "").toUpperCase()

  // The event's window on this day, clamped to midnight so an event that
  // spills over still draws its slice here rather than a full-day bar.
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

  // Where the clock is on the same day, for the dot that rides the bar
  // toward the block.
  readonly property real nowOffset: {
    var frac = (root.nowMs - Model.startOfDay(root.nowMs)) / Model.DAY_MS
    return Math.max(0, Math.min(1, frac))
  }

  // The one line under the card. The next event on a later day, in the
  // words the set already uses for distance — "Tomorrow", "In 2 days" — or
  // the flat truth when nothing is coming, or nothing at all when today's
  // card already says everything there is to say.
  readonly property string bottomText: {
    var line = root.nextLineEvent
    if (line) return root.dayLine(line)
    if (!root.ready) return ""
    var upcoming = Model.upcomingEvents(calendar.events, root.nowMs, 1, showAllDay)
    return upcoming.length === 0 ? "NO UPCOMING EVENTS" : ""
  }

  // Which nothing the empty card is saying: unset, unreachable, still
  // loading, or genuinely a clear day.
  readonly property string emptyText: {
    if (!configured) return icsUrl === "" ? "Add your calendar" : "That is not an iCal address"
    if (!ready) return error === "unavailable" ? "Calendar unavailable" : "Loading…"
    return "Nothing scheduled"
  }

  readonly property bool empty: events.length === 0

  // ---------------------------------------------------------------- paint

  // A clear day. The label at the top exactly where the card's own label
  // sits, then a vertical bar in the timeline's orange standing beside the
  // message — the same colour the block would have been, so an empty card
  // still has one piece of the accent it is missing.
  Column {
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.leftMargin: root.pad
    anchors.rightMargin: root.pad
    anchors.top: parent.top
    anchors.topMargin: root.pad
    visible: root.empty
    spacing: root.gap

    Text {
      visible: root.modLabel !== ""
      text: root.modLabel
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      font.letterSpacing: Math.max(0, Math.round(root.smallSize * 0.1))
      renderType: Text.NativeRendering
    }

    Row {
      width: parent.width
      spacing: root.gap
      // A couple of pixels below the label's own line, so the bar and its
      // message read as belonging to each other rather than to the heading.
      transform: Translate { y: 4 }

      Rectangle {
        id: emptyBar
        anchors.verticalCenter: parent.verticalCenter
        width: Math.max(5, Math.round(root.unit * 0.045))
        height: Math.max(14, Math.round(root.unit * 0.14))
        radius: Math.round(width / 2)
        color: root.accent
      }

      Text {
        width: parent.width - emptyBar.width - root.gap
        horizontalAlignment: Text.AlignLeft
        wrapMode: Text.Wrap
        textFormat: Text.PlainText
        text: root.emptyText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Math.max(12, Math.round(root.unit * 0.13))
        font.weight: Font.Bold
        renderType: Text.NativeRendering
      }
    }
  }

  // Today, when there is a today.
  Item {
    id: hero
    anchors.fill: parent
    visible: !root.empty

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
        // A hair above the label's baseline: the headline leads, the label
        // is furniture.
        transform: Translate { y: -4 }

        Text {
          id: countdown
          anchors.left: timeText.right
          anchors.leftMargin: root.gap * 2
          anchors.baseline: timeText.baseline
          width: Math.max(0, Math.min(implicitWidth,
            topRow.width - timeText.width - root.gap * 2))
          text: root.nextEvent
            ? Model.eventUntilLabel(root.nextEvent, root.nowMs) : ""
          // The one accent detail in the pair: it is "how long until", and
          // it shares the orange of the block it belongs to.
          color: root.accent
          font.family: root.fontFamily
          font.pixelSize: Math.round(root.smallSize * 1.5)
          horizontalAlignment: Text.AlignLeft
          elide: Text.ElideRight
          renderType: Text.NativeRendering
        }

        Text {
          id: timeText
          anchors.left: topRow.left
          text: {
            var ev = root.nextEvent
            if (!ev) return ""
            return ev.allDay ? "All day"
              : Qt.formatDateTime(new Date(Number(ev.start)), root.timeFormat)
          }
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: root.timeSize
          font.weight: Font.Bold
          renderType: Text.NativeRendering
        }
      }

      Text {
        id: titleText
        transform: Translate { y: -8 }
        width: parent.width
        text: root.nextEvent ? root.rowTitle(root.nextEvent) : ""
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: root.titleSize
        font.weight: Font.Bold
        wrapMode: Text.Wrap
        maximumLineCount: 2
        renderType: Text.NativeRendering
      }
    }

    Column {
      id: bottomStack
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.leftMargin: root.pad
      anchors.rightMargin: root.pad
      anchors.bottom: parent.bottom
      // Lifted off the floor by the bottom line whenever one is drawn, so
      // the timeline and the line never sit on top of each other.
      anchors.bottomMargin: root.pad
        + (bottomLine.visible ? bottomLine.height + root.gap : 0)
      spacing: root.gap

      Item {
        id: timeline
        width: parent.width
        // A fixed slot, deliberately, not one that grows with the offset:
        // the bar moves *inside* the column instead of the column growing to
        // follow it.
        height: root.blockH + Math.max(Math.round(root.unit * 0.06), 12)

        Rectangle {
          // The day, as a hairline the block sits on.
          y: root.timelineOffset + (root.blockH - root.trackH) / 2
          width: parent.width
          height: root.trackH
          radius: Math.max(1, Math.round(root.trackH / 2))
          color: Util.alpha(Color.foreground, 0.15)
        }

        Rectangle {
          id: evBlock
          // The event: where it starts and how long it lasts. Shares the
          // timeline's offset so the two move together.
          y: root.timelineOffset + (root.blockH - height) / 2
          x: Math.max(0, Math.min(parent.width - width,
            root.evOffset * parent.width))
          width: Math.max(root.minBlockW,
            Math.min(parent.width * root.evSpan, parent.width))
          height: root.blockH
          radius: 2
          color: root.accent
        }

        Rectangle {
          id: nowDot
          // The clock, as a dot already on the bar: how far through the day
          // it is, riding toward the block it is counting down to.
          x: Math.max(0, Math.min(parent.width - width,
            root.nowOffset * parent.width))
          y: root.timelineOffset + (root.blockH - root.trackH) / 2
            + (root.trackH - height) / 2
          width: Math.max(4, Math.round(root.trackH * 1.8))
          height: width
          radius: height / 2
          color: root.accent
        }
      }
    }
  }

  Text {
    id: bottomLine
    visible: root.bottomText !== ""
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.bottom: parent.bottom
    anchors.leftMargin: root.pad
    anchors.rightMargin: root.pad
    anchors.bottomMargin: root.pad
    text: root.bottomText
    textFormat: Text.PlainText
    color: root.faint
    font.family: root.fontFamily
    font.pixelSize: root.smallSize
    elide: Text.ElideRight
    renderType: Text.NativeRendering
  }

  // The name of the event, and its place when the setting asks for one — a
  // card that shows where should not have to repeat the name as a subtitle.
  function rowTitle(event) {
    if (!event) return ""
    if (!root.showLocation || !event.location) return event.summary
    return event.summary + "  ·  " + event.location
  }

  // How far away the next event's been is days, not hours: tomorrow evening
  // is still "Tomorrow" at midnight of the day before. Distance is counted
  // in calendar days, then weeks up to a month, months, and finally years —
  // the same words the rest of the set uses to keep distance honest.
  function dayLine(event) {
    if (!event) return ""
    var days = (Model.startOfDay(event.start) - Model.startOfDay(root.nowMs)) / Model.DAY_MS
    var label = ""
    if (days <= 1) label = "Tomorrow"
    else if (days < 7) label = "In " + days + " days"
    else if (days < 29) label = "In " + Math.max(1, Math.round(days / 7)) + "w"
    else if (days >= 360) {
      var years = Math.max(1, Math.round(days / 365))
      label = "In " + years + (years === 1 ? " year" : " years")
    } else {
      var months = Math.max(1, Math.round(days / 30))
      label = "In " + months + (months === 1 ? " month" : " months")
    }
    var when = event.allDay ? "all day"
      : Qt.formatDateTime(new Date(Number(event.start)), root.timeFormat)
    if (when === "all day") return label + " · " + root.rowTitle(event)
    return label + " · " + when + " · " + root.rowTitle(event)
  }
}