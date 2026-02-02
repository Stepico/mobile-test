const path = require('path');
const fs = require('fs');

const iosAppPath = process.env.IOS_APP_PATH ||
    path.join(__dirname, 'ios-app', 'DiiaOpenSource.app');
const iosBundleId = process.env.IOS_BUNDLE_ID || 'ua.gov.diia.opensource.app';
const iosDeviceName = process.env.IOS_DEVICE_NAME || 'iPhone 16 Pro';
const iosPlatformVersion = process.env.IOS_PLATFORM_VERSION || '18.2';

if (!fs.existsSync(iosAppPath)) {
    throw new Error(
        `iOS app not found.\n` +
        `Set IOS_APP_PATH or build the app (e.g. bash scripts/ios/build-app.sh).`
    );
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

exports.config = {
    runner: 'local',
    port: 4723,
    specs: [
        './test/specs/iOS/**/*.js'
    ],
    exclude: [
        ...(process.env.SKIP_AUTH_TESTS === 'true' 
            ? ['./test/specs/iOS/authentication.e2e.js'] 
            : []),
        ...(process.env.SKIP_DOCS_TESTS === 'true' 
            ? ['./test/specs/iOS/documents.e2e.js'] 
            : [])
    ],
    maxInstances: 1,
    capabilities: [{
        platformName: 'iOS',
        'appium:deviceName': iosDeviceName,
        'appium:platformVersion': iosPlatformVersion,
        ...(process.env.IOS_DEVICE_UDID ? { 'appium:udid': process.env.IOS_DEVICE_UDID } : {}),
        'appium:automationName': 'XCUITest',
        'appium:app': path.resolve(iosAppPath),
        'appium:bundleId': iosBundleId,
        'appium:noReset': process.env.CI ? true : false,
        'appium:fullReset': false,
        'appium:wdaLaunchTimeout': process.env.CI ? 300000 : 120000,
        'appium:wdaConnectionTimeout': 180000,
        'appium:wdaStartupRetries': 4,
        'appium:wdaStartupRetryInterval': 20000,
        'appium:newCommandTimeout': 1800,
        'appium:iosInstallPause': 8000,
        'appium:autoAcceptAlerts': true,
        'appium:shouldTerminateApp': false,
        'appium:showXcodeLog': !process.env.CI,
        'appium:skipLogCapture': process.env.CI,
        'appium:useSimpleBuildTest': true
    }],

    logLevel: 'info',
    bail: 0,
    waitforTimeout: process.env.CI ? 20000 : 10000,
    connectionRetryTimeout: process.env.CI ? 600000 : 120000,
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
            const sourcePath = `./artifacts/pagesources/${safeName}-${timestamp}.xml`;

            await driver.saveScreenshot(screenshotPath);

            const source = await driver.getPageSource();
            fs.writeFileSync(sourcePath, source);
        }
    },

    mochaOpts: {
        ui: 'bdd',
        timeout: 180000
    },
}
