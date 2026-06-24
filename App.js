import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, Dimensions, ActivityIndicator, Animated, PanResponder, TouchableWithoutFeedback } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { activateKeepAwakeAsync, deactivateKeepAwakeAsync } from 'expo-keep-awake';

const { width, height } = Dimensions.get('window');

export default function App() {
  const [appState, setAppState] = useState('splash');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [rawImageUri, setRawImageUri] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [currentMode, setCurrentMode] = useState('original'); 
  const [opacity, setOpacity] = useState(0.5);
  const [threshold, setThreshold] = useState(40); 
  
  const [isMirrored, setIsMirrored] = useState(false);
  const [rotation, setRotation] = useState(0); 
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [hideUI, setHideUI] = useState(false);
  
  const [isAwake, setIsAwake] = useState(false); 
  const [isLocked, setIsLocked] = useState(false); // THE SAFE LOCK RETURNS
  
  const webViewRef = useRef(null);

  // --- GESTURE ENGINE ---
  const pan = useRef(new Animated.ValueXY()).current;
  const scale = useRef(new Animated.Value(1)).current;
  const baseScale = useRef(1);
  const initialDistance = useRef(null);
  const isLockedRef = useRef(isLocked);

  // Keep the ref synced so the gesture engine knows exactly when to freeze
  useEffect(() => { 
    isLockedRef.current = isLocked; 
  }, [isLocked]);

  const calcDistance = (touches) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      
      onPanResponderGrant: () => {
        pan.setOffset({ x: pan.x._value, y: pan.y._value });
        pan.setValue({ x: 0, y: 0 });
        initialDistance.current = null; 
      },
      onPanResponderMove: (evt, gestureState) => {
        // SAFE LOCK: Instantly ignore all touches if the padlock is closed
        if (isLockedRef.current) return; 

        const touches = evt.nativeEvent.touches;
        
        if (touches.length >= 2) {
          const distance = calcDistance(touches);
          if (initialDistance.current === null) {
            initialDistance.current = distance;
          } else {
            const scaleFactor = distance / initialDistance.current;
            let newScale = baseScale.current * scaleFactor;
            newScale = Math.max(0.05, Math.min(newScale, 40)); 
            scale.setValue(newScale);
          }
        } 
        else if (touches.length === 1 && initialDistance.current === null) {
          pan.setValue({ x: gestureState.dx, y: gestureState.dy });
        }
      },
      onPanResponderRelease: () => {
        pan.flattenOffset();
        baseScale.current = scale._value; 
        initialDistance.current = null;
      }
    })
  ).current;

  // --- APP INITIALIZATION ---
  useEffect(() => {
    setTimeout(() => { setAppState('home'); }, 1500);
  }, []);

  const loadTraceWorkspace = (uri) => {
    setRawImageUri(uri);
    setProcessedImage(null);
    setCurrentMode('original');
    
    pan.setValue({ x: 0, y: 0 }); pan.setOffset({ x: 0, y: 0 });
    scale.setValue(1); baseScale.current = 1;
    
    setHideUI(false); setIsMirrored(false); setRotation(0); setIsLocked(false);
    setAppState('tracing');
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: false, quality: 0.8 });
    if (!result.canceled) { loadTraceWorkspace(result.assets[0].uri); }
  };

  const changeMode = async (mode) => {
    if (!rawImageUri || isProcessing || mode === currentMode) return;
    setCurrentMode(mode);
    if (mode === 'original') return;
    setIsProcessing(true);
    try {
      const base64Str = await FileSystem.readAsStringAsync(rawImageUri, { encoding: 'base64' });
      const fullDataUri = `data:image/jpeg;base64,${base64Str}`;
      webViewRef.current.injectJavaScript(`window.processNewImage("${fullDataUri}", ${threshold}, "${mode}"); true;`);
    } catch (error) { setIsProcessing(false); }
  };

  const updateDetail = (newThreshold) => {
    setThreshold(newThreshold);
    if (currentMode === 'stencil' && webViewRef.current) {
      setIsProcessing(true);
      webViewRef.current.injectJavaScript(`window.updateThreshold(${newThreshold}); true;`);
    }
  };

  const toggleAwake = async () => {
    if (isAwake) {
      await deactivateKeepAwakeAsync();
      setIsAwake(false);
    } else {
      await activateKeepAwakeAsync();
      setIsAwake(true);
    }
  };

  const handleMessageFromProcessor = (event) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'PROCESSING_COMPLETE') {
      setProcessedImage(data.uri);
      setIsProcessing(false);
    }
  };

  const hiddenProcessorHTML = `
    <html><body><canvas id="canvas"></canvas><script>
      let img = new Image(); let currentThreshold = 40; let processMode = 'stencil';
      window.processNewImage = function(uri, initialThreshold, targetMode) {
        currentThreshold = initialThreshold; processMode = targetMode;
        img.src = uri; img.onload = () => { applyFilter(); };
      };
      window.updateThreshold = function(newThreshold) { currentThreshold = newThreshold; applyFilter(); };
      function applyFilter() {
        const canvas = document.getElementById('canvas'); const ctx = canvas.getContext('2d');
        const maxDim = 800; let w = img.width; let h = img.height;
        if (w > maxDim || h > maxDim) { if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; } else { w = Math.round((w * maxDim) / h); h = maxDim; } }
        canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
        try {
          const imgData = ctx.getImageData(0, 0, w, h); const data = imgData.data; const output = ctx.createImageData(w, h); const outData = output.data;
          if (processMode === 'grayscale') {
            for (let i = 0; i < data.length; i += 4) {
              let gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
              outData[i] = gray; outData[i+1] = gray; outData[i+2] = gray; outData[i+3] = data[i+3];
            }
          } else if (processMode === 'stencil') {
            const getGray = (x, y) => { const i = (y * w + x) * 4; return 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]; };
            for (let y = 1; y < h - 1; y++) {
              for (let x = 1; x < w - 1; x++) {
                const idx = (y * w + x) * 4;
                const gx = -1*getGray(x-1,y-1) + 1*getGray(x+1,y-1) - 2*getGray(x-1,y) + 2*getGray(x+1,y) - 1*getGray(x-1,y+1) + 1*getGray(x+1,y+1);
                const gy = -1*getGray(x-1,y-1) - 2*getGray(x,y-1) - 1*getGray(x+1,y-1) + 1*getGray(x-1,y+1) + 2*getGray(x,y+1) + 1*getGray(x+1,y+1);
                const edge = Math.sqrt(gx*gx + gy*gy);
                if (edge > currentThreshold) { outData[idx] = 0; outData[idx+1] = 0; outData[idx+2] = 0; outData[idx+3] = 255; } 
                else { outData[idx+3] = 0; }
              }
            }
          }
          ctx.putImageData(output, 0, 0);
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PROCESSING_COMPLETE', uri: canvas.toDataURL('image/png') }));
        } catch (e) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PROCESSING_COMPLETE', uri: img.src })); }
      }
    </script></body></html>
  `;

  if (appState === 'splash') {
    return (
      <View style={styles.splashContainer}>
        <Ionicons name="pencil" size={80} color="#00E676" />
        <Text style={styles.splashTitle}>OpenTrace</Text>
        <Text style={styles.splashTagline}>Observe. Extract. Create.</Text>
      </View>
    );
  }

  if (appState === 'home') {
    return (
      <View style={styles.homeContainer}>
        <View style={styles.homeHeader}>
          <Text style={styles.homeTitle}>OpenTrace</Text>
        </View>

        <View style={styles.homeContent}>
          <Text style={styles.sectionTitle}>Start Tracing</Text>
          <TouchableOpacity style={styles.largeNewButton} onPress={() => { requestCameraPermission(); pickImage(); }}>
            <Ionicons name="add-circle" size={60} color="#00E676" />
            <Text style={styles.largeNewButtonText}>Open Gallery</Text>
            <Text style={styles.largeNewButtonSub}>Select an image from your device</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const displayImage = currentMode === 'original' ? rawImageUri : processedImage;

  return (
    <View style={styles.container}>
      
      {cameraPermission?.granted ? (
         <CameraView style={StyleSheet.absoluteFillObject} facing="back" />
      ) : (
         <View style={styles.centeredContainer}><Text style={styles.text}>Camera access required.</Text></View>
      )}

      {displayImage && (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.gestureBoundary,
            { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: scale }] }
          ]}
        >
          <Image
            source={{ uri: displayImage }}
            style={[
              styles.overlayImage, 
              { opacity: opacity, transform: [{ scaleX: isMirrored ? -1 : 1 }, { rotate: `${rotation}deg` }] }
            ]}
            resizeMode="contain"
          />
        </Animated.View>
      )}

      {!hideUI && (
        <>
          <View style={styles.topLeftTools}>
            
            {/* BACK BUTTON */}
            <TouchableOpacity style={styles.toolBtnPill} onPress={() => {
              if(isAwake) { deactivateKeepAwakeAsync(); setIsAwake(false); }
              setAppState('home');
            }}>
              <Ionicons name="arrow-back" size={18} color="#FFF" />
              <Text style={styles.toolBtnText}>Home</Text>
            </TouchableOpacity>

            {/* SCREEN WAKE BUTTON */}
            <TouchableOpacity style={[styles.toolBtnPill, isAwake && { borderColor: '#00E676' }]} onPress={toggleAwake}>
              <Ionicons name={isAwake ? "bulb" : "bulb-outline"} size={18} color={isAwake ? "#00E676" : "#FFF"} />
              <Text style={[styles.toolBtnText, isAwake && { color: '#00E676' }]}>
                {isAwake ? "Screen On" : "Screen Off"}
              </Text>
            </TouchableOpacity>

            {/* LOCK BUTTON */}
            <TouchableOpacity style={[styles.toolBtnPill, isLocked && { borderColor: '#FF1744' }]} onPress={() => setIsLocked(!isLocked)}>
              <Ionicons name={isLocked ? "lock-closed" : "lock-open-outline"} size={18} color={isLocked ? "#FF1744" : "#FFF"} />
              <Text style={[styles.toolBtnText, isLocked && { color: '#FF1744' }]}>
                {isLocked ? "Locked" : "Unlocked"}
              </Text>
            </TouchableOpacity>

          </View>

          <View style={styles.topRightTools}>
            {/* HIDE UI BUTTON */}
            <TouchableOpacity style={[styles.toolBtnPill, { backgroundColor: '#FF8A00', borderColor: '#FF8A00' }]} onPress={() => setHideUI(true)}>
              <Ionicons name="eye-off-outline" size={18} color="#FFF" />
              <Text style={styles.toolBtnText}>Hide UI</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* WAKE UI BUTTON */}
      {hideUI && (
        <View style={styles.topRightTools}>
          <TouchableOpacity style={[styles.toolBtnPill, { backgroundColor: 'rgba(20,20,20,0.6)' }]} onPress={() => setHideUI(false)}>
            <Ionicons name="eye-outline" size={18} color="#FFF" />
            <Text style={styles.toolBtnText}>Show UI</Text>
          </TouchableOpacity>
        </View>
      )}

      {isProcessing && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00E676" />
          <Text style={styles.loadingText}>Processing...</Text>
        </View>
      )}

      <View style={styles.hiddenWorker} pointerEvents="none">
        <WebView ref={webViewRef} originWhitelist={['*']} source={{ html: hiddenProcessorHTML }} onMessage={handleMessageFromProcessor} javaScriptEnabled={true} />
      </View>

      {!hideUI && (
        <View style={styles.controlPanel}>
          
          {currentMode === 'stencil' && (
             <View style={styles.sliderContainer}>
               <Text style={styles.sliderLabel}>Line Detail Filter</Text>
               <Slider style={styles.slider} minimumValue={15} maximumValue={100} value={threshold} onSlidingComplete={updateDetail} minimumTrackTintColor="#00E676" maximumTrackTintColor="#FFFFFF" thumbTintColor="#00E676" />
             </View>
          )}

          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>Transparency: {Math.round(opacity * 100)}%</Text>
            <Slider style={styles.slider} minimumValue={0.05} maximumValue={0.95} value={opacity} onValueChange={setOpacity} minimumTrackTintColor="#00E676" maximumTrackTintColor="#FFFFFF" thumbTintColor="#00E676" />
          </View>

          <View style={styles.modeRow}>
            <TouchableOpacity style={[styles.modeButton, currentMode === 'original' && styles.activeModeButton]} onPress={() => changeMode('original')}>
              <Text style={styles.buttonText}>Original</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modeButton, currentMode === 'grayscale' && styles.activeModeButton]} onPress={() => changeMode('grayscale')}>
              <Text style={styles.buttonText}>Grayscale</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modeButton, currentMode === 'stencil' && styles.activeModeButton]} onPress={() => changeMode('stencil')}>
              <Text style={styles.buttonText}>Stencil</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionButton} onPress={pickImage}>
              <Text style={styles.buttonText}>Load New</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionButton, isMirrored && styles.activeActionButton]} onPress={() => setIsMirrored(!isMirrored)}>
              <Text style={styles.buttonText}>Flip</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={() => setRotation((prev) => prev + 90)}>
              <Text style={styles.buttonText}>Rotate</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#FF1744' }]} onPress={() => { 
              setRawImageUri(null); setProcessedImage(null); setCurrentMode('original'); setRotation(0); setIsMirrored(false); setIsLocked(false);
            }}>
              <Text style={styles.buttonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' },
  splashTitle: { color: '#FFF', fontSize: 36, fontWeight: 'bold', marginTop: 15, letterSpacing: 1 },
  splashTagline: { color: '#00E676', fontSize: 14, marginTop: 10, letterSpacing: 2, textTransform: 'uppercase' },

  homeContainer: { flex: 1, backgroundColor: '#0A0A0A', paddingTop: Constants.statusBarHeight },
  homeHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  homeTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  homeContent: { flex: 1, paddingHorizontal: 20, paddingTop: 40, alignItems: 'center' },
  sectionTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20, width: '100%', textAlign: 'left' },
  
  largeNewButton: { width: '100%', backgroundColor: '#1A1A1A', borderRadius: 20, padding: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#333', borderStyle: 'dashed' },
  largeNewButtonText: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginTop: 15 },
  largeNewButtonSub: { color: '#666', fontSize: 14, marginTop: 8 },

  container: { flex: 1, backgroundColor: '#000' },
  centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A', padding: 20 },
  text: { color: '#888', textAlign: 'center', fontSize: 16 },
  
  gestureBoundary: { position: 'absolute', top: 0, left: 0, width: width, height: height, zIndex: 1, justifyContent: 'center', alignItems: 'center' },
  overlayImage: { width: '100%', height: '100%' },
  
  topLeftTools: { position: 'absolute', top: Constants.statusBarHeight + 15, left: 15, flexDirection: 'column', gap: 10, zIndex: 5, alignItems: 'flex-start' },
  topRightTools: { position: 'absolute', top: Constants.statusBarHeight + 15, right: 15, zIndex: 5 },
  
  // NEW PILL BUTTON DESIGN
  toolBtnPill: { flexDirection: 'row', backgroundColor: 'rgba(20,20,20,0.85)', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 25, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center', gap: 8 },
  toolBtnText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },

  hiddenWorker: { position: 'absolute', top: -1000, left: -1000, width: 10, height: 10, zIndex: -1, opacity: 0 },
  loadingContainer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  loadingText: { color: '#FFF', marginTop: 15, fontWeight: 'bold', fontSize: 16 },
  
  controlPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(20, 20, 20, 0.95)', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 15, paddingHorizontal: 10, alignItems: 'center', zIndex: 5, paddingBottom: 45 },
  
  sliderContainer: { width: '100%', marginBottom: 10, alignItems: 'center' },
  sliderLabel: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
  slider: { width: '90%', height: 35 },
  
  modeRow: { flexDirection: 'row', justifyContent: 'center', width: '100%', marginBottom: 10, gap: 10 },
  actionRow: { flexDirection: 'row', justifyContent: 'center', width: '100%', gap: 10 },
  
  modeButton: { backgroundColor: '#333', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#444' },
  activeModeButton: { backgroundColor: '#005f73', borderColor: '#0a9396' },
  
  actionButton: { backgroundColor: '#2A2A2A', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 10, alignItems: 'center' },
  activeActionButton: { backgroundColor: '#00E676' },
  buttonText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
});