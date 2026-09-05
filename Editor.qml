import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "Model.js" as Model

// The layout editor. One interactive overlay per output, drawn over the grid
// the desktop uses, showing the real widget cards in their real places.
//
// It is the desktop surface's opposite: on top instead of underneath, and
// made of input instead of free of it. What makes the two line up is that
// both use `exclusiveZone: 0`, so their coordinate origins are the same point
// below the bar, and both ask Model for cell rectangles rather than computing
// their own — the cell you drop into is the cell that gets drawn.
//
// Dragging is done by hand rather than with Drag/DropArea. A drag here starts
// on one of three surfaces (a card on the grid, a tile in the tray) and can
// end on any of them, and a manual grab is the only way to keep one gesture
// in charge across all of it while the drop target changes underneath.
Item {
  id: root

  property var shell: null
  property var service: null
  property var surface: null

  readonly property var config: service ? service.config : null
  readonly property var layout: config ? config.layout : Model.normalizeLayout(null)

  readonly property color foreground: Color.popups.text
  readonly property color accent: Color.accent
  readonly property color urgent: Color.urgent
  readonly property color dim: Qt.darker(foreground, 1.5)
  readonly property string fontFamily: Style.font.family

  // The widget the controls act on. Kept on the service so it outlives this
  // window; the editor only ever asks for it and asks to change it.
  readonly property string selectedId: service ? String(service.selectedId || "") : ""
  readonly property var selected: config ? Model.findInstance(config, selectedId) : null

  function select(id) { if (service) service.select(id) }

  function sourceFor(type) {
    var entry = Model.catalogEntry(type)
    return entry ? Qt.resolvedUrl(entry.source) : ""
  }

  function nameFor(instance) { return Model.displayName(config, instance) }

  // Zones as the picker wants them: the city first, because that is what
  // anyone is scanning for, with the full name kept so the several
  // Springfields stay apart.
  readonly property var timezoneOptions: {
    var names = service && service.timezoneNames ? service.timezoneNames : []
    var out = [{ value: "", label: "Your own clock" }]
    for (var i = 0; i < names.length; i++) {
      out.push({ value: names[i], label: Model.zoneLabel(names[i]) + "  ·  " + names[i] })
    }
    return out
  }

  function close() { if (service) service.editing = false }

  Variants {
    model: Quickshell.screens

    delegate: Component {
      PanelWindow {
        id: win
        required property var modelData

        readonly property string screenName: modelData && modelData.name ? String(modelData.name) : ""
        readonly property var placed: root.config
          ? Model.widgetsForScreen(root.config, win.screenName)
          : []
        readonly property var tray: root.config ? Model.offWidgets(root.config) : []

        screen: modelData
        color: "transparent"
        anchors { top: true; bottom: true; left: true; right: true }

        WlrLayershell.namespace: "omarchy-widgets-editor"
        WlrLayershell.layer: WlrLayer.Overlay

        // The same inset the desktop surface takes, so a cell drawn here is
        // the cell the widget will occupy down to the pixel.
        exclusionMode: ExclusionMode.Normal
        exclusiveZone: 0

        // Exclusive only long enough to take the keyboard, then OnDemand.
        // Held exclusively, this surface would be delivered every keystroke on
        // the system for as long as it is open. OnDemand hands the keyboard
        // back the moment another window is focused; the brief prime is what
        // still gets focus at map time, so Escape works the instant it opens
        // without a click first. Same shape the shell's own KeyboardPanel uses.
        property bool focusPrimed: false
        WlrLayershell.keyboardFocus: focusPrimed
          ? WlrKeyboardFocus.OnDemand
          : WlrKeyboardFocus.Exclusive

        Component.onCompleted: focusPrime.restart()

        Timer {
          id: focusPrime
          interval: 75
          onTriggered: win.focusPrimed = true
        }

        // ------------------------------------------------------------ drag
        //
        // State lives per window: a gesture belongs to the screen it started
        // on, and a second monitor showing the same grid should not sprout a
        // ghost because the pointer moved on this one.

        property bool dragging: false
        property string dragId: ""
        property int dragCols: 1
        property int dragRows: 1
        // Where inside the card the pointer grabbed it, so the ghost keeps
        // its grip instead of snapping its corner to the cursor.
        property real grabX: 0
        property real grabY: 0
        property real pointerX: 0
        property real pointerY: 0

        readonly property real ghostX: pointerX - grabX
        readonly property real ghostY: pointerY - grabY

        property var hoverCell: null
        property bool dropValid: false
        property bool overTray: false

        function startDrag(instance, localGrabX, localGrabY, px, py) {
          if (!instance) return
          win.dragId = String(instance.id)
          win.dragCols = instance.cols
          win.dragRows = instance.rows
          win.grabX = localGrabX
          win.grabY = localGrabY
          win.pointerX = px
          win.pointerY = py
          win.dragging = true
          root.select(win.dragId)
          win.updateTarget()
        }

        function updateTarget() {
          if (!win.dragging) return
          var trayRect = trayPanel.mapToItem(win.contentItem, 0, 0)
          win.overTray = trayPanel.visible
            && win.pointerX >= trayRect.x && win.pointerX <= trayRect.x + trayPanel.width
            && win.pointerY >= trayRect.y && win.pointerY <= trayRect.y + trayPanel.height

          if (win.overTray) {
            win.hoverCell = null
            win.dropValid = false
            return
          }

          // Both the cell and whether it is a legal one come from Model, so
          // the highlight the user sees and the drop that follows cannot
          // disagree — they are one answer, asked once.
          var target = root.config
            ? Model.dropTarget(root.config, win.dragId, win.ghostX, win.ghostY, win.width)
            : { cell: null, valid: false }
          win.hoverCell = target.cell
          win.dropValid = target.valid
        }

        function dragMove(px, py) {
          if (!win.dragging) return
          win.pointerX = px
          win.pointerY = py
          win.updateTarget()
        }

        function dragDrop() {
          if (!win.dragging) return
          var id = win.dragId
          if (win.overTray) {
            if (root.service) root.service.setEnabled(id, false)
          } else if (win.hoverCell && win.dropValid && root.service) {
            root.service.placeWidget(id, win.hoverCell.col, win.hoverCell.row)
          }
          win.dragCancel()
        }

        function dragCancel() {
          win.dragging = false
          win.dragId = ""
          win.hoverCell = null
          win.dropValid = false
          win.overTray = false
        }

        // ----------------------------------------------------------- keys

        Item {
          id: keyCatcher
          anchors.fill: parent
          focus: true
          Keys.onEscapePressed: win.dragging ? win.dragCancel() : root.close()
          Keys.onPressed: function(event) {
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
              root.close()
              event.accepted = true
            }
          }
        }

        // Dim what is behind, so the grid reads as the thing being edited.
        // It deliberately does not close on click: a click on empty grid is
        // the end of a drag far more often than it is a request to leave.
        Rectangle {
          anchors.fill: parent
          color: Util.alpha(Color.background, 0.55)
        }

        // Catches motion and release anywhere on screen, so a drag that
        // wanders off the grid still tracks and still ends.
        MouseArea {
          id: field
          anchors.fill: parent
          hoverEnabled: true
          acceptedButtons: Qt.LeftButton
          onPositionChanged: function(mouse) { win.dragMove(mouse.x, mouse.y) }
          onReleased: win.dragDrop()
          onCanceled: win.dragCancel()
          onClicked: root.select("")
        }

        // ------------------------------------------------------- the grid

        // One row past what is used, so there is always somewhere new to drop.
        readonly property int gridRows: Math.min(Model.MAX_ROWS,
          (root.config ? Model.usedRows(root.config) : 0) + 1)

        Repeater {
          model: win.gridRows * root.layout.columns

          delegate: Rectangle {
            required property int index
            readonly property int col: index % root.layout.columns
            readonly property int row: Math.floor(index / root.layout.columns)
            readonly property var rect: Model.cellRect(root.layout, win.width, col, row, 1, 1)

            x: rect.x
            y: rect.y
            width: rect.width
            height: rect.height
            radius: Style.cornerRadius > 0 ? Style.cornerRadius : 0
            color: "transparent"
            border.width: 1
            border.color: Util.alpha(root.foreground, 0.18)
          }
        }

        // Where the card in hand would land. Accent when it fits, urgent when
        // it does not, so a refused drop is refused before it happens rather
        // than by nothing appearing to change.
        Rectangle {
          visible: win.dragging && win.hoverCell !== null
          readonly property var rect: win.hoverCell
            ? Model.cellRect(root.layout, win.width, win.hoverCell.col, win.hoverCell.row,
                win.dragCols, win.dragRows)
            : ({ x: 0, y: 0, width: 0, height: 0 })
          x: rect.x
          y: rect.y
          width: rect.width
          height: rect.height
          radius: Style.cornerRadius > 0 ? Style.cornerRadius : 0
          color: Util.alpha(win.dropValid ? root.accent : root.urgent, 0.18)
          border.width: 2
          border.color: Util.alpha(win.dropValid ? root.accent : root.urgent, 0.9)
        }

        // ------------------------------------------------- placed widgets

        Repeater {
          model: win.placed

          delegate: Item {
            id: slot
            required property var modelData

            readonly property var rect: Model.widgetRect(root.layout, modelData, win.width)
            readonly property bool isDragged: win.dragging && win.dragId === modelData.id
            readonly property bool isSelected: root.selectedId === modelData.id

            x: rect.x
            y: rect.y
            width: rect.width
            height: rect.height
            // Left in place but faded while it is in hand, so the grid keeps
            // showing where it came from.
            opacity: isDragged ? 0.25 : 1

            WidgetInstance {
              anchors.fill: parent
              service: root.service
              instance: slot.modelData
              widgetSource: root.sourceFor(slot.modelData.type)
            }

            Rectangle {
              anchors.fill: parent
              anchors.margins: -3
              visible: slot.isSelected && !slot.isDragged
              radius: (slot.modelData.radius < 0 ? Style.cornerRadius : slot.modelData.radius) + 3
              color: "transparent"
              border.width: 2
              border.color: root.accent
            }

            MouseArea {
              anchors.fill: parent
              acceptedButtons: Qt.LeftButton
              cursorShape: Qt.OpenHandCursor
              preventStealing: true

              property real pressX: 0
              property real pressY: 0
              property bool armed: false

              onPressed: function(mouse) {
                pressX = mouse.x
                pressY = mouse.y
                armed = true
                root.select(slot.modelData.id)
              }

              onPositionChanged: function(mouse) {
                var p = mapToItem(win.contentItem, mouse.x, mouse.y)
                if (win.dragging) { win.dragMove(p.x, p.y); return }
                if (!armed) return
                // A few pixels of slop so selecting a widget by clicking it
                // does not turn into a one-pixel drag.
                if (Math.abs(mouse.x - pressX) + Math.abs(mouse.y - pressY) < 6) return
                win.startDrag(slot.modelData, pressX, pressY, p.x, p.y)
              }

              onReleased: function(mouse) {
                armed = false
                if (win.dragging) win.dragDrop()
              }

              onCanceled: { armed = false; win.dragCancel() }
            }
          }
        }

        // -------------------------------------------------- tray + controls

        BorderSurface {
          id: trayPanel
          anchors.horizontalCenter: parent.horizontalCenter
          anchors.bottom: parent.bottom
          anchors.bottomMargin: Style.gapsOut + Style.space(12)
          width: Math.min(win.width - Style.space(40), controls.implicitWidth + Style.space(36))
          height: controls.implicitHeight + Style.space(28)
          radius: Style.cornerRadius > 0 ? Style.cornerRadius : 0
          color: Color.popups.background
          borderSpec: Border.surfaceSpec("popups", "border", Color.popups.border, Math.max(1, Style.space(2)))

          // While a card is over the tray, the tray says so.
          Rectangle {
            anchors.fill: parent
            anchors.margins: 2
            visible: win.overTray
            radius: parent.radius
            color: Util.alpha(root.urgent, 0.16)
            border.width: 2
            border.color: Util.alpha(root.urgent, 0.8)
          }

          // Swallow clicks so a press on the toolbar is not also a press on
          // the dismissal field behind it.
          MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.AllButtons
            onClicked: {}
          }

          Column {
            id: controls
            anchors.centerIn: parent
            spacing: Style.space(10)

            Row {
              anchors.horizontalCenter: parent.horizontalCenter
              spacing: Style.space(14)

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "Side"
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }

              ButtonGroup {
                anchors.verticalCenter: parent.verticalCenter
                options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }]
                value: root.layout.side
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                focusable: false
                onChanged: function(v) { if (root.service) root.service.setSide(v) }
              }

              PanelSeparator {
                anchors.verticalCenter: parent.verticalCenter
                width: 1
                height: Style.space(20)
                foreground: root.foreground
                strength: 0.25
              }

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "Columns"
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }

              // Only the counts that actually fit this screen are offered. A
              // grid wider than the display would put widgets somewhere you
              // cannot look at them, and the count is measured against this
              // window, which is already the usable area minus the bar.
              ButtonGroup {
                anchors.verticalCenter: parent.verticalCenter
                options: {
                  var counts = Model.columnOptions(root.layout, win.width)
                  var out = []
                  for (var i = 0; i < counts.length; i++)
                    out.push({ value: String(counts[i]), label: String(counts[i]) })
                  return out
                }
                value: String(root.layout.columns)
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                focusable: false
                onChanged: function(v) { if (root.service) root.service.setColumns(Number(v)) }
              }

              PanelSeparator {
                anchors.verticalCenter: parent.verticalCenter
                width: 1
                height: Style.space(20)
                foreground: root.foreground
                strength: 0.25
              }

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "Scale"
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }

              // One field, in percent, set at 100: any whole number from 0 to
              // 200, typecast by the spinbox and written back as the factor.
              NumberField {
                anchors.verticalCenter: parent.verticalCenter
                label: ""
                value: Math.round(root.layout.scale * 100)
                from: 0
                to: 200
                stepSize: 10
                fieldWidth: Style.space(64)
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                onModified: function(v) { if (root.service) root.service.setScale(Number(v) / 100) }
              }

              PanelSeparator {
                anchors.verticalCenter: parent.verticalCenter
                width: 1
                height: Style.space(20)
                foreground: root.foreground
                strength: 0.25
              }

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "Opacity"
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }

              // The whole grid's opacity, in percent. A card that has its own
              // opacity set keeps it; the rest follow this one.
              NumberField {
                anchors.verticalCenter: parent.verticalCenter
                label: ""
                value: Math.round(root.layout.opacity * 100)
                from: 0
                to: 100
                stepSize: 5
                fieldWidth: Style.space(64)
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                onModified: function(v) { if (root.service) root.service.setLayoutOpacity(Number(v) / 100) }
              }

              PanelSeparator {
                anchors.verticalCenter: parent.verticalCenter
                width: 1
                height: Style.space(20)
                foreground: root.foreground
                strength: 0.25
              }

              // A small escape hatch from both the knobs above: scale and
              // opacity (grid-wide and every card's) go back to their
              // defaults.
              Button {
                anchors.verticalCenter: parent.verticalCenter
                text: "Reset"
                tooltipText: "Restore the default scale and opacity"
                bordered: true
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                fontSize: Style.font.bodySmall
                horizontalPadding: Style.space(10)
                verticalPadding: Style.space(6)
                onClicked: if (root.service) root.service.resetAppearance()
              }

              PanelSeparator {
                anchors.verticalCenter: parent.verticalCenter
                width: 1
                height: Style.space(20)
                foreground: root.foreground
                strength: 0.25
              }

              Text {
                anchors.verticalCenter: parent.verticalCenter
                visible: root.selected !== null
                text: root.nameFor(root.selected)
                textFormat: Text.PlainText
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
              }

              Button {
                anchors.verticalCenter: parent.verticalCenter
                visible: root.selected !== null
                  && Model.sizesFor(root.selected ? root.selected.type : "").length > 1
                text: root.selected ? (root.selected.cols + "×" + root.selected.rows) : ""
                tooltipText: "Change the size of " + root.nameFor(root.selected)
                bordered: true
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                onClicked: if (root.service) root.service.cycleSize(root.selectedId)
              }

              Button {
                anchors.verticalCenter: parent.verticalCenter
                text: "Done"
                bordered: true
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                onClicked: root.close()
              }
            }

            // What the selected widget can be told. Every control here is
            // built from the type's own settings schema, so a widget added
            // later gets this panel by describing itself — nothing in the
            // editor knows what a clock is. Opacity and scale are ahead of all
            // of them because they are true of every card, not just the ones
            // with settings.
            Row {
              anchors.horizontalCenter: parent.horizontalCenter
              spacing: Style.space(12)
              visible: root.selected !== null

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "Opacity"
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }

              // Whole percent, from see-through to solid. Reads the card's
              // own value when it has one, the layout's global otherwise;
              // editing always sets the card's own.
              NumberField {
                anchors.verticalCenter: parent.verticalCenter
                label: ""
                value: root.selected ? Math.round(Model.effectiveOpacity(root.config, root.selected) * 100) : 100
                from: 0
                to: 100
                stepSize: 5
                fieldWidth: Style.space(64)
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                onModified: function(v) {
                  if (root.service && root.selectedId) root.service.setOpacity(root.selectedId, Number(v) / 100)
                }
              }

              // Give a card that set its own opacity back to the grid's.
              Button {
                anchors.verticalCenter: parent.verticalCenter
                visible: root.selected !== null && root.selected.opacity !== null
                text: "↺"
                tooltipText: "Follow the grid's opacity instead of this one"
                bordered: true
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                onClicked: if (root.service && root.selectedId) root.service.clearOpacity(root.selectedId)
              }

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "Scale"
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }

              // Same idea as the grid's Scale field, but this one belongs to
              // the selected card alone: it overrides the grid for this card.
              NumberField {
                anchors.verticalCenter: parent.verticalCenter
                label: ""
                value: root.selected
                  ? Math.round(Model.effectiveScale(root.layout, root.selected) * 100) : 100
                from: 0
                to: 200
                stepSize: 10
                fieldWidth: Style.space(64)
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                onModified: function(v) {
                  if (root.service && root.selectedId) root.service.setWidgetScale(root.selectedId, Number(v) / 100)
                }
              }

              // Give a card that set its own scale back to the grid's.
              Button {
                anchors.verticalCenter: parent.verticalCenter
                visible: root.selected !== null && root.selected.scale !== null
                text: "↺"
                tooltipText: "Follow the grid's scale instead of this one"
                bordered: true
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                onClicked: if (root.service && root.selectedId) root.service.clearScale(root.selectedId)
              }

              Repeater {
                id: schemaRepeater
                model: root.selected ? Model.settingsSchema(root.selected.type) : []

                delegate: Row {
                  id: setting
                  required property var modelData
                  readonly property var value: root.selected && root.selected.settings
                    ? root.selected.settings[modelData.key] : undefined

                  spacing: Style.space(6)

                  function commit(v) {
                    if (root.service && root.selectedId)
                      root.service.setSetting(root.selectedId, modelData.key, v)
                  }

                  Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: setting.modelData.label
                    textFormat: Text.PlainText
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                  }

                  // Enough zones that scanning is friction, so this one
                  // carries a filter.
                  PickerField {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: setting.modelData.type === "timezone"
                    width: visible ? Style.space(210) : 0
                    height: Style.spacing.controlHeight
                    windowHeight: win.height
                    searchable: true
                    searchPlaceholder: "Search cities…"
                    emptyText: "No city by that name"
                    emptyLabel: "Your own clock"
                    options: root.timezoneOptions
                    value: String(setting.value || "")
                    foreground: root.foreground
                    accent: root.accent
                    fontFamily: root.fontFamily
                    onChanged: function(v) { setting.commit(v) }
                  }

                  PickerField {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: setting.modelData.type === "choice"
                    width: visible ? Style.space(120) : 0
                    height: Style.spacing.controlHeight
                    windowHeight: win.height
                    options: setting.modelData.options || []
                    value: String(setting.value || "")
                    foreground: root.foreground
                    accent: root.accent
                    fontFamily: root.fontFamily
                    onChanged: function(v) { setting.commit(v) }
                  }

                  TextField {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: setting.modelData.type === "text"
                    width: visible ? Style.space(110) : 0
                    text: String(setting.value || "")
                    placeholderText: setting.modelData.help || ""
                    foreground: root.foreground
                    accent: root.accent
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    // Committed as you type, so an edit cannot be lost by
                    // closing the editor without pressing Enter.
                    onTextEdited: setting.commit(text)
                  }

                  ToggleSwitch {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: setting.modelData.type === "boolean"
                    checked: setting.value === true
                    foreground: root.foreground
                    accent: root.accent
                    onToggled: setting.commit(!(setting.value === true))
                  }
                }
              }
            }

            // The tray. Widgets that are off live here; drag one onto the
            // grid to put it up, drag one back to take it down.
            Row {
              anchors.horizontalCenter: parent.horizontalCenter
              spacing: Style.space(8)
              visible: win.tray.length > 0

              Repeater {
                model: win.tray

                delegate: BorderSurface {
                  id: chip
                  required property var modelData

                  width: Style.space(96)
                  height: Style.space(34)
                  radius: Style.cornerRadius > 0 ? Style.cornerRadius : 0
                  color: Util.alpha(root.foreground, chipDrag.containsMouse ? 0.12 : 0.05)
                  borderSpec: Border.flat(Util.alpha(root.foreground, 0.3), 1)

                  Text {
                    anchors.centerIn: parent
                    text: root.nameFor(chip.modelData)
                    textFormat: Text.PlainText
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                  }

                  MouseArea {
                    id: chipDrag
                    anchors.fill: parent
                    hoverEnabled: true
                    acceptedButtons: Qt.LeftButton
                    cursorShape: Qt.OpenHandCursor
                    preventStealing: true

                    property real pressX: 0
                    property real pressY: 0
                    property bool armed: false

                    onPressed: function(mouse) {
                      pressX = mouse.x
                      pressY = mouse.y
                      armed = true
                    }

                    onPositionChanged: function(mouse) {
                      var p = mapToItem(win.contentItem, mouse.x, mouse.y)
                      if (win.dragging) { win.dragMove(p.x, p.y); return }
                      if (!armed) return
                      if (Math.abs(mouse.x - pressX) + Math.abs(mouse.y - pressY) < 6) return
                      // Grabbed from the middle of the block it will become,
                      // because the chip is nothing like the size of the card.
                      var blockW = Model.blockWidth(root.layout, chip.modelData.cols)
                      var blockH = Model.blockHeight(root.layout, chip.modelData.rows)
                      win.startDrag(chip.modelData, blockW / 2, blockH / 2, p.x, p.y)
                    }

                    onReleased: {
                      armed = false
                      if (win.dragging) win.dragDrop()
                    }

                    onCanceled: { armed = false; win.dragCancel() }
                  }
                }
              }
            }

            Text {
              anchors.horizontalCenter: parent.horizontalCenter
              width: Math.min(implicitWidth, trayPanel.width - Style.space(24))
              horizontalAlignment: Text.AlignHCenter
              wrapMode: Text.Wrap
              textFormat: Text.PlainText
              text: root.selected !== null
                ? "Drag it to move it, or into the bar below to take it off the desktop."
                : "Drag a widget to move it. Click one to change its settings."
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }
        }

        // ---------------------------------------------------------- ghost
        //
        // The card in hand. Drawn last so it is over everything, and made of
        // the same component as the real thing so what follows the pointer is
        // what will be left behind.

        Item {
          visible: win.dragging
          x: win.ghostX
          y: win.ghostY
          width: Model.blockWidth(root.layout, win.dragCols)
          height: Model.blockHeight(root.layout, win.dragRows)
          opacity: 0.85
          scale: 1.03

          WidgetInstance {
            anchors.fill: parent
            service: root.service
            instance: win.dragging && root.config ? Model.findInstance(root.config, win.dragId) : null
            widgetSource: {
              var inst = win.dragging && root.config ? Model.findInstance(root.config, win.dragId) : null
              return inst ? root.sourceFor(inst.type) : ""
            }
          }
        }
      }
    }
  }
}
