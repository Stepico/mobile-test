Part 1 - Run the app locally

1. Go to https://github.com/diia-open-source/android-diia
2. Clone the repository above to your device
3. Open the project folder in VS Code or any other text editor
4. Search for all '2oss' occurences in the code
5. Replace them with 's'
6. Save the project
7. Install Android Studio
8. Open the project (from step 6) inside Android Studio
9. Create a virtual device (in case there is none)
   *Note* Testing occured on the Medium Phone API 36.1
10. Wait for the project to build and run it

Expected result at the end of Part 1 - The app is opening in the emulated virtual device

Part 2 - Set up auto-test framework

11. Verify Node
    node -v
    npm -v
    *Note* In case there is none -> install latest versions
12. Verify java
    java -version
    *Note* In case it's not installed - you should install it (you can do it here https://adoptium.net/temurin/releases), it was tested under JDK 17
    *Note* in case even after installing Java command java -version still returns that the term 'java' is not recognized, then you need to set environment variables (for User)
    12.1 Add to PATH environment variable (for User) the path to the bin folder to your java (in my case it's C:\Program Files\Eclipse Adoptium\jdk-17.0.9-hotspot\bin)
    12.2 Add new environment variable (for User)
         Name: JAVA_HOME
         Value: <path_to_your_java> (in my case it's C:\Program Files\Eclipse Adoptium\jdk-17.0.9-hotspot)
    12.3 Restart terminal and verify java
13. Install test framework and its driver using
    npm install -g appium
    appium driver install uiautomator2
    *Note* in case second command returns 'cannot be loaded because running scripts is disabled on this system...' you should do the following
    13.1 Open the Powershell (if on Windows) as Administrator
    13.2 Execute command: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
    *Note in case second command returns 'A driver named "uiautomator2" is already installed. Did you mean to update? Run "appium driver update". See installed drivers with "appium driver list --installed".' then it means that it's already installed and no need for this command
14. Clone this repository to your device
15. Install project dependencies
    npm install
16. [NOT NEEDED] Initialiaze Node project
    npm init -y
17. [NOT NEEDED] Install test runner
    npm install webdriverio @wdio/cli --save-dev
18. [NOT NEEDED] Initialize webdriver
    npx wdio config
19. Start Android Emulator (From Android Studio)
20. Confirm device
    adb devices
    *Note* In case the output of the command is adb: command not found then likely you need to set it to the PATH environment variable (for User)
    19.1 In Android Studio File → Settings
    19.2 In the search bar write 'SDK'
    19.3 Copy the Android SDK Location and add \platform-tools at the end, so it results to something like this C:\Users\<your_user>\AppData\Local\Android\Sdk\platform-tools
    19.4 After saving changes restart Android Studio and all terminals

Part 3 - Run tests locally
20. Make sure appium server is running
    appium
21. Run tests
    npx wdio run wdio.conf.js
    *Note* In case you encounter error 'ERROR webdriver: WebDriverError: Neither ANDROID_HOME nor ANDROID_SDK_ROOT environment variable was exported' then you should set them as environment variables (for User)
    21.1 Add a variable with Name: ANDROID_HOME and Value: <value_from_step_19.3_without_platform_tools>
    21.2 Add a variable with Name: ANDROID_SDK_ROOT and Value: <value_from_step_19.3_without_platform_tools>
    21.3 Restart terminal
