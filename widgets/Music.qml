import QtQuick
import Quickshell
import Quickshell.Services.Mpris
import Quickshell.Widgets
import qs.Commons
import "../Model.js" as Model

// What is playing: the art, the title, who by, how far through, and the
// transport for it — back, play or pause, forward.
//
// Two compositions, not one stretched. A wide card puts the art down the left
// and the words beside it. A square card has no room for that — the art alone
// would take everything — so it fills the card instead and the words sit over
// it, which is what a small music tile wants to be anyway.
//
// This is the one widget in the set that takes a click, which it gets by
// declaring `interactive` in the catalogue: the desktop surface then turns
// this rectangle, and only this rectangle, back into an input region. The
// controls stay one obvious action about the track already on the card —
// skipping is the same gesture as pausing, not a menu — and play/pause keeps
// the weight, with back and forward drawn quietly beside it.
//
// The player comes from MPRIS, so it is whatever is actually playing —
// Spotify, a browser tab, mpv — rather than any one application, unless the
// `player` setting names one to follow.
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
  readonly property bool showSkip: settings.showSkip !== false

  // Blank follows whatever is playing. A name is matched against the player's
  // identity and its bus name, so "spotify" and "firefox" both work.
  readonly property string preferredPlayer: String(settings.player || "")

  // Square-ish cards get the compact layout.
  readonly property bool compact: width < unit * 1.4

  readonly property int cardRadius: card ? card.radius : 20

  // ------------------------------------------------------------ the player

  readonly property var players: Mpris.players ? Mpris.players.values : null
  readonly property int index: Model.pickPlayerIndex(players, root.preferredPlayer)
  readonly property var player: players && index >= 0 && index < players.length
    ? players[index] : null

  readonly property bool hasPlayer: player !== null
  readonly property string title: hasPlayer ? String(player.trackTitle || "") : ""
  readonly property string artist: hasPlayer ? String(player.trackArtist || "") : ""
  readonly property string artUrl: hasPlayer ? String(player.trackArtUrl || "") : ""
  readonly property bool playing: hasPlayer && player.isPlaying === true
  // What this player will actually answer. A stream has somewhere to pause
  // and nowhere to skip to, so the buttons follow the player rather than the
  // setting alone.
  readonly property var transport: Model.playerTransport(player)
  readonly property bool canToggle: transport.toggle
  readonly property bool canPrevious: root.showSkip && transport.previous
  readonly property bool canNext: root.showSkip && transport.next

  // Glyphs, not literal characters: a private-use character renders as
  // nothing if any tool along the way drops it.
  readonly property string iconPrevious: "\uf048"
  readonly property string iconNext: "\uf051"
  readonly property string iconToggle: root.playing ? "\uf04c" : "\uf04b"

  readonly property real position: hasPlayer && player.positionSupported ? player.position : 0
  readonly property real length: hasPlayer && player.lengthSupported ? player.length : 0
  readonly property real fraction: Model.trackFraction(position, length)

  // A title or an artist is enough. Some players publish one a moment before
  // the other, and waiting for both is what makes a card look slow.
  readonly property bool ready: Model.hasPlayable(player)

  readonly property bool artReady: root.showArt && artUrl !== "" && cover.status === Image.Ready

  // The position only ticks while something is playing, and only while a
  // progress bar is on screen to show it.
  FrameAnimation {
    running: root.playing && root.showProgress && root.ready
    onTriggered: if (root.player) root.player.positionChanged()
  }

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

  // The image is loaded once and drawn by whichever layout is up.
  Image {
    id: cover
    source: root.showArt ? root.artUrl : ""
    fillMode: Image.PreserveAspectCrop
    asynchronous: true
    cache: true
    visible: false
    // Decoded no larger than the card needs it.
    sourceSize.width: Math.max(64, Math.round(root.width))
    sourceSize.height: Math.max(64, Math.round(root.height))
  }

  // ------------------------------------------------------- compact layout
  //
  // Art edge to edge, words over a scrim along the bottom. Nothing is inset
  // from the card here: the cover is the card.

  Item {
    anchors.fill: parent
    visible: root.ready && root.compact

    ClippingRectangle {
      anchors.fill: parent
      radius: root.cardRadius
      color: "transparent"

      Image {
        anchors.fill: parent
        source: cover.source
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        cache: true
        visible: root.artReady
        sourceSize.width: cover.sourceSize.width
        sourceSize.height: cover.sourceSize.height
      }

      // A note where there is no cover, so the card is never simply blank.
      Text {
        anchors.centerIn: parent
        visible: !root.artReady
        text: "\uf001"
        color: Util.alpha(root.foreground, 0.25)
        font.family: root.fontFamily
        font.pixelSize: Math.round(root.unit * 0.3)
        renderType: Text.NativeRendering
      }

      // Words go over a photograph, so they need a floor to stand on. The
      // gradient is the card's own background colour, which keeps the tile
      // in the theme however bright the cover is.
      Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: Math.round(parent.height * 0.62)
        visible: root.artReady
        gradient: Gradient {
          GradientStop { position: 0.0; color: Util.alpha(Color.background, 0.0) }
          GradientStop { position: 0.45; color: Util.alpha(Color.background, 0.72) }
          GradientStop { position: 1.0; color: Util.alpha(Color.background, 0.94) }
        }
      }
    }

    Text {
      id: compactTitle
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.leftMargin: root.pad
      anchors.rightMargin: root.pad
      anchors.bottom: compactArtist.top
      anchors.bottomMargin: Math.round(root.unit * 0.01)
      textFormat: Text.PlainText
      text: root.title
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Math.max(10, Math.round(root.unit * 0.085))
      elide: Text.ElideRight
      maximumLineCount: 2
      wrapMode: Text.Wrap
      renderType: Text.NativeRendering
    }

    Text {
      id: compactArtist
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.leftMargin: root.pad
      anchors.rightMargin: root.pad
      anchors.bottom: compactControls.visible ? compactControls.top : parent.bottom
      anchors.bottomMargin: compactControls.visible
        ? Math.round(root.unit * 0.03)
        : root.pad + (root.showProgress && root.length > 0
          ? Math.round(root.unit * 0.05) : 0)
      textFormat: Text.PlainText
      text: root.artist
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Math.max(8, Math.round(root.unit * 0.065))
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    // The controls get a line of their own, centred, with the words stacked
    // above them. Sharing the artist's line is what a single button could
    // afford; three of them left the artist five characters wide, and a card
    // that cannot say who is playing is not worth the buttons.
    //
    // Only play/pause is drawn as a target. Three pills on a tile this size
    // would read as a control panel rather than a card you can pause.
    Row {
      id: compactControls
      anchors.horizontalCenter: parent.horizontalCenter
      anchors.bottom: parent.bottom
      anchors.bottomMargin: Math.round(root.pad * 0.7)
        + (root.showProgress && root.length > 0 ? Math.round(root.unit * 0.05) : 0)
      visible: root.canToggle || root.canPrevious || root.canNext
      spacing: Math.round(root.unit * 0.045)

      readonly property real toggleSize: Math.max(20, Math.round(root.unit * 0.18))
      readonly property real skipSize: Math.max(14, Math.round(toggleSize * 0.78))

      MusicButton {
        anchors.verticalCenter: parent.verticalCenter
        size: compactControls.skipSize
        icon: root.iconPrevious
        prominent: false
        accent: root.accent
        fontFamily: root.fontFamily
        visible: root.canPrevious
        onPressed: if (root.player && root.canPrevious) root.player.previous()
      }

      MusicButton {
        anchors.verticalCenter: parent.verticalCenter
        size: compactControls.toggleSize
        icon: root.iconToggle
        accent: root.accent
        fontFamily: root.fontFamily
        visible: root.canToggle
        onPressed: if (root.player && root.canToggle) root.player.togglePlaying()
      }

      MusicButton {
        anchors.verticalCenter: parent.verticalCenter
        size: compactControls.skipSize
        icon: root.iconNext
        prominent: false
        accent: root.accent
        fontFamily: root.fontFamily
        visible: root.canNext
        onPressed: if (root.player && root.canNext) root.player.next()
      }
    }

    // A hairline along the very bottom of the card, edge to edge — there is
    // no room for a bar with numbers beside it here.
    Rectangle {
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      anchors.margins: Math.round(root.unit * 0.045)
      height: Math.max(2, Math.round(root.unit * 0.016))
      radius: height / 2
      visible: root.showProgress && root.length > 0
      color: Util.alpha(root.foreground, 0.2)

      Rectangle {
        width: parent.width * root.fraction
        height: parent.height
        radius: parent.radius
        color: root.accent
      }
    }
  }

  // ---------------------------------------------------------- wide layout

  Item {
    anchors.fill: parent
    visible: root.ready && !root.compact

    readonly property real artSize: root.showArt ? Math.round(root.height - root.pad * 2) : 0
    readonly property real textLeft: root.pad
      + (root.showArt ? artSize + Math.round(root.unit * 0.075) : 0)

    ClippingRectangle {
      id: wideArt
      x: root.pad
      y: root.pad
      width: parent.artSize
      height: parent.artSize
      visible: root.showArt && parent.artSize > 0
      radius: Math.max(2, Math.round(parent.artSize * 0.1))
      color: Util.alpha(root.foreground, 0.1)

      Text {
        anchors.centerIn: parent
        visible: !root.artReady
        text: "\uf001"
        color: Util.alpha(root.foreground, 0.35)
        font.family: root.fontFamily
        font.pixelSize: Math.max(10, Math.round(wideArt.width * 0.4))
        renderType: Text.NativeRendering
      }

      Image {
        anchors.fill: parent
        source: cover.source
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        cache: true
        visible: root.artReady
        sourceSize.width: cover.sourceSize.width
        sourceSize.height: cover.sourceSize.height
      }
    }

    Text {
      id: wideTitle
      x: parent.textLeft
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
      id: wideArtist
      x: parent.textLeft
      y: wideTitle.y + wideTitle.height + Math.round(root.unit * 0.025)
      width: Math.max(0, parent.width - x - root.pad)
      textFormat: Text.PlainText
      text: root.artist
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Math.max(8, Math.round(root.unit * 0.075))
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    // There is room for the row here, so it sits under the words with the
    // progress bar below it, in the reading order the card already has —
    // centred in what the words leave rather than dropped to the floor,
    // which is what left a hole under a short title.
    Row {
      id: wideControls
      x: parent.textLeft
      y: {
        var top = wideArtist.y + wideArtist.height
        var bottom = wideProgress.visible
          ? wideProgress.y - Math.round(root.unit * 0.02)
          : parent.height - root.pad
        var centred = Math.round((top + bottom - height) / 2)
        // Never closer to the artist than the line spacing above it.
        return Math.max(top + Math.round(root.unit * 0.045), centred)
      }
      spacing: Math.round(root.unit * 0.035)

      readonly property real toggleSize: Math.max(18, Math.round(root.unit * 0.16))
      readonly property real skipSize: Math.max(14, Math.round(toggleSize * 0.82))

      MusicButton {
        anchors.verticalCenter: parent.verticalCenter
        size: wideControls.skipSize
        icon: root.iconPrevious
        prominent: false
        accent: root.accent
        fontFamily: root.fontFamily
        visible: root.canPrevious
        onPressed: if (root.player && root.canPrevious) root.player.previous()
      }

      MusicButton {
        anchors.verticalCenter: parent.verticalCenter
        size: wideControls.toggleSize
        icon: root.iconToggle
        accent: root.accent
        fontFamily: root.fontFamily
        visible: root.canToggle
        onPressed: if (root.player && root.canToggle) root.player.togglePlaying()
      }

      MusicButton {
        anchors.verticalCenter: parent.verticalCenter
        size: wideControls.skipSize
        icon: root.iconNext
        prominent: false
        accent: root.accent
        fontFamily: root.fontFamily
        visible: root.canNext
        onPressed: if (root.player && root.canNext) root.player.next()
      }
    }

    Item {
      id: wideProgress
      x: parent.textLeft
      y: parent.height - root.pad - height
      width: Math.max(0, parent.width - x - root.pad)
      height: Math.max(10, Math.round(root.unit * 0.06))
      visible: root.showProgress && root.length > 0

      Rectangle {
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
