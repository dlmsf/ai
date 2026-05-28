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
BUILD_TAR=false
BUILD_CONFIG=false
BUILD_MESSAGE_MODE=false
BUILD_DIR="$REPO_DIR/build"
ONLINE_MODE=false
MOVE_GIT=false
BUILD_SAVE_FILE="$REPO_DIR/buildsaves.cfg"

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

# =============================================================================
# BUILD SAVE/LOAD FUNCTIONS - Pure bash, no external dependencies
# =============================================================================

save_build_configuration() {
    save_name="$1"
    tmp_file="${BUILD_SAVE_FILE}.tmp.$$"
   
    # Copy existing saves, skipping the one being overwritten
    if [ -f "$BUILD_SAVE_FILE" ]; then
        skip_section=false
        while IFS= read -r line; do
            case "$line" in
                "[SAVE:${save_name}]")
                    skip_section=true
                    continue
                    ;;
                "[/SAVE:${save_name}]")
                    skip_section=false
                    continue
                    ;;
            esac
            [ "$skip_section" = false ] && echo "$line" >> "$tmp_file"
        done < "$BUILD_SAVE_FILE"
    else
        > "$tmp_file"
    fi
   
    # Count current exclusions
    excl_file_count=0
    excl_dir_count=0
    [ -f "$EXCLUDE_LIST" ] && excl_file_count=$(wc -l < "$EXCLUDE_LIST" 2>/dev/null || echo 0)
    [ -f "$EXCLUDE_DIRS_LIST" ] && excl_dir_count=$(wc -l < "$EXCLUDE_DIRS_LIST" 2>/dev/null || echo 0)
   
    # Write new save section
    {
        echo "[SAVE:${save_name}]"
        echo "DATE=$(date)"
        echo "TAR=${BUILD_TAR}"
        echo "COMMIT=${BUILD_SELECTED_COMMIT:-HEAD}"
        echo "COMMIT_MESSAGE=${BUILD_SELECTED_COMMIT_MSG:-HEAD}"
        echo "EXCLUDED_FILES_COUNT=${excl_file_count}"
        echo "EXCLUDED_DIRECTORIES_COUNT=${excl_dir_count}"
       
        if [ -f "$EXCLUDE_LIST" ] && [ -s "$EXCLUDE_LIST" ]; then
            while IFS= read -r f; do
                [ -n "$f" ] && echo "EXCLUDED_FILE=${f}"
            done < "$EXCLUDE_LIST"
        fi
       
        if [ -f "$EXCLUDE_DIRS_LIST" ] && [ -s "$EXCLUDE_DIRS_LIST" ]; then
            while IFS= read -r d; do
                [ -n "$d" ] && echo "EXCLUDED_DIRECTORY=${d}"
            done < "$EXCLUDE_DIRS_LIST"
        fi
       
        echo "[/SAVE:${save_name}]"
    } >> "$tmp_file"
   
    mv "$tmp_file" "$BUILD_SAVE_FILE"
    echo "Build configuration saved as: $save_name"
    return 0
}

load_build_configuration() {
    save_name="$1"
   
    if [ ! -f "$BUILD_SAVE_FILE" ]; then
        echo "Error: No saved configurations file found"
        return 1
    fi
   
    if ! grep -q "^\[SAVE:${save_name}\]$" "$BUILD_SAVE_FILE"; then
        echo "Error: Saved configuration '${save_name}' not found"
        return 1
    fi
   
    # Clear current exclusions
    > "$EXCLUDE_LIST"
    > "$EXCLUDE_DIRS_LIST"
   
    # Extract save section
    in_section=false
    while IFS= read -r line; do
        case "$line" in
            "[SAVE:${save_name}]")
                in_section=true
                continue
                ;;
            "[/SAVE:${save_name}]")
                in_section=false
                break
                ;;
        esac
       
        if [ "$in_section" = true ]; then
            case "$line" in
                TAR=*)
                    val=$(echo "$line" | cut -d= -f2-)
                    [ "$val" = "true" ] && BUILD_TAR=true || BUILD_TAR=false
                    ;;
                COMMIT=*)
                    val=$(echo "$line" | cut -d= -f2-)
                    if [ "$val" = "HEAD" ] || [ -z "$val" ]; then
                        BUILD_SELECTED_COMMIT=""
                    else
                        BUILD_SELECTED_COMMIT="$val"
                    fi
                    ;;
                COMMIT_MESSAGE=*)
                    BUILD_SELECTED_COMMIT_MSG=$(echo "$line" | cut -d= -f2-)
                    ;;
                EXCLUDED_FILE=*)
                    echo "$line" | cut -d= -f2- >> "$EXCLUDE_LIST"
                    ;;
                EXCLUDED_DIRECTORY=*)
                    echo "$line" | cut -d= -f2- >> "$EXCLUDE_DIRS_LIST"
                    ;;
            esac
        fi
    done < "$BUILD_SAVE_FILE"
   
    export BUILD_SELECTED_COMMIT
    export BUILD_SELECTED_COMMIT_MSG
    export BUILD_EXCLUDE_DIRS_LIST="$EXCLUDE_DIRS_LIST"
   
    echo "Loaded build configuration: $save_name"
    return 0
}

list_saved_configurations() {
    [ ! -f "$BUILD_SAVE_FILE" ] && return 1
   
    count=0
    while IFS= read -r line; do
        case "$line" in
            \[SAVE:*)
                name=$(echo "$line" | sed 's/^\[SAVE://;s/\]$//')
                count=$((count + 1))
                printf "  %2s. %s\n" "$count" "$name"
                ;;
        esac
    done < "$BUILD_SAVE_FILE"
   
    return $count
}

delete_saved_configuration() {
    save_name="$1"
   
    [ ! -f "$BUILD_SAVE_FILE" ] && return 1
   
    tmp_file="${BUILD_SAVE_FILE}.tmp.$$"
   
    skip_section=false
    while IFS= read -r line; do
        case "$line" in
            "[SAVE:${save_name}]")
                skip_section=true
                continue
                ;;
            "[/SAVE:${save_name}]")
                skip_section=false
                continue
                ;;
        esac
        [ "$skip_section" = false ] && echo "$line" >> "$tmp_file"
    done < "$BUILD_SAVE_FILE"
   
    mv "$tmp_file" "$BUILD_SAVE_FILE"
    echo "Deleted saved configuration: $save_name"
    return 0
}

# =============================================================================
# END OF BUILD SAVE/LOAD FUNCTIONS
# =============================================================================

# =============================================================================
# BUILD SYSTEM FUNCTIONS
# =============================================================================

# Sanitize string for filesystem (remove/replace invalid characters)
sanitize_filename() {
    input="$1"
    # Replace spaces with underscores
    # Replace invalid filesystem characters with underscores
    # Keep only alphanumeric, dots, dashes, underscores
    sanitized=$(echo "$input" | tr ' ' '_' | sed 's/[^a-zA-Z0-9._-]/_/g' | sed 's/__*/_/g' | sed 's/^_//' | sed 's/_$//')
    
    # If empty after sanitization, use default
    [ -z "$sanitized" ] && sanitized="build"
    
    echo "$sanitized"
}

# Get last commit message and sanitize for filename
get_commit_filename() {
    if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
        commit_msg=$(git log -1 --pretty=%B 2>/dev/null | head -n1)
        if [ -n "$commit_msg" ]; then
            sanitize_filename "$commit_msg"
        else
            echo "initial_build"
        fi
    else
        echo "build_$(date +%Y%m%d_%H%M%S)"
    fi
}

# NEW: Find the latest version tag/commit and calculate version with commit distance
calculate_build_version() {
    target_commit="$1"
    
    if [ -z "$target_commit" ]; then
        target_commit="HEAD"
    fi
    
    # Initialize variables
    latest_version=""
    latest_version_commit=""
    latest_distance=999999999
    
    # Create temp file for version candidates from commit messages
    VERSION_CANDIDATES="/tmp/build_version_candidates_$$.txt"
    > "$VERSION_CANDIDATES"
    
    # Find all version tags (tags matching semantic versioning)
    version_tags=$(git tag --sort=-creatordate 2>/dev/null | grep -E '^[0-9]+\.[0-9]+(\.[0-9]+)?$' 2>/dev/null)
    
    # Check tags first
    if [ -n "$version_tags" ]; then
        for tag in $version_tags; do
            # Check if this tag is an ancestor of the target commit
            if git merge-base --is-ancestor "$tag" "$target_commit" 2>/dev/null; then
                # Calculate the distance (number of commits between tag and target)
                distance=$(git rev-list --count "$tag..$target_commit" 2>/dev/null || echo 0)
                
                # If this is closer to the target (smaller distance), use it
                if [ "$distance" -lt "$latest_distance" ]; then
                    latest_version="$tag"
                    latest_version_commit="$tag"
                    latest_distance="$distance"
                fi
            fi
        done
    fi
    
    # Also search commit messages for version patterns
    # We write candidates to a temp file to avoid subshell issues
    git log --all --oneline --grep='^[0-9]\+\.[0-9]\+\(\.[0-9]\+\)\?$' --format="%H %s" 2>/dev/null | while IFS=' ' read -r commit_hash version_msg; do
        # Check if this commit is an ancestor of the target commit
        if git merge-base --is-ancestor "$commit_hash" "$target_commit" 2>/dev/null; then
            # Calculate the distance
            distance=$(git rev-list --count "$commit_hash..$target_commit" 2>/dev/null || echo 0)
            echo "${distance}|${version_msg}|${commit_hash}" >> "$VERSION_CANDIDATES"
        fi
    done
    
    # Process candidates from commit messages (they're already sorted by git log, so newest first)
    if [ -s "$VERSION_CANDIDATES" ]; then
        # Sort by distance (closest first)
        best_candidate=$(sort -t'|' -k1 -n "$VERSION_CANDIDATES" | head -1)
        if [ -n "$best_candidate" ]; then
            candidate_distance=$(echo "$best_candidate" | cut -d'|' -f1)
            candidate_version=$(echo "$best_candidate" | cut -d'|' -f2)
            candidate_commit=$(echo "$best_candidate" | cut -d'|' -f3)
            
            # If this candidate is closer than the tag we found, use it
            if [ "$candidate_distance" -lt "$latest_distance" ]; then
                latest_version="$candidate_version"
                latest_version_commit="$candidate_commit"
                latest_distance="$candidate_distance"
            fi
        fi
    fi
    
    # Clean up temp file
    rm -f "$VERSION_CANDIDATES"
    
    # Generate the final version string
    if [ -n "$latest_version" ]; then
        if [ "$latest_distance" -gt 0 ]; then
            echo "${latest_version}.${latest_distance}"
        else
            echo "${latest_version}"
        fi
    else
        # No version found at all
        echo ""
    fi
}

