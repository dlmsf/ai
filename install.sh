#!/bin/sh

# Configuration
REPO_DIR=$(pwd)
INSTALL_DIR="/usr/local/etc/EasyAI"
BACKUP_DIR="/usr/local/etc/EasyAI_old_$(date +%s)"
BIN_DIR="/usr/local/bin"
DEB_DIR="$REPO_DIR/core/upack"
DEB_SERVER_DIR="$REPO_DIR/core/upack-server"
APK_DIR="$REPO_DIR/core/apk"
PM2_TAR_GZ="$REPO_DIR/core/Hot/pm2.tar.gz"
PM2_EXTRACT_DIR="$INSTALL_DIR/core/Hot/pm2"
LOG_FILE="/var/log/EasyAI-install.log"
LOG_MODE=false
SKIP_PKGS=false
LOCAL_DIR_MODE=false
PRESERVE_DATA=true
BUILD_MODE=false
BUILD_COMMIT=""
ONLINE_MODE=false          # New flag for forcing online installation
MOVE_GIT=false             # New flag for moving .git directory

# =============================================================================
# SCRIPT HOOKS CONFIGURATION - Add shell scripts to execute during installation
# =============================================================================
# PRE_INSTALL_SCRIPTS: Executed with the same command line as install.sh
# Format: absolute paths or paths relative to install.sh execution path
PRE_INSTALL_SCRIPTS="
"

# POST_INSTALL_SCRIPTS: Executed after installation/update is complete
# IMPORTANT: These paths MUST be relative to the INSTALL_DIR
# They will be executed from the installation directory
POST_INSTALL_SCRIPTS="
core/Hot/sample_model/reconstruct_and_deploy.sh
"
# =============================================================================
# END OF SCRIPT HOOKS CONFIGURATION
# =============================================================================

# =============================================================================
# MODULAR CONFIGURATION - Add files/folders to exclude from installation here
# Format: relative paths from REPO_DIR, one per line
# =============================================================================
EXCLUDE_DIRS="
core/upack
core/upack-server
core/apk
build
llama.cpp
test.js
test.sh
config.json
saves.json
offmodels
models
data
log.json
scripts
"

# =============================================================================
# END OF MODULAR CONFIGURATION
# =============================================================================

# COMMAND WORKING DIRECTORY CONFIGURATION
# Set to "caller" to use the directory where command was called from
# Set to "global" to use the installation directory (default)
get_command_working_dir() {
    command="$1"
    case "$command" in
        "pm2") echo "caller" ;;
        *) echo "global" ;;
    esac
}

# Detect OS type
detect_os() {
  if [ -f /etc/alpine-release ]; then
    echo "alpine"
  elif [ -f /etc/debian_version ] || [ -f /etc/lsb-release ] || [ -f /etc/os-release ] && grep -qi "ubuntu" /etc/os-release 2>/dev/null; then
    echo "ubuntu"
  else
    echo "unknown"
  fi
}

# Detect if running on WSL (Windows Subsystem for Linux)
# Returns 0 (true) if on WSL, 1 (false) otherwise
detect_wsl() {
  # Check for WSL specific files and kernel information
  if [ -f /proc/sys/fs/binfmt_misc/WSLInterop ] || 
     [ -f /proc/sys/fs/binfmt_misc/WSLInterop-late ] ||
     grep -qi microsoft /proc/version 2>/dev/null ||
     grep -qi wsl /proc/sys/kernel/osrelease 2>/dev/null; then
    return 0
  else
    return 1
  fi
}

OS_TYPE=$(detect_os)
ON_WSL=false

# Check WSL status only for Ubuntu
if [ "$OS_TYPE" = "ubuntu" ] && detect_wsl; then
  ON_WSL=true
fi

# Whitelist of files/directories to preserve during updates
WHITELIST="
models
saves.json
llama.cpp
log.json
config.json
"

# Commands to create symbolic links
COMMANDS="
core/Flash/WebGPTFlash.js:webgpt
core/Flash/GenerateFlash.js:generate
core/Flash/ChatFlash.js:chat
core/MenuCLI/MenuCLI.js:ai
core/Hot/pm2/bin/pm2:pm2
"

# Function to get the latest commit hash
get_latest_commit() {
  git log --format="%H" -n 1 2>/dev/null || echo ""
}

