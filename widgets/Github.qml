import QtQuick
import qs.Commons
import "../Model.js" as Model

// The contribution graph: seven rows of squares, one column a week, as many
// weeks back as the card can hold.
//
// The heatmap is the accent. Everywhere else in the set the accent is one
// small detail; here the data *is* the colour, so the card spends its whole
// accent budget on the squares and leaves every letter on it neutral.
//
// Cell size is chosen from the height — seven rows have to fit exactly — and
// the number of weeks then follows from the width. So the same widget is a
// couple of months on a square card and most of a year on a wide one,
// without either being a squashed version of the other.
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
  readonly property string fontFamily: Style.font.family

  readonly property real unit: Math.min(width, height)
  readonly property real pad: Math.round(unit * 0.11)

  readonly property string login: String(settings.login || "")
  readonly property bool showLegend: settings.showLegend !== false

  // ------------------------------------------------------------- the data

  readonly property var contributions: service && service.contributions && login
    ? service.contributions[login] : null
  readonly property string error: service ? String(service.contributionsError || "") : ""
  readonly property string total: contributions ? String(contributions.total || "") : ""
  readonly property bool ready: contributions !== null && grid.columns > 0

  // ------------------------------------------------------------- geometry

  readonly property real headerHeight: Math.max(10, Math.round(unit * 0.085))
  readonly property real captionHeight: showLegend ? Math.max(8, Math.round(unit * 0.06)) : 0
  readonly property real rowGap: Math.round(unit * 0.05)

  readonly property real graphTop: pad + headerHeight + rowGap
  readonly property real graphBottom: height - pad - (showLegend ? captionHeight + rowGap : 0)
  readonly property real graphHeight: Math.max(7, graphBottom - graphTop)
  readonly property real graphWidth: Math.max(7, width - pad * 2)

  // Seven rows must fit exactly, so the cell is derived from the height and
  // the gap scales with it. Floored, then the leftovers are given back as
  // top margin, so the grid never overruns the space it was measured for.
  readonly property real cellGap: Math.max(1, Math.round(unit * 0.014))
  readonly property real cell: Math.max(2, Math.floor((graphHeight - cellGap * 6) / 7))
  readonly property real gridHeight: cell * 7 + cellGap * 6
  readonly property int weeks: Model.weeksThatFit(graphWidth, cell, cellGap)

  readonly property var grid: Model.contributionGrid(contributions, weeks)
  // Right-aligned: the most recent week is the one you look for, so it sits
  // at the edge rather than leaving a ragged gap there.
  readonly property real gridWidth: grid.columns * cell + Math.max(0, grid.columns - 1) * cellGap
  readonly property real gridLeft: pad + Math.max(0, graphWidth - gridWidth)

  function levelColor(level) {
    var n = Number(level)
    // Level zero is a day that happened and had nothing in it. It is drawn,
    // faintly, because the empty squares are what give the full ones a shape
    // to sit in.
    if (!isFinite(n) || n <= 0) return Util.alpha(root.foreground, 0.1)
    return Util.alpha(root.accent, [0, 0.35, 0.55, 0.78, 1.0][Math.min(4, n)])
  }

  // ---------------------------------------------------------------- paint

  // Nothing to draw yet, and which nothing it is. "No username" wants a
  // different thing done about it than "GitHub did not answer".
  Text {
    anchors.centerIn: parent
    width: parent.width - root.pad * 2
    visible: !root.ready
    horizontalAlignment: Text.AlignHCenter
    wrapMode: Text.Wrap
    textFormat: Text.PlainText
    text: root.login === ""
      ? "Set a GitHub username"
      : (root.error === "unavailable" ? "GitHub unavailable" : "Loading contributions…")
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: Math.max(9, Math.round(root.unit * 0.075))
    renderType: Text.NativeRendering
  }

  Item {
    anchors.fill: parent
    visible: root.ready

    // Who, and how much. The count is the headline and sits at the end of
    // the line, where the graph's most recent week also ends.
    Text {
      id: loginText
      x: root.pad
      y: root.pad
      width: Math.max(0, totalText.x - x - Style.space(6))
      textFormat: Text.PlainText
      text: root.login
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: root.headerHeight
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    Text {
      id: totalText
      x: root.width - root.pad - width
      y: root.pad
      textFormat: Text.PlainText
      text: root.total
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: root.headerHeight
      renderType: Text.NativeRendering
    }

    // The graph.
    Item {
      x: root.gridLeft
      y: root.graphTop + Math.max(0, Math.round((root.graphHeight - root.gridHeight) / 2))
      width: root.gridWidth
      height: root.gridHeight

      Repeater {
        model: root.grid.cells

        delegate: Rectangle {
          required property var modelData
          x: modelData.col * (root.cell + root.cellGap)
          y: modelData.row * (root.cell + root.cellGap)
          width: root.cell
          height: root.cell
          // Rounded only once a square is big enough for a radius to read as
          // a corner rather than as a blurred edge.
          radius: root.cell >= 6 ? Math.max(1, Math.round(root.cell * 0.22)) : 0
          color: root.levelColor(modelData.level)
        }
      }
    }

    // How much of the year is on screen, and what the shades mean.
    Text {
      id: rangeCaption
      x: root.pad
      y: root.height - root.pad - height
      visible: root.showLegend
      textFormat: Text.PlainText
      text: Model.weeksLabel(root.grid.columns)
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: root.captionHeight
      renderType: Text.NativeRendering
    }

    Row {
      id: legend
      x: root.width - root.pad - width
      y: root.height - root.pad - height
      visible: root.showLegend && root.width > root.unit * 1.2
      spacing: root.cellGap

      Text {
        anchors.verticalCenter: parent.verticalCenter
        rightPadding: root.cellGap * 2
        textFormat: Text.PlainText
        text: "Less"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: root.captionHeight
        renderType: Text.NativeRendering
      }

      Repeater {
        model: 5

        delegate: Rectangle {
          required property int index
          anchors.verticalCenter: parent.verticalCenter
          width: root.captionHeight
          height: root.captionHeight
          radius: width >= 6 ? Math.max(1, Math.round(width * 0.22)) : 0
          color: root.levelColor(index)
        }
      }

      Text {
        anchors.verticalCenter: parent.verticalCenter
        leftPadding: root.cellGap * 2
        textFormat: Text.PlainText
        text: "More"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: root.captionHeight
        renderType: Text.NativeRendering
      }
    }
  }
}