# NEW: Format file size for display
format_file_size() {
    bytes=$1
    case "$bytes" in
        ''|*[!0-9]*) echo "0B" ; return ;;
    esac
    
    if [ "$bytes" -ge 1073741824 ]; then
        gb=$(echo "scale=1; $bytes / 1073741824" | bc 2>/dev/null || echo "$((bytes / 1073741824))")
        echo "${gb}GB"
    elif [ "$bytes" -ge 1048576 ]; then
        mb=$(echo "scale=1; $bytes / 1048576" | bc 2>/dev/null || echo "$((bytes / 1048576))")
        echo "${mb}MB"
    elif [ "$bytes" -ge 1024 ]; then
        kb=$(echo "scale=1; $bytes / 1024" | bc 2>/dev/null || echo "$((bytes / 1024))")
        echo "${kb}KB"
    else
        echo "${bytes}B"
    fi
}

# NEW: Check if a file is inside an excluded directory
is_file_in_excluded_dir() {
    file_to_check="$1"
    if [ -s "$EXCLUDE_DIRS_LIST" ]; then
        while IFS= read -r excluded_dir; do
            [ -z "$excluded_dir" ] && continue
            case "$file_to_check" in
                ${excluded_dir}/*|${excluded_dir})
                    return 0
                    ;;
            esac
        done < "$EXCLUDE_DIRS_LIST"
    fi
    return 1
}

# NEW: Calculate total build statistics
calculate_build_stats() {
    total_size=0
    total_files=0
   
    while IFS='|' read -r size name; do
        [ -z "$name" ] && continue
        if grep -q "^${name}$" "$EXCLUDE_LIST" 2>/dev/null; then
            continue
        fi
        if is_file_in_excluded_dir "$name"; then
            continue
        fi
        total_size=$((total_size + size))
        total_files=$((total_files + 1))
    done < "$BUILD_FILES_LIST"
   
    echo "$total_size|$total_files"
}

# Interactive configuration interface for build exclusion (COMPACT VERSION)
build_config_interface() {
    echo ""
    echo "========================================="
    echo "  BUILD CONFIGURATION"
    echo "========================================="
    echo ""
    echo "Select files and directories to EXCLUDE from the build"
    echo ""
    
    if ! command -v git >/dev/null 2>&1 || ! git rev-parse --git-dir >/dev/null 2>&1; then
        echo "Error: Not in a git repository"
        return 1
    fi
    
    EXCLUDE_LIST="/tmp/build_exclude_$$.txt"
    EXCLUDE_DIRS_LIST="/tmp/build_exclude_dirs_$$.txt"
    > "$EXCLUDE_LIST"
    > "$EXCLUDE_DIRS_LIST"
    
    BUILD_FILES_LIST="/tmp/build_files_$$.txt"
    BUILD_DIRS_LIST="/tmp/build_dirs_$$.txt"
    > "$BUILD_FILES_LIST"
    > "$BUILD_DIRS_LIST"
    
    # Store selected commit (empty = HEAD/latest)
    SELECTED_COMMIT=""
    SELECTED_COMMIT_MSG=""
    
    # Cache file for commit metadata
    COMMIT_CACHE="/tmp/build_commits_cache_$$.txt"
    MONTH_CACHE="/tmp/build_months_cache_$$.txt"
    
    echo "Loading files..."
    
    # Function to load files from a specific commit
    load_files_from_commit() {
        commit="$1"
        > "$BUILD_FILES_LIST"
        > "$BUILD_DIRS_LIST"
        
        if [ -z "$commit" ]; then
            # Use current working tree - much faster
            git ls-files -z 2>/dev/null | xargs -0 -I{} sh -c '
                if [ -f "$1" ]; then
                    size=$(wc -c < "$1" 2>/dev/null || echo 0)
                else
                    size=0
                fi
                case "$1" in
                    *.js|*.sh|*.py|*.rb|*.php|*.ts|*.jsx|*.tsx|*.css|*.html|*.json|*.xml|*.yml|*.yaml|*.md|*.txt|*.conf|*.cfg|*.ini)
                        printf "%s|%s|C\n" "$size" "$1" ;;
                    *)
                        printf "%s|%s|D\n" "$size" "$1" ;;
                esac
            ' _ {} 2>/dev/null | sort -t'|' -k1 -n -r > "$BUILD_FILES_LIST"
            
            # Get all directories
            git ls-files -z 2>/dev/null | xargs -0 -I{} dirname "{}" 2>/dev/null | sort -u | while IFS= read -r dir; do
                [ -z "$dir" ] && continue
                [ "$dir" = "." ] && continue
                # Calculate total size of files in this directory
                dir_size=$(find "$dir" -maxdepth 1 -type f -exec wc -c {} + 2>/dev/null | tail -1 | awk '{print $1}')
                [ -z "$dir_size" ] && dir_size=0
                file_count=$(find "$dir" -maxdepth 1 -type f 2>/dev/null | wc -l)
                echo "${dir_size}|${dir}|${file_count}" >> "$BUILD_DIRS_LIST"
            done
            
            # Sort directories by size
            if [ -s "$BUILD_DIRS_LIST" ]; then
                sort -t'|' -k1 -n -r "$BUILD_DIRS_LIST" > "${BUILD_DIRS_LIST}.sorted"
                mv "${BUILD_DIRS_LIST}.sorted" "$BUILD_DIRS_LIST"
            fi
        else
            # Use files from specific commit
            git ls-tree -r -l "$commit" 2>/dev/null | while IFS=' ' read -r mode type hash rest; do
                # Extract size and filename using awk for better parsing
                size=$(echo "$rest" | awk '{print $1}')
                filename=$(echo "$rest" | cut -d' ' -f2-)
                
                # If size is "-" or empty (submodules, etc.), set to 0
                if [ "$size" = "-" ] || [ -z "$size" ]; then
                    size=0
                fi
                
                [ -z "$filename" ] && continue
                
                case "$filename" in
                    *.js|*.sh|*.py|*.rb|*.php|*.ts|*.jsx|*.tsx|*.css|*.html|*.json|*.xml|*.yml|*.yaml|*.md|*.txt|*.conf|*.cfg|*.ini)
                        file_type="C"
                        ;;
                    *)
                        file_type="D"
                        ;;
                esac
                
                echo "${size}|${filename}|${file_type}" >> "$BUILD_FILES_LIST"
                
                # Collect directories
                dirname "$filename" 2>/dev/null >> "/tmp/build_dirs_raw_$$.txt"
            done
            
            # Sort files by size numerically (largest first)
            if [ -s "$BUILD_FILES_LIST" ]; then
                sort -t'|' -k1 -n -r "$BUILD_FILES_LIST" > "${BUILD_FILES_LIST}.sorted"
                mv "${BUILD_FILES_LIST}.sorted" "$BUILD_FILES_LIST"
            fi
            
            # Process directories
            if [ -f "/tmp/build_dirs_raw_$$.txt" ]; then
                sort -u "/tmp/build_dirs_raw_$$.txt" | while IFS= read -r dir; do
                    [ -z "$dir" ] && continue
                    [ "$dir" = "." ] && continue
                    # Count files and total size for this directory from BUILD_FILES_LIST
                    dir_info=$(grep "|${dir}/" "$BUILD_FILES_LIST" 2>/dev/null | awk -F'|' '{sum+=$1; count++} END {printf "%d|%d", sum+0, count+0}')
                    dir_size=$(echo "$dir_info" | cut -d'|' -f1)
                    file_count=$(echo "$dir_info" | cut -d'|' -f2)
                    echo "${dir_size}|${dir}|${file_count}" >> "$BUILD_DIRS_LIST"
                done
                
                if [ -s "$BUILD_DIRS_LIST" ]; then
                    sort -t'|' -k1 -n -r "$BUILD_DIRS_LIST" > "${BUILD_DIRS_LIST}.sorted"
                    mv "${BUILD_DIRS_LIST}.sorted" "$BUILD_DIRS_LIST"
                fi
                
                rm -f "/tmp/build_dirs_raw_$$.txt"
            fi
        fi
    }
    
    # Load current files
    load_files_from_commit ""
    
    # Build month cache for date navigation
    build_month_cache() {
        > "$MONTH_CACHE"
        
        # Extract unique year-month combinations from the commit cache
        if [ -f "$COMMIT_CACHE" ]; then
            while IFS='|' read -r csize hash date msg is_version; do
                [ -z "$hash" ] && continue
                year_month=$(echo "$date" | cut -d'-' -f1-2)
                echo "$year_month" >> "/tmp/build_months_raw_$$.txt"
            done < "$COMMIT_CACHE"
            
            # Get unique months, sorted in reverse (newest first)
            sort -ru "/tmp/build_months_raw_$$.txt" | while IFS= read -r ym; do
                year=$(echo "$ym" | cut -d'-' -f1)
                month=$(echo "$ym" | cut -d'-' -f2)
                
                # Convert month number to name
                case "$month" in
                    01) month_name="January" ;;
                    02) month_name="February" ;;
                    03) month_name="March" ;;
                    04) month_name="April" ;;
                    05) month_name="May" ;;
                    06) month_name="June" ;;
                    07) month_name="July" ;;
                    08) month_name="August" ;;
                    09) month_name="September" ;;
                    10) month_name="October" ;;
                    11) month_name="November" ;;
                    12) month_name="December" ;;
                    *) month_name="Unknown" ;;
                esac
                
                # Count commits for this month
                commit_count=$(grep "^[^|]*|[^|]*|${ym}-" "$COMMIT_CACHE" | wc -l)
                
                echo "${ym}|${year}|${month_name}|${commit_count}" >> "$MONTH_CACHE"
            done
            
            rm -f "/tmp/build_months_raw_$$.txt"
        fi
    }
    
    # Main loop - COMPACT UI optimized for small terminals
    while true; do
        clear
        
        # Calculate stats for compact display
        stats=$(calculate_build_stats)
        build_size=$(echo "$stats" | cut -d'|' -f1)
        build_file_count=$(echo "$stats" | cut -d'|' -f2)
        excl_files=$(wc -l < "$EXCLUDE_LIST" 2>/dev/null || echo 0)
        excl_dirs=$(wc -l < "$EXCLUDE_DIRS_LIST" 2>/dev/null || echo 0)
        
        # Compact header
        echo "=== BUILD CONFIGURATION ==="
        
        # Source info (compact)
        if [ -z "$SELECTED_COMMIT" ]; then
            echo "Source: HEAD (current working tree)"
        else
            short_hash=$(echo "$SELECTED_COMMIT" | cut -c1-7)
            shortened_msg=$(echo "$SELECTED_COMMIT_MSG" | cut -c1-30)
            echo "Source: ${short_hash} ${shortened_msg}"
        fi
        
        # Output type and size (compact)
        if [ "$BUILD_TAR" = true ]; then
            out_display="Tar.gz"
        else
            out_display="Directory"
        fi
        
        size_display=$(format_file_size "$build_size")
        echo "Output: ${out_display} | Size: ${size_display} | Files: ${build_file_count} | Excl: ${excl_files}f/${excl_dirs}d"
        
        # Show current exclusions (only if they exist, compact)
        has_exclusions=false
        
        if [ -s "$EXCLUDE_DIRS_LIST" ] || [ -s "$EXCLUDE_LIST" ]; then
            echo "Excluded:"
            if [ -s "$EXCLUDE_DIRS_LIST" ]; then
                count=0
                while IFS= read -r dir; do
                    [ -z "$dir" ] && continue
                    count=$((count + 1))
                    if [ $count -le 2 ]; then
                        echo "  dir: ${dir}"
                    fi
                done < "$EXCLUDE_DIRS_LIST"
                total_dirs=$(wc -l < "$EXCLUDE_DIRS_LIST" 2>/dev/null || echo 0)
                [ "$total_dirs" -gt 2 ] && echo "  ... and $((total_dirs - 2)) more dirs"
            fi
            if [ -s "$EXCLUDE_LIST" ]; then
                count=0
                while IFS= read -r file; do
                    [ -z "$file" ] && continue
                    count=$((count + 1))
                    if [ $count -le 2 ]; then
                        echo "  file: ${file}"
                    fi
                done < "$EXCLUDE_LIST"
                total_files=$(wc -l < "$EXCLUDE_LIST" 2>/dev/null || echo 0)
                [ "$total_files" -gt 2 ] && echo "  ... and $((total_files - 2)) more files"
            fi
        else
            echo "No files or directories excluded"
        fi
        
        echo "---"
        echo "Actions:"
        echo "1. Exclude directories"
        echo "2. Exclude files"
        echo "3. Search and exclude"
        echo "4. Remove files from exclusion"
        echo "5. Remove directories from exclusion"
        echo "6. Clear all exclusions"
        echo "7. Change source commit"
        echo "8. Toggle output format (${out_display})"
        echo "---"
        echo "s. Save config | l. Load config | d. Delete config"
        echo "9. Done | 0. Quit"
        printf "Choice: "
        read action
        
        case "$action" in
            1)
                # Browse directories to exclude
                current_page=1
                ITEMS_PER_PAGE=5
                
                while true; do
                    AVAILABLE_DIRS="/tmp/build_available_dirs_$$.txt"
                    > "$AVAILABLE_DIRS"
                    
                    while IFS='|' read -r dir_size dir_name file_count; do
                        [ -z "$dir_name" ] && continue
                        if ! grep -q "^${dir_name}$" "$EXCLUDE_DIRS_LIST" 2>/dev/null; then
                            echo "${dir_size}|${dir_name}|${file_count}" >> "$AVAILABLE_DIRS"
                        fi
                    done < "$BUILD_DIRS_LIST"
                    
                    total_items=$(wc -l < "$AVAILABLE_DIRS")
                    
                    if [ "$total_items" -eq 0 ]; then
                        echo ""
                        echo "  All directories are already excluded!"
                        sleep 1
                        break
                    fi
                    
                    total_pages=$(( (total_items + ITEMS_PER_PAGE - 1) / ITEMS_PER_PAGE ))
                    [ "$current_page" -gt "$total_pages" ] && current_page="$total_pages"
                    [ "$current_page" -lt 1 ] && current_page=1
                    
                    start_line=$(( (current_page - 1) * ITEMS_PER_PAGE + 1 ))
                    end_line=$(( current_page * ITEMS_PER_PAGE ))
                    
                    clear
                    echo "=== Select Directories to Exclude (${current_page}/${total_pages}) ==="
                    
                    line_num=0
                    counter=1
                    while IFS='|' read -r dir_size dir_name file_count; do
                        line_num=$((line_num + 1))
                        [ "$line_num" -lt "$start_line" ] && continue
                        [ "$line_num" -gt "$end_line" ] && break
                        [ -z "$dir_name" ] && continue
                        
                        size_display=$(format_file_size "$dir_size")
                        printf "  %2s. %8s  %s (%s files)\n" "$counter" "$size_display" "$dir_name" "$file_count"
                        counter=$((counter + 1))
                    done < "$AVAILABLE_DIRS"
                    
                    echo ""
                    echo "n=next p=previous b=back"
                    printf "> "
                    read cmd
                    
                    case "$cmd" in
                        n|N) [ "$current_page" -lt "$total_pages" ] && current_page=$((current_page + 1)) ;;
                        p|P) [ "$current_page" -gt 1 ] && current_page=$((current_page - 1)) ;;
                        b|B) break ;;
                        *)
                            if echo "$cmd" | grep -q '^[0-9]\+$'; then
                                line_num=0
                                counter=1
                                while IFS='|' read -r dir_size dir_name file_count; do
                                    line_num=$((line_num + 1))
                                    [ "$line_num" -lt "$start_line" ] && continue
                                    [ "$line_num" -gt "$end_line" ] && break
                                    [ -z "$dir_name" ] && continue
                                    
                                    if [ "$counter" = "$cmd" ]; then
                                        if ! grep -q "^${dir_name}$" "$EXCLUDE_DIRS_LIST" 2>/dev/null; then
                                            echo "$dir_name" >> "$EXCLUDE_DIRS_LIST"
                                            # Also add all files in this directory to the exclude list automatically
                                            while IFS='|' read -r sz fn ft; do
                                                [ -z "$fn" ] && continue
                                                case "$fn" in
                                                    ${dir_name}/*|${dir_name})
                                                        if ! grep -q "^${fn}$" "$EXCLUDE_LIST" 2>/dev/null; then
                                                            echo "$fn" >> "$EXCLUDE_LIST"
                                                        fi
                                                        ;;
                                                esac
                                            done < "$BUILD_FILES_LIST"
                                            echo ""
                                            echo "  Excluded directory: $dir_name"
                                            sleep 0.5
                                        fi
                                        break
                                    fi
                                    counter=$((counter + 1))
                                done < "$AVAILABLE_DIRS"
                            fi
                            ;;
                    esac
                done
                rm -f "$AVAILABLE_DIRS"
                ;;
            
            2)
                # Browse files by size (with excluded dir files marked)
                current_page=1
                ITEMS_PER_PAGE=5
                
                while true; do
                    AVAILABLE_LIST="/tmp/build_available_$$.txt"
                    > "$AVAILABLE_LIST"
                    
                    while IFS='|' read -r size_bytes filename file_type; do
                        [ -z "$filename" ] && continue
                        if ! grep -q "^${filename}$" "$EXCLUDE_LIST" 2>/dev/null; then
                            # Check if file is in excluded directory
                            if is_file_in_excluded_dir "$filename"; then
                                echo "${size_bytes}|${filename}|IN_DIR" >> "$AVAILABLE_LIST"
                            else
                                echo "${size_bytes}|${filename}|NORMAL" >> "$AVAILABLE_LIST"
                            fi
                        fi
                    done < "$BUILD_FILES_LIST"
                    
                    total_items=$(wc -l < "$AVAILABLE_LIST")
                    
                    if [ "$total_items" -eq 0 ]; then
                        echo ""
                        echo "  All files are already excluded!"
                        sleep 1
                        break
                    fi
                    
                    total_pages=$(( (total_items + ITEMS_PER_PAGE - 1) / ITEMS_PER_PAGE ))
                    [ "$current_page" -gt "$total_pages" ] && current_page="$total_pages"
                    [ "$current_page" -lt 1 ] && current_page=1
                    
                    start_line=$(( (current_page - 1) * ITEMS_PER_PAGE + 1 ))
                    end_line=$(( current_page * ITEMS_PER_PAGE ))
                    
                    clear
                    echo "=== Select Files to Exclude (${current_page}/${total_pages}) ==="
                    
                    line_num=0
                    counter=1
                    while IFS='|' read -r size_bytes filename status; do
                        line_num=$((line_num + 1))
                        [ "$line_num" -lt "$start_line" ] && continue
                        [ "$line_num" -gt "$end_line" ] && break
                        [ -z "$filename" ] && continue
                        
                        size_display=$(format_file_size "$size_bytes")
                        
                        marker=""
                        [ "$status" = "IN_DIR" ] && marker=" [in excluded dir]"
                        
                        printf "  %2s. %8s  %s%s\n" "$counter" "$size_display" "$filename" "$marker"
                        counter=$((counter + 1))
                    done < "$AVAILABLE_LIST"
                    
                    echo ""
                    echo "n=next p=previous b=back"
                    echo "Files marked [in excluded dir] are in an excluded directory"
                    printf "> "
                    read cmd
                    
                    case "$cmd" in
                        n|N) [ "$current_page" -lt "$total_pages" ] && current_page=$((current_page + 1)) ;;
                        p|P) [ "$current_page" -gt 1 ] && current_page=$((current_page - 1)) ;;
                        b|B) break ;;
                        *)
                            if echo "$cmd" | grep -q '^[0-9]\+$'; then
                                line_num=0
                                counter=1
                                while IFS='|' read -r size_bytes filename status; do
                                    line_num=$((line_num + 1))
                                    [ "$line_num" -lt "$start_line" ] && continue
                                    [ "$line_num" -gt "$end_line" ] && break
                                    [ -z "$filename" ] && continue
                                    
                                    if [ "$counter" = "$cmd" ]; then
                                        if ! grep -q "^${filename}$" "$EXCLUDE_LIST" 2>/dev/null; then
                                            echo "$filename" >> "$EXCLUDE_LIST"
                                            echo "  Excluded: $filename"
                                            sleep 0.5
                                        fi
                                        break
                                    fi
                                    counter=$((counter + 1))
                                done < "$AVAILABLE_LIST"
                            fi
                            ;;
                    esac
                done
                rm -f "$AVAILABLE_LIST"
                ;;
            
            3)
                # Search and add
                clear
                echo "=== Search Files to Exclude ==="
                printf "Enter search term (or empty to cancel): "
                read search_term
                
                if [ -n "$search_term" ]; then
                    SEARCH_RESULTS="/tmp/build_search_$$.txt"
                    > "$SEARCH_RESULTS"
                    
                    while IFS='|' read -r size_bytes filename file_type; do
                        [ -z "$filename" ] && continue
                        case "$filename" in
                            *"$search_term"*) 
                                if ! grep -q "^${filename}$" "$EXCLUDE_LIST" 2>/dev/null; then
                                    if is_file_in_excluded_dir "$filename"; then
                                        echo "${size_bytes}|${filename}|IN_DIR" >> "$SEARCH_RESULTS"
                                    else
                                        echo "${size_bytes}|${filename}|NORMAL" >> "$SEARCH_RESULTS"
                                    fi
                                fi
                                ;;
                        esac
                    done < "$BUILD_FILES_LIST"
                    
                    result_count=$(wc -l < "$SEARCH_RESULTS")
                    
                    if [ "$result_count" -eq 0 ]; then
                        echo ""
                        echo "  No matching files found."
                        sleep 1
                    else
                        echo ""
                        echo "  Found $result_count matching files:"
                        
                        counter=1
                        while IFS='|' read -r size_bytes filename status; do
                            [ -z "$filename" ] && continue
                            size_display=$(format_file_size "$size_bytes")
                            marker=""
                            [ "$status" = "IN_DIR" ] && marker=" [in excluded dir]"
                            printf "  %2s. %8s  %s%s\n" "$counter" "$size_display" "$filename" "$marker"
                            counter=$((counter + 1))
                        done < "$SEARCH_RESULTS"
                        
                        echo ""
                        echo "Enter number to exclude | a=exclude all | b=back"
                        printf "> "
                        read search_cmd
                        
                        case "$search_cmd" in
                            a|A)
                                while IFS='|' read -r size_bytes filename status; do
                                    [ -z "$filename" ] && continue
                                    echo "$filename" >> "$EXCLUDE_LIST"
                                done < "$SEARCH_RESULTS"
                                echo "  All matching files excluded!"
                                sleep 1
                                ;;
                            b|B) ;;
                            *)
                                if echo "$search_cmd" | grep -q '^[0-9]\+$'; then
                                    counter=1
                                    while IFS='|' read -r size_bytes filename status; do
                                        [ -z "$filename" ] && continue
                                        if [ "$counter" = "$search_cmd" ]; then
                                            echo "$filename" >> "$EXCLUDE_LIST"
                                            echo "  Excluded: $filename"
                                            sleep 0.5
                                            break
                                        fi
                                        counter=$((counter + 1))
                                    done < "$SEARCH_RESULTS"
                                fi
                                ;;
                        esac
                    fi
                    rm -f "$SEARCH_RESULTS"
                fi
                ;;
            
            4)
                # Remove from file exclusion list
                if [ ! -s "$EXCLUDE_LIST" ]; then
                    echo ""
                    echo "  No files in exclusion list to remove."
                    sleep 1
                else
                    clear
                    echo "=== Remove Files from Exclusion List ==="
                    
                    counter=1
                    > "/tmp/build_remove_$$.txt"
                    while IFS= read -r file; do
                        [ -z "$file" ] && continue
                        printf "  %2s. %s\n" "$counter" "$file"
                        echo "${counter}|${file}" >> "/tmp/build_remove_$$.txt"
                        counter=$((counter + 1))
                    done < "$EXCLUDE_LIST"
                    
                    echo ""
                    echo "Enter number | a=remove all | b=back"
                    printf "> "
                    read remove_cmd
                    
                    case "$remove_cmd" in
                        a|A) > "$EXCLUDE_LIST"; echo "  All file exclusions removed!"; sleep 1 ;;
                        b|B) ;;
                        *)
                            if echo "$remove_cmd" | grep -q '^[0-9]\+$'; then
                                file_to_remove=$(grep "^${remove_cmd}|" "/tmp/build_remove_$$.txt" 2>/dev/null | cut -d'|' -f2)
                                if [ -n "$file_to_remove" ]; then
                                    grep -v "^${file_to_remove}$" "$EXCLUDE_LIST" > "${EXCLUDE_LIST}.tmp" 2>/dev/null
                                    mv "${EXCLUDE_LIST}.tmp" "$EXCLUDE_LIST" 2>/dev/null
                                    echo "  Removed: $file_to_remove"
                                    sleep 0.5
                                fi
                            fi
                            ;;
                    esac
                    rm -f "/tmp/build_remove_$$.txt"
                fi
                ;;
            
            5)
                # Remove from directory exclusion list
                if [ ! -s "$EXCLUDE_DIRS_LIST" ]; then
                    echo ""
                    echo "  No directories in exclusion list to remove."
                    sleep 1
                else
                    clear
                    echo "=== Remove Directories from Exclusion List ==="
                    
                    counter=1
                    > "/tmp/build_remove_dirs_$$.txt"
                    while IFS= read -r dir; do
                        [ -z "$dir" ] && continue
                        printf "  %2s. %s\n" "$counter" "$dir"
                        echo "${counter}|${dir}" >> "/tmp/build_remove_dirs_$$.txt"
                        counter=$((counter + 1))
                    done < "$EXCLUDE_DIRS_LIST"
                    
                    echo ""
                    echo "NOTE: Also removes dir files from exclusion"
                    echo "Enter number | a=remove all | b=back"
                    printf "> "
                    read remove_cmd
                    
                    case "$remove_cmd" in
                        a|A) 
                            > "$EXCLUDE_DIRS_LIST"
                            > "$EXCLUDE_LIST"
                            echo "  All directory and file exclusions removed!"
                            sleep 1 
                            ;;
                        b|B) ;;
                        *)
                            if echo "$remove_cmd" | grep -q '^[0-9]\+$'; then
                                dir_to_remove=$(grep "^${remove_cmd}|" "/tmp/build_remove_dirs_$$.txt" 2>/dev/null | cut -d'|' -f2)
                                if [ -n "$dir_to_remove" ]; then
                                    # Remove directory from exclusion list
                                    grep -v "^${dir_to_remove}$" "$EXCLUDE_DIRS_LIST" > "${EXCLUDE_DIRS_LIST}.tmp" 2>/dev/null
                                    mv "${EXCLUDE_DIRS_LIST}.tmp" "$EXCLUDE_DIRS_LIST" 2>/dev/null
                                    
                                    # Also remove files that were only excluded because of this directory
                                    if [ -s "$EXCLUDE_DIRS_LIST" ]; then
                                        grep -v "^${dir_to_remove}/" "$EXCLUDE_LIST" > "${EXCLUDE_LIST}.tmp" 2>/dev/null
                                        mv "${EXCLUDE_LIST}.tmp" "$EXCLUDE_LIST" 2>/dev/null
                                    else
                                        > "$EXCLUDE_LIST"
                                    fi
                                    
                                    echo "  Removed directory and its files: $dir_to_remove"
                                    sleep 0.5
                                fi
                            fi
                            ;;
                    esac
                    rm -f "/tmp/build_remove_dirs_$$.txt"
                fi
                ;;
            
            6)
                > "$EXCLUDE_LIST"
                > "$EXCLUDE_DIRS_LIST"
                echo ""
                echo "  All exclusions cleared!"
                sleep 1
                ;;
            
            7)
                # Change source commit - OPTIMIZED WITH DATE FILTER AND CORRECT SIZE
                # Build commit cache if it doesn't exist
                if [ ! -f "$COMMIT_CACHE" ]; then
                    echo ""
                    echo "  Building commit cache..."
                    echo "  (This may take a moment for large repositories)"
                    
                    # Progress indicator
                    total_commits=$(git rev-list --all --count 2>/dev/null || echo 0)
                    current=0
                    
                    # Get ALL commit info with CORRECT total sizes
                    git log --all --format="%H|%ai|%s" 2>/dev/null | while IFS='|' read -r hash date msg; do
                        [ -z "$hash" ] && continue
                        
                        # Calculate TOTAL size of all files in this commit
                        commit_size=$(git diff-tree -r -l "$hash" 2>/dev/null | awk '{
                            for(i=1;i<=NF;i++) {
                                if($i ~ /^[0-9]+$/ && $(i-1) ~ /^[MADRC][0-9]*$/) {
                                    sum += $i
                                }
                            }
                        } END { print sum+0 }')
                        
                        # If diff-tree didn't work, fall back to summing all blob sizes
                        if [ "$commit_size" = "0" ] || [ -z "$commit_size" ]; then
                            commit_size=$(git ls-tree -r -l "$hash" 2>/dev/null | awk '{
                                for(i=1;i<=NF;i++) {
                                    if($i ~ /^[0-9]+$/ && i > 3) {
                                        sum += $i
                                        break
                                    }
                                }
                            } END { print sum+0 }')
                        fi
                        
                        [ -z "$commit_size" ] && commit_size=0
                        
                        # Check if message is a version (only numbers and dots)
                        is_version=" "
                        case "$msg" in
                            *[!0-9.]*) ;;
                            *) 
                                case "$msg" in
                                    *.*) is_version="V" ;;
                                esac
                                ;;
                        esac
                        
                        short_date=$(echo "$date" | cut -d' ' -f1)
                        echo "${commit_size}|${hash}|${short_date}|${msg}|${is_version}" >> "$COMMIT_CACHE"
                        
                        # Show progress every 50 commits
                        current=$((current + 1))
                        if [ $((current % 50)) -eq 0 ] && [ "$total_commits" -gt 0 ]; then
                            printf "\r  Processing: %d/%d commits..." "$current" "$total_commits"
                        fi
                    done
                    
                    # Sort by date in reverse (newest first)
                    if [ -s "$COMMIT_CACHE" ]; then
                        sort -t'|' -k3 -r "$COMMIT_CACHE" > "${COMMIT_CACHE}.sorted"
                        mv "${COMMIT_CACHE}.sorted" "$COMMIT_CACHE"
                    fi
                    
                    # Build month cache
                    build_month_cache
                    
                    echo ""
                    echo "  Cache built with $(wc -l < "$COMMIT_CACHE") commits"
                    sleep 1
                fi
                
                current_page=1
                ITEMS_PER_PAGE=5
                show_versions_only=false
                date_filter=""  # Format: YYYY-MM
                
                while true; do
                    FILTERED_COMMITS="/tmp/build_commits_filtered_$$.txt"
                    > "$FILTERED_COMMITS"
                    
                    while IFS='|' read -r csize hash date msg is_version; do
                        [ -z "$hash" ] && continue
                        
                        # Apply version filter
                        if [ "$show_versions_only" = true ] && [ "$is_version" != "V" ]; then
                            continue
                        fi
                        
                        # Apply date filter
                        if [ -n "$date_filter" ]; then
                            case "$date" in
                                ${date_filter}*) ;;
                                *) continue ;;
                            esac
                        fi
                        
                        echo "${csize}|${hash}|${date}|${msg}|${is_version}" >> "$FILTERED_COMMITS"
                    done < "$COMMIT_CACHE"
                    
                    total_commits=$(wc -l < "$FILTERED_COMMITS" 2>/dev/null || echo 0)
                    
                    if [ "$total_commits" -eq 0 ]; then
                        echo ""
                        echo "  No commits found with current filters."
                        sleep 1
                        date_filter=""
                        continue
                    fi
                    
                    total_pages=$(( (total_commits + ITEMS_PER_PAGE - 1) / ITEMS_PER_PAGE ))
                    [ "$current_page" -gt "$total_pages" ] && current_page="$total_pages"
                    [ "$current_page" -lt 1 ] && current_page=1
                    
                    start_line=$(( (current_page - 1) * ITEMS_PER_PAGE + 1 ))
                    end_line=$(( current_page * ITEMS_PER_PAGE ))
                    
                    clear
                    echo "=== Select Source Commit (${current_page}/${total_pages}) ==="
                    
                    # Build filter description
                    filter_desc=""
                    [ "$show_versions_only" = true ] && filter_desc="${filter_desc} VERSIONS"
                    if [ -n "$date_filter" ]; then
                        year=$(echo "$date_filter" | cut -d'-' -f1)
                        month=$(echo "$date_filter" | cut -d'-' -f2)
                        case "$month" in
                            01) mname="January" ;;
                            02) mname="February" ;;
                            03) mname="March" ;;
                            04) mname="April" ;;
                            05) mname="May" ;;
                            06) mname="June" ;;
                            07) mname="July" ;;
                            08) mname="August" ;;
                            09) mname="September" ;;
                            10) mname="October" ;;
                            11) mname="November" ;;
                            12) mname="December" ;;
                        esac
                        filter_desc="${filter_desc} ${mname} ${year}"
                    fi
                    [ -z "$filter_desc" ] && filter_desc="ALL COMMITS"
                    filter_desc=$(echo "$filter_desc" | sed 's/^ //')
                    
                    echo "Filter: $filter_desc"
                    
                    line_num=0
                    counter=1
                    > "/tmp/build_commit_map_$$.txt"
                    while IFS='|' read -r csize hash date msg is_version; do
                        line_num=$((line_num + 1))
                        [ "$line_num" -lt "$start_line" ] && continue
                        [ "$line_num" -gt "$end_line" ] && break
                        [ -z "$hash" ] && continue
                        
                        size_display=$(format_file_size "$csize")
                        short_hash=$(echo "$hash" | cut -c1-7)
                        shortened_msg=$(echo "$msg" | cut -c1-30)
                        
                        marker=""
                        if [ -n "$SELECTED_COMMIT" ] && [ "$hash" = "$SELECTED_COMMIT" ]; then
                            marker=" << SELECTED"
                        fi
                        
                        printf "  %2s. %s %s %s%s\n" "$counter" "$short_hash" "$date" "$shortened_msg" "$marker"
                        echo "${counter}|${hash}|${msg}" >> "/tmp/build_commit_map_$$.txt"
                        counter=$((counter + 1))
                    done < "$FILTERED_COMMITS"
                    
                    echo ""
                    echo "n=next p=previous v=versions a=all m=month c=HEAD r=refresh b=back"
                    printf "> "
                    read cmd
                    
                    case "$cmd" in
                        n|N) [ "$current_page" -lt "$total_pages" ] && current_page=$((current_page + 1)) ;;
                        p|P) [ "$current_page" -gt 1 ] && current_page=$((current_page - 1)) ;;
                        v|V) 
                            show_versions_only=true
                            date_filter=""
                            current_page=1
                            ;;
                        a|A) 
                            show_versions_only=false
                            date_filter=""
                            current_page=1
                            ;;
                        m|M)
                            # Month selection interface
                            if [ ! -f "$MONTH_CACHE" ]; then
                                build_month_cache
                            fi
                            
                            month_page=1
                            MONTHS_PER_PAGE=5
                            total_months=$(wc -l < "$MONTH_CACHE" 2>/dev/null || echo 0)
                            total_month_pages=$(( (total_months + MONTHS_PER_PAGE - 1) / MONTHS_PER_PAGE ))
                            
                            while true; do
                                clear
                                echo "=== Select Month ==="
                                
                                month_start=$(( (month_page - 1) * MONTHS_PER_PAGE + 1 ))
                                month_end=$(( month_page * MONTHS_PER_PAGE ))
                                month_counter=1
                                while IFS='|' read -r ym year month_name commit_count; do
                                    [ -z "$ym" ] && continue
                                    [ "$month_counter" -lt "$month_start" ] && month_counter=$((month_counter + 1)) && continue
                                    [ "$month_counter" -gt "$month_end" ] && break
                                    
                                    marker=""
                                    [ "$ym" = "$date_filter" ] && marker=" << SELECTED"
                                    printf "  %2s. %s %s (%s commits)%s\n" "$month_counter" "$month_name" "$year" "$commit_count" "$marker"
                                    month_counter=$((month_counter + 1))
                                done < "$MONTH_CACHE"
                                
                                echo ""
                                echo "n=next p=previous c=clear b=back"
                                printf "> "
                                read month_cmd
                                
                                case "$month_cmd" in
                                    n|N) [ "$month_page" -lt "$total_month_pages" ] && month_page=$((month_page + 1)) ;;
                                    p|P) [ "$month_page" -gt 1 ] && month_page=$((month_page - 1)) ;;
                                    c|C) 
                                        date_filter=""
                                        current_page=1
                                        break
                                        ;;
                                    b|B) break ;;
                                    *)
                                        if echo "$month_cmd" | grep -q '^[0-9]\+$'; then
                                            selected_month=$(sed -n "${month_cmd}p" "$MONTH_CACHE" 2>/dev/null | cut -d'|' -f1)
                                            if [ -n "$selected_month" ]; then
                                                date_filter="$selected_month"
                                                current_page=1
                                                echo ""
                                                echo "  Filter set to: $(sed -n "${month_cmd}p" "$MONTH_CACHE" | cut -d'|' -f3) $(sed -n "${month_cmd}p" "$MONTH_CACHE" | cut -d'|' -f2)"
                                                sleep 1
                                                break
                                            fi
                                        fi
                                        ;;
                                esac
                            done
                            ;;
                        r|R) 
                            rm -f "$COMMIT_CACHE" "$MONTH_CACHE"
                            echo ""
                            echo "  Cache cleared. Will rebuild on next visit."
                            sleep 1
                            break
                            ;;
                        c|C) 
                            SELECTED_COMMIT=""
                            SELECTED_COMMIT_MSG=""
                            date_filter=""
                            > "$EXCLUDE_LIST"
                            > "$EXCLUDE_DIRS_LIST"
                            load_files_from_commit ""
                            echo ""
                            echo "  Switched to HEAD (current working tree)"
                            sleep 1
                            break
                            ;;
                        b|B) break ;;
                        *)
                            if echo "$cmd" | grep -q '^[0-9]\+$'; then
                                selected=$(grep "^${cmd}|" "/tmp/build_commit_map_$$.txt" 2>/dev/null | head -1)
                                if [ -n "$selected" ]; then
                                    SELECTED_COMMIT=$(echo "$selected" | cut -d'|' -f2)
                                    SELECTED_COMMIT_MSG=$(echo "$selected" | cut -d'|' -f3)
                                    > "$EXCLUDE_LIST"
                                    > "$EXCLUDE_DIRS_LIST"
                                    load_files_from_commit "$SELECTED_COMMIT"
                                    echo ""
                                    echo "  Switched to commit: $SELECTED_COMMIT_MSG"
                                    sleep 1
                                    break
                                fi
                            fi
                            ;;
                    esac
                    
                    rm -f "/tmp/build_commit_map_$$.txt"
                done
                
                rm -f "$FILTERED_COMMITS" "/tmp/build_commit_map_$$.txt"
                ;;
            
            8)  # Toggle output format
                if [ "$BUILD_TAR" = true ]; then
                    BUILD_TAR=false
                    echo ""
                    echo "  Output format switched to: Directory"
                else
                    BUILD_TAR=true
                    echo ""
                    echo "  Output format switched to: Tar.gz Archive"
                fi
                sleep 1
                ;;
            
            s|S)  # Save configuration
                clear
                echo "=== Save Build Configuration ==="
                if list_saved_configurations; then
                    echo ""
                else
                    echo "No saved configurations yet."
                    echo ""
                fi
                printf "Enter save name (alphanumeric, dashes, underscores, empty to cancel): "
                read save_name
                if [ -n "$save_name" ]; then
                    save_name=$(echo "$save_name" | sed 's/[^a-zA-Z0-9_-]/_/g')
                    save_build_configuration "$save_name"
                    sleep 1
                fi
                ;;
            
            l|L)  # Load configuration - FIX 1: Properly handle load with selection
                clear
                echo "=== Load Build Configuration ==="
                
                # Check if there are any saved configurations
                SAVE_COUNT_FILE="/tmp/build_save_count_$$.txt"
                > "$SAVE_COUNT_FILE"
                save_number=1
                while IFS= read -r line; do
                    case "$line" in
                        \[SAVE:*)
                            name=$(echo "$line" | sed 's/^\[SAVE://;s/\]$//')
                            printf "  %2s. %s\n" "$save_number" "$name"
                            echo "${save_number}|${name}" >> "$SAVE_COUNT_FILE"
                            save_number=$((save_number + 1))
                            ;;
                    esac
                done < "$BUILD_SAVE_FILE"
                
                total_saves=$((save_number - 1))
                
                if [ "$total_saves" -eq 0 ]; then
                    echo "No saved configurations found."
                    rm -f "$SAVE_COUNT_FILE"
                    sleep 1
                else
                    echo ""
                    echo "Enter number to load, name to load, or b=cancel"
                    printf "> "
                    read load_input
                    
                    if [ "$load_input" != "b" ] && [ "$load_input" != "B" ] && [ -n "$load_input" ]; then
                        load_name=""
                        
                        # Check if input is a number
                        if echo "$load_input" | grep -q '^[0-9]\+$'; then
                            # Look up the name by number
                            load_name=$(grep "^${load_input}|" "$SAVE_COUNT_FILE" 2>/dev/null | cut -d'|' -f2)
                            if [ -z "$load_name" ]; then
                                echo "Invalid number."
                                rm -f "$SAVE_COUNT_FILE"
                                sleep 1
                                continue
                            fi
                        else
                            # Input is a name directly
                            load_name="$load_input"
                            # Validate that this name exists
                            if ! grep -q "^\[SAVE:${load_name}\]$" "$BUILD_SAVE_FILE" 2>/dev/null; then
                                echo "Save '${load_name}' not found."
                                rm -f "$SAVE_COUNT_FILE"
                                sleep 1
                                continue
                            fi
                        fi
                        
                        if load_build_configuration "$load_name"; then
                            if [ -n "$BUILD_SELECTED_COMMIT" ]; then
                                load_files_from_commit "$BUILD_SELECTED_COMMIT"
                            else
                                load_files_from_commit ""
                            fi
                            echo "Configuration loaded: $load_name"
                        else
                            echo "Failed to load configuration."
                        fi
                        sleep 1
                    fi
                fi
                
                rm -f "$SAVE_COUNT_FILE"
                ;;
            
            d|D)  # Delete configuration
                clear
                echo "=== Delete Build Configuration ==="
                
                SAVE_COUNT_FILE="/tmp/build_save_count_$$.txt"
                > "$SAVE_COUNT_FILE"
                save_number=1
                while IFS= read -r line; do
                    case "$line" in
                        \[SAVE:*)
                            name=$(echo "$line" | sed 's/^\[SAVE://;s/\]$//')
                            printf "  %2s. %s\n" "$save_number" "$name"
                            echo "${save_number}|${name}" >> "$SAVE_COUNT_FILE"
                            save_number=$((save_number + 1))
                            ;;
                    esac
                done < "$BUILD_SAVE_FILE"
                
                total_saves=$((save_number - 1))
                
                if [ "$total_saves" -eq 0 ]; then
                    echo "No saved configurations found."
                    rm -f "$SAVE_COUNT_FILE"
                    sleep 1
                else
                    echo ""
                    echo "Enter number or name to delete (b=cancel)"
                    printf "> "
                    read delete_input
                    
                    if [ "$delete_input" != "b" ] && [ "$delete_input" != "B" ] && [ -n "$delete_input" ]; then
                        delete_name=""
                        
                        # Check if input is a number
                        if echo "$delete_input" | grep -q '^[0-9]\+$'; then
                            delete_name=$(grep "^${delete_input}|" "$SAVE_COUNT_FILE" 2>/dev/null | cut -d'|' -f2)
                            if [ -z "$delete_name" ]; then
                                echo "Invalid number."
                                rm -f "$SAVE_COUNT_FILE"
                                sleep 1
                                continue
                            fi
                        else
                            delete_name="$delete_input"
                        fi
                        
                        printf "Are you sure you want to delete '%s'? (y/n): " "$delete_name"
                        read confirm
                        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
                            delete_saved_configuration "$delete_name"
                            sleep 1
                        fi
                    fi
                fi
                
                rm -f "$SAVE_COUNT_FILE"
                ;;
            
            9)
                break
                ;;
            
            0)
                rm -f "$EXCLUDE_LIST" "$EXCLUDE_DIRS_LIST" "$BUILD_FILES_LIST" "$BUILD_DIRS_LIST" "$COMMIT_CACHE" "$MONTH_CACHE"
                echo ""
                echo "  Build cancelled."
                exit 0
                ;;
            
            *)
                echo ""
                echo "  Invalid choice. Press Enter to continue..."
                read dummy
                ;;
        esac
    done
    
    # Export selected commit for do_build to use
    export BUILD_SELECTED_COMMIT="$SELECTED_COMMIT"
    export BUILD_SELECTED_COMMIT_MSG="$SELECTED_COMMIT_MSG"
    export BUILD_EXCLUDE_DIRS_LIST="$EXCLUDE_DIRS_LIST"
    
    # Final summary - COMPACT
    clear
    
    stats=$(calculate_build_stats)
    build_size=$(echo "$stats" | cut -d'|' -f1)
    build_file_count=$(echo "$stats" | cut -d'|' -f2)
    
    echo "=== FINAL BUILD SUMMARY ==="
    
    if [ -z "$SELECTED_COMMIT" ]; then
        echo "Source: HEAD (current working tree)"
    else
        shortened=$(echo "$SELECTED_COMMIT_MSG" | cut -c1-30)
        echo "Source: $shortened"
    fi
    
    if [ "$BUILD_TAR" = true ]; then
        echo "Output: Tar.gz Archive"
    else
        echo "Output: Directory"
    fi
    
    size_display=$(format_file_size "$build_size")
    echo "Size: ${size_display} | Files: ${build_file_count}"
    echo "Excluded: $(wc -l < "$EXCLUDE_LIST" 2>/dev/null || echo 0) files, $(wc -l < "$EXCLUDE_DIRS_LIST" 2>/dev/null || echo 0) directories"
    
    if [ -s "$EXCLUDE_DIRS_LIST" ]; then
        echo "Excluded directories:"
        disp_count=0
        while IFS= read -r dir; do
            [ -z "$dir" ] && continue
            if [ $disp_count -ge 5 ]; then
                echo "  ... more"
                break
            fi
            echo "  ${dir}"
            disp_count=$((disp_count + 1))
        done < "$EXCLUDE_DIRS_LIST"
    fi
    
    echo ""
    printf "Save this configuration? (y/n): "
    read save_choice
    
    if [ "$save_choice" = "y" ] || [ "$save_choice" = "Y" ]; then
        printf "Enter save name: "
        read save_name
        save_name=$(echo "$save_name" | sed 's/[^a-zA-Z0-9_-]/_/g')
        if [ -n "$save_name" ]; then
            save_build_configuration "$save_name"
        fi
    fi
    
    # Clean up temporary files
    rm -f "$BUILD_FILES_LIST" "$BUILD_DIRS_LIST" "$COMMIT_CACHE" "$MONTH_CACHE"
    
    return 0
}
    
# Main build function
do_build() {
    log_message "Starting build process..."
    
    # Check if we're in a git repository
    if ! command -v git >/dev/null 2>&1 || ! git rev-parse --git-dir >/dev/null 2>&1; then
        log_message "Error: Not in a git repository. Build requires git."
        echo "Error: Build mode requires a git repository"
        exit 1
    fi
    
    # Determine build name based on mode
    if [ -z "$BUILD_SELECTED_COMMIT" ]; then
        BUILD_COMMIT="HEAD"
    else
        BUILD_COMMIT="$BUILD_SELECTED_COMMIT"
    fi
    
    # IMPROVE 1: Use version-based naming by default, message-based with --message flag
    if [ "$BUILD_MESSAGE_MODE" = true ]; then
        # Use commit message for naming
        BUILD_COMMIT_MSG=$(git log -1 --pretty=%B "$BUILD_COMMIT" 2>/dev/null | head -n1)
        if [ -n "$BUILD_COMMIT_MSG" ]; then
            build_name=$(echo "$BUILD_COMMIT_MSG" | tr ' ' '_' | sed 's/[^a-zA-Z0-9._-]/_/g' | sed 's/__*/_/g' | sed 's/^_//' | sed 's/_$//')
            [ -z "$build_name" ] && build_name="build"
        else
            build_name="build_$(date +%Y%m%d_%H%M%S)"
        fi
        log_message "Building with message-based name: $build_name"
    else
        # Use version-based naming (default)
        build_version=$(calculate_build_version "$BUILD_COMMIT")
        if [ -n "$build_version" ]; then
            build_name="$build_version"
            log_message "Building with version-based name: $build_name"
        else
            # Fallback to commit message if no version found
            BUILD_COMMIT_MSG=$(git log -1 --pretty=%B "$BUILD_COMMIT" 2>/dev/null | head -n1)
            if [ -n "$BUILD_COMMIT_MSG" ]; then
                build_name=$(echo "$BUILD_COMMIT_MSG" | tr ' ' '_' | sed 's/[^a-zA-Z0-9._-]/_/g' | sed 's/__*/_/g' | sed 's/^_//' | sed 's/_$//')
            fi
            [ -z "$build_name" ] && build_name="build_$(date +%Y%m%d_%H%M%S)"
            log_message "No version found, using fallback name: $build_name"
        fi
    fi
    
    BUILD_COMMIT_MSG=$(git log -1 --pretty=%B "$BUILD_COMMIT" 2>/dev/null | head -n1)
    
    # Handle --version flag
    if [ -n "$BUILD_VERSION" ]; then
        log_message "Build version requested: $BUILD_VERSION"
        
        if [ "$BUILD_VERSION" = "latest" ]; then
            # Search for the latest version tag, starting from most recent commits
            log_message "Searching for latest version tag..."
            
            BUILD_COMMIT=""
            
            # First, try to find the latest version tag
            version_tags=$(git tag --sort=-creatordate 2>/dev/null | grep -E '^[0-9]+\.[0-9]+(\.[0-9]+)?$' 2>/dev/null)
            
            if [ -n "$version_tags" ]; then
                # Take the first (most recent) version tag
                latest_tag=$(echo "$version_tags" | head -1)
                BUILD_COMMIT=$(git rev-list -n 1 "$latest_tag" 2>/dev/null)
                BUILD_COMMIT_MSG="$latest_tag"
                log_message "Found latest version tag: $latest_tag"
            else
                # No version tags found, search commit messages for version patterns
                log_message "No version tags found, searching commit messages..."
                
                version_commit=$(git log --all --oneline --grep='^[0-9]\+\.[0-9]\+\(\.[0-9]\+\)\?$' --format="%H|%s" 2>/dev/null | head -1)
                
                if [ -n "$version_commit" ]; then
                    BUILD_COMMIT=$(echo "$version_commit" | cut -d'|' -f1)
                    BUILD_COMMIT_MSG=$(echo "$version_commit" | cut -d'|' -f2)
                    log_message "Found latest version commit: $BUILD_COMMIT_MSG"
                else
                    log_message "Error: No version tags or version commit messages found"
                    echo "Error: Could not find any version in the repository"
                    echo "Use --build --config to manually select a commit"
                    exit 1
                fi
            fi
        else
            # Specific version requested
            log_message "Searching for version: $BUILD_VERSION"
            
            BUILD_COMMIT=""
            BUILD_COMMIT_MSG="$BUILD_VERSION"
            
            # First try to find as a tag
            if git rev-parse "$BUILD_VERSION" >/dev/null 2>&1; then
                BUILD_COMMIT=$(git rev-list -n 1 "$BUILD_VERSION" 2>/dev/null)
                log_message "Found version tag: $BUILD_VERSION"
            else
                # Try to find as a commit message
                BUILD_COMMIT=$(git log --all --oneline --grep="^${BUILD_VERSION}$" --format="%H" 2>/dev/null | head -1)
                
                if [ -z "$BUILD_COMMIT" ]; then
                    # Try partial match in commit messages
                    BUILD_COMMIT=$(git log --all --oneline --grep="${BUILD_VERSION}" --format="%H" 2>/dev/null | head -1)
                fi
                
                if [ -n "$BUILD_COMMIT" ]; then
                    log_message "Found version in commit message: $BUILD_VERSION"
                else
                    log_message "Error: Version '$BUILD_VERSION' not found as tag or commit message"
                    echo "Error: Could not find version '$BUILD_VERSION' in the repository"
                    echo "Available versions can be listed with: git tag | grep -E '^[0-9]+\.[0-9]+'"
                    echo "Or use --build --config to manually select a commit"
                    exit 1
                fi
            fi
        fi
        
        log_message "Building from version: $BUILD_COMMIT_MSG ($BUILD_COMMIT)"
        
        # Recalculate build name for version-based builds
        if [ "$BUILD_MESSAGE_MODE" != true ]; then
            build_version=$(calculate_build_version "$BUILD_COMMIT")
            [ -n "$build_version" ] && build_name="$build_version"
        fi
    fi
    
    # Run configuration interface if requested
    if [ "$BUILD_CONFIG" = true ]; then
        build_config_interface
        # Re-check selected commit after config (user might have changed it)
        if [ -n "$BUILD_SELECTED_COMMIT" ]; then
            BUILD_COMMIT="$BUILD_SELECTED_COMMIT"
            BUILD_COMMIT_MSG="$BUILD_SELECTED_COMMIT_MSG"
            # Recalculate build name for version-based builds with selected commit
            if [ "$BUILD_MESSAGE_MODE" != true ]; then
                build_version=$(calculate_build_version "$BUILD_COMMIT")
                [ -n "$build_version" ] && build_name="$build_version"
            fi
        fi
    fi
    
    # Use the directory where the script was called from
    build_base_dir="$REPO_DIR/build"
    mkdir -p "$build_base_dir"
    
    build_path="$build_base_dir/$build_name"
    
    log_message "Build name: $build_name"
    log_message "Build path: $build_path"
    log_message "Source commit: $BUILD_COMMIT"
    
    # Create temporary directory for build
    temp_build="/tmp/build_$$"
    rm -rf "$temp_build"
    mkdir -p "$temp_build"
    
    # Get list of files from the selected commit and extract them
    log_message "Extracting files from commit $BUILD_COMMIT..."
    
    # Check if we have exclusions from config or directories
    has_exclusions=false
    [ -f "$EXCLUDE_LIST" ] && [ -s "$EXCLUDE_LIST" ] && has_exclusions=true
    [ -n "$BUILD_EXCLUDE_DIRS_LIST" ] && [ -f "$BUILD_EXCLUDE_DIRS_LIST" ] && [ -s "$BUILD_EXCLUDE_DIRS_LIST" ] && has_exclusions=true
    
    if [ "$has_exclusions" = true ]; then
        # With exclusions: extract all then remove excluded
        excluded_file_count=0
        [ -f "$EXCLUDE_LIST" ] && excluded_file_count=$(wc -l < "$EXCLUDE_LIST" 2>/dev/null || echo 0)
        excluded_dir_count=0
        [ -n "$BUILD_EXCLUDE_DIRS_LIST" ] && [ -f "$BUILD_EXCLUDE_DIRS_LIST" ] && excluded_dir_count=$(wc -l < "$BUILD_EXCLUDE_DIRS_LIST" 2>/dev/null || echo 0)
        
        log_message "Applying exclusions ($excluded_file_count files, $excluded_dir_count directories excluded)..."
        git archive "$BUILD_COMMIT" 2>/dev/null | (cd "$temp_build" && tar xf - 2>/dev/null)
        
        if [ $? -eq 0 ]; then
            # Remove excluded directories first
            if [ -n "$BUILD_EXCLUDE_DIRS_LIST" ] && [ -f "$BUILD_EXCLUDE_DIRS_LIST" ] && [ -s "$BUILD_EXCLUDE_DIRS_LIST" ]; then
                while IFS= read -r excluded_dir; do
                    [ -z "$excluded_dir" ] && continue
                    if [ -e "$temp_build/$excluded_dir" ]; then
                        rm -rf "$temp_build/$excluded_dir"
                        log_message "  Excluded directory: $excluded_dir/"
                    fi
                done < "$BUILD_EXCLUDE_DIRS_LIST"
            fi
            
            # Remove individual excluded files
            if [ -f "$EXCLUDE_LIST" ] && [ -s "$EXCLUDE_LIST" ]; then
                while IFS= read -r excluded_file; do
                    [ -z "$excluded_file" ] && continue
                    if [ -e "$temp_build/$excluded_file" ]; then
                        rm -rf "$temp_build/$excluded_file"
                        log_message "  Excluded: $excluded_file"
                    fi
                done < "$EXCLUDE_LIST"
            fi
            
            # Remove empty directories
            find "$temp_build" -type d -empty -delete 2>/dev/null
        else
            log_message "Error: Failed to extract files from git"
            echo "Error: Failed to extract files from git"
            rm -rf "$temp_build"
            exit 1
        fi
    else
        # No exclusions: simple archive extraction
        git archive "$BUILD_COMMIT" 2>/dev/null | (cd "$temp_build" && tar xf - 2>/dev/null)
        
        if [ $? -ne 0 ]; then
            log_message "Error: Failed to extract files from git"
            echo "Error: Failed to extract files from git"
            rm -rf "$temp_build"
            exit 1
        fi
    fi
    
    # Count files
    file_count=$(find "$temp_build" -type f 2>/dev/null | wc -l)
    log_message "Extracted $file_count files"
    
    # Clean up temp files
    rm -f "$EXCLUDE_LIST" "$EXCLUDE_DIRS_LIST" "$BUILD_FILES_LIST" "$BUILD_DIRS_LIST" "$BUILD_EXCLUDE_DIRS_LIST"
    
    # Create the build
    if [ "$BUILD_TAR" = true ]; then
        # Create tar.gz
        tar_file="$build_path.tar.gz"
        log_message "Creating tar.gz archive: $tar_file"
        
        # Remove existing archive if present
        [ -f "$tar_file" ] && rm -f "$tar_file"
        
        cd "$temp_build" || exit 1
        tar -czf "$tar_file" . 2>/dev/null
        
        if [ $? -eq 0 ]; then
            log_message "Build archive created successfully: $tar_file"
            
            # Calculate archive size
            archive_size=$(ls -lh "$tar_file" | awk '{print $5}')
            
            echo ""
            echo "========================================="
            echo "  BUILD COMPLETE"
            echo "========================================="
            echo ""
            echo "  Archive: $tar_file"
            echo "  Size: $archive_size"
            echo "  Files: $file_count"
            echo "  Source: $BUILD_COMMIT_MSG"
            echo ""
        else
            log_message "Error: Failed to create tar.gz archive"
            echo "Error: Failed to create archive"
            cd "$REPO_DIR" > /dev/null 2>&1
            rm -rf "$temp_build"
            exit 1
        fi
        
        cd "$REPO_DIR" > /dev/null 2>&1
        
        # Clean up temp directory
        rm -rf "$temp_build"
        
        # Add build info alongside the tar.gz
        cat > "${tar_file}.info" << EOF
Build Name: $build_name
Build Date: $(date)
Source Commit: $(git rev-parse "$BUILD_COMMIT" 2>/dev/null)
Commit Message: $BUILD_COMMIT_MSG
Files: $file_count
EOF
    else
        # Create directory build
        log_message "Creating directory build: $build_path"
        
        # Remove existing if present
        [ -d "$build_path" ] && rm -rf "$build_path"
        
        mv "$temp_build" "$build_path"
        
        if [ $? -eq 0 ]; then
            log_message "Build directory created successfully: $build_path"
            
            # Calculate directory size
            dir_size=$(du -sh "$build_path" 2>/dev/null | awk '{print $1}')
            
            # Add build info file
            cat > "$build_path/BUILD_INFO.txt" << EOF
Build Name: $build_name
Build Date: $(date)
Source Commit: $(git rev-parse "$BUILD_COMMIT" 2>/dev/null)
Commit Message: $BUILD_COMMIT_MSG
Files: $file_count
EOF
            
            echo ""
            echo "========================================="
            echo "  BUILD COMPLETE"
            echo "========================================="
            echo ""
            echo "  Directory: $build_path"
            echo "  Size: $dir_size"
            echo "  Files: $file_count"
            echo "  Source: $BUILD_COMMIT_MSG"
            echo ""
        else
            log_message "Error: Failed to create build directory"
            echo "Error: Failed to create build directory"
            rm -rf "$temp_build"
            exit 1
        fi
    fi
    
    log_message "Build process completed"
    exit 0
}