# Function to handle build mode
handle_build_mode() {
  commit_hash="$1"
  build_dir="$REPO_DIR/build"
  
  # Determine commit hash if not provided
  if [ -z "$commit_hash" ]; then
    commit_hash=$(get_latest_commit)
    if [ -n "$commit_hash" ]; then
      short_hash=$(echo "$commit_hash" | cut -c1-7)
      echo "No commit specified, using latest commit: $short_hash..."
    else
      echo "Error: Not a git repository or no commits found"
      exit 1
    fi
  fi
  
  output_dir="$build_dir/$commit_hash"
  
  # Validate git repository
  if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not a git repository"
    exit 1
  fi

  # Validate commit exists
  if ! git cat-file -e "$commit_hash^{commit}" 2>/dev/null; then
    echo "Error: Commit '$commit_hash' does not exist"
    echo "Available commits (last 10):"
    git log --oneline -10 2>/dev/null || echo "No git history available"
    exit 1
  fi

  # Create build directory
  mkdir -p "$build_dir"

  # Handle existing directory
  if [ -d "$output_dir" ]; then
    echo "Directory '$output_dir' already exists, overwriting..."
    rm -rf "$output_dir"
  fi

  mkdir -p "$output_dir"

  short_hash=$(echo "$commit_hash" | cut -c1-7)
  echo "Creating build snapshot of commit: $short_hash..."

  # Export using git archive (cleanest method)
  if git archive --format=tar "$commit_hash" | tar -x -C "$output_dir"; then
    echo "Successfully created build: $output_dir"
    echo "Contents exported without .git history"

    # Show info about the commit
    echo ""
    echo "Commit info:"
    git show -s --format="%h - %s (%an, %ad)" "$commit_hash"
    echo "Path: $output_dir"
  else
    echo "Error: Failed to create build snapshot"
    exit 1
  fi
  
  exit 0
}

show_help() {
  echo "=== EasyAI Installation Script ==="
  echo ""
  echo "DESCRIPTION:"
  echo "  This script installs the EasyAI package and its dependencies."
  echo "  It handles both Ubuntu and Alpine Linux, installs required packages,"
  echo "  sets up symbolic links for commands, and provides installation logging."
  echo ""
  echo "USAGE:"
  echo "  $0 [OPTIONS]"
  echo ""
  echo "OPTIONS:"
  echo "  -h, --help       Show this help message and exit"
  echo "  --log            Enable installation logging to $LOG_FILE"
  echo "  --skip-pkgs      Skip installation of packages (warning: may affect functionality)"
  echo "  --local-dir      Run commands from current directory instead of installation directory"
  echo "  --no-preserve    Don't preserve whitelisted files during update"
  echo "  --build          Create build snapshot of specific commit (optional: provide commit hash)"
  echo "  --build <commit> Create build snapshot of specific commit hash"
  echo "  --online         Force online package installation using apt/apk instead of local .deb/.apk files"
  echo "  --movegit        Move .git directory to installation directory (default: excluded)"
  echo ""
  echo "PRESERVED FILES:"
  echo "  The following files/directories are preserved during updates:"
  for item in $WHITELIST; do
    echo "  - $item"
  done
  echo "  Use --no-preserve to disable this behavior"
  echo ""
  echo "EXCLUDED DIRECTORIES:"
  echo "  The following directories are excluded from installation by default:"
  for item in $EXCLUDE_DIRS; do
    if [ -n "$item" ]; then
      echo "  - $item"
    fi
  done
  echo "  Use --movegit to include .git directory in installation"
  echo ""
  echo "COMMANDS CREATED:"
  echo "  webgpt           WebGPT interface"
  echo "  generate         Content generation tool"
  echo "  chat             Chat interface"
  echo "  ai               Main AI command menu"
  echo "  pm2              Process manager for Node.js"
  echo ""
  echo "SCRIPT HOOKS:"
  echo "  Pre-install scripts:  $PRE_INSTALL_SCRIPTS"
  echo "  Post-install scripts: $POST_INSTALL_SCRIPTS"
  echo "  - Pre-install scripts run with the same command line as install.sh"
  echo "  - Post-install scripts MUST be relative to $INSTALL_DIR"
  echo ""
  echo "WORKING DIRECTORY CONFIGURATION:"
  echo "  By default, all commands run from the installation directory ($INSTALL_DIR)"
  echo "  with the following per-command exceptions:"
  echo "    pm2: Runs from your current working directory (caller)"
  echo ""
  echo "  Use --local-dir to override and make ALL commands run from current directory"
  echo ""
  echo "BUILD MODE:"
  echo "  Use --build to create a clean snapshot of the latest commit"
  echo "  Use --build <commit-hash> to create a snapshot of specific commit"
  echo "  Builds are saved in ./build/<commit-hash> directory"
  echo ""
  echo "ONLINE INSTALLATION:"
  echo "  By default, the script installs packages from local .deb/.apk files."
  echo "  Use --online to force online installation using the system package manager."
  echo "  On Ubuntu/WSL, online installation is automatically enabled (no --online needed)."
  echo ""
  echo "EXAMPLES:"
  echo "  Normal installation:        $0"
  echo "  Installation with logging:  $0 --log"
  echo "  Skip package installation:  $0 --skip-pkgs"
  echo "  Local directory behavior:   $0 --local-dir"
  echo "  No file preservation:      $0 --no-preserve"
  echo "  Build latest commit:       $0 --build"
  echo "  Build specific commit:     $0 --build abc123def456"
  echo "  Force online installation: $0 --online"
  echo "  Include .git directory:    $0 --movegit"
  echo ""
  echo "NOTE:"
  echo "  If you modify this script or add new parameters, please update this help section."
  exit 0
}

