import QtQuick
import Quickshell
import Quickshell.Services.Mpris
import Quickshell.Widgets
import qs.Commons
import "../Model.js" as Model

// What is playing: the art, the title, who by, how far through, and a button
// to stop it.
//
// This is the one widget in the set that takes a click, which it gets by
// declaring `interactive` in the catalogue — the desktop surface then turns
// this rectangle, and only this rectangle, back into an input region. The
// rule everywhere else still holds: a card you can click is the exception,
// and it has to earn it. This one does, because a transport control you have
// to go somewhere else to reach is not a transport control.
//
// The player comes from MPRIS, so it is whatever is actually playing —
// Spotify, a browser tab, mpv — rather than any one application.
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
  readonly property real pad: Math.round(unit * 0.1)

  readonly property bool showArt: settings.showArt !== false
  readonly property bool showProgress: settings.showProgress !== false

  // ------------------------------------------------------------ the player

  readonly property var players: Mpris.players ? Mpris.players.values : []
  readonly property int index: Model.pickPlayerIndex(players, "")
  readonly property var player: index >= 0 && index < players.length ? players[index] : null

  readonly property bool hasPlayer: player !== null
  readonly property string title: hasPlayer ? String(player.trackTitle || "") : ""
  readonly property string artist: hasPlayer ? String(player.trackArtist || "") : ""
  readonly property string artUrl: hasPlayer ? String(player.trackArtUrl || "") : ""
  readonly property bool playing: hasPlayer && player.isPlaying === true
  readonly property bool canToggle: hasPlayer && player.canTogglePlaying === true

  readonly property real position: hasPlayer && player.positionSupported ? player.position : 0
  readonly property real length: hasPlayer && player.lengthSupported ? player.length : 0
  readonly property real fraction: Model.trackFraction(position, length)

  readonly property bool ready: hasPlayer && title !== ""

  // The position only ticks while something is playing, and only while a
  // progress bar is on screen to show it.
  FrameAnimation {
    running: root.playing && root.showProgress && root.ready
    onTriggered: if (root.player) root.player.positionChanged()
  }

  // ---------------------------------------------------------------- layout

  readonly property real artSize: showArt ? Math.round(height - pad * 2) : 0
  readonly property real textLeft: pad + (showArt ? artSize + Math.round(unit * 0.075) : 0)

  // ----------------------------------------------------------------- paint

  Text {
    anchors.centerIn: parent
    width: parent.width - root.pad * 2
    visible: !root.ready
    horizontalAlignment: Text.AlignHCenter
    wrapMode: Text.Wrap
    textFormat: Text.PlainText
    text: "Nothing playing"
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: Math.max(9, Math.round(root.unit * 0.075))
    renderType: Text.NativeRendering
  }

  Item {
    anchors.fill: parent
    visible: root.ready

    // Album art, square, down the left. Kept as a rounded tile so it sits
    // inside the card rather than fighting its corners.
    // Album art, square, down the left. ClippingRectangle rounds the image
    // to the tile rather than the image being rounded itself, so a cover of
    // any aspect crops to the same shape.
    ClippingRectangle {
      id: art
      x: root.pad
      y: root.pad
      width: root.artSize
      height: root.artSize
      visible: root.showArt && root.artSize > 0
      radius: Math.max(2, Math.round(root.artSize * 0.1))
      color: Util.alpha(root.foreground, 0.1)

      // A note, for a track whose art has not loaded or does not exist.
      Text {
        anchors.centerIn: parent
        visible: cover.status !== Image.Ready
        text: "\uf001"  // a note, for art that has not loaded or does not exist
        color: Util.alpha(root.foreground, 0.35)
        font.family: root.fontFamily
        font.pixelSize: Math.max(10, Math.round(root.artSize * 0.4))
        renderType: Text.NativeRendering
      }

      Image {
        id: cover
        anchors.fill: parent
        source: root.artUrl
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        cache: true
        smooth: true
        visible: status === Image.Ready
      }
    }

    // Title, then who by.
    Text {
      id: titleText
      x: root.textLeft
      y: root.pad
      width: Math.max(0, parent.width - x - root.pad)
      textFormat: Text.PlainText
      text: root.title
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Math.max(10, Math.round(root.unit * 0.095))
      elide: Text.ElideRight
      maximumLineCount: 2
      wrapMode: Text.Wrap
      renderType: Text.NativeRendering
    }

    Text {
      id: artistText
      x: root.textLeft
      y: titleText.y + titleText.height + Math.round(root.unit * 0.025)
      width: Math.max(0, parent.width - x - root.pad)
      textFormat: Text.PlainText
      text: root.artist
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Math.max(8, Math.round(root.unit * 0.075))
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    // Play/pause. The one accent on the card, because it is the one thing
    // here you can do something with.
    Rectangle {
      id: toggle
      width: Math.max(18, Math.round(root.unit * 0.16))
      height: width
      radius: width / 2
      x: root.textLeft
      y: parent.height - root.pad - height - (root.showProgress ? progress.height + Math.round(root.unit * 0.055) : 0)
      visible: root.canToggle
      color: press.pressed
        ? Util.alpha(root.accent, 0.5)
        : (press.containsMouse ? Util.alpha(root.accent, 0.3) : Util.alpha(root.accent, 0.18))
      border.width: 1
      border.color: Util.alpha(root.accent, press.containsMouse ? 0.9 : 0.55)

      Text {
        anchors.centerIn: parent
        // Pause while it plays, play while it does not, so the button shows
        // what pressing it will do. Escapes rather than literal glyphs: a
        // private-use character in a source file renders as nothing at all if
        // any tool along the way drops it, and nothing reports the loss.
        text: root.playing ? "\uf04c" : "\uf04b"
        color: root.accent
        font.family: root.fontFamily
        font.pixelSize: Math.max(9, Math.round(toggle.width * 0.5))
        renderType: Text.NativeRendering
      }

      MouseArea {
        id: press
        anchors.fill: parent
        anchors.margins: -Math.round(root.unit * 0.02)
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: if (root.player && root.canToggle) root.player.togglePlaying()
      }
    }

    // How far through, and how long that is.
    Item {
      id: progress
      x: root.textLeft
      y: parent.height - root.pad - height
      width: Math.max(0, parent.width - x - root.pad)
      height: Math.max(10, Math.round(root.unit * 0.06))
      visible: root.showProgress && root.length > 0

      Rectangle {
        id: track
        anchors.left: parent.left
        anchors.right: elapsed.left
        anchors.rightMargin: Math.round(root.unit * 0.04)
        anchors.verticalCenter: parent.verticalCenter
        height: Math.max(2, Math.round(root.unit * 0.018))
        radius: height / 2
        color: Util.alpha(root.foreground, 0.16)

        Rectangle {
          width: parent.width * root.fraction
          height: parent.height
          radius: parent.radius
          color: root.accent
        }
      }

      Text {
        id: elapsed
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: Model.trackTime(root.position) + " / " + Model.trackTime(root.length)
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Math.max(7, Math.round(root.unit * 0.055))
        renderType: Text.NativeRendering
      }
    }
  }
}
