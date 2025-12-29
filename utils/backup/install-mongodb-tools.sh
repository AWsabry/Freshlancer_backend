#!/bin/bash

# MongoDB Database Tools Installation Script
# This script installs MongoDB database tools on various Linux distributions

set -e

echo "=========================================="
echo "MongoDB Database Tools Installation"
echo "=========================================="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    echo "Cannot detect OS. Please install manually."
    exit 1
fi

echo "Detected OS: $OS $VER"

# Function to install on Ubuntu/Debian
install_ubuntu_debian() {
    echo "Installing on Ubuntu/Debian..."
    
    # Try to install from package manager first
    if command -v apt-get &> /dev/null; then
        echo "Attempting to install via apt-get..."
        sudo apt-get update
        sudo apt-get install -y mongodb-database-tools || {
            echo "Package not available in repositories. Installing manually..."
            install_manual_linux
        }
    else
        install_manual_linux
    fi
}

# Function to install on CentOS/RHEL/Fedora
install_centos_rhel() {
    echo "Installing on CentOS/RHEL/Fedora..."
    
    if command -v yum &> /dev/null; then
        echo "Creating MongoDB repository..."
        sudo tee /etc/yum.repos.d/mongodb-org-7.0.repo > /dev/null <<EOF
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/\$releasever/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-7.0.asc
EOF
        sudo yum install -y mongodb-database-tools
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y mongodb-database-tools
    else
        install_manual_linux
    fi
}

# Function to install manually on Linux
install_manual_linux() {
    echo "Installing MongoDB Database Tools manually..."
    
    # Detect architecture
    ARCH=$(uname -m)
    if [ "$ARCH" = "x86_64" ]; then
        ARCH="x86_64"
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
        ARCH="arm64"
    else
        echo "Unsupported architecture: $ARCH"
        exit 1
    fi
    
    # Detect Ubuntu version for download URL
    if [ "$OS" = "ubuntu" ]; then
        case "$VER" in
            "22.04"|"22.10"|"23.04"|"23.10"|"24.04")
                UBUNTU_VERSION="ubuntu2204"
                ;;
            "20.04"|"20.10"|"21.04"|"21.10")
                UBUNTU_VERSION="ubuntu2004"
                ;;
            "18.04"|"18.10"|"19.04"|"19.10")
                UBUNTU_VERSION="ubuntu1804"
                ;;
            *)
                echo "Using generic Linux build for Ubuntu $VER"
                UBUNTU_VERSION="ubuntu2204"  # Default to latest
                ;;
        esac
        PLATFORM="${UBUNTU_VERSION}-${ARCH}"
    else
        # For other Linux distributions, use generic build
        PLATFORM="linux-${ARCH}"
    fi
    
    VERSION="100.9.1"
    DOWNLOAD_URL="https://fastdl.mongodb.org/tools/db/mongodb-database-tools-${PLATFORM}-${VERSION}.tgz"
    
    echo "Downloading from: $DOWNLOAD_URL"
    
    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"
    
    # Download
    if command -v wget &> /dev/null; then
        wget "$DOWNLOAD_URL" -O mongodb-tools.tgz
    elif command -v curl &> /dev/null; then
        curl -L "$DOWNLOAD_URL" -o mongodb-tools.tgz
    else
        echo "Error: Neither wget nor curl is installed"
        exit 1
    fi
    
    # Extract
    tar -xzf mongodb-tools.tgz
    
    # Install to /usr/local/bin
    echo "Installing to /usr/local/bin..."
    sudo cp mongodb-database-tools-*/bin/* /usr/local/bin/
    
    # Cleanup
    cd -
    rm -rf "$TEMP_DIR"
    
    echo "Installation complete!"
}

# Main installation logic
case "$OS" in
    ubuntu|debian)
        install_ubuntu_debian
        ;;
    centos|rhel|fedora)
        install_centos_rhel
        ;;
    *)
        echo "OS not directly supported. Attempting manual installation..."
        install_manual_linux
        ;;
esac

# Verify installation
echo ""
echo "Verifying installation..."
if command -v mongodump &> /dev/null; then
    echo "✅ mongodump installed successfully!"
    mongodump --version
else
    echo "❌ Installation failed. mongodump not found in PATH."
    echo "Please check /usr/local/bin or install manually."
    exit 1
fi

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="