# Function to detect Ubuntu variant
detect_ubuntu_variant() {
  if command -v dpkg >/dev/null 2>&1 && dpkg -l | grep -q "ubuntu-desktop"; then
    echo "desktop"
  else
    echo "server"
  fi
}

# Function to log messages
log_message() {
  if [ "$LOG_MODE" = true ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
  else
    echo "$1"
  fi
}

# Function to show progress and allow skipping
show_progress() {
  message="$1"
  pid="$2"
  count=0
  spinner="/-\\|"
  
  while kill -0 "$pid" 2>/dev/null; do
    count=$((count + 1))
    # Show spinner every 10 iterations to reduce CPU usage
    if [ $((count % 10)) -eq 0 ]; then
      spin_char=$(printf "%.1s" "$spinner" | cut -c$(( (count % 4) + 1 )))
      printf "\r%s %s (press x to skip)" "$message" "$spin_char"
    fi
    
    # Check for user input with timeout
    if read -t 0.1 -n 1 -s input 2>/dev/null; then
      if [ "$input" = "x" ]; then
        printf "
Skipping step...\n"
        kill "$pid" 2>/dev/null
        wait "$pid" 2>/dev/null
        break
      fi
    fi
  done
  wait "$pid" 2>/dev/null
  printf "\r%s completed.                      \n" "$message"
}

# Function to install packages using apt on Ubuntu
install_with_apt() {
  log_message "Installing packages using apt (online mode)..."
  
  # Update package list
  log_message "Updating package lists..."
  if [ "$LOG_MODE" = true ]; then
    sudo apt-get update &
  else
    sudo apt-get update > /dev/null 2>&1 &
  fi
  show_progress "Updating package lists" $!
  
  # Install required packages
  log_message "Installing nodejs, gcc, g++, cmake..."
  if [ "$LOG_MODE" = true ]; then
    sudo apt-get install -y nodejs gcc g++ cmake &
  else
    sudo apt-get install -y nodejs gcc g++ cmake > /dev/null 2>&1 &
  fi
  show_progress "Installing packages" $!
  
  log_message "apt installation completed."
}

# Function to install packages using apk on Alpine (online mode)
install_with_apk() {
  log_message "Installing packages using apk (online mode)..."
  
  # Update package list
  log_message "Updating package lists..."
  if [ "$LOG_MODE" = true ]; then
    apk update &
  else
    apk update > /dev/null 2>&1 &
  fi
  show_progress "Updating package lists" $!
  
  # Install required packages
  log_message "Installing nodejs, gcc, g++, cmake..."
  if [ "$LOG_MODE" = true ]; then
    apk add nodejs gcc g++ cmake make bash &
  else
    apk add nodejs gcc g++ cmake make bash > /dev/null 2>&1 &
  fi
  show_progress "Installing packages" $!
  
  log_message "apk installation completed."
}

# Function to install packages based on OS and conditions
install_packages() {
  if [ "$SKIP_PKGS" = true ]; then
    log_message "Skipping package installation as requested."
    return
  fi

  # Determine if we should use online mode
  USE_ONLINE=false
  
  # Case 1: --online flag is set
  if [ "$ONLINE_MODE" = true ]; then
    USE_ONLINE=true
    log_message "Online mode forced via --online flag."
  # Case 2: Ubuntu on WSL - automatically use online mode
  elif [ "$OS_TYPE" = "ubuntu" ] && [ "$ON_WSL" = true ]; then
    USE_ONLINE=true
    log_message "Ubuntu on WSL detected - automatically using online package installation."
  fi

  # Execute appropriate installation method
  if [ "$USE_ONLINE" = true ]; then
    case "$OS_TYPE" in
      "ubuntu")
        install_with_apt
        ;;
      "alpine")
        install_with_apk
        ;;
      *)
        log_message "Unknown OS type. Cannot perform online installation."
        ;;
    esac
  else
    # Use local package files (original behavior)
    case "$OS_TYPE" in
      "ubuntu")
        install_debs
        ;;
      "alpine")
        install_apks
        ;;
      *)
        log_message "Unknown OS type. Skipping package installation."
        ;;
    esac
  fi
}

# Function to install .deb packages
install_debs() {
  variant=$(detect_ubuntu_variant)
  deb_dir="$DEB_DIR"
  
  if [ "$variant" = "server" ]; then
    deb_dir="$DEB_SERVER_DIR"
    log_message "Ubuntu Server detected. Using server-specific .deb packages."
  else
    log_message "Ubuntu Desktop detected. Using standard .deb packages."
  fi

  if [ -d "$deb_dir" ]; then
    deb_files=$(find "$deb_dir" -maxdepth 1 -name "*.deb" 2>/dev/null | tr '\n' ' ')
    if [ -n "$deb_files" ]; then
      log_message "Installing .deb packages from $deb_dir..."
      if [ "$LOG_MODE" = true ]; then
        sudo dpkg -i $deb_files &
      else
        sudo dpkg -i $deb_files > /dev/null 2>&1 &
      fi
      show_progress "Installing dependencies" $!
    else
      log_message "No .deb files found in $deb_dir. Skipping .deb installation."
    fi
  else
    log_message "The .deb directory ($deb_dir) does not exist. Skipping .deb installation."
  fi
}

