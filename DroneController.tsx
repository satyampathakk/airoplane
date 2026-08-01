import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
  PanResponder,
  Switch,
  GestureResponderEvent,
  LayoutChangeEvent,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Gyroscope } from 'expo-sensors';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const SLIDER_THUMB_SIZE = 22;

type ControlMode = 'gyro' | 'slider';
type Screen = 'setup' | 'flying' | 'settings';

interface SettingsState {
  ipAddress: string;
  port: number;
  gyroSensitivity: number;
  deadzone: number;
  tolerance: number;
  controlMode: ControlMode;
  useAutoTakeoff: boolean;
  sensorUpdateRate: number;
}

interface FlightState {
  throttle: number;
  steering: number;
  takeoffButton: number;
}

// Design tokens
const C = {
  bg0: '#05070f',
  bg1: '#0b1024',
  bg2: '#111a35',
  card: 'rgba(255,255,255,0.06)',
  cardBorder: 'rgba(255,255,255,0.10)',
  cardBorderStrong: 'rgba(0,224,255,0.35)',
  text: '#EAF2FF',
  textDim: '#8A9BB8',
  textMuted: '#5D6E8A',
  accent: '#00E0FF',
  accentSoft: 'rgba(0,224,255,0.18)',
  success: '#3DDC97',
  danger: '#FF5A6E',
  warn: '#FFB547',
  track: 'rgba(255,255,255,0.08)',
};

// ---------------- Slider Control ----------------
interface SliderControlProps {
  value: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
  orientation?: 'horizontal' | 'vertical';
  style?: any;
  onValueChange: (value: number) => void;
  testID?: string;
}

const SliderControl: React.FC<SliderControlProps> = ({
  value,
  minimumValue,
  maximumValue,
  step,
  orientation = 'horizontal',
  style,
  onValueChange,
  testID,
}) => {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const clamp = (n: number) => Math.max(minimumValue, Math.min(maximumValue, n));
  const snap = (n: number) => Math.round(n / step) * step;

  const updateFromTouch = (x: number, y: number) => {
    const L = layoutRef.current;
    if (L.width === 0 || L.height === 0) return;
    const range = maximumValue - minimumValue;
    const ratio =
      orientation === 'vertical'
        ? 1 - Math.max(0, Math.min(1, y / L.height))
        : Math.max(0, Math.min(1, x / L.width));
    onValueChange(snap(clamp(minimumValue + ratio * range)));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) =>
        updateFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (e: GestureResponderEvent) =>
        updateFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY),
    })
  ).current;

  const range = maximumValue - minimumValue;
  const percent = range <= 0 ? 0 : ((clamp(value) - minimumValue) / range) * 100;

  return (
    <View
      testID={testID}
      style={[
        styles.sliderContainer,
        orientation === 'vertical' && styles.sliderContainerVertical,
        style,
      ]}
      onLayout={(e: LayoutChangeEvent) =>
        setLayout({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
      {...panResponder.panHandlers}
    >
      <View style={styles.sliderTrack}>
        <View
          style={[
            styles.sliderFill,
            orientation === 'vertical'
              ? { height: `${percent}%`, width: '100%' }
              : { width: `${percent}%`, height: '100%' },
          ]}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.sliderThumb,
          orientation === 'vertical'
            ? {
              top: `${100 - percent}%`,
              left: '50%',
              marginLeft: -SLIDER_THUMB_SIZE / 2,
              marginTop: -SLIDER_THUMB_SIZE / 2,
            }
            : {
              left: `${percent}%`,
              top: '50%',
              marginLeft: -SLIDER_THUMB_SIZE / 2,
              marginTop: -SLIDER_THUMB_SIZE / 2,
            },
        ]}
      />
    </View>
  );
};

// ---------------- Steering Slider (center-return, hold-to-steer) ----------------
interface SteeringSliderProps {
  value: number; // -100 .. 100
  onChange: (v: number) => void;
  onRelease: () => void;
  disabled?: boolean;
}

const STEERING_HEIGHT = 72;

