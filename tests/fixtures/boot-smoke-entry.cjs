/**
 * Electron entry for tests/unit/boot-smoke.test.ts.
 *
 * Boots the BUILT main bundle and prints what a live app must have — a window
 * and the IPC handlers behind it. Patching has to happen before the require:
 * the bundle wires everything up at import time.
 */

const { app, dialog, ipcMain, BrowserWindow } = require('electron')

// First launch asks to install the privileged helper and awaits the answer,
// which would hang a headless run. "Cancel" (response 1) lets the boot go on.
dialog.showMessageBox = async () => ({ response: 1 })

// The dev renderer at localhost:5173 is not running under test, so the built
// bundle's fire-and-forget loadURL always rejects. Nothing else here is async.
process.on('unhandledRejection', () => {})

require(process.env.LATCH_SMOKE_MAIN)

app.whenReady().then(() => {
  const deadline = Date.now() + 10_000

  const report = () => {
    // ipcMain.handle() channels live in a private map — eventNames() only lists
    // .on() listeners. Reaching in is fine for a smoke test: nothing public
    // reports them, and the test fails loudly if the field ever goes away.
    const channels = [...(ipcMain._invokeHandlers?.keys() ?? [])]
    process.stdout.write(
      `\nLATCH_SMOKE ${JSON.stringify({ windows: BrowserWindow.getAllWindows().length, channels })}\n`,
    )
    app.exit(0)
  }

  // The bundle finishes booting across a few awaits, so poll rather than guess
  // a tick count; a boot that never makes a window reports the empty truth.
  const poll = () => {
    if (BrowserWindow.getAllWindows().length > 0 || Date.now() > deadline) return report()
    setTimeout(poll, 50)
  }
  poll()
})
