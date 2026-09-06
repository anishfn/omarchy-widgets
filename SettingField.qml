import QtQuick
import qs.Commons
import qs.Ui

// One setting from a widget type's schema, drawn as whatever its kind asks
// for. The editor owns none of this: it hands over a schema entry and a value
// and takes back the value the user left, so a widget added later gets a
// working control by describing itself.
//
// Two shapes, not one. A switch takes its name on the same line, because a
// switch is a small thing and a name stacked above it reads as a heading over
// a section. Everything else takes its name above, because the control is as
// wide as the panel and a name beside it would halve that.
Column {
  id: root

  property var spec: null
  property var value: undefined

  property color foreground: Color.popups.text
  property color accent: Color.accent
  property string fontFamily: Style.font.family

  // The window this is drawn in, so a picker knows whether it has room to
  // open downwards.
  property real windowHeight: 0
  property var timezoneOptions: []

  // Set when the value came back from a file chooser rather than the
  // keyboard, so the field can show it without the caret moving.
  readonly property string kind: spec ? String(spec.type) : "text"
  readonly property string text: value === undefined || value === null ? "" : String(value)

  signal committed(var value)
  // Which chooser to open, "file" / "image" / "folder". The editor runs it,
  // because opening one means closing the editor and only the editor knows
  // that.
  signal chooseRequested(string pathKind)

  // Read by length rather than by Array.isArray: a schema entry reaches a
  // delegate through the QML model, and the nested list arrives as a
  // QVariantList, which indexes like an array and is not one.
  function pathKinds() {
    var kinds = spec ? spec.pathKinds : null
    if (!kinds || !kinds.length) return ["file"]
    var out = []
    for (var i = 0; i < kinds.length; i++) out.push(String(kinds[i]))
    return out
  }

  function chooserLabel(pathKind) {
    if (pathKind === "image") return "Image…"
    if (pathKind === "folder") return "Folder…"
    return "Choose…"
  }

  spacing: Style.spacing.labelGap

  // ------------------------------------------------------------- a switch

  Item {
    visible: root.kind === "boolean"
    width: root.width
    height: visible ? Style.spacing.controlHeight : 0

    Text {
      anchors.left: parent.left
      anchors.right: knob.left
      anchors.rightMargin: Style.spacing.md
      anchors.verticalCenter: parent.verticalCenter
      elide: Text.ElideRight
      textFormat: Text.PlainText
      text: root.spec ? String(root.spec.label) : ""
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
    }

    ToggleSwitch {
      id: knob
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      checked: root.value === true
      foreground: root.foreground
      accent: root.accent
      onToggled: root.committed(!(root.value === true))
    }
  }

  // ------------------------------------------------- everything else, named

  Text {
    visible: root.kind !== "boolean"
    width: root.width
    elide: Text.ElideRight
    textFormat: Text.PlainText
    text: root.spec ? String(root.spec.label) : ""
    color: Qt.darker(root.foreground, 1.4)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: true
  }

  TextField {
    visible: root.kind === "text"
    width: root.width
    text: root.text
    placeholderText: root.spec && root.spec.help ? String(root.spec.help) : ""
    foreground: root.foreground
    accent: root.accent
    font.family: root.fontFamily
    font.pixelSize: Style.font.bodySmall
    // Committed as you type, so an edit cannot be lost by closing the editor
    // without pressing Enter.
    onTextEdited: root.committed(text)
  }

  PickerField {
    visible: root.kind === "choice"
    width: root.width
    height: Style.spacing.controlHeight
    windowHeight: root.windowHeight
    options: root.spec && root.spec.options ? root.spec.options : []
    value: root.text
    foreground: root.foreground
    accent: root.accent
    fontFamily: root.fontFamily
    onChanged: function(v) { root.committed(v) }
  }

  PickerField {
    visible: root.kind === "timezone"
    width: root.width
    height: Style.spacing.controlHeight
    windowHeight: root.windowHeight
    searchable: true
    searchPlaceholder: "Search cities…"
    emptyText: "No city by that name"
    emptyLabel: "Your own clock"
    options: root.timezoneOptions
    value: root.text
    foreground: root.foreground
    accent: root.accent
    fontFamily: root.fontFamily
    onChanged: function(v) { root.committed(v) }
  }

  // ------------------------------------------------------------- a path
  //
  // Typing one still works — it is the same string it always was, and a path
  // pasted from a terminal is faster than any dialog. The buttons are for the
  // other case, which is most of them: nobody knows the path of the
  // photograph they mean, they know it when they see it.

  Item {
    visible: root.kind === "path"
    width: root.width
    height: visible ? pathColumn.implicitHeight : 0

    Column {
      id: pathColumn
      width: parent.width
      spacing: Style.spacing.sm

      TextField {
        width: parent.width
        text: root.text
        placeholderText: root.spec && root.spec.help ? String(root.spec.help) : ""
        foreground: root.foreground
        accent: root.accent
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        onTextEdited: root.committed(text)
      }

      Row {
        spacing: Style.spacing.md

        Repeater {
          model: root.pathKinds()

          delegate: Button {
            required property var modelData
            text: root.chooserLabel(String(modelData))
            tooltipText: String(modelData) === "folder"
              ? "Pick a folder in the desktop's file chooser"
              : "Pick a file in the desktop's file chooser"
            bordered: true
            foreground: root.foreground
            accent: root.accent
            fontFamily: root.fontFamily
            fontSize: Style.font.bodySmall
            horizontalPadding: Style.spacing.controlPaddingX
            verticalPadding: Style.spacing.controlPaddingY
            onClicked: root.chooseRequested(String(modelData))
          }
        }
      }
    }
  }
}