const SteeringSlider: React.FC<SteeringSliderProps> = ({
  value,
  onChange,
  onRelease,
  disabled,
}) => {
  const [w, setW] = useState(0);
  const wRef = useRef(w);
  wRef.current = w;
  const holdingRef = useRef(false);

  const compute = (x: number) => {
    const width = wRef.current;
    if (!width) return 0;
    const ratio = Math.max(0, Math.min(1, x / width));
    return Math.round(ratio * 200 - 100); // -100..100
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (e) => {
        holdingRef.current = true;
        onChange(compute(e.nativeEvent.locationX));
      },
      onPanResponderMove: (e) => {
        if (!holdingRef.current) return;
        onChange(compute(e.nativeEvent.locationX));
      },
      onPanResponderRelease: () => {
        holdingRef.current = false;
        onRelease();
      },
      onPanResponderTerminate: () => {
        holdingRef.current = false;
        onRelease();
      },
    })
  ).current;

  const thumbLeft = `${50 + value / 2}%`; // -100 -> 0%, 0 -> 50%, 100 -> 100%
  const fillLeft = value < 0 ? `${50 + value / 2}%` : '50%';
  const fillWidth = `${Math.abs(value) / 2}%`;

  return (
    <View
      style={[styles.steeringWrap, disabled && { opacity: 0.4 }]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      {...pan.panHandlers}
      testID="steering-slider"
    >
      <View style={styles.steeringTrack}>
        <View style={styles.steeringCenterLine} />
        <View
          style={[
            styles.steeringFill,
            { left: fillLeft as any, width: fillWidth as any },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.steeringThumb,
            { left: thumbLeft as any, marginLeft: -18 },
          ]}
        >
          <Ionicons name="swap-horizontal" size={18} color={C.bg0} />
        </View>
      </View>
      <View style={styles.steeringLabelsRow}>
        <Text style={styles.steeringSideLabel}>◀ LEFT</Text>
        <Text style={styles.steeringCenterLabel}>{value}</Text>
        <Text style={styles.steeringSideLabel}>RIGHT ▶</Text>
      </View>
    </View>
  );
};

