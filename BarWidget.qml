import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// The bar button and the popup behind it: one row per widget in the
// catalogue, each a switch. Holds no state of its own — every row reads the
// service and every click writes back to it, so the desktop and this popup
// can never disagree about what is on.
//
// The list is as long as the catalogue and gets longer every time somebody
// contributes a widget, which is what the shape here is for. Three things
// make it hold: a row is one line rather than three, the rows are grouped by
// whether they are on the desktop or not, and the group of them scrolls
// inside a fixed panel instead of running off the bottom of the screen. What
// used to be a list you read is a list you scan.
BarWidget {
  id: root
  moduleName: "anishfn.widgets"

  readonly property var service: bar && bar.shell && typeof bar.shell.serviceFor === "function"
    ? bar.shell.serviceFor(moduleName) : null

  readonly property var widgets: service ? service.widgets : []
  readonly property int enabledCount: service ? service.enabledCount : 0

  // The list as it is drawn: what is on, then what is not, with a heading
  // over each group. Built as one flat array because the cursor, the rows and
  // the scrolling all have to agree on an order, and the cheapest way to make
  // them agree is to give them one list.
  //
  // A `null` widget is a heading. Only rows with a widget can be landed on,
  // which is what `focusables` below is for.
  readonly property var rows: {
    var on = []
    var off = []
    for (var i = 0; i < widgets.length; i++) {
      if (widgets[i].enabled === true) on.push(widgets[i])
      else off.push(widgets[i])
    }
    var out = []
    if (on.length > 0) out.push({ heading: "On the desktop", widget: null })
    for (var a = 0; a < on.length; a++) out.push({ heading: "", widget: on[a] })
    if (off.length > 0) out.push({ heading: "Off", widget: null })
    for (var b = 0; b < off.length; b++) out.push({ heading: "", widget: off[b] })
    return out
  }

  // The widgets in the order the list draws them, which is not the order the
  // config holds them in: switching one off moves it to the second group, and
  // the cursor has to follow it there rather than stay on the row number it
  // used to be.
  readonly property var focusables: {
    var out = []
    for (var i = 0; i < rows.length; i++) if (rows[i].widget) out.push(rows[i].widget)
    return out
  }
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

  // Every widget the list draws, plus one action at the end that opens the
  // editor — so the keyboard reaches everything the mouse can.
  readonly property int rowCount: focusables.length + 1

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
    if (cursorIndex >= focusables.length) { editLayout(); return }
    var target = focusables[cursorIndex]
    if (target) toggleWidget(target.id)
  }

  // Which flat row the cursor is on, so the list can keep it in view. -1 when
  // the cursor is on the Arrange action, which is not in the list at all.
  readonly property int cursorRow: {
    if (!cursorActive || cursorIndex >= focusables.length) return -1
    var wanted = focusables[cursorIndex]
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].widget && rows[i].widget.id === wanted.id) return i
    }
    return -1
  }

  function toggleWidget(id) {
    if (!service) return
    service.toggle(id)
    // The row has just moved to the other group. Follow it there rather than
    // leaving the cursor on a row number that now belongs to a different
    // widget — one more Enter would otherwise switch off whatever slid up
    // into its place.
    Qt.callLater(function() { root.followCursor(id) })
  }

  function followCursor(id) {
    for (var i = 0; i < focusables.length; i++) {
      if (focusables[i].id === id) { cursorIndex = i; return }
    }
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

      // The plugin's own mark rather than a font glyph: the grid with a
      // spanning card is what this button is for, and no glyph in the set
      // says that.
      WidgetsMark {
        anchors.verticalCenter: parent.verticalCenter
        iconSize: Style.bar.iconCanvas
        color: button.foreground
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

        // What is left for the list once the fixed parts have had their
        // share. Everything above and below the list has a size that does not
        // depend on how many widgets there are, so the list is the only thing
        // that has to give — which is the whole point: adding a widget makes
        // the list scroll further, not the panel taller.
        readonly property real listRoom: Math.max(Style.space(120),
          panel.availableCardHeight - panel.verticalContentInset
            - head.implicitHeight - foot.implicitHeight - spacing * 2)

        Item {
          id: head
          width: parent.width
          implicitHeight: title.implicitHeight

          PanelSectionHeader {
            id: title
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: "Widgets"
            foreground: root.foreground
            fontFamily: root.fontFamily
          }

          // How many are on, out of how many there are. The one number worth
          // having at the top of a list this long, and the answer to the
          // question the button in the bar asks.
          Text {
            anchors.right: parent.right
            anchors.verticalCenter: title.verticalCenter
            visible: root.widgets.length > 0
            textFormat: Text.PlainText
            text: root.enabledCount + " of " + root.widgets.length + " on"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }
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

        // A list rather than a Column of rows, for one reason: it knows how
        // to bring a row into view. The keyboard cursor can walk onto a row
        // below the fold, and a cursor you cannot see is a cursor that has
        // lost you.
        ListView {
          id: list
          width: parent.width
          height: Math.min(contentHeight, column.listRoom)
          visible: root.rows.length > 0
          clip: true
          spacing: Style.space(4)
          boundsBehavior: Flickable.StopAtBounds
          model: root.rows
          currentIndex: root.cursorRow
          highlightMoveDuration: 0
          // Only when there is more than fits; a list that scrolls one pixel
          // because of rounding is a list that feels loose.
          interactive: contentHeight > height

          onCurrentIndexChanged: if (currentIndex >= 0) positionViewAtIndex(currentIndex, ListView.Contain)

          delegate: Item {
            id: entry
            required property var modelData
            required property int index

            readonly property var widget: modelData.widget
            // A heading after the first group needs air above it; the first
            // one is already under the panel's own header.
            readonly property real headingGap: entry.index === 0 ? 0 : Style.space(6)

            width: list.width
            implicitHeight: entry.widget
              ? row.implicitHeight
              : heading.implicitHeight + entry.headingGap

            // A heading. Drawn inside the list rather than above it so it
            // scrolls with the group it names — two headings pinned to the
            // top of a scrolling list would both be lying half the time.
            PanelSectionHeader {
              id: heading
              anchors.left: parent.left
              anchors.bottom: parent.bottom
              visible: !entry.widget
              text: entry.modelData.heading
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            WidgetRow {
              id: row
              anchors.left: parent.left
              anchors.right: parent.right
              visible: entry.widget !== null
              label: visible ? root.nameFor(entry.widget) : ""
              description: visible ? root.descriptionFor(entry.widget) : ""
              icon: visible ? Model.iconFor(entry.widget.type) : ""
              checked: visible && entry.widget.enabled === true
              hasCursor: root.cursorRow === entry.index
              foreground: root.foreground
              accent: Color.accent
              fontFamily: root.fontFamily
              onClicked: root.toggleWidget(entry.widget.id)
            }
          }
        }

        Column {
          id: foot
          width: parent.width
          spacing: Style.space(6)

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
            hasCursor: root.cursorActive && root.cursorIndex === root.focusables.length
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
}
