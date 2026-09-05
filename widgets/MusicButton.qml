import QtQuick
import qs.Commons

// A transport control, factored out because both music layouts need the
// identical thing and a transport button is the one place in this set where a
// hover and a press have to be visible — it is the only thing here that
// answers back.
//
// Two weights. `prominent` is the pill: play/pause, the one thing the card is
// really offering. The quiet weight is the glyph alone, for skipping either
// way — the same control, said more softly, so a card with three buttons on
// it still has one obvious action rather than a row of equals.
Item {
  id: root

  property real size: 24
  // The glyph to draw. Escapes rather than literal characters: a private-use
  // character renders as nothing if any tool along the way drops it.
  property string icon: ""
  property bool prominent: true
  property color accent: Color.accent
  property string fontFamily: Style.font.family

  signal pressed()

  readonly property alias hovered: mouse.containsMouse

  width: size
  height: size

  Rectangle {
    anchors.fill: parent
    radius: width / 2
    visible: root.prominent
    color: mouse.pressed
      ? Util.alpha(root.accent, 0.5)
      : (mouse.containsMouse ? Util.alpha(root.accent, 0.32) : Util.alpha(root.accent, 0.2))
    border.width: 1
    border.color: Util.alpha(root.accent, mouse.containsMouse ? 0.95 : 0.6)

    Behavior on color { ColorAnimation { duration: 90 } }
  }

  Text {
    anchors.centerIn: parent
    text: root.icon
    // With no pill behind it, the glyph itself has to carry the hover: it
    // sits back until the pointer is on it, which is what marks the live
    // part of a card that is live all over.
    color: root.prominent
      ? root.accent
      : Util.alpha(root.accent, mouse.pressed ? 1.0 : (mouse.containsMouse ? 1.0 : 0.8))
    font.family: root.fontFamily
    font.pixelSize: Math.max(8, Math.round(root.size * (root.prominent ? 0.46 : 0.62)))
    renderType: Text.NativeRendering

    Behavior on color { ColorAnimation { duration: 90 } }
  }

  MouseArea {
    id: mouse
    anchors.fill: parent
    // A little larger than it looks: this is a wallpaper, not a toolbar, and
    // the pointer should not have to be aimed.
    anchors.margins: -Math.round(root.size * 0.2)
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: root.pressed()
  }
}
