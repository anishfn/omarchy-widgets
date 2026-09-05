import QtQuick
import qs.Commons
import "../Model.js" as Model

// Today's list, read from a text file.
//
// The file is the interface. There is no todo service worth making a
// wallpaper depend on, and the thing every editor, every dotfiles repo and
// every sync tool already handles is a file with a line in it per thing to
// do.
//
// Two things you can do to it from here, and they are the two things you do
// to a list: **tick something off**, and **open the file**. A tick rewrites
// exactly one line and leaves the rest of the file byte for byte as it was,
// so the card never reformats what you typed. The title opens the list in
// whatever editor Omarchy has been told to use.
//
// It scrolls, in both directions, which is the one place this widget argues
// with DESIGN.md -- see the note there. A list is the one thing on a
// wallpaper that genuinely has more than a card of content, and eliding the
// eleventh item into a card that cannot reach it is worse than letting it be
// reached.
//
//   # Friday
//   - [ ] ship the calendar widget
//   - [x] reply to the issue
//   ! call the bank
//   buy milk
//
// Three sizes, three compositions:
//
//   1x1   how much is left, and the one thing to do next
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
  // card's short axis. See widgets/Calendar.qml, which does the same.
  readonly property int spanCols: instance && instance.cols > 0 ? instance.cols : 1
  readonly property int spanRows: instance && instance.rows > 0 ? instance.rows : 1
  readonly property real unit: Math.min(width / spanCols, height / spanRows)

  readonly property real pad: Math.round(unit * 0.11)
  readonly property real smallSize: Math.max(8, Math.round(unit * 0.068))
  readonly property real bodySize: Math.max(9, Math.round(unit * 0.083))
  readonly property real bigSize: Math.max(14, Math.round(unit * 0.26))
  readonly property real rowHeight: Math.round(unit * 0.175)

  readonly property bool wide: width > unit * 1.4

  // The rectangle the list gets. Worked out from the type, not from the
  // things drawn in it: measuring the progress bar would make the row count
  // depend on whether the list is empty, which depends on the row count.
  readonly property real headerHeight: Math.round(smallSize * 1.5)
  readonly property real barHeight: Math.max(2, Math.round(unit * 0.018))
  readonly property real barSpace: showProgress ? barHeight + Math.round(unit * 0.09) : 0
  readonly property real listTop: pad + headerHeight + Math.round(unit * 0.04)
  readonly property real listHeight: Math.max(0, height - pad - listTop - barSpace)

  // --------------------------------------------------------------- the data

  readonly property string path: service
    ? Model.todoPath(settings.file, service.home) : ""
  readonly property var list: service && service.todos && path
    ? service.todos[path] : null
  readonly property bool ready: list !== null && list !== undefined

  readonly property bool showDone: settings.showDone !== false
  readonly property bool showProgress: settings.showProgress !== false
  readonly property bool canTick: settings.canTick !== false
  readonly property string title: Model.todoTitle(settings.title, list)

  // The two things the card can do to the file. Both go through the service,
  // which owns the file and the process launching, so the widget only ever
  // says what happened -- it never writes or spawns anything itself.
  function toggle(item) {
    if (!root.canTick || !item || !root.service) return
    if (typeof root.service.setTodoDone !== "function") return
    root.service.setTodoDone(root.path, item.line, !item.done)
  }

  function openFile() {
    if (!root.service || typeof root.service.openTodoFile !== "function") return
    root.service.openTodoFile(root.path)
  }

  // Everything, not just what fits. The list scrolls, so a card is a window
  // onto the file rather than a fixed number of rows -- capping the model to
  // what the card can show would leave the eleventh item unreachable and the
  // scrollbar with nothing to say.
  //
  // The ceiling is the parser's, which is one limit rather than two: a file
  // longer than TODO_MAX_ITEMS is cut when it is read, and what is read is
  // what is drawn.
  readonly property var items: ready ? Model.visibleTodos(list, showDone, 0) : []

  // How many rows fit without scrolling. Not used to cut the list -- only to
  // tell the card whether there is anything below the fold.
  readonly property int capacity: Math.max(1, Math.floor(listHeight / rowHeight))
  readonly property real progress: Model.todoProgress(list)

  // Waiting, missing, or simply finished. Says which: "no file" and "nothing
  // left" want very different things done about them.
  readonly property string emptyText: {
    if (!ready) return "No list yet"
    if (list.total === 0) return "The list is empty"
    return "All done"
  }

  // Where it looked, under the message, so a first run tells you the file to
  // create rather than only that there is not one. Its own line and its own
  // weight: a path folded into the sentence turns a short message into three
  // ragged lines on a square card.
  readonly property string emptyDetail: ready ? "" : shortPath

  // The path with home written the way people write it, so the card can say
  // where it was looking without spending three lines on it.
  readonly property string shortPath: {
    var home = service ? String(service.home || "") : ""
    if (home && path.indexOf(home + "/") === 0) return "~" + path.slice(home.length)
    return path
  }

  readonly property bool empty: items.length === 0

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

    // The path opens it too, which is how a first run makes a list: the
    // editor is handed a file that is not there yet, and every editor on the
    // list Omarchy offers will happily create it.
    Item {
      width: parent.width
      height: emptyDetailText.implicitHeight
      visible: root.emptyDetail !== ""

      Text {
        id: emptyDetailText
        width: parent.width
        horizontalAlignment: Text.AlignHCenter
        textFormat: Text.PlainText
        text: root.emptyDetail
        color: emptyDetailMouse.containsMouse ? root.accent : root.faint
        font.family: root.fontFamily
        font.pixelSize: root.smallSize
        font.underline: emptyDetailMouse.containsMouse
        // Elided in the middle: the end of a path is the file you are being
        // told to make, and the start is where it goes. Both beat the middle.
        elide: Text.ElideMiddle
        renderType: Text.NativeRendering
      }

      MouseArea {
        id: emptyDetailMouse
        anchors.fill: parent
        anchors.margins: -Math.round(root.unit * 0.04)
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.openFile()
      }
    }
  }

  // The name of the list, and what is left of it.
  Item {
    id: headerRow
    x: root.pad
    y: root.pad
    width: Math.max(0, parent.width - root.pad * 2)
    height: root.headerHeight
    visible: !root.empty

    // The title opens the list in your editor. Drawn as a link rather than as
    // a button because the title is already the name of the thing being
    // opened -- a button beside it would be a second element saying the same
    // word. The whole card is an input region once a type is interactive, so
    // the hover state is doing real work here: it is the only thing telling
    // you which part of the card is live.
    Text {
      id: titleText
      anchors.verticalCenter: parent.verticalCenter
      anchors.left: parent.left
      anchors.right: leftText.left
      anchors.rightMargin: Math.round(root.unit * 0.04)
      textFormat: Text.PlainText
      text: root.title
      color: titleMouse.containsMouse ? root.accent : root.dim
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      font.underline: titleMouse.containsMouse
      elide: Text.ElideRight
      renderType: Text.NativeRendering

      MouseArea {
        id: titleMouse
        // Wider and taller than the letters: this is a wallpaper, not a
        // toolbar, and the pointer should not have to be aimed. Bounded to
        // the text's own width so it does not reach across the whole header
        // and swallow a flick that started beside it.
        anchors.fill: parent
        anchors.topMargin: -Math.round(root.unit * 0.04)
        anchors.bottomMargin: -Math.round(root.unit * 0.04)
        anchors.rightMargin: Math.max(0, parent.width - parent.contentWidth
          - Math.round(root.unit * 0.04))
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.openFile()
      }
    }

    Text {
      id: leftText
      anchors.right: parent.right
      anchors.baseline: titleText.baseline
      visible: root.wide && root.ready
      textFormat: Text.PlainText
      text: root.ready ? root.list.done + "/" + root.list.total : ""
      color: root.faint
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
      progressBar.y - height - Math.round(root.unit * 0.08))
    spacing: Math.round(root.unit * 0.01)

    Text {
      textFormat: Text.PlainText
      text: root.ready ? String(root.list.remaining) : "0"
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: root.bigSize
      font.weight: Font.Light
      renderType: Text.NativeRendering
    }

    // Dim, even when the item is marked "!". On a card this size the accent
    // is already spent on the bar, and what the mark buys an item here is the
    // top of the list rather than a colour.
    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: root.items.length > 0 ? root.items[0].text : ""
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
  // A marker and a line of text. The marker is drawn rather than set in a
  // glyph so it is a ring at every size and in every theme, and so a font
  // without the character cannot leave the column blank.

  Flickable {
    id: rows
    visible: !root.empty && root.wide
    x: root.pad
    y: root.listTop
    width: Math.max(0, parent.width - root.pad * 2)
    height: root.listHeight
    clip: true

    // Both directions. Down for a list longer than the card, across for an
    // item longer than it is wide -- which is why the rows below do not
    // elide: an ellipsis is a promise that the rest is unreachable, and here
    // it is not.
    contentWidth: Math.max(width, rowColumn.width)
    // A little tail past the last row, so the horizontal indicator that sits
    // along the bottom of this rectangle never lies across a line of text.
    contentHeight: rowColumn.height + Math.round(root.unit * 0.04)
    boundsBehavior: Flickable.StopAtBounds
    flickDeceleration: 3000
    // No press delay, so a tick registers as a tick. A drag still steals the
    // press from the marker underneath it, which is what keeps a flick that
    // started on a checkbox from ticking it.
    pressDelay: 0

    // Sized by its widest row, which is what makes the Flickable's content
    // wider than the card when an item is longer than one.
    Column {
      id: rowColumn

      Repeater {
        model: root.items

        delegate: Item {
          id: row
          required property var modelData

          implicitWidth: marker.width + label.anchors.leftMargin + label.implicitWidth
          // Measured against the viewport, never against the Column: a Column
          // takes its own width from the widest child, so a child that took
          // its width back from the Column would be a binding loop -- and QML
          // breaks one of those by picking a value, which here is the one
          // where nothing ever scrolls sideways.
          width: Math.max(rows.width, implicitWidth)
          height: root.rowHeight

          Rectangle {
            id: marker
            x: 0
            anchors.verticalCenter: label.verticalCenter
            width: Math.max(5, Math.round(root.unit * 0.05))
            height: width
            radius: width / 2
            // Filled when it is done, an outline while it is not: the shape
            // says which without a second colour having to mean anything.
            //
            // An item marked "!" gets a fuller ring rather than the accent.
            // The accent belongs to the bar along the bottom, and a second
            // one on a card this small leaves the eye no instruction.
            //
            // Hovering fills it faintly, which is the card showing you what
            // pressing would do rather than telling you.
            color: row.modelData.done
              ? root.faint
              : (markerMouse.containsMouse ? Util.alpha(root.foreground, 0.22) : "transparent")
            border.width: row.modelData.done ? 0 : Math.max(1, Math.round(root.unit * 0.008))
            border.color: markerMouse.containsMouse
              ? root.accent
              : (row.modelData.important ? root.foreground : root.dim)
          }

          // The tick. Its own target rather than the whole row: a row-wide
          // one would mean a stray click anywhere on the card marked
          // something done, and this card sits under your windows where a
          // stray click is exactly what you get.
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
            onClicked: root.toggle(row.modelData)
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
            text: row.modelData.text
            color: row.modelData.done ? root.faint : root.foreground
            font.family: root.fontFamily
            font.pixelSize: root.bodySize
            font.strikeout: row.modelData.done
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
    // Brighter while it is actually moving, which is the only feedback a
    // flick on a wallpaper gets. Not animated: it changes with the gesture
    // and never on its own.
    color: Util.alpha(root.foreground, rows.movingVertically ? 0.45 : 0.22)
    x: rows.x + rows.width - width
    height: Math.max(root.unit * 0.12, track * (rows.height / Math.max(1, rows.contentHeight)))
    y: rows.y + Math.min(track - height,
      Math.max(0, track * (rows.contentY / Math.max(1, rows.contentHeight))))
  }

  Rectangle {
    readonly property real track: rows.width
    // Only once you are actually moving sideways. At rest it would be a
    // second horizontal bar directly above the progress one, and two stacked
    // rules at the foot of a card are a card you have to decode. The signal
    // that there is more to the right is the text running off the edge
    // without an ellipsis -- an ellipsis is what promises there is not.
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

  // How far through, as a hairline along the bottom. It is content rather than
  // decoration -- it is the one thing on the card you cannot count off the
  // list yourself -- which is what earns it the accent.
  Item {
    id: progressBar
    visible: root.showProgress && !root.empty && root.ready && root.list.total > 0
    x: root.pad
    width: Math.max(0, parent.width - root.pad * 2)
    height: root.barHeight
    y: parent.height - root.pad - height

    Rectangle {
      anchors.fill: parent
      radius: height / 2
      color: Util.alpha(root.foreground, 0.14)
    }

    Rectangle {
      width: Math.round(parent.width * root.progress)
      height: parent.height
      radius: height / 2
      color: root.accent
    }
  }
}
