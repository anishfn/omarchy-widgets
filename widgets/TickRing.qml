import QtQuick
import qs.Commons

// The ring of small marks just inside a card's edge, as on the clock in the
// reference. Each tick is a short stroke along the inward normal of a rounded
// rectangle, so they stay perpendicular to the edge the whole way round —
// including through the corners, where a dashed outline would just bend.
//
// The path is walked analytically rather than dashed: four straight runs and
// four quarter arcs, with ticks dropped at an even arc length. The spacing is
// then divided back out of the true perimeter so the last gap is the same
// size as the first and the ring closes.
Canvas {
  id: root

  // Distance from the card's own edge to the ring the ticks sit on.
  property real inset: 12
  // How far each tick reaches inward from that ring.
  property real tickLength: 5
  property real tickWidth: 1
  // Target gap between ticks. The drawn gap is this rounded to whatever
  // divides the perimeter evenly.
  property real spacing: 9
  // The card's corner radius; the ring follows it, pulled in by `inset`.
  property real cardRadius: 20
  property color tickColor: Util.alpha(Color.foreground, 0.35)

  readonly property real ringWidth: Math.max(0, width - inset * 2)
  readonly property real ringHeight: Math.max(0, height - inset * 2)
  readonly property real ringRadius: Math.max(0, Math.min(cardRadius - inset,
    Math.min(ringWidth, ringHeight) / 2))

  antialiasing: true

  onInsetChanged: requestPaint()
  onTickLengthChanged: requestPaint()
  onTickWidthChanged: requestPaint()
  onSpacingChanged: requestPaint()
  onCardRadiusChanged: requestPaint()
  onTickColorChanged: requestPaint()
  onWidthChanged: requestPaint()
  onHeightChanged: requestPaint()

  // Position and outward normal at arc length `t` along the rounded rect,
  // starting at the top-left corner's end and running clockwise.
  function pointAt(t, w, h, r) {
    var straightX = Math.max(0, w - r * 2)
    var straightY = Math.max(0, h - r * 2)
    var arc = (Math.PI / 2) * r
    var d = t

    // Top edge, left to right.
    if (d < straightX) return { x: r + d, y: 0, nx: 0, ny: -1 }
    d -= straightX

    // Top-right corner, -90deg to 0deg.
    if (d < arc) {
      var a1 = -Math.PI / 2 + (arc > 0 ? d / r : 0)
      return { x: (w - r) + Math.cos(a1) * r, y: r + Math.sin(a1) * r, nx: Math.cos(a1), ny: Math.sin(a1) }
    }
    d -= arc

    // Right edge, top to bottom.
    if (d < straightY) return { x: w, y: r + d, nx: 1, ny: 0 }
    d -= straightY

    // Bottom-right corner, 0deg to 90deg.
    if (d < arc) {
      var a2 = (arc > 0 ? d / r : 0)
      return { x: (w - r) + Math.cos(a2) * r, y: (h - r) + Math.sin(a2) * r, nx: Math.cos(a2), ny: Math.sin(a2) }
    }
    d -= arc

    // Bottom edge, right to left.
    if (d < straightX) return { x: (w - r) - d, y: h, nx: 0, ny: 1 }
    d -= straightX

    // Bottom-left corner, 90deg to 180deg.
    if (d < arc) {
      var a3 = Math.PI / 2 + (arc > 0 ? d / r : 0)
      return { x: r + Math.cos(a3) * r, y: (h - r) + Math.sin(a3) * r, nx: Math.cos(a3), ny: Math.sin(a3) }
    }
    d -= arc

    // Left edge, bottom to top.
    if (d < straightY) return { x: 0, y: (h - r) - d, nx: -1, ny: 0 }
    d -= straightY

    // Top-left corner, 180deg to 270deg.
    var a4 = Math.PI + (arc > 0 ? d / r : 0)
    return { x: r + Math.cos(a4) * r, y: r + Math.sin(a4) * r, nx: Math.cos(a4), ny: Math.sin(a4) }
  }

  onPaint: {
    var ctx = getContext("2d")
    ctx.reset()
    if (root.ringWidth <= 0 || root.ringHeight <= 0 || root.spacing <= 0) return

    var w = root.ringWidth
    var h = root.ringHeight
    var r = root.ringRadius
    var perimeter = Math.max(0, w - r * 2) * 2 + Math.max(0, h - r * 2) * 2 + 2 * Math.PI * r
    if (perimeter <= 0) return

    // Round the count so the spacing divides the perimeter exactly; without
    // this the ring closes on a short gap and the seam is the first thing the
    // eye finds.
    var count = Math.max(4, Math.round(perimeter / root.spacing))
    var step = perimeter / count

    ctx.save()
    ctx.translate(root.inset, root.inset)
    ctx.strokeStyle = root.tickColor
    ctx.lineWidth = root.tickWidth
    ctx.lineCap = "butt"
    ctx.beginPath()

    for (var i = 0; i < count; i++) {
      var p = root.pointAt(i * step, w, h, r)
      // Half a pixel off the grid keeps a 1px stroke on one row of pixels
      // instead of smeared across two.
      var x0 = p.x + (p.nx === 0 ? 0.5 : 0)
      var y0 = p.y + (p.ny === 0 ? 0.5 : 0)
      ctx.moveTo(x0, y0)
      ctx.lineTo(x0 - p.nx * root.tickLength, y0 - p.ny * root.tickLength)
    }

    ctx.stroke()
    ctx.restore()
  }
}
