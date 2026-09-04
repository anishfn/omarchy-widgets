import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import "Model.js" as Model

// The desktop itself: one layer-shell surface per output, holding whichever
// widgets the config says belong on it, laid out on the grid.
//
// The surface sits on the Bottom layer, above the wallpaper and beneath every
// window, which is where a desktop widget belongs — it should be something
// you see when you clear the screen, not something you have to move around.
//
// It reserves no space and takes no input: `exclusiveZone: 0` asks the
// compositor to keep the surface inside the area the bar has already claimed,
// so the grid's top row lines up under the bar rather than behind it, and an
// empty `mask` means every click lands on whatever is underneath. That
// combination is deliberate: widgets here are read, not operated, and one
// that swallowed clicks on the desktop would be a bug the user could not see
// the cause of. Arranging them is the editor's job, on its own surface.
Item {
  id: root

  // Injected by the shell when the plugin loads.
  property var shell: null
  property var service: null
  property var manifest: null
  property string omarchyPath: ""

  readonly property string pluginId: manifest && manifest.id
    ? String(manifest.id) : "io.github.anishfn.widgets"

  // The shell assigns `service` once, as the panel loads. If the service
  // singleton was not built yet at that moment the assignment lands as null
  // and never corrects itself, so fall back to asking the shell — that lookup
  // reads a property the shell reassigns when a service appears, which makes
  // this binding re-evaluate rather than stay stuck on the miss.
  readonly property var svc: service
    ? service
    : (shell && typeof shell.serviceFor === "function" ? shell.serviceFor(pluginId) : null)

  readonly property var config: svc ? svc.config : null
  readonly property var layout: config ? config.layout : Model.normalizeLayout(null)
  readonly property bool editing: svc ? svc.editing === true : false

  function sourceFor(type) {
    var entry = Model.catalogEntry(type)
    return entry ? Qt.resolvedUrl(entry.source) : ""
  }

  // ------------------------------------------------- shell summon interface
  //
  // `omarchy-shell shell toggle <id>` has two paths, and a plugin that is
  // both a panel and a bar widget takes the panel one — shell.qml hands the
  // call to whatever the panel loader mounted, which is this file. But the
  // thing worth summoning is the bar popup, not the desktop surface, which is
  // always up and takes no input. So the contract is implemented here and
  // forwarded to the widget in the bar, which is the same place a click on
  // the bar button lands.
  //
  // `open` takes the payload shell.qml delivers and ignores it: there is
  // nothing to configure about showing a list of switches.
  readonly property var barHost: shell && shell.bar ? shell.bar : null
  readonly property bool opened: barHost && typeof barHost.isBarWidgetOpen === "function"
    ? barHost.isBarWidgetOpen(pluginId) : false

  function open(payloadJson) {
    if (barHost && typeof barHost.summonBarWidget === "function") barHost.summonBarWidget(pluginId)
  }

  function close() {
    if (barHost && typeof barHost.hideBarWidget === "function") barHost.hideBarWidget(pluginId)
  }

  function toggle() { opened ? close() : open("") }

  // ------------------------------------------------------------- the layout

  Variants {
    model: Quickshell.screens

    delegate: Component {
      PanelWindow {
        id: surface
        required property var modelData

        readonly property string screenName: modelData && modelData.name ? String(modelData.name) : ""
        readonly property var placed: root.config
          ? Model.widgetsForScreen(root.config, surface.screenName)
          : []

        screen: modelData
        // Stood down while the editor is up: the editor draws the same cards
        // in the same places on its own interactive surface, so leaving these
        // underneath would double every widget.
        visible: placed.length > 0 && !root.editing
        color: "transparent"

        anchors { top: true; bottom: true; left: true; right: true }

        WlrLayershell.namespace: "omarchy-widgets"
        WlrLayershell.layer: WlrLayer.Bottom
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.None

        // Reserve nothing, but stay inside what the bar reserved.
        exclusionMode: ExclusionMode.Normal
        exclusiveZone: 0

        // Input region: empty by default, so nothing here can intercept a
        // click meant for the desktop or a window. A widget type that asks
        // for input by declaring `interactive` in the catalogue gets its own
        // rectangle back, and nothing else — a music card can be pressed
        // without the clock beside it swallowing a click on the desktop.
        //
        // Built by hand rather than declared, because the set of rectangles
        // depends on the config. Nested regions combine, which is the union
        // of the interactive widgets and exactly what is wanted.
        mask: Region { id: inputMask }

        readonly property var interactive: root.config
          ? Model.interactiveWidgetsForScreen(root.config, surface.screenName)
          : []

        function rebuildInputRegions() {
          var made = []
          for (var i = 0; i < surface.interactive.length; i++) {
            var rect = Model.widgetRect(root.layout, surface.interactive[i], surface.width)
            var region = regionComponent.createObject(surface, {
              x: rect.x, y: rect.y, width: rect.width, height: rect.height
            })
            if (region) made.push(region)
          }
          for (var old = 0; old < surface.ownedRegions.length; old++) {
            if (surface.ownedRegions[old]) surface.ownedRegions[old].destroy()
          }
          surface.ownedRegions = made
          inputMask.regions = made
        }

        property var ownedRegions: []

        Component {
          id: regionComponent
          Region {}
        }

        onInteractiveChanged: rebuildInputRegions()
        onWidthChanged: rebuildInputRegions()
        Component.onCompleted: rebuildInputRegions()

        Connections {
          target: root
          // The grid can move without the widget list changing at all — a
          // side or column change relays every rectangle.
          function onLayoutChanged() { surface.rebuildInputRegions() }
        }

        Repeater {
          model: surface.placed

          delegate: WidgetInstance {
            required property var modelData

            readonly property var rect: Model.widgetRect(root.layout, modelData, surface.width)
            x: rect.x
            y: rect.y
            width: rect.width
            height: rect.height

            service: root.svc
            instance: modelData
            widgetSource: root.sourceFor(modelData.type)
          }
        }
      }
    }
  }

  // The editor is only built while it is open. It is a separate surface
  // because it is the opposite of this one in every way that matters: on top
  // instead of underneath, and made of input instead of free of it.
  Loader {
    active: root.editing
    asynchronous: false
    source: Qt.resolvedUrl("Editor.qml")
    onLoaded: {
      item.shell = root.shell
      item.service = root.svc
      item.surface = root
    }
    onStatusChanged: {
      if (status !== Loader.Error) return
      console.warn("widgets: editor failed to load:", errorString ? errorString() : "")
      if (root.svc) root.svc.editing = false
    }
  }
}
