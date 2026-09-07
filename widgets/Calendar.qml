import QtQuick
import Quickshell
import qs.Commons
import "../Model.js" as Model

// What is next, when it is, and where it falls in the day.
//
// The card is a time against a sentence, which is what a calendar is once you
// take the week grid away. A grid of squares on a wallpaper tells you that
// Thursday is busy; it does not tell you what you are late for.
//
// Three sizes, three compositions, each one a layer on the last rather than
// the one before it stretched:
//
//   1x1   the next thing -- when, how long you have, what it is
//   2x1   and the day it sits in, as a bar with the event on it
//   2x2   and the rest of the day under that, then what tomorrow opens with
//
// The bar is the reason the wide sizes exist. A day is 24 hours wide and a
// meeting is one of them, so at a single cell the event would be four pixels
// and the bar would be decoration pretending to be content. Given a second
// column it becomes the thing the list cannot say: not just what is next but
// whether the day ahead is packed or empty, and how much of it has gone.
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
  // short axis, because this offers a size two rows tall and dividing by the
  // span is what stops a 2x2 answering a request for more content with the
  // same content in bigger letters. See DESIGN.md.
  readonly property int spanCols: instance && instance.cols > 0 ? instance.cols : 1
  readonly property int spanRows: instance && instance.rows > 0 ? instance.rows : 1
  readonly property real unit: Math.min(width / spanCols, height / spanRows)

  readonly property real pad: Math.round(unit * 0.11)
  readonly property real gap: Math.round(unit * 0.04)

  readonly property real smallSize: Math.max(8, Math.round(unit * 0.068))
  readonly property real titleSize: Math.max(10, Math.round(unit * 0.085))
  readonly property real timeSize: Math.max(18, Math.round(unit * 0.24))

  // Which composition this footprint gets. Both are questions about the
  // card's own rectangle rather than about the numbers in the config, so a
  // card resized in the editor changes drawing as you drag it.
  readonly property bool wide: spanCols > 1
  readonly property bool tall: spanRows > 1

  // --------------------------------------------------------------- the data

  readonly property string icsUrl: String(settings.icsUrl || "")
  readonly property bool configured: Model.isSafeIcsUrl(icsUrl)
  readonly property bool showAllDay: settings.showAllDay !== false
  readonly property bool showLocation: settings.showLocation === true
  readonly property bool twelveHour: String(settings.format || "24h") === "12h"

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

  // Everything today still has to give. The first is the hero; the rest are
  // the tall card's list, which is the whole reason a limit above one is
  // worth fetching.
  readonly property var events: ready
    ? Model.todayEvents(calendar.events, nowMs, 12, showAllDay) : []
  readonly property var nextEvent: events.length > 0 ? events[0] : null
  readonly property bool empty: events.length === 0

  // What tomorrow opens with. One line under the card on every footprint,
  // so a 1x1 knows what is coming next too -- the tall card used to claim
  // it for its list, but it is the one fact worth keeping on all sizes.
  readonly property var tomorrowEvent: ready
    ? Model.nextDayEvent(calendar.events, nowMs, 1, showAllDay) : null

  // The tomorrow line, in the card's own words: "Tomorrow", then the clock's
  // time of it (none for an all-day), then what it is.
  readonly property string bottomText: {
    if (!root.tomorrowEvent) return ""
    var time = root.tomorrowEvent.allDay
      ? "" : Model.eventTimeLabel(root.tomorrowEvent, root.twelveHour)
    var label = "Tomorrow"
    if (time !== "") label += "  ·  " + time
    return label + "  ·  " + root.rowTitle(root.tomorrowEvent)
  }

  // How much of the card's floor the footer claims, so the hero, the day bar
  // and the tall list all stop short of it instead of running under it.
  readonly property real footerSpace: bottomLine.visible
    ? bottomLine.height + Math.round(root.unit * 0.03) : 0

  // How much of the card's floor the footer *and* the timeline claim, so the
  // tall list stops short of both instead of running under them.
  readonly property real barFloor: root.footerSpace
    + (timeline.visible ? timeline.height + Math.round(root.unit * 0.06) : 0)

  // The rows under the hero, as one flat list so the drawing does not have to
  // know where today stops. Tomorrow is the footer's job now, on every size,
  // so the tall card's list is today alone -- the line ends the card either
  // way, just from a place that does not double it up.
  readonly property var agenda: {
    var out = []
    for (var i = 1; i < events.length; i++) out.push({ heading: "", event: events[i] })
    return out
  }

  // The label, or the date when nobody wrote one -- a card that says which
  // calendar it is beats a card that says nothing, and a card with one
  // calendar would rather know what day it is.
  readonly property string headText: {
    var typed = String(settings.label || "").trim()
    return typed.length > 0 ? typed.toUpperCase() : Model.todayHeading(root.nowMs)
  }

  // Which nothing the card is saying: unset, unreachable, still loading, or
  // genuinely a clear day.
  readonly property string emptyText: {
    if (!configured) return icsUrl === "" ? "Add your calendar" : "That is not an iCal address"
    if (!ready) return error === "unavailable" ? "Calendar unavailable" : "Loading…"
    return "Nothing left today"
  }

  // ------------------------------------------------------------ the day bar
  //
  // Where the next event sits in the day, and how much of the day has gone.
  // Both are fractions of local midnight to local midnight, clamped -- an
  // event that began yesterday and is still running draws from the left edge
  // rather than off it.

  readonly property real dayStart: Model.startOfDay(root.nowMs)

  readonly property real eventFrom: {
    if (!nextEvent) return 0
    return Math.max(0, Math.min(1,
      (Math.max(Number(nextEvent.start), dayStart) - dayStart) / Model.DAY_MS))
  }

  readonly property real eventTo: {
    if (!nextEvent) return 0
    var end = nextEvent.end > nextEvent.start
      ? Number(nextEvent.end) : Number(nextEvent.start) + 3600000
    return Math.max(0, Math.min(1, (end - dayStart) / Model.DAY_MS))
  }

  readonly property real nowFraction:
    Math.max(0, Math.min(1, (root.nowMs - dayStart) / Model.DAY_MS))

  // The name of an event, and its place when the setting asks for one -- a
  // card that shows where should not have to repeat the name as a subtitle.
  function rowTitle(event) {
    if (!event) return ""
    if (!root.showLocation || !event.location) return event.summary
    return event.summary + "  ·  " + event.location
  }

  // ---------------------------------------------------------------- paint

  // A clear day, or a card that cannot answer yet. The head stays: a card
  // still says which calendar it is while it is saying it has nothing.
  Column {
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.leftMargin: root.pad
    anchors.rightMargin: root.pad
    anchors.topMargin: root.pad
    visible: root.empty
    spacing: root.gap

    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: root.headText
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      font.letterSpacing: Math.round(root.smallSize * 0.1)
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: root.emptyText
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Math.max(12, Math.round(root.unit * 0.13))
      font.weight: Font.Bold
      wrapMode: Text.Wrap
      maximumLineCount: 2
      renderType: Text.NativeRendering
    }
  }

  // Today, when there is a today.
  Item {
    id: body

    anchors.fill: parent
    anchors.margins: root.pad
    visible: !root.empty

    // ------------------------------------------------------------ the head

    Text {
      id: headLine

      anchors.left: parent.left
      anchors.right: headUntil.left
      anchors.rightMargin: Math.round(root.unit * 0.04)
      anchors.top: parent.top
      textFormat: Text.PlainText
      text: root.headText
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      font.letterSpacing: Math.round(root.smallSize * 0.1)
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    // How long you have: the card's one accent, opposite the date.
    //
    // It sits up here rather than beside the time, where it reads better,
    // because beside the time it only reads better at two columns -- at one
    // the hour fills the line and the countdown elides to nothing, which is
    // the single most useful thing on the card quietly disappearing at the
    // card's default size. Up here it always has its own room, and it puts
    // the calendar and the crypto card in the same shape: what this is on
    // the left, the one number worth the accent on the right.
    Text {
      id: headUntil

      anchors.right: parent.right
      anchors.baseline: headLine.baseline
      textFormat: Text.PlainText
      text: root.nextEvent ? Model.eventUntilLabel(root.nextEvent, root.nowMs) : ""
      color: root.accent
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      renderType: Text.NativeRendering
    }

    // ------------------------------------------------------------ the hero
    //
    // The time is the headline and the countdown is the one accent, sitting
    // on the same baseline: one says when, the other says how long you have,
    // and they are the same fact said two ways.

    Text {
      id: heroTime

      anchors.left: parent.left
      anchors.right: parent.right
      anchors.top: headLine.bottom
      // Half the gap, so the time and the title sit a few pixels higher and
      // the timeline at the card's floor gets room to stay a drawing.
      anchors.topMargin: Math.round(root.gap * 0.5)
      textFormat: Text.PlainText
      text: root.nextEvent
        ? (root.nextEvent.allDay ? "All day"
          : Model.clockLabel(root.nextEvent.start, root.twelveHour))
        : ""
      // "All day" is a phrase where the rest are four digits; let it shrink
      // rather than elide, so the one event a day that has no clock still
      // says so in full.
      fontSizeMode: Text.HorizontalFit
      minimumPixelSize: Math.max(12, Math.round(root.unit * 0.12))
      elide: Text.ElideRight
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: root.timeSize
      font.weight: Font.Bold
      renderType: Text.NativeRendering
    }

    Text {
      id: heroTitle

      anchors.left: parent.left
      anchors.right: parent.right
      anchors.top: heroTime.bottom
      anchors.topMargin: Math.round(root.unit * 0.01)
      textFormat: Text.PlainText
      text: root.rowTitle(root.nextEvent)
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: root.titleSize
      font.weight: Font.Bold
      wrapMode: Text.Wrap
      // Two lines at a single cell, one when there is a list (or the
      // tomorrow footer or the timeline) underneath that has more claim on
      // the room.
      maximumLineCount: (root.tall || bottomLine.visible || timeline.visible) ? 1 : 2
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    // ----------------------------------------------------------- the timeline
    //
    // Midnight to midnight as a hairline, with the event drawn on it and a
    // dot where the clock is. On every footprint, so a 1x1 still says where
    // in the day the next thing is -- a day is 24 hours across and a meeting
    // is one of them, which is a reading at any width. An all-day event
    // draws no block: it runs midnight to midnight, so it would fill the bar
    // end to end and the day would stop being a reading.

    Item {
      id: timeline

      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      // Half of the footer's drop, so the bar follows tomorrow's line down a
      // couple of pixels and the two keep their offset.
      anchors.bottomMargin: Math.max(0, root.footerSpace - 2)
      height: Math.max(6, Math.round(root.unit * 0.05))
      visible: root.nextEvent !== null

      Rectangle {
        id: track

        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        height: Math.max(1, Math.round(root.unit * 0.008))
        radius: height / 2
        color: root.faint
      }

      // The event, as a block along the day. Never thinner than it is tall,
      // so a half-hour meeting is a mark you can see rather than a hairline
      // crossing a hairline. Drawn only for a timed event: an all-day one is
      // everywhere on the day, which a solid slab would shout.
      Rectangle {
        id: evBlock

        readonly property real span: Math.max(0, root.eventTo - root.eventFrom)

        visible: root.nextEvent !== null && !root.nextEvent.allDay
        x: Math.round(Math.min(parent.width - width, root.eventFrom * parent.width))
        width: Math.max(parent.height, Math.round(span * parent.width))
        anchors.verticalCenter: parent.verticalCenter
        height: parent.height
        radius: height / 2
        color: root.accent
      }

      // The clock, as a dot riding the same day toward the block it is
      // counting down to. Drawn over the block rather than under it: when the
      // event is happening now, where you are in it is the more interesting
      // fact.
      Rectangle {
        id: nowDot

        x: Math.round(Math.min(parent.width - width, root.nowFraction * parent.width))
        anchors.verticalCenter: parent.verticalCenter
        width: Math.max(5, Math.round(root.unit * 0.04))
        height: width
        radius: height / 2
        color: root.accent
      }
    }

    // ------------------------------------------------------------ the list
    //
    // The rest of today. Only on the tall size, and only as many rows as
    // actually fit -- a card that elided its last row into nothing would be
    // worse than a card that drew one fewer. Tomorrow is the footer's job,
    // the timeline's is where the next thing sits in the day, so neither is
    // repeated here.

    Column {
      id: list

      anchors.left: parent.left
      anchors.right: parent.right
      anchors.top: heroTitle.bottom
      anchors.topMargin: Math.round(root.unit * 0.06)
      anchors.bottom: parent.bottom
      anchors.bottomMargin: root.barFloor
      visible: root.tall && root.agenda.length > 0
      spacing: Math.round(root.unit * 0.025)

      readonly property real rowHeight: Math.round(root.unit * 0.1)
      readonly property int fits: Math.max(0,
        Math.floor((height + spacing) / (rowHeight + spacing)))

      Repeater {
        model: list.fits > 0 ? root.agenda.slice(0, list.fits) : []

        delegate: Item {
          id: row

          required property var modelData

          width: list.width
          height: list.rowHeight

          // A day heading: the rule and the word, which is what turns a run
          // of times into a list you do not have to date yourself.
          Rectangle {
            anchors.left: parent.left
            anchors.right: headingText.left
            anchors.rightMargin: Math.round(root.unit * 0.03)
            anchors.verticalCenter: parent.verticalCenter
            visible: row.modelData.heading !== ""
            height: Math.max(1, Math.round(root.unit * 0.006))
            color: root.faint
          }

          Text {
            id: headingText

            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            visible: row.modelData.heading !== ""
            textFormat: Text.PlainText
            text: row.modelData.heading
            color: root.faint
            font.family: root.fontFamily
            font.pixelSize: root.smallSize
            renderType: Text.NativeRendering
          }

          // An event row: the time, then what it is.
          Text {
            id: rowTime

            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            visible: row.modelData.event !== null
            textFormat: Text.PlainText
            text: Model.eventTimeLabel(row.modelData.event, root.twelveHour)
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: root.smallSize
            renderType: Text.NativeRendering
          }

          Text {
            anchors.left: rowTime.right
            anchors.leftMargin: Math.round(root.unit * 0.045)
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            visible: row.modelData.event !== null
            textFormat: Text.PlainText
            text: root.rowTitle(row.modelData.event)
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: root.smallSize
            elide: Text.ElideRight
            renderType: Text.NativeRendering
          }
        }
      }
    }
  }

  // Tomorrow, on the floor. One line on every footprint -- 1x1, 2x1, 2x2 --
  // because "what opens tomorrow" is worth keeping however small the card
  // gets. The hero, the day bar and the list all stop before it.
  Text {
    id: bottomLine

    anchors.left: parent.left
    anchors.right: parent.right
    anchors.bottom: parent.bottom
    anchors.leftMargin: root.pad
    anchors.rightMargin: root.pad
    // A few pixels closer to the floor than the card's other margins, so
    // tomorrow's line reads as the card's bottom-most fact.
    anchors.bottomMargin: Math.max(6, Math.round(root.pad - 4))
    visible: root.bottomText !== ""
    textFormat: Text.PlainText
    text: root.bottomText
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: root.smallSize
    elide: Text.ElideRight
    renderType: Text.NativeRendering
  }
}
