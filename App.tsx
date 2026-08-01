import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DroneController from './DroneController';

export default function App() {
  return (
    <SafeAreaProvider>
      <DroneController />
    </SafeAreaProvider>
  );
}