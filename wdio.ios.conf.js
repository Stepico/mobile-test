const path = require('path');
const fs = require('fs');

// Визначаємо шлях до app bundle
// Пріоритет: IOS_APP_PATH env var > workspace relative path
const iosAppPath = process.env.IOS_APP_PATH ||
    path.join(__dirname, 'ios-app', 'DiiaOpenSource.app');
const iosBundleId = process.env.IOS_BUNDLE_ID || 'ua.gov.diia.opensource.app';
const iosDeviceName = process.env.IOS_DEVICE_NAME || 'iPhone 16 Pro';
// Локально використовуємо 18.2 (типово є в Xcode); в CI задається IOS_PLATFORM_VERSION (наприклад 18.5)
const iosPlatformVersion = process.env.IOS_PLATFORM_VERSION || '18.2';

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
    // Limit parallel test execution
    // In CI: Run 1 at a time to avoid overloading (large app)
    // Locally: Can run 1 at a time for stability
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
        // In CI: Use noReset to skip reinstall if app already installed (faster)
        // Locally: Keep noReset false for fresh install each time
        'appium:noReset': process.env.CI ? true : false,
        'appium:fullReset': false,
        
        // WebDriverAgent timeouts (increased for large app in CI)
        'appium:wdaLaunchTimeout': process.env.CI ? 300000 : 120000, // 5 min CI, 2 min local
        'appium:wdaConnectionTimeout': 180000, // 3 minutes to establish connection
        'appium:wdaStartupRetries': 4,
        'appium:wdaStartupRetryInterval': 20000,
        
        // Command timeouts
        'appium:newCommandTimeout': 1800, // 30 minutes timeout for long-running tests
        
        // Installation and launch optimizations
        'appium:iosInstallPause': 8000, // 8 second pause after app install
        'appium:autoAcceptAlerts': true,
        'appium:shouldTerminateApp': false, // Keep app running between tests
        
        // Logging
        'appium:showXcodeLog': !process.env.CI, // Disable verbose logs in CI
        'appium:skipLogCapture': process.env.CI, // Skip log capture in CI for performance
        'appium:useSimpleBuildTest': true
    }],

    //
    // ===================
    // Test Configurations
    // ===================
    logLevel: 'info',
    bail: 0,
    waitforTimeout: 10000,
    // Increased timeouts for large app (111MB) installation and launch
    connectionRetryTimeout: process.env.CI ? 600000 : 120000, // 10 minutes CI, 2 minutes local
    connectionRetryCount: 3, // Try 3 times before giving up
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
