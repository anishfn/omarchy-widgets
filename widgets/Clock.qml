import QtQuick
import Quickshell
import qs.Commons
import "../Model.js" as Model

// The clock card: a label, the time, and the line under it.
//
// Type sizes are fractions of the card rather than fixed points, so a widget
// scaled up in the config stays the same drawing at a different size instead
// of a small drawing in a large box.
Item {
  id: root

  // Injected by Surface.qml. `card` is the WidgetCard this is drawn on, so
  // anything shared with the card's chrome — the corner radius the tick ring
  // has to follow — stays a live binding rather than a copied number.
  property var service: null
  property var instance: null
  property var card: null
  readonly property var settings: instance && instance.settings ? instance.settings : ({})

  readonly property color foreground: Color.foreground
  readonly property color accent: Color.accent
  readonly property color dim: Util.alpha(Color.foreground, 0.55)
  readonly property string fontFamily: Style.font.family

  // The short axis drives the type scale, so a card that is later made wide
  // than it is tall does not get a headline taller than it has room for.
  readonly property real unit: Math.min(width, height)

  // A label the user wrote wins; otherwise the zone names itself, so picking
  // "Asia/Kolkata" is the only thing anyone has to do to get a labelled world
  // clock. Your own clock stays unlabelled — you know where you are.
  readonly property string label: settings.label
    ? String(settings.label)
    : Model.zoneLabel(timezone)
  readonly property string timezone: String(settings.timezone || "")
  readonly property string format: String(settings.format || "HH:mm")
  readonly property bool ticks: settings.ticks !== false

  // ---------------------------------------------------------------- time
  //
  // Zone offsets are resolved by the service, because the QML JS engine has
  // no Intl and ignores the `timeZone` option on toLocaleString — it returns
  // local time for every zone, silently. So the instant is shifted instead
  // and its local fields are read, which lands on the same wall clock.

  readonly property var zoneOffsets: service ? service.zoneOffsets : ({})
  readonly property bool zoneWanted: timezone.length > 0
  readonly property bool zoneKnown: zoneWanted
    && zoneOffsets && zoneOffsets[timezone] !== undefined
    && zoneOffsets[timezone] !== null

  // Minutes between that zone and yours. Also, and not by coincidence, the
  // shift that makes `now` read as that zone's wall clock.
  readonly property int shiftMinutes: zoneKnown
    ? Model.zoneShiftMinutes(now.getTimezoneOffset(), zoneOffsets[timezone])
    : 0

  property date now: clock.date
  readonly property date shown: shiftMinutes === 0
    ? now
    : new Date(now.getTime() + shiftMinutes * 60000)

  readonly property string timeText: Qt.formatDateTime(shown, format)

  // Under the time: how far this zone is from yours when it is somewhere
  // else, and the date when it is here. A zone naming your own offset falls
  // through to the date too — "+0:00" is a fact about nothing.
  readonly property string subText: {
    if (zoneWanted && !zoneKnown) return "unknown zone"
    if (shiftMinutes !== 0) return Model.offsetLabel(shiftMinutes)
    return Qt.formatDateTime(shown, "ddd d MMM")
  }

  // Seconds only when the format actually shows them, so a "HH:mm" clock
  // wakes up once a minute instead of sixty times.
  SystemClock {
    id: clock
    precision: root.format.indexOf("s") !== -1 ? SystemClock.Seconds : SystemClock.Minutes
    onDateChanged: root.now = date
  }

  // ---------------------------------------------------------------- paint

  TickRing {
    anchors.fill: parent
    visible: root.ticks
    cardRadius: root.card ? root.card.radius : 20
    inset: Math.round(root.unit * 0.06)
    // Long enough to read against the card edge; the majors stay a clear
    // step above them.
    tickLength: Math.max(3, Math.round(root.unit * 0.04))
    majorTickLength: Math.max(6, Math.round(root.unit * 0.08))
    tickColor: Util.alpha(root.foreground, 0.3)
  }

  Column {
    anchors.centerIn: parent
    // A few pixels below dead centre so the eye line of the time matches the
    // weather card's headline rather than floating above it.
    anchors.verticalCenterOffset: Math.round(root.unit * 0.02)
    spacing: Math.round(root.unit * 0.02)

    Text {
      anchors.horizontalCenter: parent.horizontalCenter
      // Same fit-to-card guard as the time: a label is user-written and can
      // be any length. A Text given a width aligns left unless told
      // otherwise, so the centring has to be said out loud once the line
      // stops being exactly as wide as its glyphs.
      width: Math.round(root.width * 0.86)
      horizontalAlignment: Text.AlignHCenter
      visible: root.label.length > 0
      text: root.label
      textFormat: Text.PlainText
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Math.max(8, Math.round(root.unit * 0.075))
      minimumPixelSize: Math.max(7, Math.round(root.unit * 0.05))
      fontSizeMode: Text.HorizontalFit
      font.letterSpacing: Math.round(root.unit * 0.075) * 0.12
      renderType: Text.NativeRendering
    }

    Text {
      anchors.horizontalCenter: parent.horizontalCenter
      // Stay inside the tick ring: a fraction of the card, not all of it.
      // Centred explicitly: the anchor centres the item, and the item is now
      // wider than the text inside it.
      width: Math.round(root.width * 0.86)
      horizontalAlignment: Text.AlignHCenter
      text: root.timeText
      textFormat: Text.PlainText
      color: root.foreground
      font.family: root.fontFamily
      // The weather card's headline size, so the two cards agree about what
      // a headline is. The 12-hour format's " PM" tail can make the line
      // wider than the card it is centred on, so it shrinks to fit rather
      // than spill past the ring; formats that already fit are untouched.
      font.pixelSize: Math.max(14, Math.round(root.unit * 0.24))
      minimumPixelSize: Math.max(10, Math.round(root.unit * 0.1))
      fontSizeMode: Text.HorizontalFit
      font.weight: Font.Light
      renderType: Text.NativeRendering
    }

    Text {
      anchors.horizontalCenter: parent.horizontalCenter
      visible: root.subText.length > 0
      text: root.subText
      textFormat: Text.PlainText
      // The one accent-colored thing on the card. It is the only line that
      // says something you cannot get from a bar clock.
      color: root.accent
      font.family: root.fontFamily
      font.pixelSize: Math.max(8, Math.round(root.unit * 0.065))
      topPadding: Math.round(root.unit * 0.045)
      renderType: Text.NativeRendering
    }
  }
}
