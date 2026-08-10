#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
tauri_config="$project_dir/src-tauri/tauri.conf.json"
package_manifest="$project_dir/package.json"
cargo_manifest="$project_dir/src-tauri/Cargo.toml"

fail() {
  echo "release verification failed: $*" >&2
  exit 1
}

assert_equal() {
  local label="$1"
  local actual="$2"
  local expected="$3"

  if [[ "$actual" != "$expected" ]]; then
    fail "$label is '$actual'; expected '$expected'"
  fi
}

product_name="$(jq -r '.productName' "$tauri_config")"
expected_version="$(jq -r '.version' "$tauri_config")"
expected_identifier="$(jq -r '.identifier' "$tauri_config")"
expected_minimum_macos="$(jq -r '.bundle.macOS.minimumSystemVersion' "$tauri_config")"
package_version="$(jq -r '.version' "$package_manifest")"
cargo_version="$(sed -n 's/^version = "\([^"]*\)"/\1/p' "$cargo_manifest" | head -n 1)"

assert_equal "package.json version" "$package_version" "$expected_version"
assert_equal "Cargo.toml version" "$cargo_version" "$expected_version"

case "$(uname -m)" in
  arm64) artifact_arch="aarch64" ;;
  x86_64) artifact_arch="x64" ;;
  *) fail "unsupported host architecture: $(uname -m)" ;;
esac

app_path="${1:-$project_dir/src-tauri/target/release/bundle/macos/$product_name.app}"
dmg_path="${2:-$project_dir/src-tauri/target/release/bundle/dmg/${product_name}_${expected_version}_${artifact_arch}.dmg}"

[[ -d "$app_path" ]] || fail "app bundle not found: $app_path"
[[ -f "$dmg_path" ]] || fail "DMG not found: $dmg_path"

info_plist="$app_path/Contents/Info.plist"
executable_name="$(plutil -extract CFBundleExecutable raw -o - "$info_plist")"
executable_path="$app_path/Contents/MacOS/$executable_name"
icon_file="$(plutil -extract CFBundleIconFile raw -o - "$info_plist")"

assert_equal "CFBundleIdentifier" "$(plutil -extract CFBundleIdentifier raw -o - "$info_plist")" "$expected_identifier"
assert_equal "CFBundleShortVersionString" "$(plutil -extract CFBundleShortVersionString raw -o - "$info_plist")" "$expected_version"
assert_equal "CFBundleVersion" "$(plutil -extract CFBundleVersion raw -o - "$info_plist")" "$expected_version"
assert_equal "LSMinimumSystemVersion" "$(plutil -extract LSMinimumSystemVersion raw -o - "$info_plist")" "$expected_minimum_macos"

[[ -x "$executable_path" ]] || fail "main executable not found: $executable_path"
[[ "$icon_file" == *.icns ]] || fail "CFBundleIconFile is not an icns resource: $icon_file"
[[ -f "$app_path/Contents/Resources/$icon_file" ]] || fail "bundle icon is missing: Contents/Resources/$icon_file"

binary_minimum_macos="$(vtool -show-build "$executable_path" | awk '/minos/{print $2; exit}')"
assert_equal "Mach-O deployment target" "$binary_minimum_macos" "$expected_minimum_macos"

hdiutil verify "$dmg_path"

mount_dir="$(mktemp -d /tmp/paperweave-release-verify.XXXXXX)"
mounted=0
cleanup_mount() {
  if [[ "$mounted" == "1" ]]; then
    if ! hdiutil detach "$mount_dir" >/dev/null; then
      echo "warning: could not detach verification image at $mount_dir" >&2
    fi
  fi
  rmdir "$mount_dir" 2>/dev/null || true
}
trap cleanup_mount EXIT

hdiutil attach "$dmg_path" -nobrowse -readonly -mountpoint "$mount_dir" >/dev/null
mounted=1

[[ -d "$mount_dir/$product_name.app" ]] || fail "DMG does not contain $product_name.app"
[[ -L "$mount_dir/Applications" ]] || fail "DMG does not contain an Applications symlink"
assert_equal "DMG Applications link" "$(readlink "$mount_dir/Applications")" "/Applications"
assert_equal "DMG app version" "$(plutil -extract CFBundleShortVersionString raw -o - "$mount_dir/$product_name.app/Contents/Info.plist")" "$expected_version"
[[ -f "$mount_dir/$product_name.app/Contents/Resources/$icon_file" ]] || fail "DMG app is missing its icon resource"

hdiutil detach "$mount_dir" >/dev/null
mounted=0
rmdir "$mount_dir"
trap - EXIT

echo "--- app codesign details ---"
app_signature="$(codesign -dvvv --entitlements :- "$app_path" 2>&1)"
echo "$app_signature"

echo "--- app strict verification ---"
if codesign --verify --deep --strict --verbose=4 "$app_path"; then
  app_signature_valid=1
else
  app_signature_valid=0
fi

echo "--- app Gatekeeper assessment ---"
if spctl -a -t exec -vvv "$app_path"; then
  app_gatekeeper_accepted=1
else
  app_gatekeeper_accepted=0
fi

echo "--- DMG signature and Gatekeeper assessment ---"
if codesign --verify --verbose=4 "$dmg_path"; then
  dmg_signature_valid=1
else
  dmg_signature_valid=0
fi

if spctl -a -t open --context context:primary-signature -vvv "$dmg_path"; then
  dmg_gatekeeper_accepted=1
else
  dmg_gatekeeper_accepted=0
fi

if [[ "${PAPERWEAVE_REQUIRE_SIGNED:-0}" == "1" ]]; then
  [[ "$app_signature_valid" == "1" ]] || fail "app has no valid Developer ID bundle signature"
  [[ "$app_gatekeeper_accepted" == "1" ]] || fail "Gatekeeper did not accept the app"
  [[ "$dmg_signature_valid" == "1" ]] || fail "DMG has no valid signature"
  [[ "$dmg_gatekeeper_accepted" == "1" ]] || fail "Gatekeeper did not accept the DMG"
  echo "$app_signature" | grep -q '^Authority=Developer ID Application:' || fail "app is not signed with Developer ID Application"
  xcrun stapler validate "$app_path"
  xcrun stapler validate "$dmg_path"
  echo "macOS release verification passed (Developer ID signed and notarized mode)"
else
  [[ "$app_signature_valid" == "0" ]] || fail "unsigned RC unexpectedly has a valid app bundle signature"
  [[ "$app_gatekeeper_accepted" == "0" ]] || fail "Gatekeeper unexpectedly accepted the unsigned app"
  [[ "$dmg_signature_valid" == "0" ]] || fail "unsigned RC unexpectedly has a signed DMG"
  [[ "$dmg_gatekeeper_accepted" == "0" ]] || fail "Gatekeeper unexpectedly accepted the unsigned DMG"
  echo "$app_signature" | grep -q '^Signature=adhoc$' || fail "expected linker ad-hoc marker was not reported"
  echo "$app_signature" | grep -q '^TeamIdentifier=not set$' || fail "unsigned RC unexpectedly has a TeamIdentifier"
  echo "macOS release verification passed (unsigned local RC mode; Gatekeeper did not accept the artifacts)"
fi
