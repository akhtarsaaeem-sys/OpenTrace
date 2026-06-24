# OpenTrace ✏️

**Observe. Extract. Create.**  
OpenTrace is a digital lightbox and tracing utility built for artists. It uses your device's camera as a background while overlaying reference images, allowing you to trace directly onto paper with perfect proportions. 

![App Screenshot]<img width="1080" height="2340" alt="WhatsApp Image 2026-06-24 at 8 15 56 PM" src="https://github.com/user-attachments/assets/e6b72d24-c996-44df-9ae3-fc7606aae1ac" />


## ✨ Features

* 📸 **Live Camera Background:** Trace your digital reference directly onto your physical sketchbook using the device's rear camera.
* 🎛️ **Image Processing:** Instantly convert any image into **Grayscale** or a high-contrast **Stencil** to make tracing line-art drastically easier. Includes a threshold slider for fine-tuning detail.
* ✋ **Infinite Gesture Engine:** A custom-built multi-touch `PanResponder` that allows for flawlessly smooth dragging and massive pinch-to-zoom freedom (up to 4000%).
* 🔒 **Canvas Lock:** Instantly freeze your zoom and pan gestures so you don't accidentally move the reference image while drawing.
* 💡 **Always Awake:** A dedicated toggle to prevent your phone screen from dimming or turning off during long drawing sessions.
* 👁️ **Zen Mode:** Hide the entire user interface to maximize your drawing workspace.
* 🔄 **Workspace Tools:** Adjust image transparency on the fly, mirror/flip references, and rotate images with single-tap buttons.

## 🛠️ Tech Stack

* **Framework:** [React Native](https://reactnative.dev/)
* **Build System:** [Expo](https://expo.dev/) / EAS
* **Key Packages:** 
  * `expo-camera` (Background view)
  * `expo-image-picker` (Gallery access)
  * `expo-keep-awake` (Screen lock)
  * `react-native-webview` (Hidden HTML5 Canvas for heavy image filtering)

## 🚀 How to Run Locally

If you want to clone this repository and run it on your own machine:

1. **Install dependencies:**
```bash
   npm install
```
Start the Expo server:

```Bash
   npx expo start -c
```
Run on your phone:
Scan the generated QR code using the Expo Go app on Android or iOS.

📦 Building the APK (Android)
This project is configured to be built locally via Expo Application Services (EAS) without requiring a strict Git history. To build an installable .apk file for your phone:

```Bash
set EAS_NO_VCS=1 && eas build -p android --profile preview
```
## 📥 Download the App
**[Download the latest Android APK here!](https://github.com/akhtarsaaeem-sys/OpenTrace/releases/latest)**

*(Note: Your phone may ask you to allow installations from unknown sources, as this is an independent developer build.)*
Created as a personal utility to level up my drawing and coding skills!
