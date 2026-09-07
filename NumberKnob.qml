import QtQuick
import QtQuick.Controls as QQC
import qs.Commons
import qs.Ui

// A number knob that applies the moment you type, no Enter required. The
// shell's NumberField only reports on commit, which is the wrong tool for a
// bar control whose whole value lives in the field: typing "110" should move
// the grid at "1", "10" and "110", not once the line is finished. Reads the
// same Style the shell control does, so it sits in the row without looking
// like a second kind of control.
//
// The knob is deliberately a plain TextField, not a QQC.SpinBox. A spinbox
// hides its edit surface behind the control's internals (a programmatic
// `value` change while the user is typing rewrites their text) and only
// reports the finished number. A TextField lets the editor see every
// keystroke as it happens, and the knob writes the parsed, clamped number
// back the instant the digit lands.
Column {
  id: knob

  property int value: 0
  property int from: 0
  property int to: 100
  property color foreground: Color.foreground
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  property real fontSize: Style.font.body
  property real fieldWidth: Style.space(76)

  signal modified(int value)

  BorderSurface {
    id: box

    width: knob.fieldWidth
    height: Style.spacing.controlHeight
    radius: Style.cornerRadius

    readonly property bool _hot: hover.hovered || field.activeFocus
    color: Style.controlFill(field.activeFocus, _hot, knob.foreground, knob.accent)
    borderSpec: Border.controlSpec(field.activeFocus ? "focus" : (_hot ? "hover-cursor" : "normal"), knob.foreground, knob.accent)

    HoverHandler {
      id: hover
    }

    QQC.TextField {
      id: field

      anchors.fill: parent
      horizontalAlignment: Text.AlignHCenter
      verticalAlignment: Text.AlignVCenter
      text: String(knob.value)
      color: knob.foreground
      selectionColor: Style.selectionFillFor(knob.foreground, knob.accent)
      selectedTextColor: knob.foreground
      font.family: knob.fontFamily
      font.pixelSize: knob.fontSize
      validator: IntValidator {
        bottom: knob.from
        top: knob.to
      }
      inputMethodHints: Qt.ImhFormattedNumbersOnly

      // User keystrokes only: textEdited, not textChanged, so the field
      // rewriting itself as the value lands does not loop back into applying.
      // The value is clamped the same way the rest of the pipe clamps it.
      onTextEdited: {
        var t = String(text).trim()
        if (t === "") return
        var n = Number(t)
        if (!isFinite(n)) return
        knob.value = Math.max(knob.from, Math.min(knob.to, n))
        knob.modified(knob.value)
      }
    }
  }
}