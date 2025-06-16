#!/usr/bin/env bash
set -euo pipefail

BRIMBLE_VERSION="v3.7.5"

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

if [ "${1:-}" = "--all" ]; then
    info "Downloading Brimble binaries for all platforms..."
    
    download_binary "${BRIMBLE_LINUX}" "${INSTALL_DIR}/brimble-linux-x64" "Linux x64"
    
    download_binary "${BRIMBLE_LINUX_ARM64}" "${INSTALL_DIR}/brimble-linux-arm64" "Linux ARM64"

    download_binary "${BRIMBLE_ALPINE}" "${INSTALL_DIR}/brimble-alpine-x64" "Alpine x64"

    download_binary "${BRIMBLE_ALPINE_ARM64}" "${INSTALL_DIR}/brimble-alpine-arm64" "Alpine ARM64"
    
    case "${OS}" in
        Linux)
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
            ;;
        Darwin)
            ln -sf "${INSTALL_DIR}/brimble-macos-x64" "${INSTALL_DIR}/brimble"
            ;;
        *)
            error "Unsupported operating system: ${OS}"
            ;;
    esac
else
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

    BRIMBLE_BIN="${INSTALL_DIR}/brimble"
    download_binary "${BRIMBLE_URL}" "${BRIMBLE_BIN}" "${OS} ${ARCH}"
fi

mv "${INSTALL_DIR}/brimble" /usr/local/bin/brimble || error "Failed to move Brimble binary to /usr/local/bin/brimble"

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

success "Brimble ${BRIMBLE_VERSION} was installed successfully"
if [ "${1:-}" = "--all" ]; then
    info "All platform binaries are available in ${INSTALL_DIR}"
fi
echo "Please restart your terminal or run 'source ~/.bashrc' to update your PATH."