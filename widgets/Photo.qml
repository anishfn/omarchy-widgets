import QtQuick
import Quickshell.Widgets
import qs.Commons
import "../Model.js" as Model

// A picture of your own on the wallpaper: one file, or a folder shown one
// picture at a time.
//
// It is the only card here whose content is not a reading. Everything else in
// the set draws a value and needs the wallpaper behind it; this one *is* an
// image, so it fills the card edge to edge and takes the card's own corners
// with it — a photograph inset inside a translucent pane would read as a
// screenshot of a photograph.
//
// Which of the two a card is comes from the path alone: a file that ends in
// an image extension is that photograph, and anything else is a directory
// whose pictures the service lists. One setting, because the choice was
// already made in the file chooser, and asking again would be asking twice.
Item {
  id: root

  // Injected by Surface.qml.
  property var service: null
  property var instance: null
  property var card: null
  readonly property var settings: instance && instance.settings ? instance.settings : ({})

  readonly property color foreground: Color.foreground
  readonly property color dim: Util.alpha(Color.foreground, 0.55)
  readonly property color faint: Util.alpha(Color.foreground, 0.3)
  readonly property string fontFamily: Style.font.family

  // Sized from a cell rather than from the card: this type offers footprints
  // three rows tall, and a caption that grew with the card would be a headline
  // on the big ones. What a bigger card buys here is more picture.
  readonly property int spanCols: instance && instance.cols > 0 ? instance.cols : 1
  readonly property int spanRows: instance && instance.rows > 0 ? instance.rows : 1
  readonly property real unit: Math.min(width / spanCols, height / spanRows)

  readonly property int cardRadius: card ? card.radius : 20

  // ------------------------------------------------------------ the pictures

  readonly property string home: service ? String(service.home || "") : ""
  readonly property var target: Model.photoTarget(settings.path, home)

  // A single file is a list of one, so everything below this line works the
  // same way whichever kind of path it was handed. The folder listing is the
  // service's, scanned once per directory however many cards share it.
  readonly property var files: {
    if (target.kind === "image") return [target.path]
    if (target.kind !== "folder") return []
    var listed = service && service.photoFiles ? service.photoFiles[target.path] : null
    return listed ? listed : []
  }

  readonly property bool scanned: target.kind !== "folder"
    || (service && service.photoFiles && service.photoFiles[target.path] !== undefined)

  property int index: 0

  readonly property string current: Model.photoAt(files, index)
  readonly property bool shuffle: settings.shuffle === true
  readonly property int intervalMs: Model.photoIntervalMs(settings.interval)
  readonly property bool fill: String(settings.fit || "fill") !== "contain"

  readonly property string caption: Model.clampString(settings.label || "")
    .replace(/^\s+|\s+$/g, "")

  // A new folder, or a folder that gained or lost pictures, starts again at
  // the top rather than keeping a position that now points at a different
  // photograph.
  //
  // Keyed on what the list *is* rather than bound to the list itself: every
  // edit anywhere in the editor replaces the whole config object, so `files`
  // is a new array several times a second while a card is being dragged, and
  // a slideshow that restarted on each of those would never leave its first
  // picture.
  readonly property string filesKey: target.path + "\u0000" + files.length
  onFilesKeyChanged: root.index = 0

  function advance() {
    if (files.length < 2) return
    root.index = Model.nextPhotoIndex(files.length, root.index, root.shuffle, Math.random())
  }

  // Only ever running for a folder with something to move between. A single
  // picture, or a slideshow set to never, runs no timer at all.
  Timer {
    interval: Math.max(5000, root.intervalMs)
    running: root.intervalMs > 0 && root.files.length > 1
    repeat: true
    onTriggered: root.advance()
  }

  // ----------------------------------------------------------------- paint

  // Decoded no larger than the card can show, as a square bound of its longer
  // side so either fit has the pixels it needs. A folder of camera JPEGs is
  // twenty megapixels apiece, and a wallpaper decoration holding one of those
  // at full size is the difference between a card and a memory leak.
  readonly property int decodeSize: Math.max(128,
    Math.round(Math.max(root.width, root.height)))

  // The last picture that finished loading. It stays underneath while the next
  // one is being read, so a slideshow changes from one photograph to another
  // rather than from a photograph to a hole and back. Nothing moves and
  // nothing fades: it is still a cut, it just has no gap in it.
  property string settled: ""

  ClippingRectangle {
    anchors.fill: parent
    radius: root.cardRadius
    color: "transparent"

    Image {
      anchors.fill: parent
      visible: root.current !== "" && root.settled !== ""
        && picture.status === Image.Loading
      source: root.settled === "" ? "" : Util.fileUrl(root.settled)
      fillMode: picture.fillMode
      asynchronous: true
      cache: true
      sourceSize.width: root.decodeSize
      sourceSize.height: root.decodeSize
    }

    Image {
      id: picture
      anchors.fill: parent
      source: root.current === "" ? "" : Util.fileUrl(root.current)
      fillMode: root.fill ? Image.PreserveAspectCrop : Image.PreserveAspectFit
      asynchronous: true
      cache: true
      sourceSize.width: root.decodeSize
      sourceSize.height: root.decodeSize
      onStatusChanged: if (status === Image.Ready) root.settled = root.current
    }

    // The caption stands on a floor of the card's own background, because the
    // thing behind it is a photograph and nothing else on it is legible over
    // an arbitrary one. Same device the music card uses for a track title
    // over its cover, and for the same reason.
    Rectangle {
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      visible: label.visible
      height: Math.round(root.unit * 0.34)
      gradient: Gradient {
        GradientStop { position: 0.0; color: "transparent" }
        GradientStop { position: 1.0; color: Util.alpha(Color.background, 0.72) }
      }
    }

    Text {
      id: label
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      anchors.margins: Math.round(root.unit * 0.07)
      visible: root.caption !== "" && picture.status === Image.Ready
      horizontalAlignment: Text.AlignHCenter
      elide: Text.ElideRight
      textFormat: Text.PlainText
      text: root.caption
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Math.max(8, Math.round(root.unit * 0.075))
      renderType: Text.NativeRendering
    }
  }

  // ------------------------------------------------------------ nothing yet
  //
  // Three ways to have no picture, and they want different sentences: no path
  // at all, a folder still being read, and a folder with nothing in it. A
  // card that said "no pictures" while it was still looking would be wrong
  // for as long as the look took.

  Column {
    anchors.centerIn: parent
    width: parent.width - Math.round(root.unit * 0.2)
    // Only when there is nothing to show at all. A picture on its way in has
    // the settled one underneath it, and covering that with a sentence would
    // be the card telling you it is busy instead of showing you a photograph.
    visible: root.current === "" || picture.status === Image.Error
    spacing: Math.round(root.unit * 0.06)

    Text {
      anchors.horizontalCenter: parent.horizontalCenter
      // A glyph, not the literal character: a private-use codepoint renders
      // as nothing if any tool between here and the screen drops it.
      text: "\uf03e"
      textFormat: Text.PlainText
      color: root.faint
      font.family: root.fontFamily
      font.pixelSize: Math.round(root.unit * 0.24)
      renderType: Text.NativeRendering
    }

    Text {
      anchors.horizontalCenter: parent.horizontalCenter
      width: parent.width
      horizontalAlignment: Text.AlignHCenter
      wrapMode: Text.Wrap
      textFormat: Text.PlainText
      text: {
        if (root.target.kind === "none") return "Choose a picture in the editor"
        if (!root.scanned) return "Reading the folder…"
        if (root.files.length === 0) return "No pictures in that folder"
        return picture.status === Image.Error ? "That picture will not open" : ""
      }
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Math.max(8, Math.round(root.unit * 0.07))
      renderType: Text.NativeRendering
    }
  }
}
