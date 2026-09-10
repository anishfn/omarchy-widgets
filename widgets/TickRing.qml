import QtQuick
import qs.Commons

// The ring of small marks just inside a card's edge, kept sparse like a clock
// on a watch: 48 minute positions around the face, with a longer tick every
// 11th (rounded to 44 positions, so the majors still come four to a ring). Ticks point at the card's centre rather than perpendicular to
// the edge, which is what gives them their gradual slant through the sides
// and corners.
//
// Positions are shared out by angle, not by arc length. Walking the true
// perimeter in even steps would bunch the marks where an edge passes far from
// the centre and pull them apart in the corners — the ring would read crooked,
// like a clock whose minute marks wander. Instead each mark gets an exactly
// even slice of 360°, placed where the ray from the centre at that angle meets
// the card's rounded-rectangle edge, so the ring closes on a beat you can sweep
// an eye around.
Canvas {
  id: root

  // Distance from the card's own edge to the ring the ticks sit on.
  property real inset: 12
  // How far a minor tick reaches, and its width.
  property real tickLength: 10
  property real tickWidth: 1
  // Held onto for backward compatibility even though nothing binds it now;
  // the ring is a fixed 48-position face, so it spaces nothing.
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

  // The point where the ray from the ring's centre at `angle` reaches the
  // rounded rectangle: the straight runs are ray-vs-line, and the corners,
  // where the runs' cut-offs cross, are ray-vs-circle with the hit kept only
  // if it falls inside that corner's own quarter. The nearest hit wins, which
  // for a convex shape is the one true exit from the centre.
  function rayPoint(cx, cy, w, h, r, angle) {
    var a = w / 2
    var b = h / 2
    var ai = Math.max(0, a - r)
    var bi = Math.max(0, b - r)
    var cosA = Math.cos(angle)
    var sinA = Math.sin(angle)
    var best = Infinity
    var eps = 1e-10

    if (sinA < -eps) {
      var t = -b / sinA
      if (t > 0 && Math.abs(t * cosA) <= ai + eps) best = Math.min(best, t)
    }
    if (sinA > eps) {
      var t = b / sinA
      if (t > 0 && Math.abs(t * cosA) <= ai + eps) best = Math.min(best, t)
    }
    if (cosA < -eps) {
      var t = -a / cosA
      if (t > 0 && Math.abs(t * sinA) <= bi + eps) best = Math.min(best, t)
    }
    if (cosA > eps) {
      var t = a / cosA
      if (t > 0 && Math.abs(t * sinA) <= bi + eps) best = Math.min(best, t)
    }

    var corners = [
      { x: -ai, y: -bi, lo: Math.PI, hi: 1.5 * Math.PI },
      { x: ai, y: -bi, lo: 1.5 * Math.PI, hi: 2 * Math.PI },
      { x: ai, y: bi, lo: 0, hi: 0.5 * Math.PI },
      { x: -ai, y: bi, lo: 0.5 * Math.PI, hi: Math.PI }
    ]
    for (var i = 0; i < 4; i++) {
      var c = corners[i]
      var dot = cosA * c.x + sinA * c.y
      var disc = dot * dot - (c.x * c.x + c.y * c.y - r * r)
      if (disc < 0) continue
      var t = dot + Math.sqrt(disc)
      if (t <= eps) continue
      var hit = Math.atan2(t * sinA - c.y, t * cosA - c.x)
      if (hit < 0) hit += 2 * Math.PI
      if (hit >= c.lo - eps && hit <= c.hi + eps) best = Math.min(best, t)
    }

    if (best === Infinity) return { x: cx, y: cy }
    return { x: cx + best * cosA, y: cy + best * sinA }
  }

  onPaint: {
    var ctx = getContext("2d")
    ctx.reset()
    if (root.ringWidth <= 0 || root.ringHeight <= 0 || root.tickCount <= 0) return

    var w = root.ringWidth
    var h = root.ringHeight
    var r = root.ringRadius

    // Exactly the requested positions: a multiple of `majorEvery`, so a major
    // lands on the first tick too and the ring never ends on a short gap.
    var count = root.tickCount
    if (root.majorEvery > 0) {
      count = Math.max(root.majorEvery, Math.round(count / root.majorEvery) * root.majorEvery)
    }

    var cx = w / 2
    var cy = h / 2

    ctx.save()
    ctx.translate(root.inset, root.inset)
    ctx.strokeStyle = root.tickColor
    ctx.lineCap = "butt"

    // Each mark owns an even slice of the circle: one twelfth of the ring is
    // twelve marks, a quarter is eleven. The first sits at twelve o'clock, so
    // the four majors fall on the card's cardinal points. Ticks are grouped by
    // width so the whole ring strokes twice instead of once per mark.
    var minor = []
    var major = []
    // The first tick sits at the top-left corner (≈10:30), rotating the ring
    // so the four majors land on the card's own corners rather than the
    // centre of each edge.
    var offset = Math.PI / 4
    for (var i = 0; i < count; i++) {
      var angle = -Math.PI / 2 + offset + i * 2 * Math.PI / count
      var p = root.rayPoint(cx, cy, w, h, r, angle)
      var dx = cx - p.x
      var dy = cy - p.y
      var distance = Math.sqrt(dx * dx + dy * dy)
      if (distance <= 0) continue
      var dirX = dx / distance
      var dirY = dy / distance
      var isMajor = root.majorEvery > 0 && (i % root.majorEvery) === 0
      var length = isMajor ? root.majorTickLength : root.tickLength
      var tick = isMajor ? major : minor
      tick.push(p.x, p.y, p.x + dirX * length, p.y + dirY * length)
    }

    function drawRing(width, ticks) {
      if (ticks.length === 0) return
      ctx.lineWidth = width
      ctx.beginPath()
      for (var k = 0; k < ticks.length; k += 4) {
        ctx.moveTo(ticks[k], ticks[k + 1])
        ctx.lineTo(ticks[k + 2], ticks[k + 3])
      }
      ctx.stroke()
    }

    drawRing(root.tickWidth, minor)
    drawRing(root.majorTickWidth, major)

    ctx.restore()
  }
}