# =============================================================================
# END OF BUILD SYSTEM FUNCTIONS
# =============================================================================

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
  echo "  --build [name]   Create a build from the last commit (optional: saved configuration name)"
  echo "  --tar            Create a tar.gz archive (use with --build)"
  echo "  --config         Interactive file exclusion (use with --build)"
  echo "  --message        Use commit message for build naming (default uses version-based naming)"
  echo "  --version [VER]  Build from a specific version or latest version (use with --build)"
  echo "  --online         Force online package installation using apt/apk instead of local .deb/.apk files"
  echo "  --movegit        Move .git directory to installation directory (default: excluded)"
  echo ""
  echo "BUILD EXAMPLES:"
  echo "  $0 --build                    Create build directory from last commit"
  echo "  $0 --build --tar              Create tar.gz archive from last commit"
  echo "  $0 --build --config           Interactive exclusion before directory build"
  echo "  $0 --build --tar --config     Interactive exclusion before tar.gz build"
  echo "  $0 --build --message          Use commit message for naming (default: version-based)"
  echo "  $0 --build mybuild            Build using saved configuration 'mybuild'"
  echo ""
  echo "BUILD SAVE SYSTEM:"
  echo "  Build configurations saved in: $BUILD_SAVE_FILE"
  echo "  - Save during --config: option 's'"
  echo "  - Load during --config: option 'l' (enter number or name)"
  echo "  - Delete during --config: option 'd' (enter number or name)"
  echo "  - Quick build from save: $0 --build <savename>"
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
  echo "  Use --build to create a clean snapshot with version-based naming (default)"
  echo "  Use --build --message to use commit message for naming instead"
  echo "  Use --build --tar to create a tar.gz archive instead of directory"
  echo "  Use --build --config for interactive file exclusion before building"
  echo "  Use --build <name> to load a saved configuration before building"
  echo "  Builds are saved in ./build/<name> directory"
  echo "  Default naming: finds last version tag/commit and adds commit distance (e.g., 0.1.1.5)"
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
  echo "  Build from latest commit:  $0 --build"
  echo "  Build tar.gz archive:      $0 --build --tar"
  echo "  Interactive build:         $0 --build --config"
  echo "  Build with message name:   $0 --build --message"
  echo "  Force online installation: $0 --online"
  echo "  Include .git directory:    $0 --movegit"
  echo "  Build from saved config:   $0 --build myconfig"
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

