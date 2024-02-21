#!/bin/bash

github_owner="brimblehq"
github_repo="brimble"

os=$(uname -s)
machine_type=$(uname -m)

supported_platforms=(
    "Linux-x86_64" => "https://github.com/${github_owner}/${github_repo}/releases/latest/download/brimble-linux-x64"
    "Linux-aarch64" => "https://github.com/${github_owner}/${github_repo}/releases/latest/download/brimble-linux-arm64"
    "Darwin-x86_64" => "https://github.com/${github_owner}/${github_repo}/releases/latest/download/brimble-macos-x64"
    "Windows-x86_64" => "https://github.com/${github_owner}/${github_repo}/releases/latest/download/brimble-win-x64.exe"
)

platform="${os}-${machine_type}"
is_supported=false
for supported_platform in "${!supported_platforms[@]}"; do
    if [[ "$supported_platform" == "$platform" ]]; then
        download_url="${supported_platforms[$supported_platform]}"
        is_supported=true
        break
    fi
done

if [[ "$is_supported" == true ]]; then
    # Download the release for the specific platform
    echo "Downloading for $platform..."
    curl -Lo cli-app.tar.gz "$download_url" || {
        echo "Download failed!"
        exit 1
    }

    # Extract the archive (not needed for Windows)
    if [[ "$os" != "Windows" ]]; then
        tar xzf cli-app.tar.gz || {
            echo "Extraction failed!"
            exit 1
        }
    fi

    # Perform platform-specific installation
    case "$platform" in
        "Linux-x86_64")
            echo "Installing on Linux x86_64..."
            ;;
        "Linux-aarch64")
            echo "Installing on Linux aarch64..."
            ;;
        "Darwin-x86_64")
            echo "Installing on macOS x86_64..."
            ;;
        "Windows-x86_64")
            echo "Installing on Windows x86_64..."
            cp cli-app-windows-x86_64.exe "C:\\Program Files\\YourApp.exe"
            ;;
    esac

    rm -rf cli-app.tar.gz

    echo "Installation complete!"

else
    echo "Installation is not supported on this platform: $platform"
    exit 1
fi
