import QtQuick
import qs.Commons
import "../Model.js" as Model

// A holding, and what it is worth.
//
// With no address in its settings the same card is a ticker: the coin, the
// price, how the day has gone. That is not a second widget, it is the same
// composition with one line fewer, which is why the address is optional
// rather than required.
//
// Left-ragged rather than centred, for the reason the weather card gives: a
// clock is one value and reads best on an axis, but this is four things of
// different lengths -- a ticker, a percentage, a balance and a sum of money
// -- and ragging them off a common left edge is what stops it looking like a
// scoreboard.
//
// The day's change is never tinted. Every other crypto readout in the world
// paints a rise green and a fall red, and DESIGN.md rules that out: a theme's
// palette is not a semantic scale. The sign carries it, the way the timezone
// offset on the clock card carries its own. It is also the card's one accent,
// which is the other half of the same rule -- it sits beside the ticker
// rather than beside the balance because it is a fact about the coin, not
// about your wallet, and the balance is already the largest thing here.
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

  // Both sizes this card offers are one row tall, so the short axis is the
  // cell and the drawing is identical at 160px and at 260px. See DESIGN.md
  // on why a card taller than one row would have to divide by its span.
  readonly property real unit: Math.min(width, height)
  readonly property real pad: Math.round(unit * 0.115)

  readonly property real labelSize: Math.max(8, Math.round(unit * 0.075))
  readonly property real valueSize: Math.max(12, Math.round(unit * 0.23))
  readonly property real detailSize: Math.max(8, Math.round(unit * 0.068))

  // ------------------------------------------------------------- settings

  readonly property string chain: Model.cryptoChainOf(settings)
  readonly property string currency: Model.cryptoCurrencyOf(settings)
  readonly property string address: String(settings.address || "")
  readonly property bool showFiat: settings.showFiat !== false
  readonly property string label: Model.cryptoCardLabel(settings, chain)
  readonly property string coin: {
    var entry = Model.cryptoChain(chain)
    return entry ? entry.coin : ""
  }

  readonly property bool wantsWallet: address.length > 0
  readonly property bool addressUsable: wantsWallet && Model.isSafeCryptoAddress(chain, address)

  // ------------------------------------------------------------- the data

  readonly property var balances: service && service.cryptoBalances ? service.cryptoBalances : ({})
  readonly property var prices: service && service.cryptoPrices ? service.cryptoPrices : ({})
  readonly property string error: service ? String(service.cryptoError || "") : ""

  // null is "not known", which is never the same as zero -- a wallet whose
  // balance has not arrived is not a wallet holding nothing.
  readonly property var balance: {
    if (!addressUsable) return null
    var held = balances[Model.cryptoWalletKey(chain, address)]
    return held === undefined || held === null ? null : held
  }
  readonly property var quote: Model.cryptoQuote(prices, coin, currency)

  // A wallet card is ready when the balance is in; a ticker when the price
  // is. Deliberately not both for the wallet: a balance with no price yet is
  // still the number you came for, and the line under it simply waits.
  readonly property bool ready: wantsWallet ? balance !== null : quote !== null

  // ------------------------------------------------------------- the words

  // The middle line: what you hold, or what one costs when you hold nothing.
  readonly property string valueText: wantsWallet
    ? Model.cryptoAmountLabel(balance)
    : (quote ? Model.cryptoMoneyLabel(quote.price, currency) : "")

  readonly property string changeText: quote ? Model.cryptoChangeLabel(quote.change) : ""

  // The line under the balance: what it is worth. Blank on a ticker, whose
  // middle line is already money, and blank when the reader has asked for a
  // card that does not show it.
  readonly property string fiatText: {
    if (!wantsWallet || !showFiat) return ""
    var worth = Model.cryptoHoldingValue(balance, quote)
    return worth === null ? "" : Model.cryptoMoneyLabel(worth, currency)
  }

  readonly property string priceText: quote ? Model.cryptoMoneyLabel(quote.price, currency) : ""

  // ------------------------------------------------------------- the graph
  //
  // The week behind the number. A price on its own answers "how much"; the
  // day's change answers "which way"; neither answers "is this normal", which
  // is the question you actually have when you glance at a coin. Seven days
  // of hourly closes is the shortest window that shows it.
  //
  // It is not tinted, and it is not the accent. The line is the same reduced
  // foreground every label on this card uses, because a graph beside a number
  // is context and the number is the thing you came for -- and because a rise
  // drawn in green and a fall in red is exactly the semantic palette DESIGN.md
  // rules out. The shape says which way it went.
  readonly property var series: quote && quote.series ? quote.series : []

  // Reduced to about one point per three pixels: a week is 168 closes and the
  // card is not 168 pixels wide, so the rest is detail nobody can see.
  readonly property var sparkline: Model.cryptoSparkline(series, root.wide ? 64 : 40)
  readonly property bool hasGraph: sparkline.length >= 2

  // Which nothing the card is saying, in the place the value would be.
  readonly property string waitingText: {
    if (wantsWallet && !addressUsable) return "Check the address"
    if (error === "unavailable") return "Unavailable"
    return "Loading…"
  }

  // The second column, and the one thing the square card cannot show: the
  // coin's own price, which the square spends its last line on the holding's
  // worth instead of. A ticker gets nothing here -- its middle line is
  // already that price, and a ticker widened is the same lines with more air,
  // which DESIGN.md says is not a size worth filling. Better an empty half
  // than a number invented to fill it.
  readonly property bool wide: wantsWallet && width > unit * 1.45

  // ---------------------------------------------------------------- paint

  Item {
    anchors.fill: parent
    anchors.margins: root.pad

    // The head: what the coin is, and how its day has gone. Both stay while
    // the card is still waiting -- a card that has not loaded should still be
    // able to say which of the four on your wallpaper it is, which is what a
    // bare "Loading…" cannot do.
    Text {
      id: labelLine

      anchors.left: parent.left
      anchors.right: changeLine.left
      anchors.rightMargin: Math.round(root.unit * 0.04)
      anchors.top: parent.top
      textFormat: Text.PlainText
      text: root.label
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: root.labelSize
      font.letterSpacing: Math.round(root.labelSize * 0.1)
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    Text {
      id: changeLine

      anchors.right: parent.right
      anchors.baseline: labelLine.baseline
      visible: text !== ""
      textFormat: Text.PlainText
      text: root.changeText
      // The one accent on the card.
      color: root.accent
      font.family: root.fontFamily
      font.pixelSize: root.labelSize
      renderType: Text.NativeRendering
    }

    // The number you came for, hard against the left edge. Light at size, the
    // way every large value in this set is: it reads calmer, and it is what
    // makes these look like faces rather than readouts.
    Text {
      id: valueLine

      anchors.left: parent.left
      anchors.right: priceLine.visible ? priceLine.left : parent.right
      anchors.rightMargin: priceLine.visible ? Math.round(root.unit * 0.06) : 0
      anchors.top: labelLine.bottom
      anchors.topMargin: Math.round(root.unit * 0.045)
      textFormat: Text.PlainText
      text: root.ready ? root.valueText : root.waitingText
      color: root.ready ? root.foreground : root.dim
      font.family: root.fontFamily
      // The waiting words are a sentence, not a value, and set at the value's
      // size they would be the loudest thing on a card that has nothing to
      // say yet.
      font.pixelSize: root.ready ? root.valueSize : root.detailSize
      font.weight: root.ready ? Font.Light : Font.Normal
      // A long balance shrinks to fit rather than eliding: the digits before
      // the point are the ones that matter, and "0.4213" cut to "0.42…" is a
      // worse answer than the same number set smaller.
      fontSizeMode: root.ready ? Text.HorizontalFit : Text.FixedSize
      minimumPixelSize: Math.max(11, Math.round(root.unit * 0.11))
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    // The coin's own price, on the wide card, sitting on the balance's
    // baseline so the two read as one line rather than two stacks.
    Text {
      id: priceLine

      anchors.right: parent.right
      anchors.baseline: valueLine.baseline
      width: Math.round(parent.width * 0.36)
      horizontalAlignment: Text.AlignRight
      visible: root.wide && root.ready && text !== ""
      textFormat: Text.PlainText
      text: root.priceText
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Math.max(9, Math.round(root.unit * 0.105))
      fontSizeMode: Text.HorizontalFit
      minimumPixelSize: Math.max(8, Math.round(root.unit * 0.06))
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    // The week, drawn between the number and the line under it. Dropped
    // rather than squeezed when the card has not left it room: a graph two
    // pixels tall is a rule, not a shape, and a rule across a card reads as a
    // divider somebody meant.
    Canvas {
      id: graph

      anchors.left: parent.left
      anchors.right: parent.right
      // A fixed band, sitting on a strip that is always reserved whether or
      // not there is a sum of money to put in it. Both halves of that matter:
      // a graph stretched to fill what is left would be one height on a
      // ticker and another on a wallet card, and a graph that dropped to the
      // floor when the bottom line was empty would sit lower on one card than
      // on its neighbour. Two of these side by side have to read as one set.
      anchors.bottom: parent.bottom
      anchors.bottomMargin: fiatLine.height + Math.round(root.unit * 0.035)
      height: Math.round(root.unit * 0.15)

      // Dropped rather than squeezed when the card has not left it room --
      // the weather card's rule. A graph that overlapped the number would be
      // worse than no graph, and the number is what the card is for.
      visible: root.ready && root.hasGraph
        && y > valueLine.y + valueLine.height
      antialiasing: true

      onPaint: {
        var ctx = getContext("2d")
        ctx.reset()
        if (!visible) return

        var points = root.sparkline
        var range = Model.cryptoSeriesRange(points)
        if (!range || points.length < 2) return

        var span = range.high - range.low
        // Half a hairline in from the top and bottom, so a week that touches
        // its own high is not clipped by the edge of its plot.
        var line = Math.max(1, Math.round(root.unit * 0.008))
        var top = line
        var usable = Math.max(1, height - line * 2)

        function px(i) { return i * (width - 1) / (points.length - 1) }
        function py(v) { return top + usable - ((v - range.low) / span) * usable }

        ctx.beginPath()
        ctx.moveTo(px(0), py(points[0]))
        for (var i = 1; i < points.length; i++) ctx.lineTo(px(i), py(points[i]))

        // The line and nothing else. An area fill under it was tried and
        // dropped: at an alpha low enough to keep the card flat it reads as a
        // grey slab with a hard bottom edge rather than as a shape, and the
        // hairline on its own carries the week perfectly well. The card is
        // flat on the wallpaper -- that is the rule, and a filled chart is
        // the heaviest thing that had ever been drawn in this set.
        ctx.lineWidth = line
        ctx.lineJoin = "round"
        ctx.lineCap = "round"
        ctx.strokeStyle = root.dim
        ctx.stroke()
      }

      // A Canvas does not know its own bindings changed.
      onWidthChanged: requestPaint()
      onHeightChanged: requestPaint()
      onVisibleChanged: requestPaint()
      Connections {
        target: root
        function onSparklineChanged() { graph.requestPaint() }
        function onDimChanged() { graph.requestPaint() }
      }
    }

    // What the holding is worth, along the bottom. Dropped rather than
    // crowded when the card is short enough that it would climb back into the
    // balance above it -- the weather card's rule, for the same reason.
    Text {
      id: fiatLine

      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      visible: root.ready && root.fiatText !== ""
        && y > valueLine.y + valueLine.height
      textFormat: Text.PlainText
      text: root.fiatText
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: root.detailSize
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }
  }
}
