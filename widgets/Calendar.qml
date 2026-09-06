import QtQuick
import Quickshell
import qs.Commons
import "../Model.js" as Model

Item {
  id: root

  property var service: null
  property var instance: null
  property var card: null

  readonly property var settings: instance && instance.settings
    ? instance.settings
    : ({})

  readonly property color foreground: Color.foreground
  readonly property color accent: Color.accent
  readonly property color dim: Util.alpha(Color.foreground, 0.55)
  readonly property color faint: Util.alpha(Color.foreground, 0.3)
  readonly property string fontFamily: Style.font.family

  readonly property int spanCols: instance && instance.cols > 0
    ? instance.cols
    : 1

  readonly property int spanRows: instance && instance.rows > 0
    ? instance.rows
    : 1

  readonly property real unit: Math.min(
    width / spanCols,
    height / spanRows
  )

  readonly property real pad: Math.round(unit * 0.11)
  readonly property real gap: Math.round(unit * 0.04)
  readonly property real stackSpacing: Math.round(unit * 0.05)

  readonly property real smallSize: Math.max(
    8,
    Math.round(unit * 0.068)
  )

  readonly property real timeSize: Math.max(
    18,
    Math.round(unit * 0.24)
  )

  readonly property real titleSize: Math.max(
    10,
    Math.round(unit * 0.085)
  )

  readonly property real trackH: Math.max(
    2,
    Math.round(unit * 0.024)
  )

  readonly property real blockH: Math.max(
    5,
    Math.round(trackH * 2.2)
  )

  readonly property real minBlockW: Math.max(
    6,
    Math.round(trackH * 2.6)
  )

  // WHOLE TIMELINE OFFSET
  // Increase this number to move both the bar and block further down.
  readonly property real timelineOffset: 14

  readonly property string icsUrl: String(
    settings.icsUrl || ""
  )

  readonly property bool configured:
    Model.isSafeIcsUrl(icsUrl)

  readonly property bool twelveHour:
    String(settings.format || "24h") === "12h"

  readonly property bool showAllDay:
    settings.showAllDay !== false

  readonly property bool showLocation:
    settings.showLocation === true

  readonly property var calendar:
    service && service.calendars && configured
      ? service.calendars[icsUrl]
      : null

  readonly property string error:
    service
      ? String(service.calendarError || "")
      : ""

  readonly property bool ready:
    calendar !== null && calendar !== undefined

  property date now: clock.date

  readonly property real nowMs:
    now.getTime()

  SystemClock {
    id: clock

    precision: SystemClock.Minutes

    onDateChanged:
      root.now = date
  }

  readonly property var events:
    ready
      ? Model.todayEvents(
          calendar.events,
          nowMs,
          12,
          showAllDay
        )
      : []

  readonly property var nextEvent:
    events.length > 0
      ? events[0]
      : null

  readonly property var nextLineEvent: {
    if (!ready)
      return null

    var list = Model.upcomingEvents(
      calendar.events,
      root.nowMs,
      8,
      showAllDay
    )

    var today = Model.startOfDay(root.nowMs)

    for (var i = 0; i < list.length; i++) {
      if (Model.startOfDay(list[i].start) > today)
        return list[i]
    }

    return null
  }

  readonly property string modLabel:
    String(settings.label || "").toUpperCase()

  readonly property real evStartMs: {
    var ev = root.nextEvent

    if (!ev)
      return 0

    return Math.max(
      Number(ev.start),
      Model.startOfDay(root.nowMs)
    )
  }

  readonly property real evEndMs: {
    var ev = root.nextEvent

    if (!ev)
      return 0

    var end = ev.end > ev.start
      ? Number(ev.end)
      : Number(ev.start) + 60000

    return Math.min(
      end,
      Model.startOfDay(root.nowMs)
        + Model.DAY_MS
    )
  }

  readonly property real evOffset:
    root.evEndMs > root.evStartMs
      ? (
          root.evStartMs
          - Model.startOfDay(root.nowMs)
        ) / Model.DAY_MS
      : 0

  readonly property real nowOffset: {
    var frac = (
      root.nowMs
      - Model.startOfDay(root.nowMs)
    ) / Model.DAY_MS

    return Math.max(
      0,
      Math.min(1, frac)
    )
  }

  readonly property real evSpan:
    root.evEndMs > root.evStartMs
      ? (
          root.evEndMs
          - root.evStartMs
        ) / Model.DAY_MS
      : 0

  readonly property string bottomText: {
    var line = root.nextLineEvent

    if (line)
      return root.dayLine(line)

    if (!root.ready)
      return ""

    var upcoming = Model.upcomingEvents(
      calendar.events,
      root.nowMs,
      1,
      showAllDay
    )

    return upcoming.length === 0
      ? "NO UPCOMING EVENTS"
      : ""
  }

  readonly property string emptyText: {
    if (!configured)
      return icsUrl === ""
        ? "Add your calendar"
        : "That is not an iCal address"

    if (!ready)
      return error === "unavailable"
        ? "Calendar unavailable"
        : "Loading…"

    return "Nothing scheduled"
  }

  readonly property bool empty:
    events.length === 0

Column {
    anchors.left:
      parent.left

    anchors.right:
      parent.right

    anchors.leftMargin:
      root.pad

    anchors.rightMargin:
      root.pad

    anchors.top:
      parent.top

    anchors.topMargin:
      root.pad

    visible:
      root.empty

    spacing:
      root.gap

    Text {
      visible:
        root.modLabel !== ""

      text:
        root.modLabel

      color:
        root.dim

      font.family:
        root.fontFamily

      font.pixelSize:
        root.smallSize

      font.letterSpacing:
        Math.max(
          0,
          Math.round(root.smallSize * 0.1)
        )

      renderType:
        Text.NativeRendering
    }

    Row {
      width:
        parent.width

      spacing:
        root.gap

      transform: Translate {
        y: 4
      }

      Rectangle {
        id: emptyBar

        anchors.verticalCenter:
          parent.verticalCenter

        width:
          Math.max(
            5,
            Math.round(root.unit * 0.045)
          )

        height:
          Math.max(
            14,
            Math.round(root.unit * 0.14)
          )

        radius:
          Math.round(width / 2)

        color:
          root.accent
      }

      Text {
        width:
          parent.width
          - emptyBar.width
          - root.gap

        horizontalAlignment:
          Text.AlignLeft

        wrapMode:
          Text.Wrap

        textFormat:
          Text.PlainText

        text:
          root.emptyText

        color:
          root.foreground

        font.family:
          root.fontFamily

        font.pixelSize:
          Math.max(
            12,
            Math.round(root.unit * 0.13)
          )

        font.weight:
          Font.Bold

        elide:
          Text.ElideRight

        renderType:
          Text.NativeRendering
      }
    }
  }

  Item {
    id: hero

    anchors.fill:
      parent

    visible:
      !root.empty

    Column {
      id: topStack

      x:
        root.pad

      y:
        root.pad

      width:
        Math.max(
          0,
          parent.width
          - root.pad * 2
        )

      spacing:
        root.stackSpacing

      Text {
        id: labelText

        visible:
          root.modLabel !== ""

        text:
          root.modLabel

        color:
          root.dim

        font.family:
          root.fontFamily

        font.pixelSize:
          root.smallSize

        font.letterSpacing:
          Math.max(
            0,
            Math.round(
              root.smallSize * 0.1
            )
          )

        renderType:
          Text.NativeRendering
      }

      Item {
        id: topRow

        width:
          parent.width

        height:
          timeText.implicitHeight

        transform: Translate {
          y: -4
        }

        Text {
          id: countdown

          anchors.left:
            timeText.right

          anchors.leftMargin:
            root.gap * 2

          anchors.baseline:
            timeText.baseline

          width:
            Math.min(
              implicitWidth,
              topRow.width
                - timeText.width
                - root.gap * 2
            )

          text:
            root.nextEvent
              ? Model.eventUntilLabel(
                  root.nextEvent,
                  root.nowMs
                )
              : ""

          color:
            root.accent

          font.family:
            root.fontFamily

          font.pixelSize:
            Math.round(
              root.smallSize * 1.5
            )

          horizontalAlignment:
            Text.AlignLeft

          elide:
            Text.ElideRight

          renderType:
            Text.NativeRendering
        }

        Text {
          id: timeText

          anchors.left:
            topRow.left

          text: {
            var ev = root.nextEvent

            if (!ev)
              return ""

            return ev.allDay
              ? "All day"
              : Model.clockLabel(
                  ev.start,
                  root.twelveHour
                )
          }

          color:
            root.foreground

          font.family:
            root.fontFamily

          font.pixelSize:
            root.timeSize

          font.weight:
            Font.Bold

          elide:
            Text.ElideRight

          renderType:
            Text.NativeRendering
        }
      }

      Text {
        id: titleText

        transform: Translate {
          y: -8
        }

        width:
          Math.max(
            0,
            parent.width
          )

        text:
          root.nextEvent
            ? root.rowTitle(
                root.nextEvent
              )
            : ""

        color:
          root.foreground

        font.family:
          root.fontFamily

        font.pixelSize:
          root.titleSize

        font.weight:
          Font.Bold

        wrapMode:
          Text.Wrap

        maximumLineCount:
          2

        elide:
          Text.ElideRight

        renderType:
          Text.NativeRendering
      }
    }

    Column {
      id: bottomStack

      anchors.left:
        parent.left

      anchors.right:
        parent.right

      anchors.leftMargin:
        root.pad

      anchors.rightMargin:
        root.pad

      anchors.bottom:
        parent.bottom

      anchors.bottomMargin:
        root.pad
        + (
            bottomLine.visible
              ? bottomLine.height
                + root.gap
              : 0
          )

      spacing:
        root.gap

      Item {
        id: timeline

        width:
          parent.width

        // The slot knows its own fixed size, independent of the
        // offset, so the column does not grow with it and cancel the
        // move.  It only needs to be tall enough that the shifted bar
        // stays inside: blockH of bar plus room for the offset.
        height:
          root.blockH
          + Math.max(
              Math.round(
                root.unit * 0.06
              ),
              12
            )

        Rectangle {
          // The background bar moves with the whole
          // timeline offset.
          y:
            root.timelineOffset
            + (
                root.blockH
                - root.trackH
              ) / 2

          width:
            parent.width

          height:
            root.trackH

          radius:
            Math.max(
              1,
              Math.round(
                root.trackH / 2
              )
            )

          color:
            Util.alpha(
              Color.foreground,
              0.15
            )
        }

        Rectangle {
          id: evBlock

          // The event block uses the exact same offset
          // so both move together.
          y:
            root.timelineOffset
            + (
                root.blockH
                - height
              ) / 2

          x:
            Math.max(
              0,
              Math.min(
                parent.width
                - width,
                root.evOffset
                * parent.width
              )
            )

          width:
            Math.max(
              root.minBlockW,
              Math.min(
                parent.width
                * root.evSpan,
                parent.width
              )
            )

          height:
            root.blockH

          radius:
            2

          color:
            root.accent
        }

        Rectangle {
          id: nowDot

          x:
            Math.max(
              0,
              Math.min(
                parent.width - width,
                root.nowOffset * parent.width
              )
            )

          y:
            root.timelineOffset
            + (
                root.blockH
                - root.trackH
              ) / 2
            + (
                root.trackH
                - height
              ) / 2

          width:
            Math.max(
              4,
              Math.round(root.trackH * 1.8)
            )

          height:
            width

          radius:
            height / 2

          color:
            root.accent
        }
      }
    }
  }

  Text {
    id: bottomLine

    visible:
      root.bottomText !== ""

    anchors.left:
      parent.left

    anchors.right:
      parent.right

    anchors.bottom:
      parent.bottom

    anchors.leftMargin:
      root.pad

    anchors.rightMargin:
      root.pad

    anchors.bottomMargin:
      root.pad

    text:
      root.bottomText

    textFormat:
      Text.PlainText

    color:
      root.faint

    font.family:
      root.fontFamily

    font.pixelSize:
      root.smallSize

    elide:
      Text.ElideRight

    renderType:
      Text.NativeRendering
  }

  function rowTitle(event) {
    if (!event)
      return ""

    if (
      !root.showLocation
      || !event.location
    )
      return event.summary

    return event.summary
      + "  ·  "
      + event.location
  }

  function dayLine(event) {
    if (!event)
      return ""

    var days = (
      Model.startOfDay(event.start)
      - Model.startOfDay(root.nowMs)
    ) / Model.DAY_MS

    var label = ""

    if (days <= 1)
      label = "Tomorrow"
    else if (days < 7)
      label = "In " + days + " days"
    else if (days < 29) {
      var weeks = Math.round(days / 7)
      label = "In " + Math.max(1, weeks) + "w"
    } else if (days >= 360) {
      var years = Math.round(days / 365)
      label = "In "
        + Math.max(1, years)
        + (Math.max(1, years) === 1
            ? " year"
            : " years")
    } else {
      var months = Math.round(days / 30)
      label = "In "
        + Math.max(1, months)
        + (Math.max(1, months) === 1
            ? " month"
            : " months")
    }

    var when = Model.eventTimeLabel(
      event,
      root.twelveHour
    )

    if (when === "all day")
      return label + " · " + root.rowTitle(event)

    return label
      + " · "
      + when
      + " · "
      + root.rowTitle(event)
  }
}