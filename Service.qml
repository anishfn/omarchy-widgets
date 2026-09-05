import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "Model.js" as Model

// Single source of truth for the Widgets plugin: which widgets exist, which
// ones are on, where they sit, and what the clock needs to know about
// timezones. The shell instantiates a service plugin once, which is what
// makes it single — the bar popup and the desktop surface both read it, so
// a toggle in one is already true in the other.
Item {
  id: service

  // Injected by the shell when the plugin loads.
  property var shell: null
  property var manifest: null
  property string omarchyPath: Quickshell.env("OMARCHY_PATH")

  readonly property string home: Quickshell.env("HOME")
  readonly property string configPath: home + "/.config/omarchy/widgets.json"

  // ------------------------------------------------------------------ state

  property var config: Model.defaultConfig()
  property bool configLoaded: false

  // The text we last wrote ourselves. `watchChanges` cannot tell our own
  // write from an editor's, and reloading our own bytes would clobber a
  // toggle that landed in between, so echoes are dropped by comparison.
  property string lastWrittenText: ""

  readonly property var widgets: config && Array.isArray(config.widgets) ? config.widgets : []
  readonly property int enabledCount: {
    var n = 0
    for (var i = 0; i < widgets.length; i++) if (widgets[i].enabled) n++
    return n
  }

  // zone name -> minutes east of UTC. Resolved by `date`, because the QML JS
  // engine has no Intl and quietly ignores the `timeZone` option.
  property var zoneOffsets: ({})

  readonly property var layout: config && config.layout
    ? config.layout : Model.normalizeLayout(null)

  // Whether the layout editor is up. Lives here rather than in the editor so
  // the bar popup, the desktop surface and the IPC all read one answer: the
  // surface stands down while this is true, and the editor exists only while
  // it is.
  property bool editing: false

  // Which widget the editor's controls act on. It lives here rather than in
  // the editor so it survives the editor being closed and reopened — you come
  // back to the widget you were working on — and so anything else that wants
  // to know can ask.
  property string selectedId: ""

  function select(id) {
    var key = String(id || "")
    service.selectedId = key && Model.findInstance(config, key) ? key : ""
  }

  // No explicit "something changed" signal: `widgets` is a bound property, so
  // Qt already emits widgetsChanged() whenever `config` is replaced. Declaring
  // one by hand collides with that generated signal and the file will not load.

  // ----------------------------------------------------------- mutations

  function apply(next) {
    config = next
    if (service.selectedId && !Model.findInstance(next, service.selectedId)) service.selectedId = ""
    saveTimer.restart()
    refreshZones()
    // Usernames and repository names are *typed* into the config, and the
    // editor commits on every keystroke so an edit cannot be lost by closing
    // the panel. Fetching straight from here would therefore send one request
    // per character — "cli/cli" is seven, and GitHub allows sixty an hour to
    // an unauthenticated address. Wait for the typing to stop.
    remoteDebounce.restart()
  }

  Timer {
    id: remoteDebounce
    interval: 1200
    onTriggered: {
      service.refreshContributions(false)
      service.refreshRepos(false)
      service.refreshCalendars(false)
    }
  }

  function setEnabled(id, enabled) { apply(Model.setEnabled(config, id, enabled)) }

  function toggle(id) { apply(Model.toggleEnabled(config, id)) }

  // Move a widget already on the grid, on either side. Whatever is in the way
  // moves rather than the drop being refused.
  function moveWidget(id, col, row, side) { apply(Model.moveWidget(config, id, col, row, side)) }

  // Drop onto a cell, switching the widget on if it was in the tray.
  function placeWidget(id, col, row, side) { apply(Model.placeWidget(config, id, col, row, side)) }

  // Send one widget to a side without naming a cell.
  function setWidgetSide(id, side) { apply(Model.setWidgetSide(config, id, side)) }

  // Another of a type, at its defaults, and a copy of a configured one. Both
  // land switched on, because a widget you asked for is one you want to see.
  function addWidget(type, side) { apply(Model.addWidget(config, type, side)) }

  function duplicateWidget(id) {
    var before = Model.countOfType(config, Model.findInstance(config, id)
      ? Model.findInstance(config, id).type : "")
    var next = Model.duplicateWidget(config, id)
    apply(next)
    // Select what was just made, so the settings panel is already pointed at
    // the thing you are about to change -- a copy exists to be edited.
    var source = Model.findInstance(next, id)
    if (source && Model.countOfType(next, source.type) > before) {
      var made = next.widgets[next.widgets.length - 1]
      if (made) service.select(made.id)
    }
  }

  function removeWidget(id) { apply(Model.removeWidget(config, id)) }

  function setSetting(id, key, value) { apply(Model.setSetting(config, id, key, value)) }

  function resizeWidget(id, cols, rows) { apply(Model.resizeWidget(config, id, cols, rows)) }

  function cycleSize(id) { apply(Model.cycleSize(config, id)) }

  function setSide(side) { apply(Model.setSide(config, side)) }

  function setColumns(columns) { apply(Model.setColumns(config, columns)) }

  function setScale(scale) { apply(Model.setScale(config, scale)) }

  // The layout's global opacity, applied to every card: moving it writes over
  // any card that had its own.
  function setLayoutOpacity(opacity) { apply(Model.setLayoutOpacity(config, opacity)) }

  function setOpacity(id, opacity) { apply(Model.setOpacity(config, id, opacity)) }

  // Put a card back on the layout's global opacity after it had its own.
  function clearOpacity(id) { apply(Model.clearOpacity(config, id)) }

  // Restore the grid's default scale and opacity, and drop any per-card opacity.
  function resetAppearance() { apply(Model.resetAppearance(config)) }

  function openEditor() { service.editing = true }

  function closeEditor() { service.editing = false }

  function toggleEditor() { service.editing = !service.editing }

  // ------------------------------------------------------------ config IO

  function loadConfig(raw) {
    var text = String(raw || "")
    var next

    if (text.replace(/^\s+|\s+$/g, "").length === 0) {
      // First run, or a file emptied by hand. Seed the defaults and write
      // them back, so there is something to edit next time someone looks.
      next = Model.defaultConfig()
    } else {
      var parsed = null
      try {
        parsed = JSON.parse(text)
      } catch (e) {
        // A file we cannot parse is a file someone is in the middle of
        // editing. Keep what is on screen and say so; do not overwrite it.
        console.warn("widgets: " + service.configPath + " is not valid JSON, leaving it alone:", e)
        service.configLoaded = true
        return
      }
      next = Model.ensureCatalogCoverage(parsed)
    }

    config = next
    service.configLoaded = true
    refreshZones()

    // Round-trip anything the parse changed — a widget type added by an
    // update, a value clamped back into range, a first run — so the file on
    // disk says what is actually running. When nothing changed this compares
    // equal and no write happens, which is what stops the watch from feeding
    // itself.
    if (text !== serialize()) saveTimer.restart()
  }

  function serialize() {
    // `null` on a widget's `opacity` means "no override: follow the layout's
    // global opacity", and spelling that out in the file would just beg future
    // readers to wonder whether the plugin lost a value. Absent is the honest
    // form, so drop the key rather than write `null`.
    return JSON.stringify(config, function (key, value) {
      return (key === "opacity" && value === null) ? undefined : value
    }, 2) + "\n"
  }

  function save() {
    if (!service.configLoaded) return
    var text = serialize()
    if (text === service.lastWrittenText) return
    service.lastWrittenText = text
    configFile.setText(text)
  }

  Timer {
    id: saveTimer
    interval: 200
    onTriggered: service.save()
  }

  FileView {
    id: configFile
    path: service.configPath
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: service.loadConfig(text())
    // Absent on first run. FileView reports that as a failure rather than as
    // empty text, and without this branch `configLoaded` would stay false
    // forever, `save()` would be a no-op, and the file would never appear.
    onLoadFailed: service.loadConfig("")
    // `text()` is stale inside the change signal, so both paths go through
    // reload -> onLoaded and always parse fresh bytes.
    onFileChanged: reload()
  }

  // ---------------------------------------------------------- timezones
  //
  // `date` is the only thing on the box that knows the zoneinfo database,
  // and it is cheap: one short-lived bash for every zone in the config,
  // every quarter hour, which is close enough to a DST boundary to matter to
  // nobody. Zone names are matched against a strict pattern before they get
  // here, and the lookup names the zoneinfo file directly rather than letting
  // glibc search for it.

  readonly property string zoneScript:
    'PATH=/usr/bin:/bin\n' +
    'export PATH\n' +
    'for z in "$@"; do\n' +
    '  if [ -f "/usr/share/zoneinfo/$z" ]; then\n' +
    '    printf \'%s\\t%s\\n\' "$z" "$(TZ=":/usr/share/zoneinfo/$z" date +%z)"\n' +
    '  else\n' +
    '    printf \'%s\\t\\n\' "$z"\n' +
    '  fi\n' +
    'done\n'

  function refreshZones() {
    var zones = Model.zonesInUse(config)
    if (zones.length === 0) {
      zoneOffsets = ({})
      return
    }
    if (zoneProc.running) return
    // `timeout` keeps a wedged `date` from holding the only slot forever.
    zoneProc.command = ["/usr/bin/timeout", "-k", "2", "5", "/usr/bin/bash", "-c", service.zoneScript, "--"].concat(zones)
    zoneProc.running = true
  }

  Process {
    id: zoneProc
    running: false
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var next = Model.parseZoneOffsets(text)
        // Reassign whole, never mutate: the bindings that read a zone off
        // this map only re-evaluate when the property itself changes.
        service.zoneOffsets = next
      }
    }
  }

  // ------------------------------------------------------- timezone list
  //
  // Every zone the system knows, for the editor's picker. Loaded the first
  // time the editor opens rather than at startup: it is six hundred lines
  // that only matter once somebody goes looking for a city, and the shell
  // starts on every login.

  property var timezoneNames: []
  property bool timezonesLoaded: false

  function loadTimezones() {
    if (service.timezonesLoaded || zoneListProc.running) return
    zoneListProc.running = true
  }

  onEditingChanged: if (service.editing) service.loadTimezones()

  Process {
    id: zoneListProc
    running: false
    command: ["/usr/bin/timeout", "-k", "2", "10", "/usr/bin/timedatectl", "list-timezones"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var lines = String(text || "").split("\n")
        var out = []
        for (var i = 0; i < lines.length; i++) {
          var zone = lines[i].replace(/^\s+|\s+$/g, "")
          // Same gate the config goes through, so nothing the picker can
          // offer is something the lookup would have to refuse.
          if (zone && Model.isSafeZone(zone)) out.push(zone)
        }
        service.timezoneNames = out
        service.timezonesLoaded = out.length > 0
      }
    }
  }

  Timer {
    id: zoneTimer
    interval: 900000
    repeat: true
    running: true
    triggeredOnStart: false
    onTriggered: service.refreshZones()
  }

  // --------------------------------------------------------------- weather
  //
  // One fetch serves every weather widget on every screen. It lives here for
  // the same reason the timezone lookup does: this is the object that talks
  // to the outside world on behalf of widgets, and a card that ran its own
  // request would run one per instance, per monitor.
  //
  // The response is kept in Celsius and converted for display, so two widgets
  // in different units still cost one request.
  //
  // Location comes from the file `omarchy-weather-location` writes, which is
  // the same one the built-in weather bar widget reads. Nothing stored there
  // means wttr.in detects it from the IP address, which is Omarchy's
  // documented default rather than a decision taken here.

  readonly property string weatherLocationPath:
    home + "/.local/state/omarchy/settings/weather.json"

  property var weather: null
  property string weatherError: ""
  property string weatherLocation: ""

  readonly property bool weatherWanted: {
    for (var i = 0; i < widgets.length; i++)
      if (widgets[i].enabled && widgets[i].type === "weather") return true
    return false
  }

  onWeatherWantedChanged: if (weatherWanted) refreshWeather()

  FileView {
    path: service.weatherLocationPath
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: service.applyWeatherLocation(text())
    onLoadFailed: service.applyWeatherLocation("")
  }

  function applyWeatherLocation(raw) {
    var next = ""
    try {
      var parsed = JSON.parse(String(raw || ""))
      if (parsed && typeof parsed === "object" && typeof parsed.name === "string")
        next = parsed.name.replace(/^\s+|\s+$/g, "")
    } catch (e) {
      // A half-written file is not a reason to forget where we are.
      return
    }
    if (next === service.weatherLocation) return
    service.weatherLocation = next
    if (service.weatherWanted) refreshWeather()
  }

  function refreshWeather() {
    if (!service.weatherWanted || weatherProc.running) return
    // The location is a path segment, so it is encoded rather than trusted,
    // and the whole thing is passed as one argv entry to curl.
    var query = service.weatherLocation ? encodeURIComponent(service.weatherLocation) : ""
    weatherProc.command = ["/usr/bin/timeout", "-k", "2", "20",
      "/usr/bin/curl", "-fsS", "--max-time", "15",
      "https://wttr.in/" + query + "?format=j1"]
    weatherProc.running = true
  }

  Process {
    id: weatherProc
    running: false
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var parsed = Model.parseWeather(text)
        if (parsed) {
          service.weather = parsed
          service.weatherError = ""
        } else {
          // Keep whatever is on screen. A card showing ten-minute-old weather
          // is better than one that has gone blank because a request failed.
          service.weatherError = service.weather ? "stale" : "unavailable"
        }
      }
    }
  }

  Timer {
    interval: 900000
    repeat: true
    running: service.weatherWanted
    triggeredOnStart: true
    onTriggered: service.refreshWeather()
  }

  // ---------------------------------------------------- github contributions
  //
  // GitHub does not publish the contribution calendar through its REST API,
  // but the page that draws it is served on its own at
  // /users/<login>/contributions and needs no token. So this goes to
  // github.com directly rather than through a third party that would
  // otherwise learn whose graph is on someone's wallpaper.
  //
  // One request per distinct login, run one at a time: two of these widgets
  // is a plausible thing to want, four simultaneous curls at startup is not.

  // login -> { total, days: [{date, level}], at }
  property var contributions: ({})
  property string contributionsError: ""
  property var contributionQueue: []

  readonly property bool githubWanted: {
    for (var i = 0; i < widgets.length; i++)
      if (widgets[i].enabled && widgets[i].type === "github") return true
    return false
  }

  onGithubWantedChanged: if (githubWanted) refreshContributions(false)

  // `force` re-fetches everything, which is what the timer wants. Without it
  // only logins with nothing drawn yet are queued, which is what a config
  // change wants: typing a username should fetch it, and dragging a widget
  // across the grid should not re-fetch anything at all.
  function refreshContributions(force) {
    if (!service.githubWanted) return
    var logins = Model.loginsInUse(config)
    var queue = []
    for (var i = 0; i < logins.length; i++) {
      if (force === true || !service.contributions[logins[i]]) queue.push(logins[i])
    }
    if (queue.length === 0) return
    service.contributionQueue = queue
    startNextContribution()
  }

  function startNextContribution() {
    if (contributionProc.running) return
    var queue = service.contributionQueue
    if (!queue || queue.length === 0) return
    var login = String(queue[0])
    service.contributionQueue = queue.slice(1)
    // Checked again here rather than trusted from the queue: this string is
    // about to become a URL path segment.
    if (!Model.isSafeLogin(login)) { startNextContribution(); return }
    contributionProc.login = login
    contributionProc.command = ["/usr/bin/timeout", "-k", "2", "25",
      "/usr/bin/curl", "-fsS", "--max-time", "20",
      "https://github.com/users/" + login + "/contributions"]
    contributionProc.running = true
  }

  Process {
    id: contributionProc
    running: false
    property string login: ""
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var parsed = Model.parseContributions(text)
        if (parsed) {
          // Reassign whole, never mutate: a binding reading one login's graph
          // only re-evaluates when the property itself changes.
          var next = ({})
          for (var key in service.contributions) next[key] = service.contributions[key]
          next[contributionProc.login] = parsed
          service.contributions = next
          service.contributionsError = ""
        } else {
          // Keep whatever is already drawn. A graph from an hour ago beats a
          // card that has emptied itself because one request failed.
          service.contributionsError = service.contributions[contributionProc.login]
            ? "stale" : "unavailable"
        }
      }
    }
    onRunningChanged: if (!running) Qt.callLater(service.startNextContribution)
  }

  Timer {
    // Contributions move on the scale of a working day, not a minute.
    interval: 1800000
    repeat: true
    running: service.githubWanted
    triggeredOnStart: true
    onTriggered: service.refreshContributions(true)
  }

  // ------------------------------------------------------------ repo pulse
  //
  // The public REST API, unauthenticated: sixty requests an hour per address.
  // Two calls per repository, every half hour, so a handful of repositories
  // sits comfortably inside that.
  //
  // Two calls because GitHub's open_issues_count counts pull requests as
  // issues: the search endpoint gives the pull request count on its own, so
  // the two can be shown as the two different things they are.

  // "owner/name" -> { info, pulls }
  property var repos: ({})
  property string reposError: ""
  property var repoQueue: []

  readonly property bool reposWanted: {
    for (var i = 0; i < widgets.length; i++)
      if (widgets[i].enabled && widgets[i].type === "repo-pulse") return true
    return false
  }

  onReposWantedChanged: if (reposWanted) refreshRepos(false)

  function refreshRepos(force) {
    if (!service.reposWanted) return
    var names = Model.reposInUse(config)
    var queue = []
    for (var i = 0; i < names.length; i++) {
      var have = service.repos[names[i]]
      // Re-queued when forced, when nothing is known, and when the repository
      // arrived but its pull request count did not.
      if (force === true || !have || have.pulls === null || have.pulls === undefined)
        queue.push(names[i])
    }
    if (queue.length === 0) return
    service.repoQueue = queue
    startNextRepo()
  }

  function startNextRepo() {
    if (repoInfoProc.running || repoStatsProc.running) return
    var queue = service.repoQueue
    if (!queue || queue.length === 0) return
    var name = String(queue[0])
    service.repoQueue = queue.slice(1)
    // Checked again here rather than trusted from the queue: this becomes
    // two path segments.
    if (!Model.isSafeRepo(name)) { startNextRepo(); return }
    repoInfoProc.repo = name
    repoInfoProc.command = ["/usr/bin/timeout", "-k", "2", "20",
      "/usr/bin/curl", "-fsSL", "--max-time", "15",
      "-H", "Accept: application/vnd.github+json",
      "https://api.github.com/repos/" + name]
    repoInfoProc.running = true
  }

  function storeRepo(name, info, pulls) {
    var next = ({})
    for (var key in service.repos) next[key] = service.repos[key]
    var existing = next[name] || ({})
    next[name] = {
      info: info !== null ? info : (existing.info || null),
      pulls: pulls !== null ? pulls : (existing.pulls === undefined ? null : existing.pulls)
    }
    service.repos = next
  }

  Process {
    id: repoInfoProc
    running: false
    property string repo: ""
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var info = Model.parseRepo(text)
        if (info) {
          service.storeRepo(repoInfoProc.repo, info, null)
          service.reposError = ""
        } else {
          service.reposError = service.repos[repoInfoProc.repo] ? "stale" : "unavailable"
        }
      }
    }
    onRunningChanged: {
      if (running) return
      // Only count pull requests for a repository that exists.
      if (service.repos[repoInfoProc.repo]) {
        repoStatsProc.repo = repoInfoProc.repo
        // The query is built from a name already matched against GitHub's own
        // rules, so it carries nothing that needs escaping beyond the colon
        // and plus signs the search syntax itself uses.
        repoStatsProc.command = ["/usr/bin/timeout", "-k", "2", "25",
          "/usr/bin/curl", "-fsSL", "--max-time", "20",
          "-H", "Accept: application/vnd.github+json",
          "https://api.github.com/search/issues?per_page=1&q=repo:"
            + repoInfoProc.repo + "+type:pr+state:open"]
        repoStatsProc.running = true
      } else {
        Qt.callLater(service.startNextRepo)
      }
    }
  }

  Process {
    id: repoStatsProc
    running: false
    property string repo: ""
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        // The repository keeps the numbers it already has if this fails; the
        // card then shows GitHub's combined count until a later pass.
        var pulls = Model.parsePullCount(text)
        if (pulls !== null) service.storeRepo(repoStatsProc.repo, null, pulls)
      }
    }
    onRunningChanged: if (!running) Qt.callLater(service.startNextRepo)
  }

  Timer {
    interval: 1800000
    repeat: true
    running: service.reposWanted
    triggeredOnStart: true
    onTriggered: service.refreshRepos(true)
  }

  // ------------------------------------------------------------- calendar
  //
  // Google publishes every calendar as an iCalendar file at a private
  // address, which is the only way to read one without a wallpaper
  // decoration holding an OAuth token it would then have to refresh. One GET
  // to Google's own host, nothing sent but the address itself, no third
  // party in the middle.
  //
  // The file is fetched here rather than in the widget for the usual reason:
  // one request serves however many cards point at the same calendar, on
  // however many monitors. It is also parsed here, once per fetch, because
  // expanding a series of recurring meetings is the expensive part and the
  // card only ever draws the next handful.
  //
  // That parse is the one blocking thing this plugin does: a 120 KB calendar
  // takes about 13ms, or roughly one dropped frame, once every fifteen
  // minutes per calendar. The alternative -- parsing lazily as the card
  // draws -- would pay it on every repaint instead.

  // ics url -> { events: [{start, end, allDay, summary, location}] }
  property var calendars: ({})
  property string calendarError: ""
  property var calendarQueue: []

  // How much of the future is expanded. Wide enough that the tall card is
  // never short of rows, and narrow enough that a daily standup started in
  // 2019 does not turn into ten thousand objects.
  readonly property int calendarWindowDays: 60

  readonly property bool calendarWanted: {
    for (var i = 0; i < widgets.length; i++)
      if (widgets[i].enabled && widgets[i].type === "calendar") return true
    return false
  }

  onCalendarWantedChanged: if (calendarWanted) refreshCalendars(false)

  // `force` re-fetches everything, which is what the timer wants. Without it
  // only calendars with nothing drawn yet are queued, which is what a config
  // change wants: pasting an address should fetch it, and dragging the card
  // across the grid should not.
  function refreshCalendars(force) {
    if (!service.calendarWanted) return
    var urls = Model.calendarsInUse(config)
    var queue = []
    for (var i = 0; i < urls.length; i++) {
      if (force === true || !service.calendars[urls[i]]) queue.push(urls[i])
    }
    if (queue.length === 0) return
    service.calendarQueue = queue
    startNextCalendar()
  }

  function startNextCalendar() {
    if (calendarProc.running) return
    var queue = service.calendarQueue
    if (!queue || queue.length === 0) return
    var url = String(queue[0])
    service.calendarQueue = queue.slice(1)
    // Checked again here rather than trusted from the queue: this string is
    // about to be handed to curl as a URL.
    if (!Model.isSafeIcsUrl(url)) { startNextCalendar(); return }
    calendarProc.url = url
    // `--max-filesize` is a ceiling on a document that arrives from outside
    // and is turned into objects inside the process that draws the desktop.
    calendarProc.command = ["/usr/bin/timeout", "-k", "2", "35",
      "/usr/bin/curl", "-fsSL", "--max-time", "30",
      "--max-filesize", "8388608",
      "-H", "Accept: text/calendar",
      url]
    calendarProc.running = true
  }

  Process {
    id: calendarProc
    running: false
    property string url: ""
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var now = Date.now()
        var parsed = Model.parseCalendar(text,
          now - Model.DAY_MS,
          now + service.calendarWindowDays * Model.DAY_MS,
          300)
        if (parsed) {
          // Reassign whole, never mutate: a binding reading one calendar only
          // re-evaluates when the property itself changes.
          var next = ({})
          for (var key in service.calendars) next[key] = service.calendars[key]
          next[calendarProc.url] = parsed
          service.calendars = next
          service.calendarError = ""
        } else {
          // Keep whatever is on screen. Yesterday's agenda still has today's
          // meetings in it; a card that has emptied itself has nothing.
          service.calendarError = service.calendars[calendarProc.url] ? "stale" : "unavailable"
        }
      }
    }
    onRunningChanged: if (!running) Qt.callLater(service.startNextCalendar)
  }

  Timer {
    // A calendar moves when somebody sends an invitation, which is not
    // something a wallpaper has to see inside the minute. The countdown on
    // the card is local arithmetic and updates every minute regardless.
    interval: 900000
    repeat: true
    running: service.calendarWanted
    triggeredOnStart: true
    onTriggered: service.refreshCalendars(true)
  }

  // ---------------------------------------------------------------- todos
  //
  // A text file, watched. No request, no daemon, no format anybody has to
  // learn -- the list is a file you already know how to edit, and the widget
  // is the part that reads it.
  //
  // The watch lives here rather than in the widget so two cards on the same
  // file are one watch, and so the parse happens once per change rather than
  // once per card per monitor.

  // absolute path -> parsed list, or null when the file is not there
  property var todos: ({})

  // ...and the bytes it was parsed from. Kept because ticking a box is a
  // *rewrite* of the file the user typed, not a re-serialisation of what was
  // parsed out of it: the parse throws away blank lines, headings, dividers
  // and every choice of bullet, and writing back from it would reformat
  // somebody's file every time they ticked something off.
  property var todoTexts: ({})

  readonly property var todoPaths: Model.todoPathsInUse(config, home)

  function storeTodos(path, raw) {
    var key = String(path)
    var parsed = ({})
    var texts = ({})
    for (var k in service.todos) parsed[k] = service.todos[k]
    for (var t in service.todoTexts) texts[t] = service.todoTexts[t]
    parsed[key] = raw === null ? null : Model.parseTodos(raw)
    texts[key] = raw === null ? "" : String(raw)
    service.todos = parsed
    service.todoTexts = texts
  }

  // Tick or untick one line, and write the file back.
  //
  // The desired state is passed rather than flipped, so two clicks that land
  // in the same frame settle on what was asked for instead of cancelling each
  // other out. `setTodoDone` answers null when the line is not a task or is
  // already in that state, and null means no write at all -- a widget under
  // your windows should not be able to touch a file by being looked at.
  function setTodoDone(path, lineIndex, done) {
    var key = String(path)
    var index = service.todoPaths.indexOf(key)
    if (index === -1) return false
    var next = Model.setTodoDone(service.todoTexts[key], lineIndex, done)
    if (next === null) return false

    var view = todoWatches.objectAt(index)
    if (!view) return false
    // Stored before the write so the card redraws now rather than after the
    // watch has been round the file system and back.
    service.storeTodos(key, next)
    view.setText(next)
    return true
  }

  // Open the list in whatever editor Omarchy has been told to use. Its own
  // launcher, rather than xdg-open: `omarchy-launch-editor` is what every
  // other "edit this" in the desktop goes through, so a list opens in the
  // same editor as everything else, in a terminal if that is what it is.
  //
  // `execArgv` runs it without a shell interpreting the arguments, which
  // matters because the path came out of a config file.
  function openTodoFile(path) {
    var key = String(path)
    if (!key || service.todoPaths.indexOf(key) === -1) return false
    Util.execArgv([service.omarchyPath + "/bin/omarchy-launch-editor", key])
    return true
  }

  Instantiator {
    id: todoWatches
    model: service.todoPaths
    delegate: FileView {
      required property var modelData
      path: String(modelData)
      watchChanges: true
      printErrors: false
      // Written whole, and atomically: this file is somebody's list, and a
      // half-written one is worse than a stale one.
      atomicWrites: true
      // `text()` is stale inside the change signal, so both paths go through
      // reload -> onLoaded and always parse fresh bytes. Re-reading our own
      // write costs one parse and cannot clobber anything, so unlike the
      // config there is no echo to suppress.
      onFileChanged: reload()
      // A file that is not there yet is not an error worth drawing: the card
      // says how to make one.
      onLoadFailed: service.storeTodos(path, null)
      onLoaded: service.storeTodos(path, text())
      Component.onCompleted: reload()
    }
  }

  // ----------------------------------------------------------------- IPC

  IpcHandler {
    target: "widgets"

    function list(): string {
      var out = []
      for (var i = 0; i < service.widgets.length; i++) {
        var w = service.widgets[i]
        out.push((w.enabled ? "on   " : "off  ") + w.id
          + "  (" + w.type + ", " + Model.sideOf(w, service.layout)
          + " col " + w.col + " row " + w.row
          + ", " + w.cols + "x" + w.rows + ")")
      }
      var used = Model.sidesInUse(service.config)
      var where = used.left && used.right ? "both sides"
        : (used.left || used.right ? service.layout.side + " side" : "nothing placed")
      var head = "grid: " + service.layout.columns + " columns, " + where
        + " (new widgets go " + service.layout.side + ")"
      return head + (out.length ? "\n" + out.join("\n") : "\nno widgets configured")
    }

    function json(): string { return JSON.stringify(service.config, null, 2) }

    function enable(id: string): string {
      if (!Model.findInstance(service.config, id)) return "no widget with id " + id
      service.setEnabled(id, true)
      return "ok"
    }

    function disable(id: string): string {
      if (!Model.findInstance(service.config, id)) return "no widget with id " + id
      service.setEnabled(id, false)
      return "ok"
    }

    function toggle(id: string): string {
      if (!Model.findInstance(service.config, id)) return "no widget with id " + id
      service.toggle(id)
      return "ok"
    }

    function move(id: string, col: string, row: string, side: string): string {
      if (!Model.findInstance(service.config, id)) return "no widget with id " + id
      service.moveWidget(id, Number(col), Number(row), side)
      var now = Model.findInstance(service.config, id)
      return now.col === Number(col) && now.row === Number(row)
        ? "ok"
        : "cell " + col + "," + row + " is off the grid"
    }

    function place(id: string, col: string, row: string, side: string): string {
      if (!Model.findInstance(service.config, id)) return "no widget with id " + id
      service.placeWidget(id, Number(col), Number(row), side)
      var now = Model.findInstance(service.config, id)
      return now.enabled && now.col === Number(col) && now.row === Number(row)
        ? "ok"
        : "cell " + col + "," + row + " is off the grid, or the grid is full"
    }

    function add(type: string): string {
      if (!Model.catalogEntry(type)) return "no widget type '" + type
        + "'; there is: " + Model.catalogTypes().join(", ")
      var before = Model.countOfType(service.config, type)
      service.addWidget(type, "")
      var after = Model.countOfType(service.config, type)
      if (after > before) return service.config.widgets[service.config.widgets.length - 1].id
      return Model.allowsMultiple(type)
        ? "no room for another widget"
        : type + " reads one source, so one of it is all there is"
    }

    function duplicate(id: string): string {
      var target = Model.findInstance(service.config, id)
      if (!target) return "no widget with id " + id
      if (!Model.allowsMultiple(target.type))
        return target.type + " reads one source, so one of it is all there is"
      var before = Model.countOfType(service.config, target.type)
      service.duplicateWidget(id)
      return Model.countOfType(service.config, target.type) > before
        ? service.config.widgets[service.config.widgets.length - 1].id
        : "no room for another widget"
    }

    function remove(id: string): string {
      if (!Model.findInstance(service.config, id)) return "no widget with id " + id
      if (!Model.canRemove(service.config, id))
        return "that is the only " + Model.findInstance(service.config, id).type
          + "; switch it off instead"
      service.removeWidget(id)
      return "ok"
    }

    function select(id: string): string {
      service.select(id)
      return service.selectedId ? "ok" : "no widget with id " + id
    }

    function set(id: string, key: string, value: string): string {
      var target = Model.findInstance(service.config, id)
      if (!target) return "no widget with id " + id
      if (!Model.settingSpec(target.type, key)) {
        var keys = []
        var schema = Model.settingsSchema(target.type)
        for (var i = 0; i < schema.length; i++) keys.push(schema[i].key)
        return "no setting '" + key + "'; " + target.type + " has: " + keys.join(", ")
      }
      service.setSetting(id, key, value)
      return String(Model.findInstance(service.config, id).settings[key])
    }

    function size(id: string): string {
      if (!Model.findInstance(service.config, id)) return "no widget with id " + id
      service.cycleSize(id)
      var now = Model.findInstance(service.config, id)
      return now.cols + "x" + now.rows
    }

    // With no id, everything moves; with one, just that widget.
    function side(value: string, id: string): string {
      if (Model.SIDES.indexOf(String(value)) === -1)
        return "side must be one of: " + Model.SIDES.join(", ")
      if (!String(id)) { service.setSide(value); return "ok" }
      if (!Model.findInstance(service.config, id)) return "no widget with id " + id
      service.setWidgetSide(id, value)
      return Model.sideOf(Model.findInstance(service.config, id), service.layout)
    }

    function columns(value: string): string {
      service.setColumns(Number(value))
      return String(service.layout.columns)
    }

    function scale(value: string): string {
      service.setScale(Number(value))
      return String(service.layout.scale)
    }

    // The layout's global opacity, applied to every card; cards that had
    // their own join it.
    function opacityAll(value: string): string {
      service.setLayoutOpacity(Number(value))
      return String(service.layout.opacity)
    }

    function opacity(id: string, value: string): string {
      if (!Model.findInstance(service.config, id)) return "no widget with id " + id
      service.setOpacity(id, Number(value))
      return String(Model.findInstance(service.config, id).opacity)
    }

    function opacityClear(id: string): string {
      if (!Model.findInstance(service.config, id)) return "no widget with id " + id
      service.clearOpacity(id)
      return "ok"
    }

    function resetAppearance(): string {
      service.resetAppearance()
      return "ok"
    }

    function edit(): string {
      service.openEditor()
      return "ok"
    }

    function done(): string {
      service.closeEditor()
      return "ok"
    }

    function weather(): string {
      if (!service.weatherWanted) return "no weather widget is on"
      if (!service.weather) return service.weatherError || "not fetched yet"
      var w = service.weather
      return w.place + "  " + w.tempC + "C / " + w.tempF + "F  " + w.condition
        + "  (H:" + w.highC + " L:" + w.lowC + ")"
        + (service.weatherError ? "  [" + service.weatherError + "]" : "")
    }

    function github(): string {
      var logins = Model.loginsInUse(service.config)
      if (logins.length === 0) return "no github widget has a username set"
      var out = []
      for (var i = 0; i < logins.length; i++) {
        var data = service.contributions[logins[i]]
        out.push(logins[i] + ": " + (data
          ? data.total + " in the last year, " + data.days.length + " days"
          : (service.contributionsError || "not fetched yet")))
      }
      return out.join("\n")
    }

    function repos(): string {
      var names = Model.reposInUse(service.config)
      if (names.length === 0) return "no repo-pulse widget has a repository set"
      var out = []
      for (var i = 0; i < names.length; i++) {
        var data = service.repos[names[i]]
        if (!data || !data.info) { out.push(names[i] + ": " + (service.reposError || "not fetched yet")); continue }
        var st = Model.repoStats(data.info, data.pulls)
        out.push(names[i] + ": " + st.stars + " stars, " + st.forks + " forks, "
          + st.issues + " issues, " + (st.pulls === null ? "PRs unknown" : st.pulls + " PRs"))
      }
      return out.join("\n")
    }

    function refreshRepos(): string {
      service.refreshRepos(true)
      return "ok"
    }

    function refreshGithub(): string {
      service.refreshContributions(true)
      return "ok"
    }

    function refreshWeather(): string {
      service.refreshWeather()
      return "ok"
    }

    function calendar(): string {
      var urls = Model.calendarsInUse(service.config)
      if (urls.length === 0) return "no calendar widget has an iCal address set"
      var now = Date.now()
      var out = []
      for (var i = 0; i < urls.length; i++) {
        var data = service.calendars[urls[i]]
        if (!data) { out.push("calendar " + (i + 1) + ": " + (service.calendarError || "not fetched yet")); continue }
        var next = Model.upcomingEvents(data.events, now, 5, true)
        // The address itself is not printed: it is the secret, and this
        // answer goes wherever the caller sends it.
        out.push("calendar " + (i + 1) + ": " + data.events.length + " events in the window")
        for (var e = 0; e < next.length; e++) {
          out.push("  " + Model.dayHeading(next[e].start, now) + " "
            + Model.eventTimeLabel(next[e], false) + "  " + next[e].summary)
        }
      }
      return out.join("\n")
    }

    function todo(path: string, line: string, done: string): string {
      var target = String(path) || (service.todoPaths.length === 1 ? service.todoPaths[0] : "")
      if (!target) return "say which list: " + service.todoPaths.join(", ")
      var wanted = String(done) !== "false" && String(done) !== "0"
      return service.setTodoDone(target, Number(line), wanted)
        ? "ok"
        : "line " + line + " is not a task, or is already " + (wanted ? "done" : "not done")
    }

    function refreshCalendar(): string {
      service.refreshCalendars(true)
      return "ok"
    }

    function todos(): string {
      var paths = service.todoPaths
      if (paths.length === 0) return "no todos widget is on"
      var out = []
      for (var i = 0; i < paths.length; i++) {
        var list = service.todos[paths[i]]
        if (!list) { out.push(paths[i] + ": no such file"); continue }
        out.push(paths[i] + ": " + list.remaining + " left of " + list.total)
        var shown = Model.visibleTodos(list, true, 10)
        for (var t = 0; t < shown.length; t++) {
          out.push("  [" + (shown[t].done ? "x" : " ") + "] "
            + (shown[t].important ? "! " : "") + shown[t].text)
        }
      }
      return out.join("\n")
    }

    function reload(): string {
      configFile.reload()
      return "ok"
    }
  }

  Component.onCompleted: configFile.reload()
}