// ---------------- Main App ----------------
const DroneController: React.FC = () => {
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState<SettingsState>({
    ipAddress: '192.168.1.18',
    port: 4210,
    gyroSensitivity: 50,
    deadzone: 10,
    tolerance: 5,
    controlMode: 'slider',
    useAutoTakeoff: false,
    sensorUpdateRate: 50,
  });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [flightState, setFlightState] = useState<FlightState>({
    throttle: 0,
    steering: 0,
    takeoffButton: 0,
  });
  const flightRef = useRef(flightState);
  flightRef.current = flightState;

  const [screen, setScreen] = useState<Screen>('setup');
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Not connected');
  const [gyroValue, setGyroValue] = useState({ x: 0, y: 0, z: 0 });
  const [currentIP, setCurrentIP] = useState(settings.ipAddress);
  const [toast, setToast] = useState<{ msg: string; kind: 'info' | 'error' | 'success' } | null>(
    null
  );

  const lastSendTime = useRef<number>(0);
  const gyroBufferRef = useRef<number[]>([]);
  const gyroSubscription = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const returnAnim = useRef(new Animated.Value(0)).current;
  const returnListener = useRef<string | null>(null);
  const armedPulse = useRef(new Animated.Value(0)).current;
  const toastAnim = useRef(new Animated.Value(0)).current;
  const isMounted = useRef<boolean>(true);

  // ---------- Toast ----------
  const showToast = (msg: string, kind: 'info' | 'error' | 'success' = 'info') => {
    if (!isMounted.current) return;
    setToast({ msg, kind });
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      if (isMounted.current) {
        setToast(null);
      }
    });
  };

  // ---------- Send flight data ----------
  const sendFlightDataRaw = (throttle: number, steering: number, takeoff: number) => {
    try {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const message = `${throttle},${steering},${takeoff}`;
      ws.send(message);
      lastSendTime.current = Date.now();
    } catch (err) {
      console.error('WS send error:', err);
      // Don't crash the app on WebSocket errors
    }
  };

  const sendFlightData = (throttle: number, steering: number, takeoff: number) => {
    const now = Date.now();
    const rate = settingsRef.current.sensorUpdateRate;
    if (now - lastSendTime.current < rate) return;
    sendFlightDataRaw(throttle, steering, takeoff);
  };

  // ---------- Gyroscope ----------
  const stopGyroscope = () => {
    if (gyroSubscription.current) {
      gyroSubscription.current.remove();
      gyroSubscription.current = null;
    }
    gyroBufferRef.current = [];
  };

  const startGyroscope = () => {
    try {
      stopGyroscope();
      Gyroscope.setUpdateInterval(settingsRef.current.sensorUpdateRate);
      gyroSubscription.current = Gyroscope.addListener((data) => {
        setGyroValue(data);
        const s = settingsRef.current;
        // Roll (X) drives steering. Positive = right, Negative = left.
        let steeringValue = Math.round(data.x * s.gyroSensitivity);
        steeringValue = Math.max(-100, Math.min(100, steeringValue));
        if (Math.abs(steeringValue) < s.deadzone) steeringValue = 0;

        // Smoothing buffer
        gyroBufferRef.current.push(steeringValue);
        if (gyroBufferRef.current.length > 4) gyroBufferRef.current.shift();
        const smoothed = Math.round(
          gyroBufferRef.current.reduce((a, b) => a + b, 0) / gyroBufferRef.current.length
        );

        const currentSteering = flightRef.current.steering;
        if (Math.abs(smoothed - currentSteering) < s.tolerance) return;

        // When drone is not armed, steering should be forced to 0
        const armed = flightRef.current.takeoffButton === 1;
        const safeSteering = armed ? smoothed : 0;

        setFlightState((prev) => ({ ...prev, steering: safeSteering }));
        sendFlightData(flightRef.current.throttle, safeSteering, flightRef.current.takeoffButton);
      });
    } catch (error) {
      console.error('Failed to start gyroscope:', error);
      showToast('Gyroscope not available', 'error');
    }
  };

  // Restart gyro whenever mode/settings that affect it change while flying
  useEffect(() => {
    if (screen !== 'flying' || !isConnected) return;
    if (settings.controlMode === 'gyro') {
      startGyroscope();
    } else {
      stopGyroscope();
      // Reset steering to 0 when switching away from gyro
      if (flightRef.current.steering !== 0) {
        setFlightState((prev) => ({ ...prev, steering: 0 }));
        sendFlightDataRaw(flightRef.current.throttle, 0, flightRef.current.takeoffButton);
      }
    }
    return stopGyroscope;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, isConnected, settings.controlMode, settings.sensorUpdateRate]);

  // ---------- WebSocket ----------
  const initializeConnection = () => {
    setConnectionStatus('Connecting...');
    try {
      const wsUrl = `ws://${currentIP}:${settings.port}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionStatus(`Connected · ${currentIP}:${settings.port}`);
        showToast('Connected to ESP32', 'success');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
        sendFlightDataRaw(0, 0, 0);
      };
      ws.onerror = () => {
        setConnectionStatus('Connection failed');
        setIsConnected(false);
        showToast('Failed to connect to ESP32', 'error');
      };
      ws.onclose = () => {
        setIsConnected(false);
        setConnectionStatus('Disconnected');
        wsRef.current = null;
        stopGyroscope();
      };
      ws.onmessage = () => {
        // ACKs — ignore, keep UI clean
      };
    } catch (err) {
      setConnectionStatus('Connection failed');
      showToast(String(err), 'error');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (wsRef.current) wsRef.current.close();
      stopGyroscope();
      if (returnListener.current) returnAnim.removeListener(returnListener.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Heartbeat (400ms) — ensures ESP32 doesn't timeout ----------
  useEffect(() => {
    if (!isConnected) return;
    const iv = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const f = flightRef.current;
      sendFlightDataRaw(f.throttle, f.steering, f.takeoffButton);
    }, 400); // Send every 400ms (faster than 500ms ESP32 timeout)
    return () => clearInterval(iv);
  }, [isConnected]);

  // ---------- Armed pulse animation ----------
  useEffect(() => {
    if (!isMounted.current) return;

    if (flightState.takeoffButton === 1) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(armedPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(armedPulse, { toValue: 0, duration: 800, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => {
        if (isMounted.current) {
          loop.stop();
        }
      };
    }
    armedPulse.setValue(0);
  }, [flightState.takeoffButton, armedPulse]);

  // ---------- Handlers ----------
  const handleThrottleChange = (value: number) => {
    if (!isMounted.current) return;

    const newThrottle = Math.round(value);

    // Add throttle deadzone - ignore very low values (below 15)
    // This prevents motors from trying to run at too low speeds
    const throttleDeadzone = 15;
    const effectiveThrottle = newThrottle < throttleDeadzone ? 0 : newThrottle;

    // When drone is not armed, throttle should be forced to 0
    const armed = flightRef.current.takeoffButton === 1;
    const safeThrottle = armed ? effectiveThrottle : 0;

    setFlightState((prev) => ({ ...prev, throttle: safeThrottle }));

    // Only send throttle data when armed, otherwise send 0
    sendFlightData(safeThrottle, flightRef.current.steering, flightRef.current.takeoffButton);
  };

  const handleTakeoffPress = () => {
    const next = flightRef.current.takeoffButton === 0 ? 1 : 0;
    const armed = next === 1;

    // When arming, ensure throttle is 0 for safety
    // When disarming, also set throttle to 0
    const safeThrottle = 0;
    const safeSteering = 0;

    setFlightState((prev) => ({ ...prev, throttle: safeThrottle, steering: safeSteering, takeoffButton: next }));

    // Send zero values when arming/disarming for safety
    sendFlightDataRaw(safeThrottle, safeSteering, next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });

    // Show toast for arming status
    if (armed) {
      showToast('Drone armed - Throttle unlocked', 'success');
    } else {
      showToast('Drone disarmed - Motors stopped', 'info');
    }
  };

  const handleEmergencyStop = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => { });
    setFlightState({ throttle: 0, steering: 0, takeoffButton: 0 });
    sendFlightDataRaw(0, 0, 0);
    setConnectionStatus('Emergency Stop · Power Cut');
    showToast('Emergency stop — power cut & disarmed', 'error');
  };

  // Slider steering: hold-to-steer, spring-back on release
  const handleSteeringChange = (v: number) => {
    // cancel any return animation
    returnAnim.stopAnimation();

    // When drone is not armed, steering should be forced to 0
    const armed = flightRef.current.takeoffButton === 1;
    const safeSteering = armed ? v : 0;

    setFlightState((prev) => ({ ...prev, steering: safeSteering }));

    // Only send steering data when armed, otherwise send 0
    sendFlightData(flightRef.current.throttle, safeSteering, flightRef.current.takeoffButton);
  };

  const handleSteeringRelease = () => {
    const startVal = flightRef.current.steering;
    if (startVal === 0) return;
    returnAnim.setValue(startVal);
    if (returnListener.current) returnAnim.removeListener(returnListener.current);
    returnListener.current = returnAnim.addListener(({ value }) => {
      const rounded = Math.round(value);

      // When drone is not armed, steering should be forced to 0
      const armed = flightRef.current.takeoffButton === 1;
      const safeSteering = armed ? rounded : 0;

      setFlightState((prev) =>
        prev.steering === safeSteering ? prev : { ...prev, steering: safeSteering }
      );
      sendFlightData(flightRef.current.throttle, safeSteering, flightRef.current.takeoffButton);
    });
    Animated.timing(returnAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(() => {
      if (returnListener.current) {
        returnAnim.removeListener(returnListener.current);
        returnListener.current = null;
      }
      setFlightState((prev) => ({ ...prev, steering: 0 }));
      sendFlightDataRaw(flightRef.current.throttle, 0, flightRef.current.takeoffButton);
    });
  };

  const handleSettingChange = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    if (key === 'ipAddress') setCurrentIP(value as string);
  };

  const handleConnectAndFly = () => {
    if (!currentIP || !settings.port) {
      showToast('Enter IP and port first', 'error');
      return;
    }
    setSettings((prev) => ({ ...prev, ipAddress: currentIP }));
    setScreen('flying');
    // Small delay so screen mounts before we connect
    setTimeout(initializeConnection, 60);
  };

  const handleDisconnect = () => {
    if (wsRef.current) wsRef.current.close();
    stopGyroscope();
    setFlightState({ throttle: 0, steering: 0, takeoffButton: 0 });
    setScreen('setup');
  };

  // ------------------- UI: Backdrop -------------------
  const Backdrop = () => (
    <>
      <LinearGradient
        colors={[C.bg0, C.bg1, '#0a1230']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={[styles.blob, { top: -80, right: -60, backgroundColor: '#00E0FF' }]} />
      <View style={[styles.blob, { bottom: -120, left: -80, backgroundColor: '#5B8CFF' }]} />
    </>
  );

  // ------------------- Setup Screen -------------------
  const renderSetupScreen = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.setupContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandLogo}>
            <Ionicons name="paper-plane" size={22} color={C.bg0} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandTitle}>SkyLink</Text>
            <Text style={styles.brandSubtitle}>ESP32 Drone Controller</Text>
          </View>
          <Pressable
            testID="open-settings-icon"
            onPress={() => setScreen('settings')}
            style={styles.iconBtn}
            hitSlop={10}
          >
            <Ionicons name="settings-outline" size={20} color={C.text} />
          </Pressable>
        </View>

        <GlassCard>
          <View style={styles.cardHead}>
            <Ionicons name="wifi" size={16} color={C.accent} />
            <Text style={styles.cardTitle}>Network</Text>
          </View>

          <Text style={styles.label}>ESP32 IP Address</Text>
          <TextInput
            testID="ip-input"
            style={styles.input}
            placeholder="192.168.1.18"
            placeholderTextColor={C.textMuted}
            value={currentIP}
            onChangeText={setCurrentIP}
            keyboardType="decimal-pad"
            autoCapitalize="none"
          />

          <Text style={[styles.label, { marginTop: 14 }]}>WebSocket Port</Text>
          <TextInput
            testID="port-input"
            style={styles.input}
            placeholder="4210"
            placeholderTextColor={C.textMuted}
            value={String(settings.port)}
            onChangeText={(t) => handleSettingChange('port', parseInt(t) || 4210)}
            keyboardType="number-pad"
          />

          <Pressable
            testID="connect-and-fly-button"
            onPress={handleConnectAndFly}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="rocket" size={18} color={C.bg0} />
            <Text style={styles.primaryBtnText}>Connect & Fly</Text>
          </Pressable>
        </GlassCard>

        <GlassCard>
          <View style={styles.cardHead}>
            <Ionicons name="game-controller" size={16} color={C.accent} />
            <Text style={styles.cardTitle}>Control Mode</Text>
          </View>
          <SegmentedControl
            value={settings.controlMode}
            options={[
              { key: 'slider', label: 'Slider', icon: 'options' },
              { key: 'gyro', label: 'Gyro', icon: 'phone-portrait' },
            ]}
            onChange={(v) => handleSettingChange('controlMode', v as ControlMode)}
          />
          <Text style={styles.helperText}>
            {settings.controlMode === 'gyro'
              ? 'Tilt your phone left/right (trial) to steer. Sensitivity in Settings.'
              : 'Hold the horizontal slider on the Flying screen. Releases spring back to center.'}
          </Text>
        </GlassCard>

        <GlassCard>
          <View style={styles.cardHead}>
            <Ionicons name="speedometer" size={16} color={C.accent} />
            <Text style={styles.cardTitle}>Quick Tuning</Text>
          </View>

          <TuningRow
            label="Deadzone"
            value={`${settings.deadzone}%`}
            min={0}
            max={30}
            step={1}
            current={settings.deadzone}
            onChange={(v) => handleSettingChange('deadzone', Math.round(v))}
          />
          <TuningRow
            label="Gyro Sensitivity"
            value={String(settings.gyroSensitivity)}
            min={10}
            max={100}
            step={5}
            current={settings.gyroSensitivity}
            onChange={(v) => handleSettingChange('gyroSensitivity', Math.round(v))}
          />
        </GlassCard>

        <Pressable
          testID="advanced-settings-button"
          style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85 }]}
          onPress={() => setScreen('settings')}
        >
          <Ionicons name="options" size={16} color={C.accent} />
          <Text style={styles.secondaryBtnText}>Advanced Settings</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ------------------- Flying Screen -------------------
  const renderFlyingScreen = () => {
    const armed = flightState.takeoffButton === 1;
    const armedGlow = armedPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.9],
    });

    return (
      <View style={[styles.flyingContainer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 10 }]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable testID="disconnect-button" onPress={handleDisconnect} style={styles.chipBtn} hitSlop={10}>
            <Ionicons name="chevron-back" size={16} color={C.text} />
            <Text style={styles.chipBtnText}>Back</Text>
          </Pressable>

          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? (armed ? C.warn : C.success) : C.danger },
              ]}
            />
            <Text style={styles.statusPillText} numberOfLines={1}>
              {armed ? 'ARMED' : connectionStatus}
            </Text>
          </View>

          <View style={[styles.modePill, armed && { backgroundColor: C.warn }]}>
            <Ionicons
              name={settings.controlMode === 'gyro' ? 'phone-portrait' : 'options'}
              size={12}
              color={armed ? '#fff' : C.accent}
            />
            <Text style={[styles.modePillText, armed && { color: '#fff' }]}>
              {armed ? 'ACTIVE' : (settings.controlMode === 'gyro' ? 'GYRO' : 'SLIDER')}
            </Text>
          </View>
        </View>

        {/* Telemetry strip */}
        <View style={styles.telemetryRow}>
          <TelemetryBox
            label="Throttle"
            value={`${Math.round((flightState.throttle / 255) * 100)}%`}
            sub={`${flightState.throttle}/255`}
            icon="flash"
          />
          <TelemetryBox
            label="Steering"
            value={`${flightState.steering}`}
            sub="-100 · +100"
            icon="git-compare"
            highlight={flightState.steering !== 0}
          />
          <TelemetryBox
            label={settings.controlMode === 'gyro' ? 'Gyro X' : 'Mode'}
            value={
              settings.controlMode === 'gyro'
                ? gyroValue.x.toFixed(2)
                : 'HOLD'
            }
            sub={settings.controlMode === 'gyro' ? 'roll' : 'to steer'}
            icon={settings.controlMode === 'gyro' ? 'compass' : 'hand-left'}
          />
        </View>

        {/* Controls area */}
        <View style={styles.controlsRow}>
          {/* Throttle */}
          <View style={[styles.throttleCard, !armed && { opacity: 0.6 }]} testID="throttle-card">
            <View style={styles.throttleHead}>
              <Ionicons name="chevron-up" size={14} color={armed ? C.accent : C.textDim} />
              <Text style={[styles.throttleLabel, { color: armed ? C.accent : C.textDim }]}>
                {armed ? 'Throttle' : 'LOCKED'}
              </Text>
            </View>
            <SliderControl
              testID="throttle-slider"
              style={[styles.verticalSlider, !armed && { opacity: 0.5 }]}
              minimumValue={0}
              maximumValue={255}
              value={flightState.throttle}
              onValueChange={handleThrottleChange}
              step={5}  // Reduced sensitivity - larger steps
              orientation="vertical"
            />
            <View style={styles.throttleFoot}>
              <Text style={styles.throttleFootText}>0</Text>
              <Text style={styles.throttleFootText}>50</Text>
              <Text style={styles.throttleFootText}>100</Text>
            </View>
          </View>

          {/* Right side: actions + steering */}
          <View style={{ flex: 1, gap: 10 }}>
            <Animated.View
              style={[
                styles.armedGlow,
                { opacity: armed ? armedGlow : 0 },
              ]}
              pointerEvents="none"
            />
            <Pressable
              testID="arm-takeoff-button"
              onPress={handleTakeoffPress}
              style={({ pressed }) => [
                styles.armBtn,
                armed && styles.armBtnActive,
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              <Ionicons
                name={armed ? 'rocket' : 'power'}
                size={22}
                color={armed ? C.bg0 : C.accent}
              />
              <Text style={[styles.armBtnText, armed && { color: C.bg0 }]}>
                {armed ? 'TAKING OFF' : 'ARM'}
              </Text>
            </Pressable>

            <Pressable
              testID="emergency-stop-button"
              onPress={handleEmergencyStop}
              style={({ pressed }) => [styles.stopBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="warning" size={20} color="#fff" />
              <Text style={styles.stopBtnText}>EMERGENCY STOP</Text>
            </Pressable>

            {/* Steering: slider (hold) or gyro (visual) */}
            <View style={styles.steeringCard}>
              <View style={styles.steeringHeadRow}>
                <Ionicons name="git-compare" size={14} color={C.accent} />
                <Text style={styles.steeringHeadText}>
                  {settings.controlMode === 'slider' ? 'Steering · Hold to steer' : 'Steering · Gyro'}
                </Text>
              </View>
              {settings.controlMode === 'slider' ? (
                <SteeringSlider
                  value={flightState.steering}
                  onChange={handleSteeringChange}
                  onRelease={handleSteeringRelease}
                />
              ) : (
                <View style={styles.gyroVisual}>
                  <View style={styles.gyroVisualTrack}>
                    <View style={styles.gyroVisualCenter} />
                    <View
                      style={[
                        styles.gyroVisualThumb,
                        { left: `${50 + flightState.steering / 2}%`, marginLeft: -12 },
                      ]}
                    />
                  </View>
                  <Text style={styles.gyroVisualHint}>Tilt phone left / right</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  // ------------------- Settings Screen -------------------
  const renderSettingsScreen = () => (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.setupContent, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.brandRow}>
        <Pressable
          testID="back-to-setup-button"
          onPress={() => setScreen('setup')}
          style={styles.iconBtn}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandTitle}>Advanced Settings</Text>
          <Text style={styles.brandSubtitle}>Tune sensors and flight behavior</Text>
        </View>
      </View>

      <GlassCard>
        <View style={styles.cardHead}>
          <Ionicons name="game-controller" size={16} color={C.accent} />
          <Text style={styles.cardTitle}>Control Mode</Text>
        </View>
        <SegmentedControl
          value={settings.controlMode}
          options={[
            { key: 'slider', label: 'Slider', icon: 'options' },
            { key: 'gyro', label: 'Gyro (Trial)', icon: 'phone-portrait' },
          ]}
          onChange={(v) => handleSettingChange('controlMode', v as ControlMode)}
        />
      </GlassCard>

      <GlassCard>
        <View style={styles.cardHead}>
          <Ionicons name="pulse" size={16} color={C.accent} />
          <Text style={styles.cardTitle}>Sensor Tuning</Text>
        </View>
        <TuningRow
          label="Gyro Sensitivity"
          value={String(settings.gyroSensitivity)}
          min={10}
          max={100}
          step={5}
          current={settings.gyroSensitivity}
          onChange={(v) => handleSettingChange('gyroSensitivity', Math.round(v))}
        />
        <TuningRow
          label="Deadzone"
          value={`${settings.deadzone}%`}
          min={0}
          max={30}
          step={1}
          current={settings.deadzone}
          onChange={(v) => handleSettingChange('deadzone', Math.round(v))}
        />
        <TuningRow
          label="Tolerance"
          value={`${settings.tolerance}%`}
          min={0}
          max={20}
          step={1}
          current={settings.tolerance}
          onChange={(v) => handleSettingChange('tolerance', Math.round(v))}
        />
        <TuningRow
          label="Update Rate"
          value={`${settings.sensorUpdateRate}ms`}
          min={20}
          max={100}
          step={10}
          current={settings.sensorUpdateRate}
          onChange={(v) => handleSettingChange('sensorUpdateRate', Math.round(v))}
        />
      </GlassCard>

      <GlassCard>
        <View style={styles.cardHead}>
          <Ionicons name="sparkles" size={16} color={C.accent} />
          <Text style={styles.cardTitle}>Features</Text>
        </View>

        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Auto-Takeoff Mode</Text>
            <Text style={styles.rowSub}>
              ESP32 injects minimum lift throttle when armed
            </Text>
          </View>
          <Switch
            testID="auto-takeoff-switch"
            value={settings.useAutoTakeoff}
            onValueChange={(v) => handleSettingChange('useAutoTakeoff', v)}
            trackColor={{ true: C.accentSoft, false: C.track }}
            thumbColor={settings.useAutoTakeoff ? C.accent : '#c7d0e0'}
          />
        </View>
      </GlassCard>

      <Pressable
        testID="save-settings-button"
        onPress={() => setScreen('setup')}
        style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.secondaryBtnText}>Done</Text>
      </Pressable>
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg0 }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <Backdrop />
      <SafeAreaView
        style={{ flex: 1 }}
        edges={screen === 'flying' ? ['left', 'right'] : ['top', 'left', 'right']}
      >
        {screen === 'setup' && renderSetupScreen()}
        {screen === 'flying' && renderFlyingScreen()}
        {screen === 'settings' && renderSettingsScreen()}
      </SafeAreaView>

      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              bottom: insets.bottom + 24,
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [30, 0],
                  }),
                },
              ],
              borderColor:
                toast.kind === 'error'
                  ? C.danger
                  : toast.kind === 'success'
                    ? C.success
                    : C.accent,
            },
          ]}
          testID="toast"
        >
          <Ionicons
            name={
              toast.kind === 'error'
                ? 'alert-circle'
                : toast.kind === 'success'
                  ? 'checkmark-circle'
                  : 'information-circle'
            }
            size={16}
            color={
              toast.kind === 'error'
                ? C.danger
                : toast.kind === 'success'
                  ? C.success
                  : C.accent
            }
          />
          <Text style={styles.toastText}>{toast.msg}</Text>
        </Animated.View>
      )}
    </View>
  );
};

// -------- Small subcomponents --------
const GlassCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.glassCard}>
    <BlurView tint="dark" intensity={22} style={StyleSheet.absoluteFillObject} />
    <View style={styles.glassCardInner}>{children}</View>
  </View>
);

const SegmentedControl: React.FC<{
  value: string;
  options: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[];
  onChange: (v: string) => void;
}> = ({ value, options, onChange }) => (
  <View style={styles.segment}>
    {options.map((opt) => {
      const active = opt.key === value;
      return (
        <Pressable
          key={opt.key}
          testID={`segment-${opt.key}`}
          onPress={() => onChange(opt.key)}
          style={[styles.segmentItem, active && styles.segmentItemActive]}
        >
          <Ionicons name={opt.icon} size={14} color={active ? C.bg0 : C.textDim} />
          <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const TuningRow: React.FC<{
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, current, onChange }) => (
  <View style={{ marginBottom: 14 }}>
    <View style={styles.rowBetween}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
    <SliderControl
      style={styles.slider}
      minimumValue={min}
      maximumValue={max}
      step={step}
      value={current}
      onValueChange={onChange}
    />
  </View>
);

const TelemetryBox: React.FC<{
  label: string;
  value: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  highlight?: boolean;
}> = ({ label, value, sub, icon, highlight }) => (
  <View style={[styles.telBox, highlight && styles.telBoxActive]}>
    <View style={styles.telHead}>
      <Ionicons name={icon} size={12} color={highlight ? C.accent : C.textDim} />
      <Text style={styles.telLabel}>{label}</Text>
    </View>
    <Text style={styles.telValue}>{value}</Text>
    <Text style={styles.telSub}>{sub}</Text>
  </View>
);

// -------- Styles --------
const styles = StyleSheet.create({
  container: { flex: 1 },
  setupContent: { paddingHorizontal: 20, paddingTop: 8 },

  blob: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 260,
    opacity: 0.14,
  },

  // Brand
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 22,
  },
  brandLogo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  brandSubtitle: {
    color: C.textDim,
    fontSize: 13,
    marginTop: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: C.cardBorder,
  },

  // Glass card
  glassCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.card,
  },
  glassCardInner: { padding: 18 },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  label: {
    color: C.textDim,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
  },

  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnText: {
    color: C.bg0,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: C.cardBorderStrong,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    backgroundColor: 'rgba(0,224,255,0.04)',
  },
  secondaryBtnText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  helperText: {
    color: C.textDim,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
  },

  // Rows
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rowLabel: { color: C.text, fontSize: 14, fontWeight: '600' },
  rowSub: { color: C.textDim, fontSize: 12, marginTop: 2 },
  rowValue: { color: C.accent, fontSize: 13, fontWeight: '700' },

  // Segmented
  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 9,
    gap: 6,
  },
  segmentItemActive: {
    backgroundColor: C.accent,
  },
  segmentText: {
    color: C.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: C.bg0,
    fontWeight: '700',
  },

  // Slider
  sliderContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  sliderContainerVertical: { alignItems: 'center' },
  sliderTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.track,
    borderRadius: 999,
    overflow: 'hidden',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    backgroundColor: C.accent,
    borderRadius: 999,
  },
  sliderThumb: {
    position: 'absolute',
    width: SLIDER_THUMB_SIZE,
    height: SLIDER_THUMB_SIZE,
    borderRadius: SLIDER_THUMB_SIZE / 2,
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: C.accent,
  },
  slider: { width: '100%', height: 34, marginTop: 6 },

  // Flying
  flyingContainer: {
    flex: 1,
    paddingHorizontal: 14,
    gap: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  chipBtnText: { color: C.text, fontWeight: '600', fontSize: 13 },
  statusPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusPillText: {
    color: C.text,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.accentSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorderStrong,
  },
  modePillText: {
    color: C.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  telemetryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  telBox: {
    flex: 1,
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  telBoxActive: {
    borderColor: C.cardBorderStrong,
    backgroundColor: 'rgba(0,224,255,0.06)',
  },
  telHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  telLabel: {
    color: C.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  telValue: {
    color: C.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  telSub: { color: C.textMuted, fontSize: 10, marginTop: 2 },

  controlsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  throttleCard: {
    width: 110,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: 'center',
  },
  throttleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  throttleLabel: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  verticalSlider: {
    width: 44,
    flex: 1,
    minHeight: 200,
  },
  throttleFoot: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  throttleFootText: { color: C.textMuted, fontSize: 10, fontWeight: '600' },

  armBtn: {
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 2,
    borderColor: C.accent,
    backgroundColor: 'rgba(0,224,255,0.06)',
  },
  armBtnActive: {
    backgroundColor: C.accent,
  },
  armBtnText: {
    color: C.accent,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.6,
  },
  armedGlow: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 20,
    backgroundColor: C.accent,
    opacity: 0.4,
  },
  stopBtn: {
    backgroundColor: C.danger,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  stopBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.6,
  },

  // Steering slider (hold-to-steer)
  steeringCard: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: C.cardBorder,
    flex: 1,
    justifyContent: 'center',
  },
  steeringHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  steeringHeadText: {
    color: C.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  steeringWrap: {},
  steeringTrack: {
    height: STEERING_HEIGHT / 2,
    backgroundColor: C.track,
    borderRadius: STEERING_HEIGHT / 4,
    position: 'relative',
    overflow: 'visible',
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  steeringCenterLine: {
    position: 'absolute',
    left: '50%',
    top: 4,
    bottom: 4,
    width: 2,
    marginLeft: -1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 1,
  },
  steeringFill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    backgroundColor: C.accent,
    borderRadius: STEERING_HEIGHT / 4,
    opacity: 0.55,
  },
  steeringThumb: {
    position: 'absolute',
    top: -6,
    width: 36,
    height: STEERING_HEIGHT / 2 + 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  steeringLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  steeringSideLabel: {
    color: C.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  steeringCenterLabel: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '800',
  },

  // Gyro visual (read-only)
  gyroVisual: { alignItems: 'center' },
  gyroVisualTrack: {
    width: '100%',
    height: 24,
    borderRadius: 12,
    backgroundColor: C.track,
    borderWidth: 1,
    borderColor: C.cardBorder,
    position: 'relative',
  },
  gyroVisualCenter: {
    position: 'absolute',
    left: '50%',
    top: 4,
    bottom: 4,
    width: 2,
    marginLeft: -1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 1,
  },
  gyroVisualThumb: {
    position: 'absolute',
    top: -2,
    width: 24,
    height: 28,
    borderRadius: 8,
    backgroundColor: C.accent,
    borderWidth: 2,
    borderColor: '#fff',
  },
  gyroVisualHint: {
    color: C.textDim,
    fontSize: 11,
    marginTop: 8,
  },

  // Toast
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(10,14,35,0.95)',
    borderWidth: 1,
  },
  toastText: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
});

export default DroneController;
