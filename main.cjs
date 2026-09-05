const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, Menu, screen } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isSonosURL } = require('./security.cjs');
if (process.env.SONOS_AMP_TEST_DATA) app.setPath('userData', process.env.SONOS_AMP_TEST_DATA);
let win, player;
const home = 'https://play.sonos.com/';
const localURL = pathToFileURL(path.join(__dirname, 'ui/index.html')).href;

// Mini player: a small always-on-top window that reuses the SAME player WebContentsView
// (moved over, not reloaded) so playback/session state is untouched. It crops the Sonos
// page down to just its own real now-playing bar (via CSS + a fixed viewport width where
// Sonos's own responsive layout already collapses to art+transport+volume) rather than
// faking transport controls.
const diagnostic = data => require('node:fs').appendFileSync('/private/tmp/sonos-amp-diagnostic.log', JSON.stringify(data) + '\n');
let miniWin = null, miniCssKey = null, miniVisOn = false, miniPos = null;
// 640 isn't arbitrary: Sonos's own responsive layout collapses this bar to a mobile-style
// row below ~768px, but at 480px an actively-playing track's info column starves to ~100px
// (its icons/buttons don't shrink, only the text column does) and titles get mangled. 640px
// is the narrowest width that keeps a real track's title+artist+room fully readable.
const MINI_W = 640, MINI_BAR_H = 86, MINI_TOOLBAR_H = 26, MINI_ROOMBAR_H = 24, MINI_VIS_H = 160;
const MINI_HEADER_H = MINI_TOOLBAR_H + MINI_ROOMBAR_H;
const miniCss = `
  header, main, [aria-label="System view"] { display: none !important; }
  html, body { height: auto !important; background: #15161c !important; }
  section:has(> div > button[aria-label="Open Now Playing"]) { width: 100% !important; }
  /* These two open a real Sonos dropdown/panel positioned relative to the page's own
     viewport — but the mini window's WebContentsView is only as tall as this bar, so
     anything they render falls outside the visible area and is silently clipped rather
     than shown. Hiding them beats leaving a control that looks broken; both still work
     normally from the full window. */
  section:has(> div > button[aria-label="Open Now Playing"]) button[aria-label="More options"],
  section:has(> div > button[aria-label="Open Now Playing"]) button[aria-label="Queue"] {
    display: none !important;
  }
`;
function miniHeight() { return MINI_HEADER_H + (miniVisOn ? MINI_VIS_H : 0) + MINI_BAR_H; }
function layoutMiniPlayer() {
  if (!miniWin || !player) return;
  player.setBounds({ x: 0, y: MINI_HEADER_H + (miniVisOn ? MINI_VIS_H : 0), width: MINI_W, height: MINI_BAR_H });
  player.setVisible(true);
}
function openMini() {
  if (!win || !player) return;
  if (miniWin) { miniWin.show(); miniWin.focus(); return; }
  const display = screen.getPrimaryDisplay();
  const h = miniHeight();
  // Default to the top-right corner (below the menu bar, clear of the Dock, which on most
  // Macs sits at the bottom) rather than bottom-right; once the user drags it, remember
  // that spot for next time instead of resetting to a corner.
  const { x, y } = miniPos ?? {
    x: Math.round(display.workArea.x + display.workArea.width - MINI_W - 16),
    y: Math.round(display.workArea.y + 16)
  };
  miniWin = new BrowserWindow({
    width: MINI_W, height: h, x, y, resizable: false, alwaysOnTop: true, frame: false, hasShadow: true,
    skipTaskbar: true, backgroundColor: '#15161c', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  miniWin.on('moved', () => { if (miniWin) { const b = miniWin.getBounds(); miniPos = { x: b.x, y: b.y }; } });
  win.contentView.removeChildView(player);
  miniWin.contentView.addChildView(player);
  player.webContents.insertCSS(miniCss, { cssOrigin: 'user' }).then(key => { miniCssKey = key; }).catch(() => {});
  layoutMiniPlayer();
  miniWin.webContents.on('console-message', (_event, details) => diagnostic({ type: 'mini-console', level: details.level, message: details.message }));
  miniWin.loadFile('ui/mini.html');
  miniWin.once('ready-to-show', () => miniWin.show());
  miniWin.webContents.once('did-finish-load', () => miniWin?.webContents.send('init-preset', currentPreset));
  // Single cleanup path regardless of how the window goes away (restore button or otherwise).
  miniWin.on('closed', () => {
    miniWin = null; miniVisOn = false;
    if (miniCssKey && player && !player.webContents.isDestroyed()) { player.webContents.removeInsertedCSS(miniCssKey).catch(() => {}); miniCssKey = null; }
    if (win && !win.isDestroyed() && player) {
      win.contentView.addChildView(player);
      win.restore(); win.show(); win.focus();
      win.webContents.send('player-restore');
    }
  });
  win.minimize();
}
function closeMini() {
  if (miniWin && !miniWin.isDestroyed()) miniWin.close();
}
function setMiniVis(on) {
  if (!miniWin) return;
  miniVisOn = on;
  miniWin.setContentSize(MINI_W, miniHeight());
  layoutMiniPlayer();
}
// Sonos itself has no "which room" API surface we hook into; this drives the same real
// "Set <room> as active" buttons the (hidden, in mini mode) System view already has.
// The active room's card is the one Sonos does NOT inline-override back to the idle
// "--activity-default" variable group — everything else gets that override, so its
// absence is what marks the currently-active room in the underlying markup.
function getRooms() {
  if (!player || player.webContents.isDestroyed()) return Promise.resolve({ rooms: [], active: null });
  return player.webContents.executeJavaScript(`(() => {
    const buttons = [...document.querySelectorAll('button[aria-label^="Set "][aria-label$=" as active"]')];
    const name = b => b.getAttribute('aria-label').replace(/^Set /, '').replace(/ as active$/, '');
    const activeBtn = buttons.find(b => !(b.parentElement.getAttribute('style') || '').includes('--activity-default'));
    return { rooms: buttons.map(name), active: activeBtn ? name(activeBtn) : null };
  })()`).catch(() => ({ rooms: [], active: null }));
}
function selectRoom(label) {
  if (!player || player.webContents.isDestroyed()) return;
  const wanted = `Set ${label} as active`;
  const code = `(() => { const want = ${JSON.stringify(wanted)}; const b = [...document.querySelectorAll('button[aria-label]')].find(el => el.getAttribute('aria-label') === want); if (b) b.click(); return !!b; })()`;
  player.webContents.executeJavaScript(code).catch(() => {});
}
let currentPreset = null;
function createWindow() {
  win = new BrowserWindow({width: 1440, height: 940, minWidth: 1080, minHeight: 720, backgroundColor: '#16171d', title: 'Sonos Amp', titleBarStyle: 'hiddenInset', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }});
  const account = session.fromPartition('persist:sonos');
  account.setUserAgent(account.getUserAgent().replace(/\sElectron\/\S+/g, '').replace(/\ssonos-amp\/\S+/gi, '').replace(/\sSonosAmp\/\S+/gi, '')); 
  account.setPermissionRequestHandler((_w, permission, callback) => { require('node:fs').appendFileSync('/private/tmp/sonos-amp-diagnostic.log',JSON.stringify({type:'permission-request',permission})+'\n'); callback(false); });
  account.setPermissionCheckHandler((_w, permission) => { require('node:fs').appendFileSync('/private/tmp/sonos-amp-diagnostic.log',JSON.stringify({type:'permission-check',permission})+'\n'); return false; });
  player = new WebContentsView({ webPreferences: { session: account, sandbox: true, contextIsolation: true, nodeIntegration: false }});
  win.contentView.addChildView(player);
  player.setBackgroundColor('#111111');
  const external = url => { if (/^https:\/\//.test(url)) shell.openExternal(url); };
  const protect = contents => {
    contents.on('will-navigate', (event, url) => { if (!isSonosURL(url)) { event.preventDefault(); external(url); } });
    contents.setWindowOpenHandler(({url}) => {
      if (isSonosURL(url)) return {action: 'allow', overrideBrowserWindowOptions: {webPreferences: {session: account, sandbox: true, contextIsolation: true, nodeIntegration: false, preload: undefined}}};
      external(url); return {action: 'deny'};
    });
    contents.on('did-create-window', child => protect(child.webContents));
  };
  protect(player.webContents);
  // Diagnostic messages deliberately omit request headers, bodies, and query strings.
  player.webContents.debugger.attach('1.3');
  player.webContents.debugger.sendCommand('Network.enable');
  player.webContents.debugger.on('message', (_event, method, params) => { if(method === 'Network.webSocketFrameError') diagnostic({type:'websocket-error',error:params.errorMessage}); if(method === 'Network.webSocketHandshakeResponseReceived') diagnostic({type:'websocket-handshake',status:params.response.status,statusText:params.response.statusText}); });
  player.webContents.on('console-message', (_event, details) => diagnostic({type:'console', level:details.level, message:details.message?.replace(/(https?:\/\/[^\s?]+)\?[^\s]+/g, '$1?[redacted]')}));
  win.webContents.on('console-message', (_event, details) => diagnostic({type:'main-console', level: details.level, message: details.message}));
  account.webRequest.onCompleted(details => {if(details.statusCode >= 400) {const u=new URL(details.url); diagnostic({type:'http',status:details.statusCode,url:u.origin+u.pathname});}});
  account.webRequest.onErrorOccurred(details => {const u=new URL(details.url); diagnostic({type:'network',error:details.error,url:u.origin+u.pathname});});

  const theme = require('node:fs').readFileSync(path.join(__dirname, 'ui/sonos-theme.css'), 'utf8');
  player.webContents.on('did-finish-load', () => player.webContents.insertCSS(theme, { cssOrigin: 'user' }).catch(() => {}));

  const status = message => { if (win && !win.isDestroyed()) win.webContents.send('player-status', message); };
  player.webContents.on('did-start-loading', () => status('Connecting to Sonos…'));
  player.webContents.on('did-stop-loading', () => status('Sonos web player'));
  player.webContents.on('did-fail-load', (_e, code, description, _url, mainFrame) => { if (mainFrame && code !== -3) status('Connection failed. Use Reload to retry.'); });
  player.webContents.on('render-process-gone', () => status('Player stopped. Use Reload to retry.'));
  // Main and mini windows each run their own independent visualizer + mic capture (each
  // is its own renderer process, so audio can't be shared between them) — both need this.
  const isOwnWindow = contents => contents === win.webContents || (miniWin && contents === miniWin.webContents);
  win.webContents.session.setPermissionCheckHandler((contents, permission, origin, details) => isOwnWindow(contents) && permission === 'media' && details?.mediaType === 'audio');
  win.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => callback(isOwnWindow(contents) && permission === 'media' && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio'));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.loadFile('ui/index.html');
  player.webContents.loadURL(home).catch(() => status('Connection failed. Use Reload to retry.'));
  win.on('closed', () => { if (miniWin && !miniWin.isDestroyed()) miniWin.close(); if (!player.webContents.isDestroyed()) player.webContents.close(); win = null; });
}
ipcMain.on('player-bounds', (event, bounds) => {
  if (miniWin || !win || event.sender !== win.webContents || !bounds || !['x','y','width','height'].every(key => Number.isFinite(bounds[key]))) return;
  const [w,h] = win.getContentSize();
  player.setBounds({x: Math.max(0,Math.round(bounds.x)), y: Math.max(0,Math.round(bounds.y)), width: Math.max(0,Math.min(w,Math.round(bounds.width))), height: Math.max(0,Math.min(h,Math.round(bounds.height)))});
  player.setVisible(bounds.width > 0 && bounds.height > 0);
});
ipcMain.on('player-action', (event, action) => {
  const fromMain = win && event.sender === win.webContents;
  const fromMini = miniWin && event.sender === miniWin.webContents;
  if (!fromMain && !fromMini) return;
  if (action === 'reload') player.webContents.reload();
  if (action === 'home') player.webContents.loadURL(home).catch(() => {});
  if (action === 'browser') shell.openExternal(home);
  if (action === 'mini' && fromMain) openMini();
  if (action === 'restore' && fromMini) closeMini();
  if (action === 'mini-vis-on' && fromMini) setMiniVis(true);
  if (action === 'mini-vis-off' && fromMini) setMiniVis(false);
});
ipcMain.handle('mini-get-rooms', (event) => {
  if (!miniWin || event.sender !== miniWin.webContents) return [];
  return getRooms();
});
ipcMain.on('mini-select-room', (event, label) => {
  if (!miniWin || event.sender !== miniWin.webContents || typeof label !== 'string') return;
  selectRoom(label);
});
ipcMain.on('preset-changed', (event, name) => {
  if (!win || event.sender !== win.webContents || typeof name !== 'string') return;
  currentPreset = name;
});
app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{role:'appMenu'}, {role:'editMenu'}, {label:'View', submenu:[{role:'togglefullscreen'},{role:'reload'},{role:'toggleDevTools'}]}, {role:'windowMenu'}]));
  createWindow(); app.on('activate', () => { if (!win) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
