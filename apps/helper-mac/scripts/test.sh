#!/bin/sh
# `swift test` for the helper, on either toolchain.
#
# The suites use swift-testing, not XCTest: XCTest.framework ships only inside
# Xcode, so a machine with just the Command Line Tools cannot run an XCTest
# suite at all. Testing.framework does ship with the Command Line Tools — but
# off to one side, where neither the compiler nor dyld looks by default. Full
# Xcode needs none of this, so the flags go on only when they are the thing
# standing between you and a test run.
set -eu

cd "$(dirname "$0")/.."

DEVELOPER_DIR_PATH="$(xcode-select -p)"

case "$DEVELOPER_DIR_PATH" in
  */CommandLineTools)
    FRAMEWORKS="$DEVELOPER_DIR_PATH/Library/Developer/Frameworks"
    LIBS="$DEVELOPER_DIR_PATH/Library/Developer/usr/lib"
    exec swift test \
      -Xswiftc -F -Xswiftc "$FRAMEWORKS" \
      -Xlinker -F -Xlinker "$FRAMEWORKS" \
      -Xlinker -rpath -Xlinker "$FRAMEWORKS" \
      -Xlinker -rpath -Xlinker "$LIBS" \
      "$@"
    ;;
esac

exec swift test "$@"
