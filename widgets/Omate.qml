import QtQuick
import qs.Commons
import qs.Ui
import "../Model.js" as Model

// The desktop pet's card: a switch, a row of skins, and the two dials a pet
// actually has -- how big it is, and how eagerly it chases the cursor.
//
// The pet itself lives in another plugin (palccod.omate). This card does not
// own anything about it; every control writes through to the omate service,
// reached in-process through the shell, so the card and the pet's own panel
// are two views of one state and can never disagree. When omate is not
// loaded the card says so and goes inert rather than pretending.
//
// It scrolls, which is the second entry in DESIGN.md's book of exceptions
// (the list in Todos was the first). A skin is a character, and characters
// are art: showing three names and hiding the other fifteen is a menu, not
// a shelf. The row shows every pack at the size a sprite is still readable,
// and lets the rest be reached by a flick.

Item {
  id: root

  // Injected by WidgetInstance.qml. `shell` is the shell object itself, the
  // same one Surface.qml gets, because the thing this card controls is not
  // this plugin's service.
  property var service: null
  property var instance: null
  property var card: null
  property var shell: null
  readonly property var settings: instance && instance.settings ? instance.settings : ({})

  readonly property color foreground: Color.foreground
  readonly property color accent: Color.accent
  readonly property color dim: Util.alpha(Color.foreground, 0.55)
  readonly property color faint: Util.alpha(Color.foreground, 0.3)
  readonly property string fontFamily: Style.font.family

  // One grid cell, whatever footprint the card is wearing. The card ships
  // as 2x2 only, but the rule holds anyway: sizing type off the card's
  // short axis would mean a future size change rescales the drawing rather
  // than giving it more room. See Todos.qml and Calendar.qml.
  readonly property int spanCols: instance && instance.cols > 0 ? instance.cols : 1
  readonly property int spanRows: instance && instance.rows > 0 ? instance.rows : 1
  readonly property real unit: Math.min(width / spanCols, height / spanRows)

  readonly property real pad: Math.round(unit * 0.11)
  readonly property real titleSize: Math.max(9, Math.round(unit * 0.075))
  readonly property real smallSize: Math.max(8, Math.round(unit * 0.062))
  readonly property real bodySize: Math.max(9, Math.round(unit * 0.072))

  // -------------------------------------------------------------- the service
  //
  // serviceFor reads a registry the shell reassigns as plugins load, so this
  // binding re-resolves when omate appears -- including when this widget is
  // created first and the pet second. Every use below still guards, because
  // a plugin can be disabled while its widget card is still configured.

  readonly property var omate: shell && typeof shell.serviceFor === "function"
    ? shell.serviceFor("palccod.omate") : null
  readonly property bool live: omate !== null
    && typeof omate.updateSettings === "function"
    && omate.initialized !== false

  // What the power switch is showing right now. omate's toggle is a plain
  // in-process call that lands before the next frame, so there is no write in
  // flight to draw over: the service is the truth, and a card with no service
  // has nothing to show.
  readonly property bool petVisible: live
    && (omate.settings ? omate.settings.visible !== false : true)

  // Where omate keeps PetSprite.qml. `pluginFile` resolves a relative path
  // against the service's own file, which is the plugin directory by
  // definition -- the one way to find a sibling of a service you do not own.
  // Empty when omate is not there or does not offer it, and the chips fall
  // back to their names rather than to an empty box.
  readonly property url spriteSource: live && typeof omate.pluginFile === "function"
    ? Model.pluginFileUrl(omate.pluginFile("PetSprite.qml"))
    : ""

  // The one place this card writes to the pet. Guarded here rather than at
  // each call site, because a control can be released after omate has gone --
  // a slider drag outlives the plugin that was disabled halfway through it.
  function writeSettings(patch) {
    if (!live) return
    omate.updateSettings(patch)
  }

  // The owner's name. The card's own setting wins -- it is what the editor
  // edits -- and a blank falls through to whatever omate already has, so
  // clearing the field here never erases a name set from the panel.
  readonly property string ownerName: {
    var own = String(settings.label || "").trim()
    if (own.length > 0) return own
    if (live && omate.settings && omate.settings.userName)
      return String(omate.settings.userName)
    return ""
  }

  // Push the editor's owner name through to the pet. Only a non-empty name
  // is pushed: blank means "no opinion from this card", and omate sanitizes
  // on its side anyway, so this is a nudge, not an authority.
  // Both directions matter: the name changing, and omate turning up to hear
  // it. A card configured before the pet was installed would otherwise hold a
  // name it never said.
  onSettingsChanged: pushOwnerName()
  onLiveChanged: pushOwnerName()
  function pushOwnerName() {
    if (!live) return
    var name = String(settings.label || "").trim()
    if (name.length === 0) return
    if (omate.settings && omate.settings.userName === name) return
    writeSettings({ userName: name })
  }

  // ------------------------------------------------------------- the paint

  // The header: what the card is, what the pet is doing, and the switch.
  Row {
    id: header

    x: root.pad
    y: root.pad
    width: parent.width - root.pad * 2
    spacing: Math.round(root.unit * 0.05)

    Column {
      // Row leaves no gap for a hidden switch, so neither does this.
      width: parent.width - (power.visible ? power.width + parent.spacing : 0)
      spacing: Math.round(root.unit * 0.02)

      Text {
        text: "Omate"
        textFormat: Text.PlainText
        color: root.live ? root.foreground : root.dim
        font.family: root.fontFamily
        font.pixelSize: root.titleSize
        renderType: Text.NativeRendering
      }

      Text {
        // The one line of live state on the card: what the switch did, in
        // the words the pet's own panel uses.
        text: !root.live
          ? "not loaded"
          : (root.omate.sleeping ? "Sleeping"
            : (root.petVisible ? "Enabled" : "Disabled"))
        textFormat: Text.PlainText
        color: root.live ? root.dim : root.faint
        font.family: root.fontFamily
        font.pixelSize: root.smallSize
        renderType: Text.NativeRendering
      }
    }

    // The power switch: the very button the omate panel uses in its own
    // header -- PanelActionButton, same glyph, same colors, same write --
    // so the card reads as the panel's control, not a lookalike.
    PanelActionButton {
      id: power

      anchors.verticalCenter: parent.verticalCenter
      // nf-md-power. \u in a QML string takes exactly four hex digits, so
      // the five-digit codepoint goes through fromCodePoint -- the escape
      // form parses as U+F042 followed by a literal "5".
      iconText: String.fromCodePoint(0xF0425)
      tooltipText: root.petVisible ? "Disable the mate" : "Enable the mate"
      fontFamily: root.fontFamily
      foreground: root.petVisible ? root.accent : Qt.alpha(root.foreground, 0.55)
      bordered: true
      size: Math.round(root.unit * 0.13)
      // Gone rather than greyed when there is no pet: an accent on a
      // click-through desktop is a promise that something happens.
      visible: root.live
      enabled: root.live
      onClicked: {
        if (!root.live) return
        if (typeof root.omate.toggleMateVisible === "function")
          root.omate.toggleMateVisible()
      }
    }
  }

  // ------------------------------------------------------------- the skins
  //
  // One flickable row, one chip per pack. A chip is the pack's own idle
  // animation -- drawn by the pet's own sprite component, loaded out of the
  // omate plugin, so a preview and the pet above the wallpaper can never
  // drift apart -- with its title under it, and the accent border on the
  // one that is live.

  Flickable {
    id: skins

    x: root.pad
    y: header.y + header.height + Math.round(root.unit * 0.06)
    width: Math.max(0, parent.width - root.pad * 2)
    height: Math.round(root.unit * 0.46)
    visible: root.live
    clip: true
    contentWidth: Math.max(width, skinRow.width)
    contentHeight: height
    boundsBehavior: Flickable.StopAtBounds
    flickDeceleration: 3000
    // No press delay: a tap selects where it lands. A drag still steals the
    // press from the chip underneath it, which is what keeps a flick that
    // started on a skin from switching to it.
    pressDelay: 0

    // A grab beats an animation: if the row is gliding from an arrow click
    // and a finger lands on it, the glide has lost the argument.
    onMovementStarted: skinScroll.stop()

    onContentWidthChanged: clampX()
    onWidthChanged: clampX()
    function clampX() {
      contentX = Math.max(0, Math.min(contentX, Math.max(0, contentWidth - width)))
    }

    Row {
      id: skinRow

      spacing: Math.round(root.unit * 0.055)

      Repeater {
        model: root.live && omate.packList ? omate.packList : []

        delegate: Item {
          id: chip

          required property var modelData

          readonly property bool selected: root.live && root.omate.packName === modelData.name
          readonly property real chipWidth: Math.round(root.unit * 0.36)
          readonly property real chipHeight: Math.round(root.unit * 0.44)

          width: chipWidth
          height: chipHeight

          Rectangle {
            anchors.fill: parent
            radius: Math.round(root.unit * 0.045)
            color: chipMouse.containsMouse
              ? Util.alpha(root.foreground, 0.06) : "transparent"
            border.width: chip.selected ? Math.max(1, Math.round(root.unit * 0.012)) : 1
            border.color: chip.selected
              ? root.accent
              : (chipMouse.containsMouse ? root.dim : root.faint)

            Behavior on border.color { ColorAnimation { duration: 90 } }
          }

          // The preview. Loaded from the omate plugin rather than redrawn
          // here: PetSprite carries both pack formats and the fallback
          // rules, and a second animator in this repo would be one more
          // thing to keep in step with pack.json.
          Loader {
            id: preview

            anchors.horizontalCenter: parent.horizontalCenter
            y: Math.round(root.unit * 0.025)
            width: parent.width - Math.round(root.unit * 0.05)
            height: parent.height - Math.round(root.unit * 0.12)
            active: String(root.spriteSource).length > 0

            source: root.spriteSource

            onLoaded: bindSprite()
            function bindSprite() {
              if (!item) return
              item.skin = {
                dir: chip.modelData.dir,
                anims: chip.modelData.pack ? chip.modelData.pack.anims : null
              }
              item.anim = "idle"
              item.playing = true
            }
          }

          // The pack list is live: a pack imported while the card is on the
          // wall re-binds the preview rather than showing the old sprite.
          onModelDataChanged: preview.bindSprite()

          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.bottom
            anchors.bottomMargin: Math.round(root.unit * 0.02)
            width: parent.width - Math.round(root.unit * 0.04)
            text: chip.modelData.title
            textFormat: Text.PlainText
            // Elided: the row scrolls, so the full name stays reachable --
            // this is a hint of which chip is which, not the end of it.
            elide: Text.ElideRight
            horizontalAlignment: Text.AlignHCenter
            color: chip.selected ? root.foreground : root.dim
            font.family: root.fontFamily
            font.pixelSize: root.smallSize
            renderType: Text.NativeRendering
          }

          MouseArea {
            id: chipMouse

            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: {
              if (!root.live || typeof root.omate.selectPack !== "function") return
              root.omate.selectPack(chip.modelData.name)
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------- the row's arrows
  //
  // The flick stays, but a row that scrolls only by flicking keeps its
  // second half a secret from anyone who never thought to drag a wallpaper.
  // The arrows sit in the space under the row, one at each end, and step
  // one chip per click. Each is present only while its direction has
  // somewhere to go, so the ends of the row are the affordance and the
  // arrows never pose as decoration.

  // One chip plus its gap: what one click of an arrow is worth.
  readonly property real chipStep: Math.round(root.unit * 0.36) + Math.round(root.unit * 0.055)

  NumberAnimation {
    id: skinScroll

    target: skins
    property: "contentX"
    duration: 180
    easing.type: Easing.OutCubic
  }

  component SkinArrow: Rectangle {
    id: arrow

    // -1 scrolls toward the first chip, +1 toward the last.
    property int direction: 1

    width: Math.round(root.unit * 0.12)
    height: width
    radius: width / 2
    color: arrowMouse.containsMouse || arrowMouse.pressed
      ? Util.alpha(root.foreground, 0.26) : Util.alpha(root.foreground, 0.16)
    border.width: 1
    border.color: root.dim

    Behavior on color { ColorAnimation { duration: 90 } }

    Text {
      anchors.centerIn: parent
      text: arrow.direction < 0 ? "\u276E" : "\u276F"
      textFormat: Text.PlainText
      color: arrowMouse.containsMouse || arrowMouse.pressed
        ? root.foreground : root.dim
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      renderType: Text.NativeRendering
    }

    MouseArea {
      id: arrowMouse

      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: {
        var max = Math.max(0, skins.contentWidth - skins.width)
        var target = Math.max(0, Math.min(max,
          skins.contentX + arrow.direction * root.chipStep))
        if (target === skins.contentX) return
        skinScroll.to = target
        skinScroll.start()
      }
    }
  }

  SkinArrow {
    direction: -1
    visible: root.live && skins.contentX > 1
    x: skins.x
    y: skins.y + skins.height + Math.round(root.unit * 0.02)
  }

  SkinArrow {
    direction: 1
    visible: root.live && skins.contentWidth > skins.width + 1
      && skins.contentX < skins.contentWidth - skins.width - 1
    x: skins.x + skins.width - width
    y: skins.y + skins.height + Math.round(root.unit * 0.02)
  }

  // The row's position, drawn only while it is moving -- the Todos rule.
  // It runs between the two arrow slots, the one place in the strip that
  // belongs to neither arrow.
  Rectangle {
    readonly property real slot: Math.round(root.unit * 0.12)
    readonly property real track: skins.width - slot * 2 - Math.round(root.unit * 0.06)
    visible: root.live && skins.contentWidth > skins.width + 1
      && (skins.movingHorizontally || skins.contentX > 1)
    height: Math.max(2, Math.round(root.unit * 0.012))
    radius: height / 2
    color: Util.alpha(root.foreground, skins.movingHorizontally ? 0.45 : 0.22)
    y: skins.y + skins.height + Math.round(root.unit * 0.02) + slot / 2 - height / 2
    width: Math.max(root.unit * 0.08, track * (skins.width / Math.max(1, skins.contentWidth)))
    x: skins.x + slot + Math.round(root.unit * 0.03)
      + Math.min(track - width,
        Math.max(0, track * (skins.contentX / Math.max(1, skins.contentWidth))))
  }

  // ------------------------------------------------------------ the dials
  //
  // Owner, size, cursor: three rows of the same shape, a caption, a track,
  // and the value as it is right now. Both sliders commit on release rather
  // than per pixel -- each commit is a settings write on the omate side, and
  // a drag across six sizes would be six disk writes and six resizes.

  Column {
    id: dials

    x: root.pad
    width: parent.width - root.pad * 2
    anchors.bottom: parent.bottom
    anchors.bottomMargin: root.pad
    spacing: Math.round(root.unit * 0.055)
    visible: root.live

    // The owner. Reading, not editing: the desktop layer never takes the
    // keyboard, so the name is edited in the layout editor's "Owner name"
    // field, which pushes through here.
    Text {
      width: parent.width
      text: root.ownerName.length > 0 ? root.ownerName : "unnamed"
      textFormat: Text.PlainText
      color: root.ownerName.length > 0 ? root.foreground : root.faint
      font.family: root.fontFamily
      font.pixelSize: root.bodySize
      // Elided rather than wrapped: a name is one line, and the editor
      // field that sets it is the place a long one gets trimmed.
      elide: Text.ElideRight
      renderType: Text.NativeRendering
    }

    // Roaming, in the panel's own terms: the same switch component, and the
    // same write -- setRoaming, never a bare updateSettings.
    Item {
      width: parent.width
      height: Math.round(root.unit * 0.09)
      visible: root.live

      Text {
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        text: "Roaming"
        textFormat: Text.PlainText
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: root.smallSize
        renderType: Text.NativeRendering
      }

      ToggleSwitch {
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        checked: root.live && root.omate.roaming
        enabled: root.live
        trackHeight: Math.round(root.unit * 0.06)
        onToggled: {
          if (!root.live) return
          if (typeof root.omate.setRoaming === "function")
            root.omate.setRoaming(!checked)
        }
      }
    }

    // Naps and chatter, the panel's two cadences. The panel types them into
    // spin boxes; this card never takes the keyboard, so the same numbers --
    // same floors, same ceilings -- are stepped rather than typed.
    Item {
      width: parent.width
      height: Math.round(root.unit * 0.09)
      visible: root.live

      Text {
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        text: "Naps / chatter"
        textFormat: Text.PlainText
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: root.smallSize
        renderType: Text.NativeRendering
      }

      Row {
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        spacing: Math.round(root.unit * 0.06)

        DialStepper {
          value: Model.settingNumber(
            root.live && omate.settings ? omate.settings.sleepMinutes : undefined, 10, 0, 120)
          from: 0
          to: 120
          enabled: root.live
          onChange: function (v) { root.writeSettings({ sleepMinutes: v }) }
        }

        DialStepper {
          value: Model.settingNumber(
            root.live && omate.settings ? omate.settings.chatterMinutes : undefined, 4, 1, 60)
          from: 1
          to: 60
          enabled: root.live
          onChange: function (v) { root.writeSettings({ chatterMinutes: v }) }
        }
      }
    }

    CardSlider {
      width: parent.width
      height: Math.round(root.unit * 0.12)

      caption: "Size"
      from: 1
      to: 6
      step: 1
      value: Model.settingNumber(root.live ? omate.petScale : undefined, 1, 1, 6)
      format: function (v) { return String(Math.round(v)) }
      enabled: root.live
      onCommit: function (v) { root.writeSettings({ scale: Math.round(v) }) }
    }

    Column {
      id: cursorRow

      // Cursor chasing, in the omate panel's own terms: one control for the
      // on/off and the cadence, because the interesting choice is not
      // "should it happen" but "how often". The chips, the labels and the
      // write path are the panel's -- setChaseCooldown then setCursorChase,
      // never a bare updateSettings -- so the card and the panel cannot
      // disagree about what the feature is.
      readonly property var chaseOptions: [
        { value: "off",  label: "Off" },
        { value: "10",   label: "10s" },
        { value: "60",   label: "1 min" },
        { value: "300",  label: "5 min" },
        { value: "1800", label: "30 min" }
      ]
      readonly property string chaseValue: root.live && root.omate.cursorChase
        ? String(root.omate.chaseCooldownSec) : "off"
      // The panel's wording, spelled out in Model.js so the cadence a chip
      // does not cover still reads as a setting rather than as nothing.
      readonly property string chaseDescription: Model.chaseLabel(
        root.live && root.omate.cursorChase === true,
        root.live ? root.omate.chaseCooldownSec : 0)

      width: parent.width
      spacing: Math.round(root.unit * 0.025)

      // The caption line: what the row is, and what it is currently saying
      // -- the panel carries the same sentence beside its chips.
      Item {
        width: parent.width
        height: chaseTitle.implicitHeight

        Text {
          id: chaseTitle

          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          text: "Chase cursor"
          textFormat: Text.PlainText
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: root.smallSize
          renderType: Text.NativeRendering
        }

        Text {
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          text: cursorRow.chaseDescription
          textFormat: Text.PlainText
          color: root.faint
          font.family: root.fontFamily
          font.pixelSize: root.smallSize
          renderType: Text.NativeRendering
        }
      }

      Row {
        id: chaseChips

        // Left, under the caption's first word: the row reads top to
        // bottom, Off first, rather than trailing the card's right edge.
        spacing: Math.round(root.unit * 0.025)

        Repeater {
          model: cursorRow.chaseOptions

          delegate: Rectangle {
            id: chaseChip

            required property var modelData

            readonly property bool selected: cursorRow.chaseValue === modelData.value

            width: chaseLabel.implicitWidth + Math.round(root.unit * 0.075)
            height: Math.round(root.unit * 0.075)
            radius: height / 2
            color: selected
              ? Util.alpha(root.accent, 0.2)
              : (chaseMouse.containsMouse ? Util.alpha(root.foreground, 0.06) : "transparent")
            border.width: 1
            border.color: selected ? root.accent : root.faint

            Behavior on color { ColorAnimation { duration: 90 } }

            Text {
              id: chaseLabel

              anchors.centerIn: parent
              text: chaseChip.modelData.label
              textFormat: Text.PlainText
              color: chaseChip.selected ? root.accent : root.dim
              font.family: root.fontFamily
              font.pixelSize: root.smallSize
              renderType: Text.NativeRendering
            }

            MouseArea {
              id: chaseMouse

              anchors.fill: parent
              anchors.margins: -Math.round(root.unit * 0.015)
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              enabled: root.live
              onClicked: {
                if (!root.live) return
                if (chaseChip.modelData.value === "off") {
                  if (typeof root.omate.setCursorChase === "function")
                    root.omate.setCursorChase(false)
                  return
                }
                if (typeof root.omate.setChaseCooldown === "function")
                  root.omate.setChaseCooldown(Number(chaseChip.modelData.value))
                if (typeof root.omate.setCursorChase === "function")
                  root.omate.setCursorChase(true)
              }
            }
          }
        }
      }
    }
  }

  // The not-loaded state, where the rest of the card would be. Said in
  // place rather than hidden: a card that vanishes because a plugin is off
  // is a hole in the grid with no explanation.
  Text {
    anchors.centerIn: parent
    visible: !root.live
    text: "Omate is not loaded"
    textFormat: Text.PlainText
    color: root.faint
    font.family: root.fontFamily
    font.pixelSize: root.bodySize
    renderType: Text.NativeRendering
  }

  // ------------------------------------------------------------------ stepper
  //
  // Minutes, stepped. The quiet counterpart of the panel's spin box: the
  // value, a minus and a plus, nothing else. Each click is one settings
  // write, the same commit the panel's onModified makes per step -- there
  // is no drag here to batch.

  component StepButton: Item {
    id: stepButton

    property string glyph: ""
    // Whether pressing it can still move the value, so the dead end of
    // the range sits back instead of pretending.
    property bool live: true

    signal clicked()

    width: Math.max(12, Math.round(root.unit * 0.07))
    height: width

    Text {
      anchors.centerIn: parent
      text: stepButton.glyph
      textFormat: Text.PlainText
      color: !stepButton.enabled || !stepButton.live
        ? root.faint
        : (stepMouse.containsMouse ? root.foreground : root.dim)
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      renderType: Text.NativeRendering

      Behavior on color { ColorAnimation { duration: 90 } }
    }

    MouseArea {
      id: stepMouse

      anchors.fill: parent
      anchors.margins: -Math.round(root.unit * 0.02)
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      enabled: stepButton.enabled && stepButton.live
      onClicked: stepButton.clicked()
    }
  }

  component DialStepper: Row {
    id: stepper

    property int value: 0
    property int from: 0
    property int to: 99
    property bool enabled: true
    signal change(int value)

    spacing: Math.round(root.unit * 0.02)

    StepButton {
      glyph: "\u2212"
      enabled: stepper.enabled
      live: stepper.value > stepper.from
      onClicked: stepper.change(stepper.value - 1)
    }

    Text {
      anchors.verticalCenter: parent.verticalCenter
      width: Math.max(implicitWidth, Math.round(root.unit * 0.12))
      horizontalAlignment: Text.AlignHCenter
      text: stepper.value + "m"
      textFormat: Text.PlainText
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      renderType: Text.NativeRendering
    }

    StepButton {
      glyph: "+"
      enabled: stepper.enabled
      live: stepper.value < stepper.to
      onClicked: stepper.change(stepper.value + 1)
    }
  }

  // ------------------------------------------------------------------ slider
  //
  // One dial, drawn: a caption and live value above a hairline track. Both
  // dials on the card are this one component, because the two things that
  // differ -- range, curve, and what a commit means -- are all properties.

  component CardSlider: Item {
    id: slider

    property string caption: ""
    property real from: 0
    property real to: 1
    property real step: 0
    // The committed value, owned by the caller's binding.
    property real value: from
    // What the number beside the caption shows: the drag while there is
    // one, the committed value otherwise, so the handle never lies about
    // where it came from.
    property var format: function (v) { return String(v) }
    readonly property real shown: dragArea.pressed ? dragValue : value
    readonly property real fraction: to > from
      ? Math.min(1, Math.max(0, (shown - from) / (to - from))) : 0

    property real dragValue: value
    signal commit(real value)

    Text {
      id: cap

      anchors.top: parent.top
      text: slider.caption
      textFormat: Text.PlainText
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      renderType: Text.NativeRendering
    }

    Text {
      anchors.top: parent.top
      anchors.right: parent.right
      text: slider.format(slider.shown)
      textFormat: Text.PlainText
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: root.smallSize
      renderType: Text.NativeRendering
    }

    Rectangle {
      id: groove

      anchors.bottom: parent.bottom
      anchors.bottomMargin: Math.round(root.unit * 0.012)
      width: parent.width
      height: Math.max(2, Math.round(root.unit * 0.008))
      radius: height / 2
      color: root.faint
    }

    Rectangle {
      id: fill

      anchors.bottom: groove.bottom
      width: Math.round(groove.width * slider.fraction)
      height: groove.height
      radius: height / 2
      color: root.accent
    }

    Rectangle {
      id: handle

      readonly property real d: Math.max(8, Math.round(root.unit * 0.045))

      x: Math.round((groove.width - d) * slider.fraction)
      y: groove.y + groove.height / 2 - d / 2
      width: d
      height: d
      radius: d / 2
      color: dragArea.pressed || dragArea.containsMouse
        ? root.foreground : root.accent

      Behavior on color { ColorAnimation { duration: 90 } }
    }

    MouseArea {
      id: dragArea

      // The whole row is the target, not the handle: a dial on a wallpaper
      // should not have to be aimed either.
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      enabled: slider.enabled
      onPressed: track(mouseX)
      onPositionChanged: if (pressed) track(mouseX)
      onReleased: slider.commit(slider.dragValue)

      function track(x) {
        var t = Math.min(1, Math.max(0, x / Math.max(1, groove.width)))
        var v = slider.from + t * (slider.to - slider.from)
        slider.dragValue = slider.step > 0 ? Math.round(v / slider.step) * slider.step : v
      }
    }
  }
}