# Initialize build version variable and save name
BUILD_VERSION=""
BUILD_SAVE_NAME=""

# Parse command line arguments
prev_arg=""
for arg in "$@"; do
    case "$arg" in
        --build) 
            BUILD_MODE=true 
            ;;
        --tar) BUILD_TAR=true ;;
        --config) BUILD_CONFIG=true ;;
        --message) BUILD_MESSAGE_MODE=true ;;
        --version) 
            BUILD_MODE=true
            BUILD_VERSION="latest"
            ;;
        --log) LOG_MODE=true; touch "$LOG_FILE" 2>/dev/null || LOG_MODE=false ;;
        --skip-pkgs) SKIP_PKGS=true ;;
        --local-dir) LOCAL_DIR_MODE=true ;;
        --no-preserve) PRESERVE_DATA=false ;;
        --online) ONLINE_MODE=true ;;
        --movegit) MOVE_GIT=true ;;
    esac
    
    # Handle --build with optional save name
    if [ "$prev_arg" = "--build" ] && [ "$arg" != "--build" ] && [ "$arg" != "--tar" ] && [ "$arg" != "--config" ] && [ "$arg" != "--message" ] && [ "$arg" != "--version" ] && [ "$arg" != "--log" ] && [ "$arg" != "--skip-pkgs" ] && [ "$arg" != "--local-dir" ] && [ "$arg" != "--no-preserve" ] && [ "$arg" != "--online" ] && [ "$arg" != "--movegit" ] && [ "$arg" != "-h" ] && [ "$arg" != "--help" ]; then
        BUILD_SAVE_NAME="$arg"
    fi
    
    # Handle --version with specific version number
    if [ "$prev_arg" = "--version" ] && [ "$arg" != "--version" ] && echo "$arg" | grep -qE '^[0-9]+\.[0-9]+'; then
        BUILD_VERSION="$arg"
    fi
    prev_arg="$arg"
done

# Handle build mode (exit early if only building)
if [ "$BUILD_MODE" = true ]; then
    # If save name is provided, load it before building
    if [ -n "$BUILD_SAVE_NAME" ]; then
        EXCLUDE_LIST="/tmp/build_exclude_$$.txt"
        EXCLUDE_DIRS_LIST="/tmp/build_exclude_dirs_$$.txt"
        > "$EXCLUDE_LIST"
        > "$EXCLUDE_DIRS_LIST"
        
        if load_build_configuration "$BUILD_SAVE_NAME"; then
            log_message "Loaded build configuration: $BUILD_SAVE_NAME"
        else
            log_message "Error: Could not load save '$BUILD_SAVE_NAME'"
            exit 1
        fi
    fi
    
    do_build
fi

# Check if EasyAI is already installed and force skip packages if it is
if check_installed; then
  log_message "EasyAI is already installed. Forcing package installation skip."
  SKIP_PKGS=true
fi

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