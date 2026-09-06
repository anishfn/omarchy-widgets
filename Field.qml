import QtQuick
import qs.Commons

// A control with its name written above it, small and quiet.
//
// The editor's toolbar used to put the name beside the control, which is what
// a form does when it has two of them. With six across the bottom of a screen
// it became a sentence you had to read through to find the knob you wanted.
// Stacked, the names are one row and the controls are another, and the eye
// can take either row on its own.
Item {
  id: root

  property string label: ""
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family

  default property alias content: holder.data

  implicitWidth: Math.max(caption.implicitWidth, holder.childrenRect.width)
  implicitHeight: caption.implicitHeight + Style.spacing.labelGap + holder.childrenRect.height

  Text {
    id: caption
    anchors.left: parent.left
    anchors.top: parent.top
    textFormat: Text.PlainText
    text: root.label
    color: Qt.darker(root.foreground, 1.4)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: true
  }

  Item {
    id: holder
    anchors.left: parent.left
    anchors.top: caption.bottom
    anchors.topMargin: Style.spacing.labelGap
    width: childrenRect.width
    height: childrenRect.height
  }
}
