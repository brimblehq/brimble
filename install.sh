#!/usr/bin/env bash
set -euo pipefail

BRIMBLE_VERSION="v3.8.4"

error() {
    echo -e "\033[0;31merror:\033[0m" "$@" >&2
    exit 1
}

success() {
    echo -e "\033[0;32msuccess:\033[0m" "$@"
}

info() {
    echo -e "\033[0;34minfo:\033[0m" "$@"
}

OS="$(uname -s)"
ARCH="$(uname -m)"
echo "Detected OS: ${OS}, Architecture: ${ARCH}"

BRIMBLE_LINUX="https://github.com/brimblehq/brimble/releases/download/${BRIMBLE_VERSION}/brimble-linux-x64"
BRIMBLE_LINUX_ARM64="https://github.com/brimblehq/brimble/releases/download/${BRIMBLE_VERSION}/brimble-linux-arm64"
BRIMBLE_ALPINE="https://github.com/brimblehq/brimble/releases/download/${BRIMBLE_VERSION}/brimble-alpine-x64"
BRIMBLE_ALPINE_ARM64="https://github.com/brimblehq/brimble/releases/download/${BRIMBLE_VERSION}/brimble-alpine-arm64"

INSTALL_DIR="$HOME/.brimble/bin"
mkdir -p "${INSTALL_DIR}"

download_binary() {
    local url="$1"
    local output_path="$2"
    local platform="$3"
    
    info "Downloading Brimble for ${platform}..."
    curl --fail --location --progress-bar --output "${output_path}" "${url}" || error "Failed to download Brimble for ${platform}"
    chmod +x "${output_path}" || error "Failed to set executable permissions on Brimble for ${platform}"
    success "Downloaded Brimble for ${platform} to ${output_path}"
}

# Check if we're on a supported OS
case "${OS}" in
    Linux)
        ;;
    *)
        error "Unsupported operating system: ${OS}. This script only supports Linux."
        ;;
esac

if [ "${1:-}" = "--all" ]; then
    info "Downloading Brimble binaries for all Linux platforms..."
    
    download_binary "${BRIMBLE_LINUX}" "${INSTALL_DIR}/brimble-linux-x64" "Linux x64"
    
    download_binary "${BRIMBLE_LINUX_ARM64}" "${INSTALL_DIR}/brimble-linux-arm64" "Linux ARM64"

    download_binary "${BRIMBLE_ALPINE}" "${INSTALL_DIR}/brimble-alpine-x64" "Alpine x64"

    download_binary "${BRIMBLE_ALPINE_ARM64}" "${INSTALL_DIR}/brimble-alpine-arm64" "Alpine ARM64"
    
    case "${ARCH}" in
        x86_64|amd64)
            ln -sf "${INSTALL_DIR}/brimble-linux-x64" "${INSTALL_DIR}/brimble"
            ;;
        aarch64)
            ln -sf "${INSTALL_DIR}/brimble-linux-arm64" "${INSTALL_DIR}/brimble"
            ;;
        *)
            error "Unsupported architecture: ${ARCH} on Linux"
            ;;
    esac
else
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

    BRIMBLE_BIN="${INSTALL_DIR}/brimble"
    download_binary "${BRIMBLE_URL}" "${BRIMBLE_BIN}" "${OS} ${ARCH}"
fi

if sudo mv "${INSTALL_DIR}/brimble" /usr/local/bin/brimble; then
    success "Brimble ${BRIMBLE_VERSION} was installed successfully to /usr/local/bin/brimble"
    if [ "${1:-}" = "--all" ]; then
        info "All Linux platform binaries are available in ${INSTALL_DIR}"
    fi
    echo "Brimble is now available in your PATH. You can run 'brimble' from anywhere."
else
    info "Could not install to /usr/local/bin, keeping binary in ${INSTALL_DIR}"
    
    echo 'Adding Brimble to PATH in .bashrc and .zshrc...'
    
    if ! grep -q "export PATH=${INSTALL_DIR}" "$HOME/.bashrc" 2>/dev/null; then
        {
            echo "# Brimble PATH"
            echo "export PATH=${INSTALL_DIR}:\$PATH"
        } >> "$HOME/.bashrc"
    fi

    if [ -f "$HOME/.zshrc" ] && ! grep -q "export PATH=${INSTALL_DIR}" "$HOME/.zshrc" 2>/dev/null; then
        {
            echo "# Brimble PATH"
            echo "export PATH=${INSTALL_DIR}:\$PATH"
        } >> "$HOME/.zshrc"
    fi

    success "Brimble ${BRIMBLE_VERSION} was installed successfully"
    if [ "${1:-}" = "--all" ]; then
        info "All Linux platform binaries are available in ${INSTALL_DIR}"
    fi
    echo "Please restart your terminal or run 'source ~/.bashrc' to update your PATH."
fi