# Function to install .apk packages with recursive fallback
install_apks() {
  if [ ! -d "$APK_DIR" ]; then
    log_message "The .apk directory ($APK_DIR) does not exist. Skipping .apk installation."
    return
  fi

  # Get list of APK files
  apk_files=$(find "$APK_DIR" -maxdepth 1 -name "*.apk" 2>/dev/null)
  
  if [ -z "$apk_files" ]; then
    log_message "No .apk files found in $APK_DIR. Skipping .apk installation."
    return
  fi

  log_message "Found APK packages, starting recursive installation..."
  
  # Initialize counters and tracking
  attempt=0
  max_attempts=10  # Safety limit to prevent infinite loops
  
  # Create a temporary file to track failed packages
  failed_list=$(mktemp)
  current_list=$(mktemp)
  
  # Initial list of all packages to try
  echo "$apk_files" > "$current_list"
  
  while [ $attempt -lt $max_attempts ]; do
    attempt=$((attempt + 1))
    
    # Clear the failed list for this attempt
    > "$failed_list"
    
    # Count packages to try
    pkg_count=$(wc -l < "$current_list")
    
    if [ $pkg_count -eq 0 ]; then
      log_message "No more packages to install. All packages installed successfully!"
      break
    fi
    
    log_message "Installation attempt $attempt: Processing $pkg_count package(s)..."
    
    # Try to install each package
    failed_any=false
    while IFS= read -r apk_file; do
      [ -z "$apk_file" ] && continue
      
      pkg_name=$(basename "$apk_file")
      
      if [ "$LOG_MODE" = true ]; then
        if apk add --allow-untrusted "$apk_file" 2>&1 | tee -a "$LOG_FILE"; then
          log_message "✓ Successfully installed: $pkg_name"
        else
          log_message "✗ Failed to install: $pkg_name (will retry)"
          echo "$apk_file" >> "$failed_list"
          failed_any=true
        fi
      else
        if apk add --allow-untrusted "$apk_file" > /dev/null 2>&1; then
          log_message "✓ Installed: $pkg_name"
        else
          log_message "✗ Failed: $pkg_name (will retry)"
          echo "$apk_file" >> "$failed_list"
          failed_any=true
        fi
      fi
    done < "$current_list"
    
    # Check if any packages failed
    if [ "$failed_any" = false ]; then
      log_message "All packages installed successfully in attempt $attempt!"
      break
    fi
    
    # Check if we're making progress
    failed_count=$(wc -l < "$failed_list")
    if [ $failed_count -eq $pkg_count ]; then
      # No progress made - all packages failed
      if [ $attempt -ge 2 ]; then
        log_message "Warning: No progress made in attempt $attempt. Stopping recursive installation."
        log_message "Failed packages ($failed_count):"
        while IFS= read -r apk_file; do
          [ -z "$apk_file" ] && continue
          log_message "  - $(basename "$apk_file")"
        done < "$failed_list"
        break
      fi
    fi
    
    # Update the current list with failed packages for next attempt
    cp "$failed_list" "$current_list"
    
    # Update APK cache between attempts (helps resolve dependency issues)
    log_message "Updating APK cache before next attempt..."
    apk update > /dev/null 2>&1
    
    log_message "Moving to attempt $((attempt + 1)) with $failed_count remaining package(s)..."
  done
  
  # Final APK cache update
  log_message "Updating APK cache..."
  apk update > /dev/null 2>&1
  
  # Clean up temporary files
  rm -f "$failed_list" "$current_list"
  
  log_message "APK installation process completed."
}

# Function to build find exclude pattern from EXCLUDE_DIRS
build_exclude_pattern() {
  if [ -z "$EXCLUDE_DIRS" ]; then
    echo ""
    return
  fi
  
  # Build pattern in the exact same format as the original working script
  pattern=""
  for dir in $EXCLUDE_DIRS; do
    if [ -n "$dir" ]; then
      if [ -z "$pattern" ]; then
        pattern="-path ./$dir"
      else
        pattern="$pattern -o -path ./$dir"
      fi
    fi
  done
  
  # Add .git to exclude pattern unless --movegit is specified
  if [ "$MOVE_GIT" = false ]; then
    if [ -z "$pattern" ]; then
      pattern="-path ./.git"
    else
      pattern="$pattern -o -path ./.git"
    fi
  fi
  
  echo "$pattern"
}

