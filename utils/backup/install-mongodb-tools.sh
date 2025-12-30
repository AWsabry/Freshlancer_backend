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

# Function to install on CentOS/RHEL/Fedora/AlmaLinux
install_centos_rhel() {
    echo "Installing on CentOS/RHEL/Fedora/AlmaLinux..."
    
    # Try dnf first (preferred for newer RHEL-based systems)
    if command -v dnf &> /dev/null; then
        echo "Creating MongoDB repository for dnf..."
        sudo tee /etc/yum.repos.d/mongodb-org-7.0.repo > /dev/null <<EOF
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/\$releasever/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://pgp.mongodb.com/server-7.0.asc
EOF
        echo "Installing mongodb-database-tools via dnf..."
        sudo dnf install -y mongodb-database-tools || {
            echo "Package installation failed. Attempting manual installation..."
            install_manual_linux
        }
    elif command -v yum &> /dev/null; then
        echo "Creating MongoDB repository for yum..."
        sudo tee /etc/yum.repos.d/mongodb-org-7.0.repo > /dev/null <<EOF
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/\$releasever/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://pgp.mongodb.com/server-7.0.asc
EOF
        echo "Installing mongodb-database-tools via yum..."
        sudo yum install -y mongodb-database-tools || {
            echo "Package installation failed. Attempting manual installation..."
            install_manual_linux
        }
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
    
    # Try latest stable version - MongoDB database tools versioning
    # If this fails, we'll try alternative versions
    VERSIONS=("100.9.4" "100.9.1" "100.8.0" "100.7.0")
    DOWNLOAD_SUCCESS=false
    
    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"
    
    # Try downloading with different versions
    for VERSION in "${VERSIONS[@]}"; do
        DOWNLOAD_URL="https://fastdl.mongodb.org/tools/db/mongodb-database-tools-${PLATFORM}-${VERSION}.tgz"
        echo "Attempting to download version $VERSION from: $DOWNLOAD_URL"
        
        # Download with user-agent header to avoid 403 errors
        if command -v wget &> /dev/null; then
            if wget --user-agent="Mozilla/5.0" "$DOWNLOAD_URL" -O mongodb-tools.tgz 2>&1; then
                # Check if file was downloaded and is not empty
                if [ -f mongodb-tools.tgz ] && [ -s mongodb-tools.tgz ]; then
                    DOWNLOAD_SUCCESS=true
                    break
                else
                    echo "Download failed or file is empty, trying next version..."
                    rm -f mongodb-tools.tgz
                fi
            else
                echo "Download failed, trying next version..."
                rm -f mongodb-tools.tgz
            fi
        elif command -v curl &> /dev/null; then
            HTTP_CODE=$(curl -L --user-agent "Mozilla/5.0" -o mongodb-tools.tgz -w "%{http_code}" "$DOWNLOAD_URL" 2>/dev/null)
            if [ "$HTTP_CODE" = "200" ] && [ -f mongodb-tools.tgz ] && [ -s mongodb-tools.tgz ]; then
                DOWNLOAD_SUCCESS=true
                break
            else
                echo "Download failed (HTTP $HTTP_CODE), trying next version..."
                rm -f mongodb-tools.tgz
            fi
        else
            echo "Error: Neither wget nor curl is installed"
            exit 1
        fi
    done
    
    if [ "$DOWNLOAD_SUCCESS" = false ]; then
        echo "❌ Failed to download MongoDB database tools from all attempted URLs."
        echo "Please visit https://www.mongodb.com/try/download/database-tools to download manually."
        cd -
        rm -rf "$TEMP_DIR"
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
    centos|rhel|fedora|almalinux|rocky)
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

