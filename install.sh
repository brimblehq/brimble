#!/usr/bin/env bash
set -euo pipefail

BRIMBLE_VERSION="v3.5.98"

error() {
    echo -e "\033[0;31merror:\033[0m" "$@" >&2
    exit 1
}

success() {
    echo -e "\033[0;32msuccess:\033[0m" "$@"
}

OS="$(uname -s)"
ARCH="$(uname -m)"
echo "Detected OS: ${OS}, Architecture: ${ARCH}"

# Define the URLs for the Brimble binaries
BRIMBLE_LINUX="https://github.com/brimblehq/brimble/releases/download/${BRIMBLE_VERSION}/brimble-linux-x64"
BRIMBLE_LINUX_ARM64="https://github.com/brimblehq/brimble/releases/download/${BRIMBLE_VERSION}/brimble-linux-arm64"
BRIMBLE_MACOS="https://github.com/brimblehq/brimble/releases/download/${BRIMBLE_VERSION}/brimble-macos-x64"
BRIMBLE_WINDOWS="https://github.com/brimblehq/brimble/releases/download/${BRIMBLE_VERSION}/brimble-win-x64.exe"

case "${OS}" in
    Linux)
        case "${ARCH}" in
            x86_64|amd64)
                BRIMBLE_URL="${BRIMBLE_LINUX}"
                ;;
            aarch64)
                BRIMBLE_URL="${BRIMBLE_LINUX_ARM64}"
                ;;
            *)
                error "Unsupported architecture: ${ARCH} on Linux"
                ;;
        esac
        ;;
    Darwin)
        case "${ARCH}" in
            x86_64|amd64|i386)
                BRIMBLE_URL="${BRIMBLE_MACOS}"
                ;;
            arm64)
                BRIMBLE_URL="${BRIMBLE_MACOS}"
                ;;
            *)
                error "Unsupported architecture: ${ARCH} on macOS"
                ;;
        esac
        ;;
    *)
        error "Unsupported operating system: ${OS}"
        ;;
esac

INSTALL_DIR="$HOME/.brimble/bin"
mkdir -p "${INSTALL_DIR}"

BRIMBLE_BIN="${INSTALL_DIR}/brimble"

echo "Downloading Brimble from ${BRIMBLE_URL}..."
curl --fail --location --progress-bar --output "${BRIMBLE_BIN}" "${BRIMBLE_URL}" || error "Failed to download Brimble"

chmod +x "${BRIMBLE_BIN}" || error "Failed to set executable permissions on Brimble"

mv "${BRIMBLE_BIN}" /usr/local/bin/brimble || error "Failed to move Brimble binary to /usr/local/bin/brimble"

echo 'Adding Brimble to PATH in .bashrc and .zshrc...'
{
    echo "# Brimble PATH"
    echo "export PATH=${INSTALL_DIR}:\$PATH"
} >> "$HOME/.bashrc"

if [ -f "$HOME/.zshrc" ]; then
    {
    echo "# Brimble PATH"
    echo "export PATH=${INSTALL_DIR}:\$PATH"
    } >> "$HOME/.zshrc"
fi

success "Brimble ${BRIMBLE_VERSION} was installed successfully to ${BRIMBLE_BIN}"
echo "Please restart your terminal or run 'source ~/.bashrc' to update your PATH."