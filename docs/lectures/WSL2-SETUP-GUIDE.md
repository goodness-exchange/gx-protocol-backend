# WSL2 Setup Guide for GX Protocol Backend Development

**Date:** October 15, 2025  
**Purpose:** Set up Windows Subsystem for Linux 2 (WSL2) for development  
**Target:** Windows laptop → WSL2 → Docker Desktop workflow

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installing WSL2](#installing-wsl2)
3. [Installing Ubuntu on WSL2](#installing-ubuntu-on-wsl2)
4. [Installing Node.js 18.18.0](#installing-nodejs-18180)
5. [Installing Docker Desktop](#installing-docker-desktop)
6. [Setting Up VS Code](#setting-up-vs-code)
7. [Cloning the Project](#cloning-the-project)
8. [Verifying the Setup](#verifying-the-setup)
9. [Troubleshooting](#troubleshooting)
10. [Next Steps](#next-steps)

---

## Prerequisites

### System Requirements

- ✅ **OS:** Windows 10 version 2004+ (Build 19041+) or Windows 11
- ✅ **RAM:** 8GB minimum (16GB recommended)
- ✅ **Disk Space:** 20GB+ free space
- ✅ **Virtualization:** Enabled in BIOS (usually enabled by default)

### Check Your Windows Version

```powershell
# Run in PowerShell
winver
```

**Expected Output:** Version 2004 (Build 19041) or higher

If you're on an older version, update Windows first:
- Settings → Update & Security → Windows Update

---

## Installing WSL2

### Option A: One-Command Install (Windows 10 2004+ / Windows 11)

**This is the easiest method!**

#### Step 1: Open PowerShell as Administrator

1. Press `Win + X`
2. Click **"Windows PowerShell (Admin)"** or **"Terminal (Admin)"**
3. Click **"Yes"** on UAC prompt

#### Step 2: Run Installation Command

```powershell
wsl --install
```

**What this does:**
- Enables WSL feature
- Enables Virtual Machine Platform
- Downloads and installs the latest Linux kernel
- Sets WSL 2 as default
- Installs Ubuntu (default distribution)

#### Step 3: Restart Your Computer

```powershell
# After installation completes
Restart-Computer
```

**IMPORTANT:** Restart is required for changes to take effect!

---

### Option B: Manual Install (If Option A Fails)

#### Step 1: Enable WSL Feature

```powershell
# Run in PowerShell (Admin)
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
```

#### Step 2: Enable Virtual Machine Platform

```powershell
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

#### Step 3: Restart Computer

```powershell
Restart-Computer
```

#### Step 4: Download WSL2 Linux Kernel Update

1. Download from: https://aka.ms/wsl2kernel
2. Run the downloaded `wsl_update_x64.msi`
3. Click through the installer

#### Step 5: Set WSL 2 as Default

```powershell
wsl --set-default-version 2
```

---

## Installing Ubuntu on WSL2

### Step 1: Install Ubuntu from Microsoft Store

**After restart, Ubuntu should auto-install. If not:**

```powershell
# Option 1: Using wsl command
wsl --install -d Ubuntu

# Option 2: Using Microsoft Store
# - Open Microsoft Store
# - Search for "Ubuntu 22.04 LTS"
# - Click "Get" or "Install"
```

**Recommended:** Ubuntu 22.04 LTS (Long Term Support)

### Step 2: First Launch and Setup

1. **Launch Ubuntu** from Start Menu
2. **Wait for installation** (1-2 minutes)
3. **Create UNIX username:**
   ```
   Enter new UNIX username: hp
   ```
   (Use lowercase, no spaces - same as your Windows username for simplicity)

4. **Create password:**
   ```
   New password: [your-password]
   Retype new password: [your-password]
   ```
   **IMPORTANT:** This password is for Ubuntu only, can be different from Windows

5. **Success!** You should see:
   ```bash
   hp@DESKTOP-XXXXX:~$
   ```

---

## Installing Node.js 18.18.0

### Method 1: Using NodeSource Repository (Recommended)

```bash
# Update package list
sudo apt update

# Install prerequisites
sudo apt install -y curl

# Add NodeSource repository for Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node --version    # Should show v18.x.x
npm --version     # Should show 9.x.x or higher
```

### Method 2: Using NVM (Alternative - More Flexible)

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash

# Reload shell configuration
source ~/.bashrc

# Install Node.js 18.18.0
nvm install 18.18.0

# Set as default
nvm use 18.18.0
nvm alias default 18.18.0

# Verify
node --version    # Should show v18.18.0
```

### Verify Installation

```bash
# Check Node.js
node --version
# Expected: v18.18.0 (or v18.x.x)

# Check npm
npm --version
# Expected: 10.x.x or 9.x.x

# Check installation location
which node
# Expected: /usr/bin/node or ~/.nvm/versions/node/v18.18.0/bin/node
```

---

## Installing Docker Desktop

### Step 1: Download Docker Desktop

1. Go to: https://www.docker.com/products/docker-desktop/
2. Click **"Download for Windows"**
3. Run the installer (`Docker Desktop Installer.exe`)

### Step 2: Installation Options

**During installation, ensure:**
- ✅ **"Use WSL 2 instead of Hyper-V"** is checked
- ✅ **"Add shortcut to desktop"** (optional)

**Click "Ok" and wait for installation** (~5 minutes)

### Step 3: Restart Computer

After installation completes, restart your computer.

### Step 4: First Launch Configuration

1. **Launch Docker Desktop** from Start Menu
2. **Accept Terms** if prompted
3. **Skip Tutorial** (or complete if interested)
4. **Settings → General:**
   - ✅ **"Use the WSL 2 based engine"** (should be checked)
5. **Settings → Resources → WSL Integration:**
   - ✅ Enable integration with your default WSL distro (Ubuntu)
   - ✅ Click **"Apply & Restart"**

### Step 5: Verify Docker in WSL2

```bash
# In Ubuntu (WSL2) terminal
docker --version
# Expected: Docker version 24.x.x or higher

docker compose version
# Expected: Docker Compose version v2.x.x

# Test Docker is working
docker run hello-world
# Should download and run successfully
```

**Expected Output:**
```
Hello from Docker!
This message shows that your installation appears to be working correctly.
```

---

## Setting Up VS Code

### Step 1: Install VS Code Extensions

**You likely already have VS Code. Install these extensions:**

1. **WSL Extension** (Required)
   - Open VS Code
   - Press `Ctrl + Shift + X` (Extensions)
   - Search: **"WSL"**
   - Install: **"WSL" by Microsoft**

2. **Remote Development Extension Pack** (Recommended)
   - Search: **"Remote Development"**
   - Install: **"Remote Development" by Microsoft**
   - This includes: Remote-SSH, Remote-Containers, Remote-WSL

3. **Other Recommended Extensions** (if not installed):
   - ESLint
   - Prettier
   - GitLens
   - Docker
   - GitHub Copilot (you already have this!)

### Step 2: Connect VS Code to WSL2

**Method 1: From WSL Terminal**
```bash
# In Ubuntu (WSL2) terminal, navigate to project
cd ~
code .
```

VS Code will automatically install the VS Code Server in WSL2

**Method 2: From VS Code**
1. Press `F1` or `Ctrl + Shift + P`
2. Type: **"WSL: Connect to WSL"**
3. Select your Ubuntu distribution

**Success Indicator:**
- Bottom-left corner should show: **"WSL: Ubuntu"** in green

---

## Cloning the Project

### Step 1: Configure Git in WSL2

```bash
# Set your Git identity (use your GitHub info)
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Verify
git config --list
```

### Step 2: Set Up SSH Key (Optional but Recommended)

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your.email@example.com"
# Press Enter for all prompts (accept defaults)

# Copy public key
cat ~/.ssh/id_ed25519.pub
```

**Add to GitHub:**
1. Go to https://github.com/settings/keys
2. Click **"New SSH key"**
3. Paste the public key
4. Save

### Step 3: Clone the Repository

```bash
# Navigate to home directory
cd ~

# Create projects folder
mkdir -p projects
cd projects

# Clone via SSH (if you set up SSH key)
git clone git@github.com:goodness-exchange/gx-protocol-backend.git

# OR Clone via HTTPS
git clone https://github.com/goodness-exchange/gx-protocol-backend.git

# Navigate into project
cd gx-protocol-backend

# Checkout dev branch
git checkout dev

# Verify
git branch
# Should show: * dev
```

### Step 4: Install Project Dependencies

```bash
# In project directory
npm install

# This will install all dependencies for all 16 packages
# Takes 2-3 minutes
```

**Expected Output:**
```
added 1500+ packages in 2m
```

### Step 5: Verify Project Setup

```bash
# Type check
npm run type-check
# Expected: ✓ 16/16 packages pass type checking

# Lint
npm run lint
# Expected: No errors

# Try to build
npm run build
# Expected: Build successful (but may have some warnings)
```

---

## Verifying the Setup

### Complete Verification Checklist

Run these commands in WSL2 Ubuntu terminal:

```bash
# 1. Check WSL version
wsl --version
# Expected: WSL version 2.x.x

# 2. Check you're in WSL2
uname -a
# Expected: Linux ... Microsoft

# 3. Check Node.js
node --version
# Expected: v18.18.0 or v18.x.x

# 4. Check npm
npm --version
# Expected: 10.x.x or 9.x.x

# 5. Check Docker
docker --version
# Expected: Docker version 24.x.x

# 6. Check Docker Compose
docker compose version
# Expected: Docker Compose version v2.x.x

# 7. Check Git
git --version
# Expected: git version 2.x.x

# 8. Check project location
pwd
# Expected: /home/hp/projects/gx-protocol-backend (or similar)

# 9. Check project dependencies
npm list --depth=0
# Should show all workspace packages

# 10. Test Docker
docker ps
# Should not error (may be empty list)
```

### Verification Success Criteria

✅ All commands run without errors  
✅ WSL version is 2.x  
✅ Node.js version is 18.x  
✅ Docker is accessible  
✅ Project builds successfully  
✅ VS Code connected to WSL (green "WSL: Ubuntu" indicator)

---

## Troubleshooting

### Issue 1: "WSL 2 requires an update to its kernel component"

**Solution:**
```powershell
# Download and install: https://aka.ms/wsl2kernel
# Then run:
wsl --update
```

---

### Issue 2: "Virtualization is not enabled"

**Solution:**
1. Restart computer
2. Enter BIOS (usually press F2, F10, or Del during boot)
3. Find "Virtualization Technology" or "Intel VT-x" or "AMD-V"
4. Enable it
5. Save and exit BIOS

---

### Issue 3: Docker not accessible in WSL2

**Solution:**
```bash
# Ensure Docker Desktop is running
# Check WSL integration in Docker Desktop:
# Settings → Resources → WSL Integration → Enable for Ubuntu

# Restart Docker Desktop
# Then in WSL2:
docker ps
```

---

### Issue 4: "npm install" fails with permissions error

**Solution:**
```bash
# Do NOT use sudo with npm in WSL2
# If you get permission errors, fix npm permissions:
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

---

### Issue 5: Slow file system performance

**Problem:** Project in Windows file system (`/mnt/c/...`)

**Solution:** Keep project in WSL2 file system
```bash
# WRONG (slow):
cd /mnt/c/Users/HP/Desktop/projects/gx-protocol-backend

# RIGHT (fast):
cd ~/projects/gx-protocol-backend
```

**Accessing from Windows Explorer:**
- Type in address bar: `\\wsl$\Ubuntu\home\hp\projects\gx-protocol-backend`
- Or in WSL2 terminal: `explorer.exe .`

---

### Issue 6: VS Code not connecting to WSL2

**Solution:**
```bash
# Uninstall VS Code Server in WSL
rm -rf ~/.vscode-server

# Close VS Code
# Restart VS Code and reconnect to WSL
```

---

### Issue 7: "command not found: docker"

**Solution:**
```bash
# Ensure Docker Desktop is running (Windows)
# Check Docker Desktop settings:
# - Settings → Resources → WSL Integration
# - Enable integration with Ubuntu
# - Apply & Restart

# Restart WSL2:
wsl --shutdown
# Then reopen Ubuntu from Start Menu
```

---

### Issue 8: Port conflicts (5432, 6379 already in use)

**Problem:** PostgreSQL or Redis already running on Windows

**Solution:**
```powershell
# In Windows PowerShell (Admin):
# Stop Windows PostgreSQL service
Stop-Service postgresql-x64-*

# Stop Windows Redis service (if exists)
# Or just change ports in docker-compose.yml to 5433, 6380
```

---

## Understanding WSL2 File Systems

### WSL2 File System (FAST ⚡)
```bash
# Linux home directory
/home/hp/

# Your project should be here
/home/hp/projects/gx-protocol-backend/

# Access from Windows Explorer:
\\wsl$\Ubuntu\home\hp\projects\
```

### Windows File System (SLOW 🐌)
```bash
# Windows C: drive
/mnt/c/

# Your Windows user folder
/mnt/c/Users/HP/

# AVOID putting project here - it's slow!
```

### Best Practice
✅ **Keep all code in WSL2 file system** (`~/projects/`)  
✅ **Access from Windows when needed** (`\\wsl$\...`)  
✅ **VS Code will handle sync automatically**

---

## WSL2 Useful Commands

### WSL Management (Run in PowerShell)

```powershell
# List all installed distributions
wsl --list --verbose

# Shutdown all WSL instances
wsl --shutdown

# Restart specific distribution
wsl --terminate Ubuntu

# Set default distribution
wsl --set-default Ubuntu

# Update WSL
wsl --update

# Check WSL version
wsl --version
```

### Ubuntu Management (Run in WSL2)

```bash
# Update package list
sudo apt update

# Upgrade installed packages
sudo apt upgrade -y

# Clean up old packages
sudo apt autoremove -y

# Check disk usage
df -h

# Check memory usage
free -h

# Exit WSL (close terminal)
exit
```

---

## WSL2 Performance Tips

### 1. Limit WSL2 Memory Usage (Optional)

Create `.wslconfig` in Windows:

```powershell
# In PowerShell
notepad $env:USERPROFILE\.wslconfig
```

Add this content:
```ini
[wsl2]
memory=8GB          # Limit to 8GB RAM
processors=4        # Limit to 4 CPU cores
swap=2GB            # 2GB swap file
localhostForwarding=true
```

Save and restart WSL:
```powershell
wsl --shutdown
```

### 2. Use WSL2 File System

❌ **Slow:** `/mnt/c/Users/HP/projects/`  
✅ **Fast:** `/home/hp/projects/`

**10x-50x performance difference!**

### 3. Docker Performance

- ✅ Use WSL2 backend (not Hyper-V)
- ✅ Enable file sharing in Docker Desktop settings
- ✅ Keep Docker images in WSL2 file system

---

## Daily Development Workflow

### Starting Your Day

```bash
# 1. Open VS Code (Windows)
# 2. Connect to WSL2
#    - Press F1
#    - Type: "WSL: Connect to WSL"
#    - Select Ubuntu

# 3. Or use terminal command
wsl
cd ~/projects/gx-protocol-backend
code .

# 4. Terminal opens in VS Code (WSL2 context)
```

### Running Services

```bash
# Start Docker containers (PostgreSQL, Redis)
docker compose up -d

# Run development servers (once implemented)
npm run dev

# Run specific service
npm run dev --filter=svc-identity

# Stop Docker containers
docker compose down
```

### Git Workflow

```bash
# All git commands work normally in WSL2
git status
git add .
git commit -m "message"
git push origin dev
```

---

## Integration with External AlmaLinux Fabric

When we get to Phase 1, here's how WSL2 will connect to your external Fabric:

### Architecture

```
┌─────────────────────────────────────────┐
│  Windows Laptop                         │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  VS Code (Edit code)            │   │
│  └─────────────────────────────────┘   │
│            ↕                            │
│  ┌─────────────────────────────────┐   │
│  │  WSL2 Ubuntu                    │   │
│  │  - Node.js services             │   │
│  │  - npm build/run                │   │
│  └─────────────────────────────────┘   │
│            ↕                            │
│  ┌─────────────────────────────────┐   │
│  │  Docker Desktop                 │   │
│  │  - PostgreSQL                   │   │
│  │  - Redis                        │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
            ↕ (Network - TCP/IP)
┌─────────────────────────────────────────┐
│  External HDD - AlmaLinux               │
│  - Hyperledger Fabric Network           │
│  - Peer: grpcs://192.168.x.x:7051       │
│  - Orderer: grpcs://192.168.x.x:7050    │
└─────────────────────────────────────────┘
```

### Connection Configuration (Phase 1)

```bash
# In .env file (Phase 1)
FABRIC_PEER_URL=grpcs://192.168.1.100:7051
FABRIC_ORDERER_URL=grpcs://192.168.1.100:7050
FABRIC_ORG_MSP=GoodnessOrg1MSP
```

WSL2 can access your external HDD's IP address just like any network device!

---

## Backup and Disaster Recovery

### Export WSL2 Distribution (Backup)

```powershell
# In PowerShell
wsl --export Ubuntu C:\Backups\ubuntu-backup.tar

# Import if needed
wsl --import Ubuntu C:\WSL\Ubuntu C:\Backups\ubuntu-backup.tar
```

### Project Backup

Your project is in Git, so:
- ✅ Just push to GitHub regularly
- ✅ `git push origin dev` is your backup

---

## Next Steps

Once WSL2 is set up, we'll proceed with **Task 0.4**:

### Task 0.4: Local Development Environment

1. ✅ **Create `docker-compose.yml`**
   - PostgreSQL 15 container
   - Redis 7 container
   - PgAdmin (optional)

2. ✅ **Create `.env.example`**
   - Database URLs
   - Redis URLs
   - Service configs

3. ✅ **Test local environment**
   - Start containers
   - Connect to databases
   - Verify hot-reload

4. ✅ **Document setup**
   - `docs/LOCAL-DEVELOPMENT.md`
   - Troubleshooting guide
   - Common commands

---

## Resources

### Official Documentation
- **WSL2:** https://docs.microsoft.com/en-us/windows/wsl/
- **Docker Desktop:** https://docs.docker.com/desktop/windows/wsl/
- **VS Code Remote:** https://code.visualstudio.com/docs/remote/wsl

### Community Resources
- **WSL2 GitHub:** https://github.com/microsoft/WSL
- **Docker Forums:** https://forums.docker.com/
- **Stack Overflow:** Tag `wsl2`, `docker-desktop`

### Video Tutorials
- **WSL2 Setup:** https://www.youtube.com/results?search_query=wsl2+setup
- **Docker + WSL2:** https://www.youtube.com/results?search_query=docker+wsl2
- **VS Code + WSL2:** https://www.youtube.com/results?search_query=vscode+wsl2

---

## Quick Reference Card

### Essential Commands

```bash
# WSL Management (PowerShell)
wsl                          # Start default distribution
wsl --shutdown               # Stop all WSL instances
wsl --list --verbose         # List distributions

# In WSL2 Ubuntu
cd ~/projects/gx-protocol-backend   # Navigate to project
npm install                  # Install dependencies
npm run dev                  # Run development
docker compose up -d         # Start containers
docker compose down          # Stop containers
code .                       # Open in VS Code
explorer.exe .               # Open in Windows Explorer
exit                         # Close WSL terminal

# Project Commands
npm run type-check           # Type checking
npm run lint                 # Linting
npm run build                # Build all packages
npm test                     # Run tests (when implemented)
```

---

## Summary

After completing this guide, you will have:

✅ WSL2 installed and running  
✅ Ubuntu 22.04 LTS distribution  
✅ Node.js 18.18.0 installed  
✅ Docker Desktop with WSL2 integration  
✅ VS Code connected to WSL2  
✅ GX Protocol project cloned and set up  
✅ All dependencies installed  
✅ Ready for Task 0.4 (Docker Compose local environment)

---

**Total Setup Time:** 30-45 minutes  
**Difficulty:** Beginner-friendly  
**Support:** Follow each step carefully, use troubleshooting section if needed

---

**Document Version:** 1.0  
**Last Updated:** October 15, 2025  
**Next:** Task 0.4 - Local Development Environment Setup

**Ready to begin? Let's start with Step 1!** 🚀
