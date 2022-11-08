/**
 *
 * =====================================================================================
 *  =  ====  ===================  ====  ===================     ==  =====================
 *  =  ===  ====================  ===  ===================  ===  =  =====================
 *  =  ==  =====================  ==  ===================  =======  =================  ==
 *  =  =  =====   ===   ==    ==  =  =====   ==  =  =====  =======  =  ==   ==  = ==    =
 *  =     ====  =  =  =  =  =  =     ====  =  =  =  =====  =======  ====  =  =     ==  ==
 *  =  ==  ===     =     =  =  =  ==  ===     ==    =====  =======  =  =     =  =  ==  ==
 *  =  ===  ==  ====  ====    ==  ===  ==  =======  =====  =======  =  =  ====  =  ==  ==
 *  =  ====  =  =  =  =  =  ====  ====  =  =  =  =  ======  ===  =  =  =  =  =  =  ==  ==
 *  =  ====  ==   ===   ==  ====  ====  ==   ===   ========     ==  =  ==   ==  =  ==   =
 *  =====================================================================================
 *  KeepKey client
 *    - A companion application for the keepkey device
 *
 *  Features:
 *    * KeepKey bridge (express server on port: localhost:1646
 *    * invocation support (web app pairing similar UX to BEX embedding like Metamask)
 *
 *
 *  Notes:
 *    This will "pair" a users wallet with the pioneer api.
 *      Note: This is exporting a pubkey wallet of the users connected wallet and storing it service side
 *
 *    This pubkey wallet is also available to be read by any paired apikey
 *              (generally stored in an Web Applications local storage).
 *
 *    paired API keys allow any application to request payments from the users wallet
 *      * all payment requests are queued in this main process
 *          and must receive manual user approval before signing
 *
 *    P.S. use a keepkey!
 *                                                -Highlander
 */

import path from 'path'
import isDev from 'electron-is-dev'
import log from 'electron-log'
import { app, BrowserWindow, nativeTheme, ipcMain, shell } from 'electron'
import AutoLaunch from 'auto-launch'
import * as Sentry from "@sentry/electron";
import { config as dotenvConfig } from 'dotenv'
import { queueIpcEvent, startTcpBridge, stopBridge } from './bridge'
import { shared } from './shared'
import { isWin, ALLOWED_HOSTS } from './constants'
import { db } from './db'
import { Settings } from './settings'
import { setupAutoUpdater, skipUpdateCheckCompleted } from './updater'
import fs from 'fs'
import { CONNECTED, DISCONNECTED, HARDWARE_ERROR, KKStateController, PLUGIN } from './bridge/kk-state-controller'
import { createAndUpdateTray } from './tray'
import { BridgeLogger } from './bridge/logger'

dotenvConfig()

log.transports.file.level = "debug";
setupAutoUpdater()

Sentry.init({ dsn: process.env.SENTRY_DSN });

export const settings = new Settings()
export const bridgeLogger = new BridgeLogger()

// dont allow muliple windows to open
if (!app.requestSingleInstanceLock()) app.quit()

export let shouldShowWindow = false;

export const windows: {
    mainWindow: undefined | BrowserWindow,
    splash: undefined | BrowserWindow
} = {
    mainWindow: undefined,
    splash: undefined
}

export const kkAutoLauncher = new AutoLaunch({
    name: 'KeepKey Desktop'
})

try {
    if (isWin && nativeTheme.shouldUseDarkColors === true) {
        // require('fs').unlinkSync(require('path').join(app.getPath('userData'), 'DevTools Extensions'))
        fs.unlinkSync(require('path').join(app.getPath('userData'), 'DevTools Extensions'))
    }
} catch (_) { }

if (process.defaultApp) {
    app.setAsDefaultProtocolClient('keepkey')
}

const onKKStateChange = async (eventName: string, args: any) => {
    // try to start the tcp bridge if not already running
    if (eventName === CONNECTED) await startTcpBridge()
    else if (eventName === DISCONNECTED || eventName === HARDWARE_ERROR) await stopBridge()
    createAndUpdateTray()
    return queueIpcEvent(eventName, args)
}

export const kkStateController = new KKStateController(onKKStateChange)
// send a plugin event if its not unplugged
if (kkStateController.lastState !== 'DISCONNECTED')
    queueIpcEvent(PLUGIN, {})


