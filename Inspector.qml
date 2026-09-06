import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Everything that is true of one widget, in one panel, beside the widget it
// is about.
//
// It used to be a second row on the toolbar: the card's name, then its size,
// then Duplicate and Remove, then whatever its schema asked for, all reading
// left to right across the bottom of the screen. That row grew with every
// setting any widget declared, and it put the controls for one card as far
// from it as the screen is wide.
//
// Here instead, docked on the side the grid is not, so it never covers the
// thing being edited and never moves while you work. It is only up while
// something is selected — a click on empty grid puts it away — so the editor
// is quiet by default and detailed on demand.
BorderSurface {
  id: root

  property var service: null
  property var config: null
  property var selected: null
  property string selectedId: ""
  property var layout: null
  property var timezoneOptions: []
  property real windowHeight: 0
  // The most this may grow to before its content starts scrolling.
  property real maxHeight: 400

  property color foreground: Color.popups.text
  property color accent: Color.accent
  property color urgent: Color.urgent
  property string fontFamily: Style.font.family

  readonly property color dim: Qt.darker(foreground, 1.5)
  readonly property string type: selected ? String(selected.type) : ""
  readonly property real contentWidth: Style.space(272)

  readonly property var sizeOptions: {
    if (!root.selected || !root.layout) return []
    var sizes = Model.sizesWithin(root.type, root.layout.columns)
    var out = []
    for (var i = 0; i < sizes.length; i++) {
      out.push({
        value: sizes[i][0] + "x" + sizes[i][1],
        label: Model.sizeLabel(sizes[i][0], sizes[i][1])
      })
    }
    return out
  }

  function commit(key, value) {
    if (service && selectedId) service.setSetting(selectedId, key, value)
  }

  width: contentWidth + Style.spacing.panelPadding * 2
  height: Math.min(root.maxHeight, column.implicitHeight + Style.spacing.panelPadding * 2)
  radius: Style.cornerRadius > 0 ? Style.cornerRadius : 0
  color: Color.popups.background
  borderSpec: Border.surfaceSpec("popups", "border", Color.popups.border, Math.max(1, Style.space(2)))

  // Swallow clicks, so working the controls is not also clicking the grid
  // behind them.
  MouseArea {
    anchors.fill: parent
    acceptedButtons: Qt.AllButtons
    onClicked: {}
    onWheel: function(wheel) { wheel.accepted = true }
  }

  Flickable {
    anchors.fill: parent
    anchors.margins: Style.spacing.panelPadding
    contentHeight: column.implicitHeight
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    interactive: contentHeight > height

    Column {
      id: column
      width: parent.width
      spacing: Style.spacing.xxl

      // ------------------------------------------------------------ name

      Row {
        width: parent.width
        spacing: Style.spacing.lg

        Text {
          anchors.verticalCenter: parent.verticalCenter
          text: Model.iconFor(root.type)
          textFormat: Text.PlainText
          color: root.accent
          font.family: root.fontFamily
          font.pixelSize: Style.font.iconLarge
          renderType: Text.NativeRendering
        }

        Column {
          anchors.verticalCenter: parent.verticalCenter
          width: parent.width - parent.spacing - Style.font.iconLarge
          spacing: Style.spacing.xxs

          Text {
            width: parent.width
            elide: Text.ElideRight
            textFormat: Text.PlainText
            text: Model.displayName(root.config, root.selected)
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.title
            font.bold: true
          }

          // The id, which is the name the command line and the config file
          // know this card by. Worth having somewhere, and this is the one
          // place there is room for it.
          Text {
            width: parent.width
            elide: Text.ElideRight
            textFormat: Text.PlainText
            text: root.selectedId
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }
        }
      }

      PanelSeparator { width: parent.width; foreground: root.foreground }

      // ------------------------------------------------- size and opacity
      //
      // Ahead of the schema because they are true of every card, and a list
      // rather than a button that cycles because the photo card offers seven
      // footprints and pressing through six of them to reach the last is not
      // a choice, it is a wait.

      Field {
        width: parent.width
        label: "Size"
        visible: root.sizeOptions.length > 1
        foreground: root.foreground
        fontFamily: root.fontFamily

        PickerField {
          width: root.contentWidth
          height: Style.spacing.controlHeight
          windowHeight: root.windowHeight
          options: root.sizeOptions
          value: root.selected ? (root.selected.cols + "x" + root.selected.rows) : ""
          foreground: root.foreground
          accent: root.accent
          fontFamily: root.fontFamily
          onChanged: function(v) {
            var parts = String(v).split("x")
            if (root.service && root.selectedId && parts.length === 2)
              root.service.resizeWidget(root.selectedId, Number(parts[0]), Number(parts[1]))
          }
        }
      }

      Field {
        width: parent.width
        label: "Opacity"
        foreground: root.foreground
        fontFamily: root.fontFamily

        Row {
          spacing: Style.spacing.md

          // Reads the card's own value when it has one, the grid's otherwise;
          // editing always sets the card's own.
          NumberField {
            anchors.verticalCenter: parent.verticalCenter
            label: ""
            value: root.selected ? Math.round(Model.effectiveOpacity(root.config, root.selected) * 100) : 100
            from: 0
            to: 100
            stepSize: 5
            fieldWidth: Style.space(84)
            foreground: root.foreground
            accent: root.accent
            fontFamily: root.fontFamily
            onModified: function(v) {
              if (root.service && root.selectedId) root.service.setOpacity(root.selectedId, Number(v) / 100)
            }
          }

          Button {
            anchors.verticalCenter: parent.verticalCenter
            visible: root.selected !== null && root.selected.opacity !== null
            text: "↺"
            tooltipText: "Follow the grid's opacity instead of this one"
            bordered: true
            foreground: root.foreground
            accent: root.accent
            fontFamily: root.fontFamily
            fontSize: Style.font.bodySmall
            onClicked: if (root.service && root.selectedId) root.service.clearOpacity(root.selectedId)
          }
        }
      }

      // ----------------------------------------------------- the schema

      PanelSeparator {
        width: parent.width
        foreground: root.foreground
        visible: schema.count > 0
      }

      Repeater {
        id: schema
        model: root.selected ? Model.settingsSchema(root.type) : []

        delegate: SettingField {
          required property var modelData
          width: column.width
          spec: modelData
          value: root.selected && root.selected.settings
            ? root.selected.settings[modelData.key] : undefined
          foreground: root.foreground
          accent: root.accent
          fontFamily: root.fontFamily
          windowHeight: root.windowHeight
          timezoneOptions: root.timezoneOptions
          onCommitted: function(v) { root.commit(modelData.key, v) }
          onChooseRequested: function(pathKind) {
            if (!root.service || !root.selectedId) return
            root.service.choosePath(root.selectedId, modelData.key, pathKind,
              "Choose " + String(modelData.label).toLowerCase()
                + " for " + Model.displayName(root.config, root.selected),
              modelData.extensions || "")
          }
        }
      }

      // --------------------------------------------------- one more, or none

      PanelSeparator {
        width: parent.width
        foreground: root.foreground
        visible: duplicate.visible || remove.visible
      }

      Row {
        width: parent.width
        spacing: Style.spacing.md

        // Only for a type that says a second one means something — a
        // duplicate weather card would be the same reading twice.
        Button {
          id: duplicate
          visible: Model.allowsMultiple(root.type)
          text: "Duplicate"
          tooltipText: "Add another, with these settings"
          bordered: true
          foreground: root.foreground
          accent: root.accent
          fontFamily: root.fontFamily
          fontSize: Style.font.bodySmall
          onClicked: if (root.service) root.service.duplicateWidget(root.selectedId)
        }

        // ...and away again. Only ever offered for a spare: the last of a type
        // is switched off rather than deleted, because deleting it would only
        // mean the next config read put a fresh one back.
        Button {
          id: remove
          visible: root.config !== null && Model.canRemove(root.config, root.selectedId)
          text: "Remove"
          tooltipText: "Delete this widget and its settings"
          bordered: true
          foreground: root.urgent
          accent: root.urgent
          fontFamily: root.fontFamily
          fontSize: Style.font.bodySmall
          onClicked: if (root.service) root.service.removeWidget(root.selectedId)
        }
      }
    }
  }
}
