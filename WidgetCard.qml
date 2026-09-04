import QtQuick
import qs.Commons
import qs.Ui

// The surface every desktop widget is drawn on: a translucent card that takes
// its colors from the active Omarchy theme and lets the wallpaper through.
//
// Color comes from the theme's foundational palette rather than from a shell
// surface role, because none of the existing roles describes a card that sits
// *on* the wallpaper — popups and tooltips are drawn over windows and are
// opaque enough to say so. `backgroundAlpha` is the one dial that matters.
BorderSurface {
  id: root

  // -1 follows the theme's Hyprland rounding; anything else is literal px.
  property int cardRadius: 20
  property real backgroundAlpha: 0.72

  readonly property color surface: Util.alpha(Color.background, root.backgroundAlpha)
  readonly property color foreground: Color.foreground
  readonly property color accent: Color.accent
  readonly property color dim: Util.alpha(Color.foreground, 0.55)
  readonly property string fontFamily: Style.font.family

  default property alias content: contentHolder.children

  radius: cardRadius < 0 ? Style.cornerRadius : cardRadius
  color: root.surface

  // A hairline of the theme's foreground, not the accent: the card should
  // read as a pane on the wallpaper, and an accent outline turns every widget
  // into a notification.
  borderSpec: Border.flat(Util.alpha(Color.foreground, 0.14), 1)

  Item {
    id: contentHolder
    anchors.fill: parent
  }
}
