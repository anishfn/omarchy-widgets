import QtQuick
import qs.Commons
import "../Model.js" as Model

// A holding, and what it is worth.
//
// With no address in its settings the same card is a ticker: label, price,
// how the day has gone. That is not a second widget, it is the same three
// lines with a different middle value, which is why the address is optional
// rather than required.
//
// The change is never tinted. Every other crypto readout in the world paints
// a rise green and a fall red, and DESIGN.md forbids exactly that — a theme's
// palette is not a semantic scale. The sign carries it, the way the timezone
// offset on the clock card carries its own.
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

  // null is "not known", which is never the same as zero — a wallet whose
  // balance has not arrived is not a wallet holding nothing.
  readonly property var balance: {
    if (!addressUsable) return null
    var held = balances[Model.cryptoWalletKey(chain, address)]
    return held === undefined || held === null ? null : held
  }
  readonly property var quote: Model.cryptoQuote(prices, coin, currency)

  readonly property bool ready: wantsWallet ? balance !== null : quote !== null

  // ------------------------------------------------------------- the words

  readonly property string valueText: wantsWallet
    ? Model.cryptoAmountLabel(balance)
    : (quote ? Model.cryptoMoneyLabel(quote.price, currency) : "")

  readonly property string changeText: quote ? Model.cryptoChangeLabel(quote.change) : ""

  readonly property string fiatText: {
    if (!wantsWallet || !showFiat) return ""
    var worth = Model.cryptoHoldingValue(balance, quote)
    return worth === null ? "" : Model.cryptoMoneyLabel(worth, currency)
  }

  readonly property string priceText: quote ? Model.cryptoMoneyLabel(quote.price, currency) : ""

  // The line under the value on the small card: what it is worth and how the
  // day has gone, whichever of the two is known.
  readonly property string detailText: {
    if (!wantsWallet) return changeText
    var parts = []
    if (fiatText) parts.push(fiatText)
    if (changeText) parts.push(changeText)
    return parts.join("  ")
  }

  readonly property string waitingText: {
    if (wantsWallet && !addressUsable) return "Check the address"
    if (error === "unavailable") return "Unavailable"
    return "Loading…"
  }

  // Two columns only when there is a holding to put beside a price. A ticker
  // widened is the same three lines with more air, which DESIGN.md says is
  // not a size worth offering — so it keeps the centred shape.
  readonly property bool wide: wantsWallet && width > unit * 1.4

  // ---------------------------------------------------------------- paint

  Text {
    anchors.centerIn: parent
    width: parent.width - root.pad * 2
    visible: !root.ready
    horizontalAlignment: Text.AlignHCenter
    wrapMode: Text.Wrap
    textFormat: Text.PlainText
    text: root.waitingText
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: Math.max(9, Math.round(root.unit * 0.075))
    renderType: Text.NativeRendering
  }

  // The square card, and the wide ticker: label, value, one detail.
  Column {
    anchors.centerIn: parent
    width: parent.width - root.pad * 2
    visible: root.ready && !root.wide
    spacing: Math.round(root.unit * 0.02)

    Text {
      width: parent.width
      horizontalAlignment: Text.AlignHCenter
      textFormat: Text.PlainText
      text: root.label
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Math.max(8, Math.round(root.unit * 0.075))
      font.letterSpacing: Math.round(root.unit * 0.012)
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    Text {
      width: parent.width
      horizontalAlignment: Text.AlignHCenter
      textFormat: Text.PlainText
      text: root.valueText
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Math.max(12, Math.round(root.unit * 0.21))
      fontSizeMode: Text.HorizontalFit
      minimumPixelSize: Math.max(11, Math.round(root.unit * 0.11))
      font.weight: Font.Light
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    Text {
      width: parent.width
      horizontalAlignment: Text.AlignHCenter
      visible: text !== ""
      textFormat: Text.PlainText
      text: root.detailText
      color: root.accent
      font.family: root.fontFamily
      font.pixelSize: Math.max(8, Math.round(root.unit * 0.065))
      fontSizeMode: Text.HorizontalFit
      minimumPixelSize: Math.max(8, Math.round(root.unit * 0.05))
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }
  }

  // The wide card: the holding on the left, the coin's own price on the
  // right. That price is the thing the square card cannot show — it spends
  // its third line on what the holding is worth instead — so the extra column
  // is more content rather than the same content stretched.
  Item {
    anchors.fill: parent
    anchors.margins: root.pad
    visible: root.ready && root.wide

    Column {
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      width: Math.round(parent.width * 0.54)
      spacing: Math.round(root.unit * 0.02)

      Text {
        width: parent.width
        textFormat: Text.PlainText
        text: root.label
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Math.max(8, Math.round(root.unit * 0.075))
        font.letterSpacing: Math.round(root.unit * 0.012)
        elide: Text.ElideRight
        renderType: Text.NativeRendering
      }

      Text {
        width: parent.width
        textFormat: Text.PlainText
        text: root.valueText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Math.max(12, Math.round(root.unit * 0.21))
        fontSizeMode: Text.HorizontalFit
        minimumPixelSize: Math.max(11, Math.round(root.unit * 0.11))
        font.weight: Font.Light
        elide: Text.ElideRight
        renderType: Text.NativeRendering
      }

      Text {
        width: parent.width
        visible: text !== ""
        textFormat: Text.PlainText
        text: root.fiatText
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Math.max(8, Math.round(root.unit * 0.065))
        fontSizeMode: Text.HorizontalFit
        minimumPixelSize: Math.max(8, Math.round(root.unit * 0.05))
        elide: Text.ElideRight
        renderType: Text.NativeRendering
      }
    }

    Column {
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      width: Math.round(parent.width * 0.4)
      spacing: Math.round(root.unit * 0.02)

      Text {
        width: parent.width
        horizontalAlignment: Text.AlignRight
        textFormat: Text.PlainText
        text: root.priceText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Math.max(10, Math.round(root.unit * 0.105))
        fontSizeMode: Text.HorizontalFit
        minimumPixelSize: Math.max(9, Math.round(root.unit * 0.06))
        elide: Text.ElideRight
        renderType: Text.NativeRendering
      }

      Text {
        width: parent.width
        horizontalAlignment: Text.AlignRight
        visible: text !== ""
        textFormat: Text.PlainText
        text: root.changeText
        color: root.accent
        font.family: root.fontFamily
        font.pixelSize: Math.max(8, Math.round(root.unit * 0.075))
        elide: Text.ElideRight
        renderType: Text.NativeRendering
      }
    }
  }
}
