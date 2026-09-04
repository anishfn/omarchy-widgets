import QtQuick
import QtQuick.Controls
import QtQuick.Window
import qs.Commons
import qs.Ui

// A single-select picker for the editor's settings panel, optionally with a
// search filter over its options.
//
// It exists instead of the kit's Dropdown / SearchableDropdown for one
// reason: those anchor their popup below the trigger unconditionally, and the
// editor's panel sits at the bottom of the screen, so the list opened straight
// off the edge and could not be seen. This one measures the room below the
// trigger when it opens and flips upward when there isn't any — adaptive
// rather than always-up, so it stays right if the panel ever moves.
//
// Everything else — the trigger chrome, the popup surface, the row states,
// the keys — mirrors Ui/Dropdown so it reads as the same control.
Item {
  id: root

  property var options: []
  property string value: ""
  // Shown on the trigger when the value has no matching option, which is how
  // an empty selection says something friendlier than nothing.
  property string emptyLabel: ""
  property bool searchable: false
  property string searchPlaceholder: "Search…"
  property string emptyText: "No matches"

  property color foreground: Color.popups.text
  property color background: Color.popups.background
  property color popupBorder: Color.popups.border
  property color accent: Color.accent
  property string fontFamily: Style.font.family

  property int rowHeight: Style.spacing.controlHeight
  property int popupRowHeight: Style.spacing.popupRowHeight
  property int visibleRows: 8

  readonly property var popupBorderSpec: Border.localOrSurfaceSpec("popups", "border",
    popupBorder, Color.popups.border, Style.normalBorderWidth)

  signal changed(string value)

  implicitWidth: Style.spacing.dropdownWidth
  implicitHeight: rowHeight

  function optionValue(o) { return (o && typeof o === "object") ? String(o.value) : String(o) }
  function optionLabel(o) { return (o && typeof o === "object") ? String(o.label) : String(o) }

  function currentLabel() {
    for (var i = 0; i < options.length; i++) {
      if (optionValue(options[i]) === value) return optionLabel(options[i])
    }
    return value === "" && emptyLabel !== "" ? emptyLabel : value
  }

  // Options matching the filter. Case-insensitive substring against the
  // label, which for a timezone carries both the city and the full name, so
  // typing either finds it.
  property string filter: ""
  readonly property var filtered: {
    if (!root.searchable) return root.options
    var needle = root.filter.toLowerCase()
    if (needle === "") return root.options
    var out = []
    for (var i = 0; i < root.options.length; i++) {
      if (root.optionLabel(root.options[i]).toLowerCase().indexOf(needle) !== -1) out.push(root.options[i])
    }
    return out
  }

  BorderSurface {
    id: trigger
    anchors.fill: parent
    radius: Style.cornerRadius

    readonly property bool _hot: triggerHover.hovered || trigger.activeFocus
    color: Style.controlFill(trigger.activeFocus, trigger._hot, root.foreground, root.accent)
    borderSpec: Border.controlSpec(trigger.activeFocus ? "focus" : (trigger._hot ? "hover-cursor" : "normal"),
      root.foreground, root.accent)

    activeFocusOnTab: true

    HoverHandler { id: triggerHover }

    Keys.onPressed: function(event) {
      if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter
          || event.key === Qt.Key_Space || event.key === Qt.Key_Down
          || event.key === Qt.Key_Up) {
        popup.opened ? popup.close() : root.openPopup()
        event.accepted = true
      } else if (event.key === Qt.Key_Escape && popup.opened) {
        popup.close()
        event.accepted = true
      }
    }

    Text {
      anchors.left: parent.left
      anchors.right: chevron.left
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: trigger.borderLeft + Style.spacing.controlPaddingX
      anchors.rightMargin: trigger.borderRight + Style.spacing.md
      textFormat: Text.PlainText
      text: root.currentLabel()
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      elide: Text.ElideRight
    }

    Text {
      id: chevron
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.rightMargin: trigger.borderRight + Style.spacing.controlGap
      // Points the way the list will actually go. Written as surrogate pairs
      // because these chevrons live above the basic plane, where \uXXXX
      // cannot reach them — and as escapes at all because a literal
      // private-use character renders as nothing if any tool drops it.
      text: popup.opened && root.openUp ? "\udb80\udd43" : "\udb80\udd40"
      color: Qt.darker(root.foreground, 1.2)
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
    }

    MouseArea {
      anchors.fill: parent
      cursorShape: Qt.PointingHandCursor
      onClicked: {
        trigger.forceActiveFocus()
        popup.opened ? popup.close() : root.openPopup()
      }
    }
  }

  // ------------------------------------------------------------- direction

  readonly property int gap: Style.spacing.xxs
  readonly property int searchHeight: root.searchable ? Style.spacing.controlHeight + root.gap : 0
  readonly property int listHeight: Math.max(root.popupRowHeight,
    Math.min(root.filtered.length, root.visibleRows) * root.popupRowHeight)
  readonly property int popupHeight: root.listHeight + root.searchHeight
    + Border.top(root.popupBorderSpec) + Border.bottom(root.popupBorderSpec)
    + Style.spacing.hairline * 2

  // Decided when the popup opens rather than bound: the answer depends on
  // where this control sits in its window, and an item's scene position is
  // not something a binding is told about when an ancestor moves.
  property bool openUp: false

  // Height of the surface this sits on. Read from the attached Window by
  // default; a caller that already knows can say so and skip the attached
  // lookup entirely.
  property real windowHeight: root.Window.height

  function openPopup() {
    var scene = root.mapToItem(null, 0, 0)
    var available = root.windowHeight > 0 ? root.windowHeight : 0
    // Nothing to measure against means we cannot know there is room, and
    // opening downward off a screen edge is the failure this exists to stop.
    var roomBelow = available > 0 ? available - (scene.y + root.height) : -1
    var needed = root.popupHeight + root.gap + Style.gapsOut
    root.openUp = roomBelow < needed
    root.filter = ""
    popup.open()
  }

  Popup {
    id: popup
    x: 0
    y: root.openUp ? -(root.popupHeight + root.gap) : root.height + root.gap
    width: root.width
    height: root.popupHeight
    padding: Style.spacing.hairline
    leftPadding: Border.left(root.popupBorderSpec) + Style.spacing.hairline
    rightPadding: Border.right(root.popupBorderSpec) + Style.spacing.hairline
    topPadding: Border.top(root.popupBorderSpec) + Style.spacing.hairline
    bottomPadding: Border.bottom(root.popupBorderSpec) + Style.spacing.hairline
    focus: true

    background: BorderSurface {
      color: root.background
      borderSpec: root.popupBorderSpec
      radius: Style.cornerRadius
    }

    onOpened: {
      optionList.currentIndex = Math.max(0, optionList.indexOfValue(root.value))
      optionList.positionViewAtIndex(optionList.currentIndex, ListView.Contain)
      if (root.searchable) search.forceActiveFocus()
      else optionList.forceActiveFocus()
    }

    onClosed: root.filter = ""

    contentItem: Item {

      // Opening upward puts the trigger at the bottom of the whole
      // arrangement, so the search box goes there too — next to the thing
      // that was clicked, rather than at the far end of the list.
      TextField {
        id: search
        visible: root.searchable
        anchors.left: parent.left
        anchors.right: parent.right
        y: root.openUp ? optionList.height + root.gap : 0
        height: root.searchable ? Style.spacing.controlHeight : 0
        placeholderText: root.searchPlaceholder
        foreground: root.foreground
        accent: root.accent
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        onTextChanged: {
          root.filter = text
          optionList.currentIndex = root.filtered.length > 0 ? 0 : -1
        }
        Keys.onPressed: function(event) {
          if (event.key === Qt.Key_Escape) { popup.close(); event.accepted = true }
          else if (event.key === Qt.Key_Down) {
            optionList.currentIndex = Math.min(root.filtered.length - 1, optionList.currentIndex + 1)
            optionList.positionViewAtIndex(optionList.currentIndex, ListView.Contain)
            event.accepted = true
          } else if (event.key === Qt.Key_Up) {
            optionList.currentIndex = Math.max(0, optionList.currentIndex - 1)
            optionList.positionViewAtIndex(optionList.currentIndex, ListView.Contain)
            event.accepted = true
          } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
            optionList.selectCurrent()
            event.accepted = true
          }
        }
      }

      Text {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.leftMargin: Style.spacing.controlPaddingX
        y: (root.openUp ? 0 : root.searchHeight) + Style.spacing.xs
        visible: root.filtered.length === 0
        textFormat: Text.PlainText
        text: root.emptyText
        color: Qt.darker(root.foreground, 1.4)
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
      }

      ListView {
        id: optionList
        anchors.left: parent.left
        anchors.right: parent.right
        y: root.openUp ? 0 : root.searchHeight
        height: root.listHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        model: root.filtered
        currentIndex: -1

        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) {
          if (event.key === Qt.Key_Escape) { popup.close(); event.accepted = true }
          else if (event.key === Qt.Key_Down || event.text === "j") {
            optionList.currentIndex = Math.min(root.filtered.length - 1, optionList.currentIndex + 1)
            event.accepted = true
          } else if (event.key === Qt.Key_Up || event.text === "k") {
            optionList.currentIndex = Math.max(0, optionList.currentIndex - 1)
            event.accepted = true
          } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
            optionList.selectCurrent()
            event.accepted = true
          }
        }

        function indexOfValue(v) {
          for (var i = 0; i < root.filtered.length; i++)
            if (root.optionValue(root.filtered[i]) === v) return i
          return -1
        }

        function selectCurrent() {
          if (currentIndex < 0 || currentIndex >= root.filtered.length) return
          var v = root.optionValue(root.filtered[currentIndex])
          root.value = v
          root.changed(v)
          popup.close()
        }

        delegate: Rectangle {
          required property var modelData
          required property int index
          width: optionList.width
          height: root.popupRowHeight
          color: index === optionList.currentIndex
            ? Style.hoverFillFor(root.foreground, root.accent)
            : "transparent"

          Text {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.leftMargin: Style.spacing.controlPaddingX
            anchors.rightMargin: Style.spacing.controlPaddingX
            textFormat: Text.PlainText
            text: root.optionLabel(modelData)
            color: index === optionList.currentIndex
              ? Style.hoverStateColor(root.foreground, root.accent)
              : root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
            elide: Text.ElideRight
          }

          MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onPositionChanged: optionList.currentIndex = parent.index
            onClicked: optionList.selectCurrent()
          }
        }
      }
    }
  }
}
