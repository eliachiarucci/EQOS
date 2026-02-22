#!/bin/bash
# Patches the Electron dev binary's Info.plist to enable system audio capture
# (needed for the frequency analyzer via AudioTee / Core Audio Taps)

PLIST="node_modules/electron/dist/Electron.app/Contents/Info.plist"

if [ -f "$PLIST" ]; then
  /usr/libexec/PlistBuddy -c "Print :NSAudioCaptureUsageDescription" "$PLIST" 2>/dev/null
  if [ $? -ne 0 ]; then
    /usr/libexec/PlistBuddy -c "Add :NSAudioCaptureUsageDescription string 'EQOS captures system audio to display a real-time frequency analyzer on the EQ graph.'" "$PLIST"
    echo "Patched Electron Info.plist with NSAudioCaptureUsageDescription"
  fi
fi
