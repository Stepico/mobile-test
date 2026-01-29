const path = require('path');
const fs = require('fs');

// Визначаємо шлях до app bundle
// Пріоритет: IOS_APP_PATH env var > workspace relative path
const iosAppPath = process.env.IOS_APP_PATH ||
    path.join(__dirname, 'ios-app', 'DiiaOpenSource.app');
const iosBundleId = process.env.IOS_BUNDLE_ID || 'ua.gov.diia.opensource.app';
const iosDeviceName = process.env.IOS_DEVICE_NAME || 'iPhone 16 Pro';
const iosPlatformVersion = process.env.IOS_PLATFORM_VERSION || '18.5';

// Перевірка існування app bundle з детальним повідомленням
if (!fs.existsSync(iosAppPath)) {
    const resolvedPath = path.resolve(iosAppPath);
    const workspacePath = process.env.GITHUB_WORKSPACE || __dirname;
    throw new Error(
        `iOS app not found at "${resolvedPath}".\n` +
        `Workspace: ${workspacePath}\n` +
        `Set IOS_APP_PATH environment variable or ensure app is built to ./ios-app/DiiaOpenSource.app\n` +
        `In CI, run: bash scripts/ios/build-app.sh`
    );
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

exports.config = {
    //
    // ====================
    // Runner Configuration
    // ====================
    runner: 'local',
    port: 4723,
    //
    // ==================
    // Specify Test Files
    // ==================
    specs: [
        './test/specs/iOS/**/*.js'
    ],
    exclude: [],
    //
    maxInstances: 1,
    //
    // iOS capabilities
    capabilities: [{
        platformName: 'iOS',
        'appium:deviceName': iosDeviceName,
        'appium:platformVersion': iosPlatformVersion,
        ...(process.env.IOS_DEVICE_UDID ? { 'appium:udid': process.env.IOS_DEVICE_UDID } : {}),
        'appium:automationName': 'XCUITest',
        'appium:app': path.resolve(iosAppPath),
        'appium:bundleId': iosBundleId,
        'appium:noReset': false,
        'appium:fullReset': false,  // Full reset to clean state before tests
        'appium:wdaLaunchTimeout': 60000,
        'appium:newCommandTimeout': 1800, // 30 minutes timeout for long-running tests
        'appium:showXcodeLog': true,
        'appium:useSimpleBuildTest': true
    }],

    //
    // ===================
    // Test Configurations
    // ===================
    logLevel: 'info',
    bail: 0,
    waitforTimeout: 10000,
    connectionRetryTimeout: process.env.CI ? 180000 : 120000, // Збільшений timeout для CI
    connectionRetryCount: 2,
    services: ['appium'],
    framework: 'mocha',
    reporters: ['spec'],

    before: function (capabilities, specs) {
        ensureDir('./artifacts/screenshots');
        ensureDir('./artifacts/pagesources');
    },

    afterTest: async function (test, context, { passed }) {
        if (!passed) {
            const safeName = test.title.replace(/\s+/g, '_');
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
        // Перший прохід авторизації іноді триває довше (BankID + PIN)
        timeout: 180000
    },
}