# Function to remove symbolic links
remove_links() {
  echo "$COMMANDS" | while IFS= read -r line; do
    if [ -n "$line" ]; then
      src=$(echo "$line" | cut -d: -f1)
      dest=$(echo "$line" | cut -d: -f2)
      dest_path="$BIN_DIR/$dest"
      if [ -L "$dest_path" ]; then
        log_message "Removing symbolic link: $dest_path"
        rm "$dest_path"
      else
        log_message "Symbolic link not found: $dest_path"
      fi
    fi
  done
}

# Function to preserve whitelisted files by moving them from backup
preserve_files_from_backup() {
  if [ "$PRESERVE_DATA" = false ]; then
    log_message "Skipping file preservation as requested."
    return
  fi

  if [ -d "$BACKUP_DIR" ]; then
    log_message "Restoring whitelisted files from backup..."
    
    for item in $WHITELIST; do
      source_path="$BACKUP_DIR/$item"
      dest_path="$INSTALL_DIR/$item"
      
      if [ -e "$source_path" ]; then
        log_message "Restoring $item..."
        dest_dir=$(dirname "$dest_path")
        mkdir -p "$dest_dir"
        
        # Remove existing destination if it exists
        if [ -e "$dest_path" ]; then
          rm -rf "$dest_path"
        fi
        
        # Move file/directory from backup to new installation
        mv -f "$source_path" "$dest_path"
      fi
    done
    
    # Clean up backup directory
    log_message "Cleaning up backup directory..."
    rm -rf "$BACKUP_DIR"
  fi
}

# Function to create command wrappers or direct symlinks
create_command_links() {
  install_dir="$1"
  
  echo "$COMMANDS" | while IFS= read -r line; do
    if [ -n "$line" ]; then
      src=$(echo "$line" | cut -d: -f1)
      dest=$(echo "$line" | cut -d: -f2)
      src_path="$install_dir/$src"
      dest_path="$BIN_DIR/$dest"
      working_dir=$(get_command_working_dir "$dest")
      
      if [ "$LOCAL_DIR_MODE" = true ]; then
        # Direct symlink mode (current directory behavior)
        log_message "Creating direct symlink for $dest..."
        [ -L "$dest_path" ] && rm "$dest_path"
        ln -s "$src_path" "$dest_path"
        chmod 755 "$src_path"
      else
        # Wrapper mode (installation directory behavior with per-command configuration)
        wrapper_path="$install_dir/wrappers/$dest"
        mkdir -p "$(dirname "$wrapper_path")"
        
        log_message "Creating wrapper for $dest with working directory: $working_dir..."
        
        # Create the wrapper script based on working directory configuration
        if [ "$working_dir" = "caller" ]; then
          # Use caller's current directory
          cat > "$wrapper_path" <<EOF
#!/bin/sh
# Working directory: caller's current directory
exec node "$src_path" "\$@"
EOF
        else
          # Use global installation directory (default)
          cat > "$wrapper_path" <<EOF
#!/bin/sh
cd "$install_dir" || { echo "Error: Could not change to installation directory $install_dir" >&2; exit 1; }
exec node "$src_path" "\$@"
EOF
        fi

        # Make the wrapper executable
        chmod +x "$wrapper_path"

        # Create the symlink to the wrapper
        [ -L "$dest_path" ] && rm "$dest_path"
        ln -s "$wrapper_path" "$dest_path"
      fi
    fi
  done
}

# Function to check if EasyAI is already installed
check_installed() {
  if [ -d "$INSTALL_DIR" ]; then
    log_message "EasyAI installation detected at $INSTALL_DIR"
    return 0
  else
    return 1
  fi
}

# =============================================================================
# FUNCTION: Check if model_example.gguf exists in installation directory
# =============================================================================
check_model_exists() {
  # Check if model_example.gguf exists in installation directory models folder
  if [ -f "$INSTALL_DIR/models/model_example.gguf" ]; then
    log_message "Model model_example.gguf detected in $INSTALL_DIR/models"
    return 0
  else
    log_message "Model model_example.gguf NOT found in $INSTALL_DIR/models"
    return 1
  fi
}

