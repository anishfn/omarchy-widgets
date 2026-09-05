import QtQuick
import qs.Commons
import "../Model.js" as Model

// What is due, from Todoist.
//
// The same card as widgets/Todos.qml, for a list that lives in Todoist rather
// than in a file. It is the same drawing on purpose: a list on a wallpaper is
// a list on a wallpaper, and two cards that show the same thing from two
// sources should not be two designs.
//
// One thing you can do to it, which is the one thing anybody does to a list:
// **tick something off**. There is no title link here -- `todos` opens the
// file because a file is a thing you edit, and a stray click on a wallpaper
// launching a browser is worse than one opening an editor. Two actions
// (a tick, a scroll) where `todos` takes three.
//
// It scrolls, in both directions, for the reason DESIGN.md records for
// `todos`: a list is the one thing on a wallpaper that genuinely has more
// than a card of content, and eliding the eleventh item into a card that
// cannot reach it is worse than letting it be reached.
//
// Three sizes, three compositions:
//
//   1x1   how much is due, and the one thing to do next
//   2x1   the top of the list
//   2x2   the list
Item {
  id: root

  // Injected by Surface.qml.
  property var service: null
  property var instance: null
  property var card: null
  readonly property var settings: instance && instance.settings ? instance.settings : ({})

  readonly property color foreground: Color.foreground
  readonly property color accent: Color.accent
  readonly property color dim: Util.alpha(Color.foreground, 0.55)
  readonly property color faint: Util.alpha(Color.foreground, 0.3)
  readonly property string fontFamily: Style.font.family

  // ------------------------------------------------------------- the scale
  //
  // One grid cell, whatever footprint the card is wearing. A list given a
  // second row should hold twice as many lines, not the same lines in letters
  // twice the size, so the type is sized off a cell rather than off the
  // card's short axis. See widgets/Todos.qml, which does the same.
  readonly property int spanCols: instance && instance.cols > 0 ? instance.cols : 1
  readonly property int spanRows: instance && instance.rows > 0 ? instance.rows : 1
  readonly property real unit: Math.min(width / spanCols, height / spanRows)

  readonly property real pad: Math.round(unit * 0.11)
  readonly property real smallSize: Math.max(8, Math.round(unit * 0.068))
  readonly property real bodySize: Math.max(9, Math.round(unit * 0.083))
  readonly property real bigSize: Math.max(14, Math.round(unit * 0.26))
  readonly property real rowHeight: Math.round(unit * 0.175)

  readonly property bool wide: width > unit * 1.4

  // The rectangle the list gets. Worked out from the type rather than from
  // what is drawn in it, so the row count never depends on the row count.
  readonly property real headerHeight: Math.round(smallSize * 1.5)
  readonly property real listTop: pad + headerHeight + Math.round(unit * 0.04)
  readonly property real listHeight: Math.max(0, height - pad - listTop)

  // --------------------------------------------------------------- the data

  readonly property string query: Model.todoistFilter(settings.filter)
  readonly property var list: service && service.todoist ? service.todoist[query] : null
  readonly property bool ready: list !== null && list !== undefined
  readonly property bool tokenReady: service ? service.todoistTokenReady(settings.tokenFile) : false

  readonly property bool canTick: settings.canTick !== false
  readonly property string title: Model.todoistTitle(settings.title, settings.filter)

  // Everything the fetch returned, minus whatever a tick has already closed.
  // Not capped to what fits: the list scrolls, so a card is a window onto the
  // filter rather than a fixed number of rows, and the ceiling is the
  // parser's rather than a second one here.
  readonly property var items: ready
    ? Model.visibleTodoistTasks(list, service ? service.todoistClosing : null) : []
  readonly property bool empty: items.length === 0

  readonly property int overdue: {
    var n = 0
    for (var i = 0; i < items.length; i++) if (items[i].overdue) n++
    return n
  }

  // The one thing the card can do to the list. It goes through the service,
  // which owns the token and the process launching, so the widget only ever
  // says what happened -- it never fetches or spawns anything itself.
  function close(task) {
    if (!root.canTick || !task || !root.service) return
    if (typeof root.service.closeTodoistTask !== "function") return
    root.service.closeTodoistTask(root.query, task.id)
  }

  // Waiting, unauthorised, unreachable, or simply clear. Says which: these
  // want very different things done about them.
  readonly property string emptyText: {
    if (!root.tokenReady) return "No API token"
    if (!ready) return service && service.todoistError === "unavailable"
      ? "Todoist unreachable" : "Loading"
    return "Nothing due"
  }

  // Where the token was looked for, under the message, so a first run tells
  // you the file to make rather than only that there is not one. Its own line
  // and its own weight: a path folded into the sentence turns a short message
  // into three ragged lines on a square card.
  readonly property string emptyDetail: root.tokenReady ? "" : shortTokenPath

  readonly property string shortTokenPath: {
    if (!service) return ""
    var home = String(service.home || "")
    var path = Model.todoistTokenPath(settings.tokenFile, home)
    if (home && path.indexOf(home + "/") === 0) return "~" + path.slice(home.length)
    return path
  }

  // ---------------------------------------------------------------- paint

  Column {
    anchors.centerIn: parent
    width: parent.width - root.pad * 2
    visible: root.empty
    spacing: Math.round(root.unit * 0.03)

    Text {
      width: parent.width
      horizontalAlignment: Text.AlignHCenter
      wrapMode: Text.Wrap
      textFormat: Text.PlainText
      text: root.emptyText
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      maximumLineCount: 2
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    Text {
      width: parent.width
      visible: root.emptyDetail !== ""
      horizontalAlignment: Text.AlignHCenter
      textFormat: Text.PlainText
      text: root.emptyDetail
      color: root.faint
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      // Elided in the middle: the end of a path is the file you are being
      // told to make, and the start is where it goes. Both beat the middle.
      elide: Text.ElideMiddle
      renderType: Text.NativeRendering
    }
  }

  // The name of the list, and what is late in it.
  Item {
    id: headerRow
    x: root.pad
    y: root.pad
    width: Math.max(0, parent.width - root.pad * 2)
    height: root.headerHeight
    visible: !root.empty

    Text {
      id: titleText
      anchors.verticalCenter: parent.verticalCenter
      anchors.left: parent.left
      anchors.right: countText.left
      anchors.rightMargin: Math.round(root.unit * 0.04)
      textFormat: Text.PlainText
      text: root.title
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    // The one accent on the card, and only while it has something to say. How
    // much is late is the single thing here you cannot count off the list
    // yourself, which is what earns it; a card with nothing overdue shows the
    // plain total and spends no colour at all.
    Text {
      id: countText
      anchors.right: parent.right
      anchors.baseline: titleText.baseline
      visible: root.wide
      textFormat: Text.PlainText
      text: root.overdue > 0 ? root.overdue + " late" : String(root.items.length)
      color: root.overdue > 0 ? root.accent : root.faint
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      renderType: Text.NativeRendering
    }
  }

  // ------------------------------------------------------------ the square
  //
  // The number that matters and the one thing to do about it. A count with no
  // item beside it is a statistic; an item with no count is a card that hides
  // how much is behind it.

  Column {
    id: squareBody
    visible: !root.empty && !root.wide
    x: root.pad
    width: Math.max(0, parent.width - root.pad * 2)
    y: Math.max(headerRow.y + headerRow.height,
      parent.height - root.pad - height)
    spacing: Math.round(root.unit * 0.01)

    Text {
      textFormat: Text.PlainText
      text: String(root.items.length)
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: root.bigSize
      font.weight: Font.Light
      renderType: Text.NativeRendering
    }

    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: root.items.length > 0 ? root.items[0].content : ""
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      elide: Text.ElideRight
      maximumLineCount: 2
      wrapMode: Text.Wrap
      renderType: Text.NativeRendering
    }
  }

  // -------------------------------------------------------------- the list
  //
  // A marker, the task, and when it is due. The marker is drawn rather than
  // set in a glyph so it is a ring at every size and in every theme, and so a
  // font without the character cannot leave the column blank.

  Flickable {
    id: rows
    visible: !root.empty && root.wide
    x: root.pad
    y: root.listTop
    width: Math.max(0, parent.width - root.pad * 2)
    height: root.listHeight
    clip: true

    // Both directions. Down for a list longer than the card, across for a
    // task longer than it is wide -- which is why the rows below do not
    // elide: an ellipsis is a promise that the rest is unreachable, and here
    // it is not.
    contentWidth: Math.max(width, rowColumn.width)
    contentHeight: rowColumn.height + Math.round(root.unit * 0.04)
    boundsBehavior: Flickable.StopAtBounds
    flickDeceleration: 3000
    // No press delay, so a tick registers as a tick. A drag still steals the
    // press from the marker underneath it, which is what keeps a flick that
    // started on a checkbox from closing the task.
    pressDelay: 0

    Column {
      id: rowColumn

      Repeater {
        model: root.items

        delegate: Item {
          id: row
          required property var modelData

          implicitWidth: marker.width + label.anchors.leftMargin + label.implicitWidth
            + (due.visible ? due.anchors.leftMargin + due.implicitWidth : 0)
          // Measured against the viewport, never against the Column: a Column
          // takes its own width from the widest child, so a child that took
          // its width back from the Column would be a binding loop.
          width: Math.max(rows.width, implicitWidth)
          height: root.rowHeight

          Rectangle {
            id: marker
            x: 0
            anchors.verticalCenter: label.verticalCenter
            width: Math.max(5, Math.round(root.unit * 0.05))
            height: width
            radius: width / 2
            // An outline, filled faintly while the pointer is on it: the card
            // showing you what pressing would do rather than telling you.
            //
            // A task that is late gets a fuller ring rather than a colour.
            // The accent is already spent in the header, and a second one on
            // a card this small leaves the eye no instruction.
            color: markerMouse.containsMouse
              ? Util.alpha(root.foreground, 0.22) : "transparent"
            border.width: Math.max(1, Math.round(root.unit * 0.008))
            border.color: markerMouse.containsMouse
              ? root.accent
              : (row.modelData.overdue ? root.foreground : root.dim)
          }

          // The tick. Its own target rather than the whole row: a row-wide one
          // would mean a stray click anywhere on the card closed a task, and
          // this card sits under your windows where a stray click is exactly
          // what you get.
          MouseArea {
            id: markerMouse
            enabled: root.canTick
            x: marker.x - hit
            y: marker.y - hit
            width: marker.width + hit * 2
            height: marker.height + hit * 2
            readonly property real hit: Math.round(root.unit * 0.045)
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.close(row.modelData)
          }

          Text {
            id: label
            anchors.left: marker.right
            anchors.leftMargin: Math.round(root.unit * 0.055)
            y: Math.round((parent.height - implicitHeight) / 2)
            // Its natural width, not the card's: what makes the row scroll
            // sideways instead of losing its tail to an ellipsis.
            width: implicitWidth
            textFormat: Text.PlainText
            text: row.modelData.content
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: root.bodySize
            renderType: Text.NativeRendering
          }

          // When it is due, after the task rather than in a column of its own:
          // a column would have to be as wide as the longest label on a card
          // where most rows say "today" and one says "Thu 18 Sep".
          Text {
            id: due
            anchors.left: label.right
            anchors.leftMargin: Math.round(root.unit * 0.055)
            anchors.baseline: label.baseline
            visible: row.modelData.due !== null
            width: implicitWidth
            textFormat: Text.PlainText
            text: row.modelData.due ? row.modelData.due.label : ""
            color: row.modelData.overdue ? root.dim : root.faint
            font.family: root.fontFamily
            font.pixelSize: root.smallSize
            renderType: Text.NativeRendering
          }
        }
      }
    }
  }

  // Where you are in a list that does not fit. Drawn only while there is
  // something off the edge, because a scrollbar on a list that fits is a
  // control describing nothing. Static -- it moves when the list moves and
  // never on its own.
  Rectangle {
    readonly property real track: rows.height
    visible: rows.visible && rows.contentHeight > rows.height + 1
    width: Math.max(2, Math.round(root.unit * 0.014))
    radius: width / 2
    color: Util.alpha(root.foreground, rows.movingVertically ? 0.45 : 0.22)
    x: rows.x + rows.width - width
    height: Math.max(root.unit * 0.12, track * (rows.height / Math.max(1, rows.contentHeight)))
    y: rows.y + Math.min(track - height,
      Math.max(0, track * (rows.contentY / Math.max(1, rows.contentHeight))))
  }

  Rectangle {
    readonly property real track: rows.width
    // Only once you are actually moving sideways. The signal that there is
    // more to the right is the text running off the edge without an ellipsis
    // -- an ellipsis is what promises there is not.
    visible: rows.visible && rows.contentWidth > rows.width + 1
      && (rows.movingHorizontally || rows.contentX > 1)
    height: Math.max(2, Math.round(root.unit * 0.014))
    radius: height / 2
    color: Util.alpha(root.foreground, rows.movingHorizontally ? 0.45 : 0.22)
    y: rows.y + rows.height - height
    width: Math.max(root.unit * 0.12, track * (rows.width / Math.max(1, rows.contentWidth)))
    x: rows.x + Math.min(track - width,
      Math.max(0, track * (rows.contentX / Math.max(1, rows.contentWidth))))
  }
}
