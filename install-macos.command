#!/bin/bash
set -euo pipefail
source_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
extension_root="$HOME/Library/Application Support/Adobe/CEP/extensions"
destination="$extension_root/com.kinetic.panel"
for item in CSXS/manifest.xml index.html js/bridge.js js/core.js js/panel.js css/panel.css jsx/kinetic.jsx; do
  if [ ! -f "$source_dir/$item" ]; then echo "Missing $item. Extract the complete ZIP first."; exit 1; fi
done
if [ -e "$destination" ]; then
  echo "Kinetic already exists at $destination. Close After Effects and move that exact folder elsewhere as a backup first."
  exit 1
fi
mkdir -p "$destination"
for item in CSXS css js jsx index.html; do cp -R "$source_dir/$item" "$destination/"; done
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
echo "Installed Kinetic to $destination"
echo 'Enabled CEP 12 developer mode for this user (unsigned extensions).'
echo 'Restart After Effects 2025/2026, then open Window > Extensions > Kinetic.'