# =============================================================================
# FUNCTION: Execute pre-install hook scripts with the same command line
# =============================================================================
execute_pre_install_scripts() {
  if [ -z "$PRE_INSTALL_SCRIPTS" ]; then
    log_message "No pre-install scripts configured."
    return
  fi
  
  log_message "Executing pre-install scripts..."
  
  # Get the original command line used to execute this script
  original_command="$0"
  for arg in "$@"; do
    # Properly quote arguments that contain spaces
    if echo "$arg" | grep -q " "; then
      original_command="$original_command \"$arg\""
    else
      original_command="$original_command $arg"
    fi
  done
  
  # Get the directory where the original script was executed from
  execution_dir=$(pwd)
  
  for script_path in $PRE_INSTALL_SCRIPTS; do
    # Skip empty lines
    [ -z "$script_path" ] && continue
    
    log_message "Executing pre-install script: $script_path"
    
    # Check if script exists
    if [ ! -f "$script_path" ]; then
      log_message "Warning: Script not found: $script_path"
      continue
    fi
    
    # Check if script is executable
    if [ ! -x "$script_path" ]; then
      log_message "Making script executable: $script_path"
      chmod +x "$script_path"
    fi
    
    # Execute the script with the same command line
    log_message "Running: $script_path $@"
    
    (
      # Execute in a subshell to preserve environment
      export ORIGINAL_INSTALL_COMMAND="$original_command"
      export INSTALL_EXECUTION_DIR="$execution_dir"
      
      if [ "$LOG_MODE" = true ]; then
        "$script_path" "$@" 2>&1 | tee -a "$LOG_FILE"
      else
        "$script_path" "$@" > /dev/null 2>&1
      fi
    )
    
    exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
      log_message "✓ Pre-install script completed successfully: $script_path"
    else
      log_message "✗ Pre-install script failed with exit code $exit_code: $script_path"
      # Continue with other scripts even if one fails
    fi
  done
}

# =============================================================================
# FUNCTION: Execute post-install scripts from the installation directory
# =============================================================================
execute_post_install_scripts() {
  if [ -z "$POST_INSTALL_SCRIPTS" ]; then
    log_message "No post-install scripts configured."
    return
  fi
  
  log_message "Executing post-install scripts from installation directory..."
  
  # Verify installation directory exists
  if [ ! -d "$INSTALL_DIR" ]; then
    log_message "Error: Installation directory not found: $INSTALL_DIR"
    return 1
  fi
  
  # Save current directory to return later
  current_dir=$(pwd)
  
  # Change to installation directory
  cd "$INSTALL_DIR" || {
    log_message "Error: Could not change to installation directory: $INSTALL_DIR"
    return 1
  }
  
  log_message "Now in: $(pwd)"
  
  for script_path in $POST_INSTALL_SCRIPTS; do
    # Skip empty lines
    [ -z "$script_path" ] && continue
    
    # Resolve the script path relative to installation directory
    full_script_path="$INSTALL_DIR/$script_path"
    
    log_message "Checking for post-install script: $full_script_path"
    
    if [ -f "$full_script_path" ]; then
      log_message "Executing post-install script: $script_path"
      
      # Make executable if needed
      if [ ! -x "$full_script_path" ]; then
        log_message "Making script executable: $full_script_path"
        chmod +x "$full_script_path"
      fi
      
      # Execute from installation directory
      if [ "$LOG_MODE" = true ]; then
        "$full_script_path" 2>&1 | tee -a "$LOG_FILE"
      else
        "$full_script_path" > /dev/null 2>&1
      fi
      
      exit_code=$?
      
      if [ $exit_code -eq 0 ]; then
        log_message "✓ Post-install script completed successfully: $script_path"
      else
        log_message "✗ Post-install script failed with exit code $exit_code: $script_path"
      fi
    else
      log_message "Warning: Post-install script not found in installation directory: $full_script_path"
    fi
  done
  
  # Return to original directory
  cd "$current_dir" || {
    log_message "Warning: Could not return to original directory: $current_dir"
  }
}

# Trap to handle Ctrl+C
trap 'log_message "Installation interrupted."; 
if [ "$OS_TYPE" = "ubuntu" ]; then 
  sudo dpkg --configure -a; 
fi; 
exit 1' INT

# Check for help arguments first
for arg in "$@"; do
  case "$arg" in
    -h|--help)
      show_help
      ;;
  esac
done

# Check if EasyAI is already installed and force skip packages if it is
if check_installed; then
  log_message "EasyAI is already installed. Forcing package installation skip."
  SKIP_PKGS=true
fi

# Check for build mode first (should take precedence over other modes)
i=1
for arg in "$@"; do
  if [ "$arg" = "--build" ]; then
    BUILD_MODE=true
    # Check if next argument exists and is not another option
    if [ $((i+1)) -le $# ] && ! echo "$2" | grep -q "^-"; then
      BUILD_COMMIT="$2"
    fi
    handle_build_mode "$BUILD_COMMIT"
  fi
  i=$((i+1))
done

# Check for other arguments
for arg in "$@"; do
  case "$arg" in
    --log)
      LOG_MODE=true
      touch "$LOG_FILE" 2>/dev/null || LOG_MODE=false
      ;;
    --skip-pkgs)
      SKIP_PKGS=true
      ;;
    --local-dir)
      LOCAL_DIR_MODE=true
      log_message "Local directory mode enabled - commands will run from current directory"
      ;;
    --no-preserve)
      PRESERVE_DATA=false
      log_message "File preservation disabled - whitelisted files will not be saved"
      ;;
    --online)
      ONLINE_MODE=true
      log_message "Online installation mode enabled - will use apt/apk instead of local packages"
      ;;
    --movegit)
      MOVE_GIT=true
      log_message "Git directory will be included in installation (--movegit enabled)"
      ;;
  esac
