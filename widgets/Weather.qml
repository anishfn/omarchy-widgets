import QtQuick
import Quickshell
import qs.Commons
import "../Model.js" as Model

// The weather card: where you are, what it is doing, and today's range.
//
// Left-aligned rather than centred, unlike the clock. A clock is one value
// and reads best on an axis; this is four things of different lengths, and
// ragging them off a common left edge is what stops it looking like a
// scoreboard.
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
  readonly property string fontFamily: Style.font.family

  // The short axis drives the type scale, so a widget widened to two columns
  // gets more room rather than bigger letters.
  readonly property real unit: Math.min(width, height)
  readonly property real pad: Math.round(unit * 0.115)

  readonly property string units: String(settings.units || "celsius")
  readonly property bool showRange: settings.showRange !== false

  // ------------------------------------------------------------ the data

  readonly property var observation: service ? service.weather : null
  readonly property string error: service ? String(service.weatherError || "") : ""

  // The label the user wrote wins; otherwise wherever the report says it is,
  // falling back to whatever Omarchy has been told.
  readonly property string place: {
    if (settings.label) return String(settings.label)
    if (observation && observation.place) return String(observation.place)
    return service ? String(service.weatherLocation || "") : ""
  }

  readonly property string temperature: Model.tempLabel(observation, units, "temp")
  readonly property string condition: observation ? String(observation.condition || "") : ""
  readonly property string range: showRange ? Model.rangeLabel(observation, units) : ""

  // Sunrise and sunset arrive as wall-clock times where the weather is, so
  // the comparison is against a wall clock too.
  property date now: clock.date
  readonly property bool night: observation
    ? Model.isNight(now.getHours() * 60 + now.getMinutes(), observation.sunrise, observation.sunset)
    : false
  readonly property string icon: observation ? Model.weatherIcon(observation.code, night) : ""

  readonly property bool ready: observation !== null && temperature !== ""

  SystemClock {
    id: clock
    // Only used to decide whether the icon is its day or night variant, and
    // that changes twice a day.
    precision: SystemClock.Minutes
    onDateChanged: root.now = date
  }

  // ---------------------------------------------------------------- paint

  // Waiting, or nothing to show. Says which, because "no weather" and "no
  // location" want different things done about them.
  Text {
    anchors.centerIn: parent
    width: parent.width - root.pad * 2
    visible: !root.ready
    horizontalAlignment: Text.AlignHCenter
    wrapMode: Text.Wrap
    textFormat: Text.PlainText
    text: root.error === "unavailable" ? "Weather unavailable" : "Fetching weather…"
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: Math.max(9, Math.round(root.unit * 0.075))
    renderType: Text.NativeRendering
  }

  Item {
    anchors.fill: parent
    anchors.margins: root.pad
    visible: root.ready

    // Place, with the condition icon opposite it. The icon is the one accent
    // on the card — it is the thing you look at first and sometimes the only
    // thing you need.
    Text {
      id: placeText
      anchors.left: parent.left
      anchors.right: conditionIcon.left
      anchors.rightMargin: Math.round(root.unit * 0.03)
      anchors.top: parent.top
      textFormat: Text.PlainText
      text: root.place
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Math.max(9, Math.round(root.unit * 0.085))
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    Text {
      id: conditionIcon
      anchors.right: parent.right
      anchors.top: parent.top
      textFormat: Text.PlainText
      text: root.icon
      color: root.accent
      font.family: root.fontFamily
      font.pixelSize: Math.max(11, Math.round(root.unit * 0.11))
      renderType: Text.NativeRendering
    }

    // The number, big, and hard against the left edge.
    Text {
      id: temperatureText
      anchors.left: parent.left
      anchors.top: placeText.bottom
      anchors.topMargin: Math.round(root.unit * 0.04)
      textFormat: Text.PlainText
      text: root.temperature
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Math.max(14, Math.round(root.unit * 0.24))
      font.weight: Font.Light
      renderType: Text.NativeRendering
    }

    Text {
      id: conditionText
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.top: temperatureText.bottom
      anchors.topMargin: Math.round(root.unit * 0.035)
      textFormat: Text.PlainText
      text: root.condition
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Math.max(8, Math.round(root.unit * 0.07))
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    // Today's range, along the bottom. Dropped rather than crowded when the
    // card is short enough that it would collide with the condition.
    Text {
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      visible: root.range !== ""
        && y > conditionText.y + conditionText.height
      textFormat: Text.PlainText
      text: root.range
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Math.max(8, Math.round(root.unit * 0.065))
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }
  }
}
