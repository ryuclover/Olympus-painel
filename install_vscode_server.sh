#!/bin/bash
set -e
COMMIT="7debcd0e2acdea1c52de81bf9ee1620444407dda"
SERVERDIR="$HOME/.vscode-server/bin/$COMMIT"
mkdir -p "$SERVERDIR"
cd "$SERVERDIR"
if [ -f "bin/code-server" ]; then
    echo "VS Code Server already installed at $SERVERDIR"
    ls bin/
    exit 0
fi
echo "Downloading VS Code Server $COMMIT..."
DOWNLOAD_URL="https://update.code.visualstudio.com/commit:${COMMIT}/server-linux-x64/stable"
wget -q "$DOWNLOAD_URL" -O vscode-server.tar.gz
echo "Extracting..."
tar -xzf vscode-server.tar.gz --strip-components=1
rm vscode-server.tar.gz
echo "Installation complete!"
ls bin/