done

# =============================================================================
# EXECUTE PRE-INSTALL SCRIPTS (with same command line)
# =============================================================================
execute_pre_install_scripts "$@"

# Install packages based on OS (will be skipped if already installed or --skip-pkgs used)
install_packages

# Run package configuration if not skipping package installation
if [ "$SKIP_PKGS" = false ] && [ "$OS_TYPE" = "ubuntu" ]; then
  log_message "Running dpkg --configure -a..."
  if [ "$LOG_MODE" = true ]; then
    sudo dpkg --configure -a &
  else
    sudo dpkg --configure -a > /dev/null 2>&1 &
  fi
  show_progress "Configuring packages" $!
fi

# Check if the installation directory already exists
if [ -d "$INSTALL_DIR" ]; then
  log_message "The EasyAI folder already exists. Choose an option:"
  log_message "1. Update (replace existing files)"
  log_message "2. Remove (delete the existing folder and symbolic links)"
  log_message "3. Exit (cancel setup)"

  printf "Enter your choice (1/2/3): "
  read choice
  case "$choice" in
    1)
      log_message "Updating the existing installation..."
      # Rename existing installation to backup location
      mv -f "$INSTALL_DIR" "$BACKUP_DIR"
      remove_links
      ;;
    2)
      log_message "Removing the existing folder and symbolic links..."
      remove_links
      rm -rf "$INSTALL_DIR"
      log_message "Folder and symbolic links removed. Setup cancelled."
      exit 0
      ;;
    3)
      log_message "Setup cancelled."
      exit 0
      ;;
    *)
      log_message "Invalid choice. Setup cancelled."
      exit 1
      ;;
  esac
fi

# Proceed with global installation
log_message "Creating installation directory..."
mkdir -p "$INSTALL_DIR"

log_message "Copying files..."
# Build exclude pattern from EXCLUDE_DIRS, now including .git conditionally
EXCLUDE_PATTERN=$(build_exclude_pattern)

# Check if model exists before copying files
MODEL_EXISTS=false
# For updates, check if model exists in preserved files
if [ -d "$BACKUP_DIR" ] && [ -f "$BACKUP_DIR/models/model_example.gguf" ]; then
  MODEL_EXISTS=true
elif check_model_exists; then
  MODEL_EXISTS=true
fi

if [ "$MODEL_EXISTS" = true ]; then
  log_message "model_example.gguf exists, excluding sample_model from installation..."
  # Add sample_model to exclusion pattern
  if [ -z "$EXCLUDE_PATTERN" ]; then
    EXCLUDE_PATTERN="-path ./core/Hot/sample_model"
  else
    EXCLUDE_PATTERN="$EXCLUDE_PATTERN -o -path ./core/Hot/sample_model"
  fi
fi

if [ "$LOG_MODE" = true ]; then
  # Copy with verbose output for logging
  if [ -n "$EXCLUDE_PATTERN" ]; then
    (cd "$REPO_DIR" && find . \( $EXCLUDE_PATTERN \) -prune -o -type f -print | while read file; do
      if [ -n "$file" ] && [ "$file" != "." ]; then
        dest_file="$INSTALL_DIR/$file"
        mkdir -p "$(dirname "$dest_file")"
        cp -v "$file" "$dest_file"
      fi
    done) &
  else
    # No exclusions defined - use original pattern with .git exclusion unless --movegit is specified
    if [ "$MOVE_GIT" = true ]; then
      # Include .git in copy
      (cd "$REPO_DIR" && find . \( -path ./core/upack -o -path ./core/upack-server -o -path ./core/apk \) -prune -o -type f -print | while read file; do
        if [ -n "$file" ] && [ "$file" != "." ]; then
          dest_file="$INSTALL_DIR/$file"
          mkdir -p "$(dirname "$dest_file")"
          cp -v "$file" "$dest_file"
        fi
      done) &
    else
      # Exclude .git (default)
      (cd "$REPO_DIR" && find . \( -path ./.git -o -path ./core/upack -o -path ./core/upack-server -o -path ./core/apk \) -prune -o -type f -print | while read file; do
        if [ -n "$file" ] && [ "$file" != "." ]; then
          dest_file="$INSTALL_DIR/$file"
          mkdir -p "$(dirname "$dest_file")"
          cp -v "$file" "$dest_file"
        fi
      done) &
    fi
  fi
