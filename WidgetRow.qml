import QtQuick
import qs.Commons
import qs.Ui

// One widget in the bar popup: its glyph, its name, and a switch.
//
// The kit's `Toggle` is the same row with the description under the name, and
// that is right for a panel with four settings on it. This list is as long as
// the catalogue, and it grows every time anybody contributes a widget: at
// three lines and 54px a row, nine widgets already ran past the bottom of a
// laptop screen, and the descriptions were nine sentences nobody reads twice.
//
// So: one line, the glyph doing the work the sentence used to do, and the
// sentence kept as the tooltip for the one row you are actually asking about.
BorderSurface {
  id: root

  property string label: ""
  property string description: ""
  property string icon: ""
  property bool checked: false
  property bool hasCursor: false

  property color foreground: Color.popups.text
  property color accent: Color.accent
  property string fontFamily: Style.font.family

  signal clicked()

  readonly property bool hot: hasCursor || mouse.containsMouse

  implicitHeight: Math.max(Style.space(32),
    Style.font.subtitle + Style.spacing.rowPaddingX)
  implicitWidth: Style.space(240)
  radius: Style.cornerRadius

  color: Style.controlFill(false, hot, foreground, accent)
  borderSpec: Border.controlSpec(hot ? "hover-cursor" : "normal", foreground, accent)

  Behavior on color { ColorAnimation { duration: 100 } }

  Row {
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    anchors.leftMargin: root.borderLeft + Style.spacing.rowPaddingX
    anchors.rightMargin: root.borderRight + Style.spacing.rowPaddingX
    spacing: Style.spacing.md

    Text {
      anchors.verticalCenter: parent.verticalCenter
      width: Style.font.icon
      horizontalAlignment: Text.AlignHCenter
      textFormat: Text.PlainText
      text: root.icon
      // Never the accent: a column of accented glyphs is a column of
      // highlights, which is a list with nothing highlighted. It follows the
      // switch instead — lit for what is on the desktop, quiet for what is
      // not — so the shape of the list answers before any of it is read.
      color: root.checked ? root.foreground : Qt.darker(root.foreground, 1.6)
      font.family: root.fontFamily
      font.pixelSize: Style.font.icon
      renderType: Text.NativeRendering
    }

    Text {
      anchors.verticalCenter: parent.verticalCenter
      width: parent.width - track.width - Style.font.icon - parent.spacing * 2
      elide: Text.ElideRight
      textFormat: Text.PlainText
      text: root.label
      color: root.checked ? root.foreground : Qt.darker(root.foreground, 1.35)
      font.family: root.fontFamily
      font.pixelSize: Style.font.subtitle
    }

    // The row owns the click, so the switch is presentation only here.
    ToggleSwitch {
      id: track
      anchors.verticalCenter: parent.verticalCenter
      checked: root.checked
      foreground: root.foreground
      accent: root.accent
      interactive: false
    }
  }

  // The sentence the row used to carry, kept for the one row being asked
  // about rather than printed nine times.
  PanelToolTip {
    visible: root.description !== "" && mouse.containsMouse
    text: root.description
    fontFamily: root.fontFamily
  }

  MouseArea {
    id: mouse
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: root.clicked()
  }
}
