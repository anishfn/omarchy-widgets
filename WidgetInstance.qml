import QtQuick
import qs.Commons
import "Model.js" as Model

// One configured widget, drawn. The card chrome plus whichever QML file the
// catalogue names for its type.
//
// Both the desktop and the editor mount this, which is the point: what you
// drag around in the editor is the same component, at the same size, in the
// same colors as the thing that ends up on your wallpaper. An editor that
// drew its own approximation of a widget would drift from it.
Item {
  id: root

  property var service: null
  property var instance: null
  // Source URL for the type's QML, resolved by the caller against the plugin
  // directory — this file lives beside Surface.qml, so a relative resolve here
  // would be right by accident rather than by contract.
  property url widgetSource: ""

  readonly property real cardOpacity: {
    if (service && service.config && service.config.layout)
      return Model.effectiveOpacity(service.config, instance)
    return instance && typeof instance.opacity === "number" ? instance.opacity : Model.DEFAULT_OPACITY
  }
  readonly property int radius: instance && instance.radius !== undefined
    ? instance.radius : 20

  readonly property alias card: card

  WidgetCard {
    id: card
    anchors.fill: parent
    backgroundAlpha: root.cardOpacity
    cardRadius: root.radius

    Loader {
      id: widgetLoader
      anchors.fill: parent
      asynchronous: true
      source: root.widgetSource

      function inject() {
        if (!item) return
        if ("service" in item) item.service = root.service
        if ("instance" in item) item.instance = root.instance
        if ("card" in item) item.card = card
      }

      onLoaded: inject()
      // The delegate is rebuilt whenever the config changes, but a settings
      // edit that leaves the list identical reuses it, so re-inject rather
      // than trust the one-shot at load.
      Connections {
        target: root
        function onInstanceChanged() { widgetLoader.inject() }
      }

      onStatusChanged: {
        if (status !== Loader.Error) return
        var detail = errorString && errorString() ? errorString() : ""
        console.warn("widgets: " + (root.instance ? root.instance.type : "?")
          + " failed to load:", detail)
      }
    }
  }
}
