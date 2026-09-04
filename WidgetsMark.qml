import QtQuick
import qs.Commons

// The Widgets mark: the shape the grid makes — two cards side by side, one
// spanning both underneath. It is the plugin's own layout at icon size, and
// the span is the part that says "widgets" rather than "a grid of anything".
//
// Drawn rather than loaded, so it takes the bar's colour and stays sharp at
// whatever size the bar asks for.
//
// Geometry follows the bar's other icons: a nine by nine grid in a sixteen
// unit canvas, four units to a block and one unit of gap. That gap is a
// single device pixel at the default bar size, so every edge is rounded to a
// whole one — half a pixel of antialiasing either side of a one pixel gap
// closes it, and the three blocks resolve into one smudge.
Item {
  id: root

  property real iconSize: Style.font.icon
  property color color: Color.foreground

  readonly property real unit: Math.max(1, Math.round(iconSize / 16))
  readonly property real block: unit * 4
  readonly property real stride: unit * 5
  readonly property real artSize: unit * 9
  // Floor, not round: with a nine unit mark in a sixteen unit canvas the
  // difference is 3.5, and rounding it up drops the mark below the glyphs
  // either side of it.
  readonly property real offsetY: Math.floor((root.height - root.artSize) / 2)

  // Square at bar size, where a radius would only blur a four pixel block;
  // rounded once there is room for it to read as a card.
  readonly property real tile: root.unit >= 2 ? root.unit : 0

  implicitWidth: artSize
  implicitHeight: iconSize
  width: implicitWidth
  height: implicitHeight

  // Two cards, side by side.
  Rectangle {
    x: 0
    y: root.offsetY
    width: root.block
    height: root.block
    radius: root.tile
    color: root.color
  }

  Rectangle {
    x: root.stride
    y: root.offsetY
    width: root.block
    height: root.block
    radius: root.tile
    color: root.color
  }

  // One spanning both, underneath.
  Rectangle {
    x: 0
    y: root.offsetY + root.stride
    width: root.artSize
    height: root.block
    radius: root.tile
    color: root.color
  }
}
