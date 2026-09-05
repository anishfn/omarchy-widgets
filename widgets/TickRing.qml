import QtQuick
import qs.Commons

// The ring of small marks just inside a card's edge, kept sparse like the
// clock in the reference: 48 minute positions around the face, with a longer
// tick every 11th (rounded to 44 positions, so the majors still come four
// to a ring). Ticks point at the card's centre rather than perpendicular to
// the edge, which is what gives them their gradual slant through the sides
// and corners.
//
// The path is walked analytically rather than dashed: four straight runs and
// four quarter arcs, with a tick dropped every `perimeter / count` of the
// true perimeter. Walked that way the ring closes on an even gap.
Canvas {
  id: root

  // Distance from the card's own edge to the ring the ticks sit on.
  property real inset: 12
  // How far a minor tick reaches, and its width.
  property real tickLength: 10
  property real tickWidth: 1
  // Kept for compatibility with the existing clock widget, which still binds
  // it; the ring is a fixed 48-position face now, so it spaces nothing.
  property real spacing: 12
  // The card's corner radius; the ring follows it, pulled in by `inset`.
  property real cardRadius: 20
  property color tickColor: Util.alpha(Color.foreground, 0.3)

  property int tickCount: 48
  // One major per sector: 44 / 11 = 4. Longer, but not thicker.
  property int majorEvery: 11
  property real majorTickLength: 14
  property real majorTickWidth: 1

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
  onTickCountChanged: requestPaint()
  onMajorEveryChanged: requestPaint()
  onMajorTickLengthChanged: requestPaint()
  onMajorTickWidthChanged: requestPaint()
  onWidthChanged: requestPaint()
  onHeightChanged: requestPaint()

  // Point at arc length `t` along the rounded rect, starting at the top-left
  // corner's end and running clockwise. `t` is wrapped, so any non-negative
  // length works and the ring closes.
  function pointAt(t, w, h, r) {
    var straightX = Math.max(0, w - r * 2)
    var straightY = Math.max(0, h - r * 2)
    var arc = (Math.PI / 2) * r
    var perimeter = straightX * 2 + straightY * 2 + arc * 4
    if (perimeter <= 0) return { x: 0, y: 0 }
    var d = ((t % perimeter) + perimeter) % perimeter

    // Top edge, left to right.
    if (d < straightX) return { x: r + d, y: 0 }
    d -= straightX

    // Top-right corner, -90deg to 0deg.
    if (d < arc) {
      var a1 = -Math.PI / 2 + (arc > 0 ? d / r : 0)
      return { x: (w - r) + Math.cos(a1) * r, y: r + Math.sin(a1) * r }
    }
    d -= arc

    // Right edge, top to bottom.
    if (d < straightY) return { x: w, y: r + d }
    d -= straightY

    // Bottom-right corner, 0deg to 90deg.
    if (d < arc) {
      var a2 = arc > 0 ? d / r : 0
      return { x: (w - r) + Math.cos(a2) * r, y: (h - r) + Math.sin(a2) * r }
    }
    d -= arc

    // Bottom edge, right to left.
    if (d < straightX) return { x: (w - r) - d, y: h }
    d -= straightX

    // Bottom-left corner, 90deg to 180deg.
    if (d < arc) {
      var a3 = Math.PI / 2 + (arc > 0 ? d / r : 0)
      return { x: r + Math.cos(a3) * r, y: (h - r) + Math.sin(a3) * r }
    }
    d -= arc

    // Left edge, bottom to top.
    if (d < straightY) return { x: 0, y: (h - r) - d }
    d -= straightY

    // Top-left corner, 180deg to 270deg.
    var a4 = Math.PI + (arc > 0 ? d / r : 0)
    return { x: r + Math.cos(a4) * r, y: r + Math.sin(a4) * r }
  }

  onPaint: {
    var ctx = getContext("2d")
    ctx.reset()
    if (root.ringWidth <= 0 || root.ringHeight <= 0 || root.tickCount <= 0) return

    var w = root.ringWidth
    var h = root.ringHeight
    var r = root.ringRadius
    var straightX = Math.max(0, w - r * 2)
    var straightY = Math.max(0, h - r * 2)
    var arc = (Math.PI / 2) * r
    var perimeter = straightX * 2 + straightY * 2 + arc * 4
    if (perimeter <= 0) return

    // Exactly the requested positions: a multiple of `majorEvery`, so a major
    // lands on the first tick too and the ring never ends on a short gap.
    var count = root.tickCount
    if (root.majorEvery > 0) {
      count = Math.max(root.majorEvery, Math.round(count / root.majorEvery) * root.majorEvery)
    }
    var step = perimeter / count

    ctx.save()
    ctx.translate(root.inset, root.inset)
    ctx.strokeStyle = root.tickColor
    ctx.lineCap = "butt"

    var cx = w / 2
    var cy = h / 2

    for (var i = 0; i < count; i++) {
      var p = root.pointAt(i * step, w, h, r)
      var major = root.majorEvery > 0 && (i % root.majorEvery) === 0
      var length = major ? root.majorTickLength : root.tickLength

      // Inward, toward the card's centre, rather than perpendicular to the
      // edge — the slant through the corners is the point of this ring.
      var dx = cx - p.x
      var dy = cy - p.y
      var distance = Math.sqrt(dx * dx + dy * dy)
      if (distance <= 0) continue
      var dirX = dx / distance
      var dirY = dy / distance

      ctx.lineWidth = major ? root.majorTickWidth : root.tickWidth

      // Half a pixel off the grid keeps a straight 1px stroke on one row of
      // pixels instead of smeared across two. Diagonal ticks are left alone.
      var x0 = p.x + (Math.abs(dirX) < 0.01 ? 0.5 : 0)
      var y0 = p.y + (Math.abs(dirY) < 0.01 ? 0.5 : 0)

      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x0 + dirX * length, y0 + dirY * length)
      ctx.stroke()
    }

    ctx.restore()
  }
}
