import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// The bar button and the popup behind it: one row per widget in the
// catalogue, each a switch. Holds no state of its own — every row reads the
// service and every click writes back to it, so the desktop and this popup
// can never disagree about what is on.
BarWidget {
  id: root
  moduleName: "io.github.anishfn.widgets"

  readonly property var service: bar && bar.shell && typeof bar.shell.serviceFor === "function"
    ? bar.shell.serviceFor(moduleName) : null

  readonly property var widgets: service ? service.widgets : []
  readonly property int enabledCount: service ? service.enabledCount : 0
  readonly property var layout: service ? service.layout : null
  readonly property string gridSummary: layout
    ? (layout.columns + (layout.columns === 1 ? " column" : " columns") + " on the " + layout.side)
    : ""
  readonly property bool showCount: setting("showCount", false) === true

  // Two different foregrounds on purpose. The bar row follows the bar, which
  // has its own rule for transparent bars; the popup is drawn on the popup
  // surface and follows that instead.
  readonly property color foreground: Color.popups.text
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  // nf-fa-th_large. One glyph in both states rather than a filled/outlined
  // pair: the button already dims when nothing is on screen, and an icon
  // that changes shape reads as a different button, not a different state.
  readonly property string glyph: ""
  readonly property string labelText: showCount ? String(enabledCount) : ""

  // ------------------------------------------------- shell summon interface
  //
  // shell.qml's summon routing needs exactly these three names, and having
  // them is the whole IPC surface this widget needs: `omarchy-shell shell
  // toggle <plugin-id>` already routes here. A handler of our own would
  // register once per monitor, since a bar surface exists per output.
  readonly property bool opened: panel.open
  function open() { cursorIndex = 0; cursorActive = false; panel.open = true }
  function close() { panel.open = false }
  function toggle() { opened ? close() : open() }

  // ------------------------------------------------------- keyboard cursor

  property int cursorIndex: 0
  property bool cursorActive: false

  // The rows are every widget, plus one action at the end that opens the
  // editor — so the keyboard reaches everything the mouse can.
  readonly property int rowCount: widgets.length + 1

  function moveCursor(delta) {
    if (rowCount === 0) return
    if (!cursorActive) { cursorActive = true; return }
    var next = cursorIndex + delta
    if (next < 0) next = rowCount - 1
    if (next >= rowCount) next = 0
    cursorIndex = next
  }

  function activateCursor() {
    if (!cursorActive) { cursorActive = true; return }
    if (cursorIndex >= widgets.length) { editLayout(); return }
    var target = widgets[cursorIndex]
    if (target) toggleWidget(target.id)
  }

  function toggleWidget(id) {
    if (!service) return
    service.toggle(id)
  }

  // Arranging is a different job from choosing, and it needs the whole
  // screen. Close the popup on the way so the editor is not opening behind
  // a panel that is about to take the keyboard back.
  function editLayout() {
    if (!service) return
    close()
    service.openEditor()
  }

  // Distinguishing rather than just descriptive: with two clocks on the
  // desktop, two rows both reading "Clock" name neither of them.
  function nameFor(instance) {
    return Model.displayName(service ? service.config : null, instance)
  }

  function descriptionFor(instance) {
    var entry = Model.catalogEntry(instance.type)
    return entry ? entry.description : ""
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onOpenedChanged: if (opened) { cursorIndex = 0; cursorActive = false }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    fontFamily: root.fontFamily
    tooltipText: root.enabledCount === 1
      ? "1 widget on the desktop"
      : root.enabledCount + " widgets on the desktop"
    // Dimmed while nothing is on screen: the button is still there to be
    // clicked, it just isn't showing you anything yet.
    dimmed: root.enabledCount === 0
    onPressed: function(b) { root.toggle() }

    labelVisible: false
    hasVisualContent: true
    fixedWidth: vertical ? -1 : content.implicitWidth + scaledHorizontalMargin * 2

    Row {
      id: content
      anchors.centerIn: parent
      spacing: Style.space(6)

      Text {
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: root.glyph
        color: button.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.icon
        renderType: Text.NativeRendering
      }

      Text {
        anchors.verticalCenter: parent.verticalCenter
        visible: root.labelText !== ""
        textFormat: Text.PlainText
        text: root.labelText
        color: button.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        renderType: Text.NativeRendering
      }
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(300))
    contentHeight: panel.fittedContentHeight(column.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) { root.moveCursor(dy !== 0 ? dy : dx) }
      onActivateRequested: root.activateCursor()
      onCloseRequested: root.close()
      onTabRequested: function(direction) {
        if (root.bar && typeof root.bar.switchPanelFrom === "function") root.bar.switchPanelFrom(root, direction)
      }

      Column {
        id: column
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        spacing: Style.space(6)

        PanelSectionHeader {
          text: "On the desktop"
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        Text {
          width: parent.width
          visible: root.widgets.length === 0
          wrapMode: Text.Wrap
          textFormat: Text.PlainText
          text: "No widgets are configured. If this is unexpected, check "
            + "~/.config/omarchy/widgets.json."
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
        }

        Repeater {
          model: root.widgets

          Toggle {
            required property var modelData
            required property int index

            width: column.width
            label: root.nameFor(modelData)
            description: root.descriptionFor(modelData)
            checked: modelData.enabled === true
            hasCursor: root.cursorActive && root.cursorIndex === index
            foreground: root.foreground
            accent: Color.accent
            fontFamily: root.fontFamily
            onClicked: root.toggleWidget(modelData.id)
          }
        }

        PanelSeparator {
          width: parent.width
          foreground: root.foreground
          visible: root.widgets.length > 0
        }

        Button {
          width: parent.width
          text: "Arrange…"
          tooltipText: "Drag the widgets around on the desktop"
          bordered: true
          leftAlign: true
          hasCursor: root.cursorActive && root.cursorIndex === root.widgets.length
          foreground: root.foreground
          accent: Color.accent
          fontFamily: root.fontFamily
          onClicked: root.editLayout()
        }

        Text {
          width: parent.width
          horizontalAlignment: Text.AlignHCenter
          textFormat: Text.PlainText
          text: root.gridSummary
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
    }
  }
}
