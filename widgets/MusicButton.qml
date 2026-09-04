import QtQuick
import qs.Commons

// The play/pause control, factored out because both music layouts need the
// identical thing and a transport button is the one place in this set where a
// hover and a press have to be visible — it is the only thing here that
// answers back.
Item {
  id: root

  property real size: 24
  property bool playing: false
  property color accent: Color.accent
  property string fontFamily: Style.font.family

  signal pressed()

  readonly property alias hovered: mouse.containsMouse

  width: size
  height: size

  Rectangle {
    anchors.fill: parent
    radius: width / 2
    color: mouse.pressed
      ? Util.alpha(root.accent, 0.5)
      : (mouse.containsMouse ? Util.alpha(root.accent, 0.32) : Util.alpha(root.accent, 0.2))
    border.width: 1
    border.color: Util.alpha(root.accent, mouse.containsMouse ? 0.95 : 0.6)

    Behavior on color { ColorAnimation { duration: 90 } }

    Text {
      anchors.centerIn: parent
      // Pause while it plays, play while it does not, so the button shows
      // what pressing it will do. Escapes rather than literal glyphs: a
      // private-use character renders as nothing if any tool drops it.
      text: root.playing ? "\uf04c" : "\uf04b"
      color: root.accent
      font.family: root.fontFamily
      font.pixelSize: Math.max(8, Math.round(root.size * 0.46))
      renderType: Text.NativeRendering
    }
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
