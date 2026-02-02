const path = require('path');
const fs = require('fs');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

exports.config = {
    runner: 'local',
    port: 4723,
    specs: [
        './test/specs/**/*.js'
    ],
    exclude: [
        ...(process.env.SKIP_AUTH_TESTS === 'true' 
            ? ['./test/specs/Android/auth.e2e.js'] 
            : [])
    ],
    maxInstances: 1,
    capabilities: [{
        platformName: 'Android',
        'appium:deviceName': 'emulator-5554',
        'appium:automationName': 'UiAutomator2',
        'appium:app': path.resolve('./app/diia-debug.apk'),
        'appium:autoGrantPermissions': true,
        'appium:noReset': false
      }],
    logLevel: 'info',
    bail: 0,
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,
    services: ['appium'],
    framework: 'mocha',
    reporters: ['spec'],

    before: function (capabilities, specs) {
        ensureDir('./artifacts/screenshots');
        ensureDir('./artifacts/pagesources');
    },

    afterTest: async function (test, context, { passed }) {
        if (!passed) {
            const safeName = test.title
                .replace(/\s+/g, '_')
                .replace(/["'`]/g, '')
                .replace(/[\\/:*?<>|]/g, '_')
                .replace(/[()[\]{}]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '');
            const timestamp = Date.now();

            const screenshotPath = `./artifacts/screenshots/${safeName}-${timestamp}.png`;

            await driver.saveScreenshot(screenshotPath);
        }
    },

    mochaOpts: {
        ui: 'bdd',
        timeout: 360000
    },
}
