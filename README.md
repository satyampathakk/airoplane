# ESP32 Drone Controller - React Native Expo App

This is a mobile application for controlling ESP32-based drones using gyroscope and manual controls.

## Features

- **IP Configuration Screen**: Enter ESP32 IP address and port
- **Gyroscope Control**: Use phone's gyroscope for steering control
- **Manual Throttle Control**: Vertical slider for throttle (0-255)
- **Takeoff/Arm Button**: Toggle takeoff/arming state
- **Emergency Stop**: Immediate power cut
- **Advanced Settings**: Configure sensitivity, deadzone, tolerance
- **Real-time Telemetry**: Display gyroscope data and flight parameters

## Setup Instructions

### 1. Install Dependencies

```bash
cd airoplane
npm install
```

### 2. Run the App

```bash
# Start Expo development server
npm start

# Scan QR code with Expo Go app on your phone
# or use the following:

# Android
npm run android

# iOS (requires macOS)
npm run ios

# Web
npm run web
```

### 3. Connect to ESP32

1. Make sure your ESP32 is running the drone control firmware
2. Ensure ESP32 is connected to the same WiFi network as your phone
3. Enter the ESP32's IP address (default: `192.168.1.18`)
4. Enter the UDP port (default: `4210`)
5. Click "Connect & Fly"

## ESP32 Configuration

The app sends data in the format: `THROTTLE,STEERING,TAKEOFF`

- **Throttle**: 0-255 (motor power)
- **Steering**: -100 to 100 (roll control from gyroscope)
- **Takeoff**: 0 or 1 (takeoff/arming state)

## Controls

### Flight Screen
- **Gyroscope**: Tilt phone left/right to steer (requires permission)
- **Throttle Slider**: Drag vertical slider to adjust power
- **ARM Button**: Arm motors for takeoff
- **EMERGENCY STOP**: Immediately cut all power

### Settings
- **Gyro Sensitivity**: Adjust gyroscope responsiveness
- **Deadzone**: Ignore small gyroscope movements
- **Tolerance**: Smoothing factor for gyroscope inputs
- **Update Rate**: How often to send commands (20-100ms)

## Technical Details

- Built with React Native & Expo
- Uses Expo Sensors for gyroscope access
- Dark theme UI with flight control aesthetics
- Cross-platform: iOS, Android, Web

## Permissions

The app requires:
- Gyroscope access (for flight control)
- Network access (for ESP32 communication)

## Troubleshooting

1. **Gyroscope not working**: Check app permissions, enable gyroscope in settings
2. **Connection failed**: Verify ESP32 IP address and network connection
3. **App crashes on start**: Clear Expo Go cache or reinstall dependencies
4. **Controls unresponsive**: Check throttle is not at 0%

## ESP32 Code

Your ESP32 should:
1. Create UDP socket on port 4210
2. Parse incoming data: `throttle,steering,takeoff`
3. Convert values to motor controls
4. Implement safety timeout (stop if no data received)

## License

MIT