export const createWindow = () => new Promise<boolean>(async (resolve, reject) => {
    //Auto launch on startup
    if (!isDev && settings.shouldAutoLunch) {
        kkAutoLauncher.enable()
        kkAutoLauncher
            .isEnabled()
            .then(function (isEnabled) {
                if (isEnabled) {
                    return
                }
                kkAutoLauncher.enable()
            })
    }

    try {
        await kkStateController.syncState()
    } catch (e: any) {
        if (e.toString().includes('claimInterface error')) {
            windows?.splash?.webContents.send("@update/errorClaimed")
            await new Promise(() => 0)
        } else {
            windows?.splash?.webContents.send("@update/errorReset")
            await new Promise(() => 0)
        }
    }


    if (settings.shouldAutoStartBridge) await startTcpBridge(settings.bridgeApiPort)

    windows.mainWindow = new BrowserWindow({
        focusable: true,
        width: isDev ? 1960 : 960,
        height: 780,
        show: false,
        backgroundColor: 'white',
        autoHideMenuBar: true,
        webPreferences: {
            webviewTag: true,
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true
        }
    })

    if (isDev) windows.mainWindow.webContents.openDevTools()

    const startURL = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../../build/index.html')}`

    windows.mainWindow.loadURL(startURL)

    windows.mainWindow.removeAllListeners('closed')
    windows.mainWindow.removeAllListeners('ready-to-show')

    windows.mainWindow.on('closed', () => {
        if (windows.mainWindow) {
            windows.mainWindow.destroy()
            windows.mainWindow = undefined
        }
    })

    windows.mainWindow.once('ready-to-show', () => {
        shouldShowWindow = true;
        if (skipUpdateCheckCompleted) windows.mainWindow?.show()
    });

    db.findOne({ type: 'user' }, (err, doc) => {
        if (doc) shared.USER = doc.user
    })

    windows.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        let urlObj = new URL(url);
        let urlHost = urlObj.hostname;
        if (ALLOWED_HOSTS.includes(urlHost)) return { action: 'allow' }
        shell.openExternal(url);
        return { action: 'deny' }
    })

    windows.mainWindow.webContents.on("will-navigate", (event, url) => {
        let urlObj = new URL(url);
        let urlHost = urlObj.hostname;
        if (!ALLOWED_HOSTS.includes(urlHost)) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });
})

app.on("second-instance", async () => {
    if (windows.mainWindow) {
        if (windows.mainWindow.isDestroyed()) {
            await createWindow();
        } else if (windows.mainWindow.isMinimized()) {
            windows.mainWindow.restore();
        }
        windows.mainWindow.focus();
    } else {
        await createWindow();
    }
});

app.on('window-all-closed', () => {
    if (!settings.shouldMinimizeToTray) app.quit()
})

app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", bridgeLogger.saveLogs)

// C:\Users\amito\AppData\Local\Programs\keepkey-desktop\resources\app.asar\electron\dist
log.info("__dirname", __dirname)
ipcMain.on('@app/get-asset-url', (event, data) => {
    const assetUrl = !isDev ? `file://${path.resolve(__dirname, "../../build/", data.assetPath)}` : data.assetPath
    event.sender.send(`@app/get-asset-url-${data.nonce}`, { nonce: data.nonce, assetUrl })
})

ipcMain.on("@app/version", (event, _data) => {
    event.sender.send("@app/version", app.getVersion());
})

ipcMain.on("@app/pairings", (_event, _data) => {
    db.find({ type: 'pairing' }, (err, docs) => {
        if (windows.mainWindow && !windows.mainWindow.isDestroyed())
            windows.mainWindow.webContents.send("@app/pairings", docs)
    })
})

ipcMain.on("@walletconnect/pairing", (event, data) => {
    db.findOne({
        type: 'pairing', serviceName: data.serviceName,
        serviceHomePage: data.serviceHomePage,
        pairingType: 'walletconnect'
    }, (err, doc) => {
        if (doc) {
            db.update({
                type: 'pairing', serviceName: data.serviceName,
                serviceHomePage: data.serviceHomePage,
                pairingType: 'walletconnect'
            }, {
                type: 'pairing',
                addedOn: Date.now(),
                serviceName: data.serviceName,
                serviceImageUrl: data.serviceImageUrl,
                serviceHomePage: data.serviceHomePage,
                pairingType: 'walletconnect'
            })
        } else {
            db.insert({
                type: 'pairing',
                addedOn: Date.now(),
                serviceName: data.serviceName,
                serviceImageUrl: data.serviceImageUrl,
                serviceHomePage: data.serviceHomePage,
                pairingType: 'walletconnect'
            })
        }
    })
})
