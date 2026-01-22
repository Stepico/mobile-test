## Instruction for Android version of the **Diia Application** (open-source)

---

## Part 1 – Run the app locally

1. Go to [https://github.com/diia-open-source/android-diia](https://github.com/diia-open-source/android-diia)
2. Clone the repository above to your device
3. Open the project folder in **VS Code** or any other text editor
4. Search for all **`2oss`** occurrences in the code
5. Replace them with **`s`**
6. Save the project
7. Install **Android Studio**
8. Open the project (from step 6) inside Android Studio
9. Create a virtual device (in case there is none)
   *Note:* Testing occurred on the **Medium Phone API 36.1**
10. Wait for the project to build and run it

**Expected result at the end of Part 1**
The app is opening in the emulated virtual device.

---

## Part 2 – Set up auto-test framework

11. Verify **Node**

```bash
node -v
npm -v
```

*Note:* In case there is none → install latest versions

12. Verify **Java**

```bash
java -version
```

*Note:* In case it's not installed – you should install it (you can do it here [https://adoptium.net/temurin/releases](https://adoptium.net/temurin/releases)), it was tested under **JDK 17**
*Note:* In case even after installing Java the command `java -version` still returns that the term **`java`** is not recognized, then you need to set environment variables (for User)

### 12.1 Add Java to PATH (User)

Add to **PATH** environment variable the path to the **bin** folder of your Java installation
Example:

```
C:\Program Files\Eclipse Adoptium\jdk-17.0.9-hotspot\bin
```

### 12.2 Add JAVA_HOME variable (User)

* **Name:** `JAVA_HOME`
* **Value:** `<path_to_your_java>`
  Example:

```
C:\Program Files\Eclipse Adoptium\jdk-17.0.9-hotspot
```

### 12.3 Restart terminal and verify Java again

13. Install test framework and its driver

```bash
npm install -g appium
appium driver install uiautomator2
```

*Note:* In case the second command returns:
`cannot be loaded because running scripts is disabled on this system...`

#### 13.1 Open **PowerShell** (Windows) as **Administrator**

#### 13.2 Execute command:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

*Note:* In case the second command returns:
`A driver named "uiautomator2" is already installed...`
then it means that it's already installed and no need for this command.

14. Clone this repository to your device
15. Install project dependencies

```bash
npm install
```

16. Start Android Emulator (from Android Studio)

17. Confirm device

```bash
adb devices
```

*Note:* In case the output of the command is `adb: command not found`, then you likely need to add it to the **PATH** environment variable (for User)

### 17.1 Open Android Studio → **File → Settings**

### 17.2 In the search bar write **SDK**

### 17.3 Copy the **Android SDK Location** and add `\platform-tools` at the end

Example:

```
C:\Users\<your_user>\AppData\Local\Android\Sdk\platform-tools
```

### 17.4 After saving changes restart Android Studio and all terminals

---

## Part 3 – Run tests locally

18. Make sure **Appium server** is running

```bash
appium
```

19. Run tests

```bash
npx wdio run wdio.conf.js
```

*Note:* In case you encounter error:
`ERROR webdriver: WebDriverError: Neither ANDROID_HOME nor ANDROID_SDK_ROOT environment variable was exported`

Then you should set them as environment variables (for User)

### 19.1 Add variable

* **Name:** `ANDROID_HOME`
* **Value:** `<value_from_step_17.3_without_platform_tools>`

### 19.2 Add variable

* **Name:** `ANDROID_SDK_ROOT`
* **Value:** `<value_from_step_17.3_without_platform_tools>`

### 19.3 Restart terminal
