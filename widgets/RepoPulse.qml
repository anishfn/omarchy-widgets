import QtQuick
import qs.Commons
import "../Model.js" as Model

// A repository at a glance: what it has collected, and when it last moved.
//
// Four numbers, no chart. A sparkline on a card this size says less than the
// numbers do — you cannot read a week off it — so the space goes to figures
// you can actually act on.
//
// `issues` is the count with pull requests taken back out of it. GitHub's
// open_issues_count includes them, which is a quirk of the API and not what
// anyone means by the word.
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

  readonly property string repo: String(settings.repo || "")
  readonly property bool showStats: settings.showStats !== false

  // ------------------------------------------------------------- the data

  readonly property var pulse: service && service.repos && repo ? service.repos[repo] : null
  readonly property string error: service ? String(service.reposError || "") : ""
  readonly property var info: pulse && pulse.info ? pulse.info : null
  readonly property var stats: info ? Model.repoStats(info, pulse ? pulse.pulls : null) : null
  readonly property bool ready: info !== null

  // Just the name: the owner is usually the part you already know, and the
  // card is not wide enough to spend on both.
  readonly property string shortName: {
    if (!info) return repo
    var parts = String(info.fullName).split("/")
    return parts.length === 2 ? parts[1] : String(info.fullName)
  }

  property date now: clockTick.date
  readonly property string pushed: info ? Model.sinceLabel(info.pushedAt, now.getTime()) : ""

  Timer {
    id: clockTick
    property date date: new Date()
    interval: 60000
    repeat: true
    running: root.ready
    triggeredOnStart: true
    onTriggered: date = new Date()
  }

  // ---------------------------------------------------------------- rows
  //
  // Two columns on a square card, four across when there is room, so the
  // same four figures stay one glance either way.

  readonly property real valueSize: Math.max(9, Math.round(unit * 0.08))
  readonly property real wordSize: Math.max(8, Math.round(unit * 0.065))
  readonly property int columns: width > unit * 1.4 ? 4 : 2

  // Words rather than icons. A star is recognisable, but a fork and an open
  // issue are two small outlines that look alike at this size, and "0" beside
  // a shape you have to decode is worse than "0 forks".
  readonly property var figures: stats ? [
    { value: Model.compactCount(stats.stars), word: stats.stars === 1 ? "star" : "stars" },
    { value: Model.compactCount(stats.forks), word: stats.forks === 1 ? "fork" : "forks" },
    { value: Model.compactCount(stats.issues), word: stats.issues === 1 ? "issue" : "issues" },
    {
      value: stats.pulls === null ? "\u2013" : Model.compactCount(stats.pulls),
      word: stats.pulls === 1 ? "PR" : "PRs"
    }
  ] : []

  // ---------------------------------------------------------------- paint

  Text {
    anchors.centerIn: parent
    width: parent.width - root.pad * 2
    visible: !root.ready
    horizontalAlignment: Text.AlignHCenter
    wrapMode: Text.Wrap
    textFormat: Text.PlainText
    text: root.repo === ""
      ? "Set a repository"
      : (root.error === "unavailable" ? "Repository unavailable" : "Loading…")
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: Math.max(9, Math.round(root.unit * 0.075))
    renderType: Text.NativeRendering
  }

  Item {
    anchors.fill: parent
    visible: root.ready

    // The name, and how long since anything happened to it — the only thing
    // on the card that says whether the project is alive, so it takes the
    // accent.
    Text {
      id: nameText
      x: root.pad
      y: root.pad
      width: Math.max(0, pushedText.x - x - Style.space(6))
      textFormat: Text.PlainText
      text: root.shortName
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Math.max(10, Math.round(root.unit * 0.095))
      elide: Text.ElideRight
      maximumLineCount: 2
      wrapMode: Text.Wrap
      renderType: Text.NativeRendering
    }

    Text {
      id: pushedText
      x: root.width - root.pad - width
      y: root.pad
      textFormat: Text.PlainText
      text: root.pushed
      color: root.accent
      font.family: root.fontFamily
      font.pixelSize: Math.max(10, Math.round(root.unit * 0.095))
      renderType: Text.NativeRendering
    }

    Grid {
      id: figureGrid
      x: root.pad
      y: root.height - root.pad - height
      width: Math.max(0, parent.width - root.pad * 2)
      visible: root.showStats
      columns: root.columns
      columnSpacing: Math.round(root.unit * 0.06)
      rowSpacing: Math.round(root.unit * 0.055)

      Repeater {
        model: root.figures

        delegate: Row {
          required property var modelData
          width: Math.max(0, (figureGrid.width
            - figureGrid.columnSpacing * (root.columns - 1)) / root.columns)
          spacing: Math.round(root.unit * 0.028)

          Text {
            anchors.baseline: wordLabel.baseline
            textFormat: Text.PlainText
            text: modelData.value
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: root.valueSize
            renderType: Text.NativeRendering
          }

          Text {
            id: wordLabel
            textFormat: Text.PlainText
            text: modelData.word
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: root.wordSize
            elide: Text.ElideRight
            renderType: Text.NativeRendering
          }
        }
      }
    }
  }
}
