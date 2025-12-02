#!/bin/bash

# Get the root directory of the repository
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🧪 Testing Window Routing Fix"
echo "================================"
echo ""

echo "✅ Phase 1: Check tauri.conf.json has URLs"
echo "Settings window URL:"
grep -A 10 '"label": "settings"' "${REPO_ROOT}/src-tauri/tauri.conf.json" | grep '"url"' || echo "❌ NOT FOUND"

echo "Debug console window URL:"
grep -A 10 '"label": "debug-console"' "${REPO_ROOT}/src-tauri/tauri.conf.json" | grep '"url"' || echo "❌ NOT FOUND"

echo ""
echo "✅ Phase 2: Check main.tsx has window label detection"
echo "Looking for getCurrentWebviewWindow import:"
grep -n "getCurrentWebviewWindow" "${REPO_ROOT}/src/main.tsx" || echo "❌ NOT FOUND"

echo "Looking for getWindowLabel function:"
grep -n "getWindowLabel" "${REPO_ROOT}/src/main.tsx" || echo "❌ NOT FOUND"

echo "Looking for window label routing:"
grep -n "windowLabel ===" "${REPO_ROOT}/src/main.tsx" || echo "❌ NOT FOUND"

echo ""
echo "✅ Phase 3: Check App.tsx has enhanced createWindowAtomic"
echo "Looking for enhanced logging:"
grep -n "Creating window" "${REPO_ROOT}/src/App.tsx" || echo "❌ NOT FOUND"

echo ""
echo "🎯 Testing Instructions:"
echo "1. Open ReMedia application (should be running on http://localhost:1420)"
echo "2. Open browser developer tools"
echo "3. Try opening settings window"
echo "4. Try opening debug console window"
echo "5. Check console logs for:"
echo "   - 'ReMedia starting'"
echo "   - '- pathname: [value]'"
echo "   - '- window label: [value]'"
echo "   - '✓ Rendering [Component] component'"
echo ""
echo "🔍 Expected behavior:"
echo "- Settings window should show SettingsWindow component"
echo "- Debug console should show DebugConsole component"
echo "- Main window should show App component"
echo "- Each window should log its label and pathname"