else
  # Silent copy
  if [ -n "$EXCLUDE_PATTERN" ]; then
    (cd "$REPO_DIR" && find . \( $EXCLUDE_PATTERN \) -prune -o -type f -exec cp --parents {} "$INSTALL_DIR" \; 2>/dev/null) &
  else
    # No exclusions defined - use original pattern with .git exclusion unless --movegit is specified
    if [ "$MOVE_GIT" = true ]; then
      # Include .git in copy
      (cd "$REPO_DIR" && find . \( -path ./core/upack -o -path ./core/upack-server -o -path ./core/apk \) -prune -o -type f -exec cp --parents {} "$INSTALL_DIR" \; 2>/dev/null) &
    else
      # Exclude .git (default)
      (cd "$REPO_DIR" && find . \( -path ./.git -o -path ./core/upack -o -path ./core/upack-server -o -path ./core/apk \) -prune -o -type f -exec cp --parents {} "$INSTALL_DIR" \; 2>/dev/null) &
    fi
  fi
fi

show_progress "Copying files" $!

# Count files to verify copy was successful
if [ -n "$EXCLUDE_PATTERN" ]; then
  src_count=$(cd "$REPO_DIR" && find . \( $EXCLUDE_PATTERN \) -prune -o -type f -print | wc -l)
else
  if [ "$MOVE_GIT" = true ]; then
    src_count=$(cd "$REPO_DIR" && find . \( -path ./core/upack -o -path ./core/upack-server -o -path ./core/apk \) -prune -o -type f -print | wc -l)
  else
    src_count=$(cd "$REPO_DIR" && find . \( -path ./.git -o -path ./core/upack -o -path ./core/upack-server -o -path ./core/apk \) -prune -o -type f -print | wc -l)
  fi
fi
dest_count=$(find "$INSTALL_DIR" -type f | wc -l)

if [ "$src_count" -eq "$dest_count" ]; then
  log_message "Successfully copied $src_count files."
else
  log_message "File count mismatch: source has $src_count files, destination has $dest_count files."
  log_message "This may be normal if some files were excluded during copy."
fi

# Restore preserved files from backup if this was an update
preserve_files_from_backup

# Extract the pm2 tar.gz file
if [ -f "$PM2_TAR_GZ" ]; then
  log_message "Extracting $PM2_TAR_GZ to $PM2_EXTRACT_DIR..."
  mkdir -p "$PM2_EXTRACT_DIR"
  tar -xzf "$PM2_TAR_GZ" -C "$PM2_EXTRACT_DIR" --strip-components=1 > /dev/null 2>&1
  log_message "PM2 extraction completed."
else
  log_message "The pm2 tar.gz file ($PM2_TAR_GZ) does not exist. Skipping extraction."
fi

# Check if we should handle sample_model specially (only if model doesn't exist)
if check_model_exists; then
  log_message "model_example.gguf exists in models directory. Skipping sample_model-related operations."
  
  # IMPORTANT: Remove the sample_model directory if it was accidentally copied
  SAMPLE_MODEL_DIR="$INSTALL_DIR/core/Hot/sample_model"
  if [ -d "$SAMPLE_MODEL_DIR" ]; then
    log_message "Removing sample_model directory as model already exists..."
    rm -rf "$SAMPLE_MODEL_DIR"
    log_message "Sample_model directory removed."
  fi
else
  log_message "model_example.gguf not found, sample_model may be processed if exists..."
  # If sample_model directory exists in installation, post-install script will run
fi

# Create command links (either wrappers or direct symlinks based on mode)
create_command_links "$INSTALL_DIR"

# =============================================================================
# EXECUTE POST-INSTALL SCRIPTS (strictly from installation directory)
# =============================================================================
execute_post_install_scripts

log_message "Setup complete. You can now use the commands globally."

if [ "$LOCAL_DIR_MODE" = true ]; then
  log_message "Note: Commands will run from your current directory (--local-dir mode)"
else
  log_message "Note: Command working directories:"
  log_message "  webgpt:   Installation directory ($INSTALL_DIR)"
  log_message "  generate: Installation directory ($INSTALL_DIR)"
  log_message "  chat:     Installation directory ($INSTALL_DIR)"
  log_message "  ai:       Installation directory ($INSTALL_DIR)"
  log_message "  pm2:      Your current working directory (caller)"
fi

if [ "$PRESERVE_DATA" = true ] && [ -d "$BACKUP_DIR" ]; then
  log_message "Note: Whitelisted files were preserved during update"
fi

# Display package installation method information
if [ "$SKIP_PKGS" = true ]; then
  log_message "Note: Package installation was skipped (--skip-pkgs or existing installation)"
elif [ "$ONLINE_MODE" = true ]; then
  log_message "Note: Packages were installed online using system package manager (--online mode)"
elif [ "$OS_TYPE" = "ubuntu" ] && [ "$ON_WSL" = true ]; then
  log_message "Note: Ubuntu on WSL detected - packages were installed online using apt"
else
  log_message "Note: Packages were installed from local .deb/.apk files"
fi

# Display git directory status
if [ "$MOVE_GIT" = true ]; then
  log_message "Note: Git directory was included in installation (--movegit enabled)"
else
  log_message "Note: Git directory was excluded from installation (default, use --movegit to include)"
fi

log_message "Installation completed successfully!"