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
  readonly property real titleSize: Math.max(9, Math.round(unit * 0.082))
  readonly property real timeSize: Math.max(16, Math.round(unit * 0.23))

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

  // What tomorrow opens with, for the line the tall card ends on. Exactly one
  // day ahead: the rest of tomorrow can wait until it is today.
  readonly property var tomorrowEvent: ready
    ? Model.nextDayEvent(calendar.events, nowMs, 1, showAllDay) : null

  // The rows under the hero, as one flat list so the drawing does not have to
  // know where today stops and tomorrow starts -- a heading is just a row
  // that happens to be a date.
  readonly property var agenda: {
    var out = []
    for (var i = 1; i < events.length; i++) out.push({ heading: "", event: events[i] })
    if (tomorrowEvent) {
      out.push({ heading: Model.dayHeading(tomorrowEvent.start, root.nowMs), event: null })
      out.push({ heading: "", event: tomorrowEvent })
    }
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
      font.pixelSize: root.titleSize
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
      anchors.topMargin: root.gap
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
      font.weight: Font.Light
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
      wrapMode: Text.Wrap
      // Two lines at a single cell, one when there is a list underneath that
      // has more claim on the room.
      maximumLineCount: root.tall ? 1 : 2
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    // ------------------------------------------------------------- the day
    //
    // Midnight to midnight as a hairline, with the event drawn on it and a
    // mark where the clock is. Only on the wide sizes: at one cell the whole
    // day is 150 pixels and an hour of it is six, which is a texture rather
    // than a reading.

    Item {
      id: dayBar

      anchors.left: parent.left
      anchors.right: parent.right
      anchors.top: heroTitle.bottom
      anchors.topMargin: Math.round(root.unit * 0.05)
      height: Math.max(4, Math.round(root.unit * 0.035))
      // Dropped rather than crowded when the hero has taken the room, which
      // is the rule the weather card set.
      visible: root.wide && root.nextEvent !== null
        && y + height < parent.height

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
      // crossing a hairline.
      //
      // Not drawn at all for an all-day event, which is the one case where
      // the block has nothing to say: it runs midnight to midnight, so it
      // fills the bar end to end and the day becomes a solid accent rule --
      // which is both a slab of the one colour the card is allowed to spend
      // once, and an answer to "where in the day" of "everywhere". The track
      // and the mark stay, so the bar still says how much of the day has
      // gone, which is the part that is still true.
      Rectangle {
        id: block

        readonly property real span: Math.max(0, root.eventTo - root.eventFrom)

        visible: root.nextEvent !== null && !root.nextEvent.allDay
        x: Math.round(Math.min(parent.width - width, root.eventFrom * parent.width))
        width: Math.max(parent.height, Math.round(span * parent.width))
        anchors.verticalCenter: parent.verticalCenter
        height: parent.height
        radius: height / 2
        color: root.accent
      }

      // The clock, riding the same day toward the block it is counting down
      // to. Drawn over the block rather than under it: when the event is
      // happening now, where you are in it is the more interesting fact.
      Rectangle {
        id: nowMark

        x: Math.round(Math.min(parent.width - width, root.nowFraction * parent.width))
        width: Math.max(1, Math.round(root.unit * 0.008))
        anchors.verticalCenter: parent.verticalCenter
        height: parent.height
        radius: width / 2
        color: root.foreground
      }
    }

    // ------------------------------------------------------------ the list
    //
    // The rest of the day, and what tomorrow opens with. Only on the tall
    // size, and only as many rows as actually fit -- a card that elided its
    // last row into nothing would be worse than a card that drew one fewer.

    Column {
      id: list

      anchors.left: parent.left
      anchors.right: parent.right
      anchors.top: dayBar.visible ? dayBar.bottom : heroTitle.bottom
      anchors.topMargin: Math.round(root.unit * 0.06)
      anchors.bottom: parent.bottom
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
}
