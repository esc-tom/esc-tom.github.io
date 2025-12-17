/**
 * GitHub Storage Integration Code
 * 
 * Add these code blocks to your existing scripts/script.js file
 * Follow the instructions marked with // ADD THIS
 */

// ============================================================================
// SECTION 1: Add after password hashing functions (around line 60)
// ============================================================================

// GitHub Storage Instance
let githubStorage = null;
let githubReady = false;

/**
 * Initialize GitHub Storage
 * Prompts user for token if not already stored
 */
async function initGitHubStorage() {
    // Check if token exists in localStorage
    let token = localStorage.getItem('github_api_token');
    
    if (!token) {
        // Show token setup modal
        await showGitHubTokenModal();
        token = localStorage.getItem('github_api_token');
        
        if (!token) {
            throw new Error('GitHub token required to use this application');
        }
    }

    // Initialize GitHub storage with token
    githubStorage = window.githubStorage;
    const success = await githubStorage.init(token);
    
    if (!success) {
        // Invalid token - remove and try again
        localStorage.removeItem('github_api_token');
        throw new Error('Invalid GitHub token. Please try again.');
    }

    githubReady = true;
    console.log('✅ GitHub storage ready');
    return true;
}

/**
 * Show GitHub token setup modal
 * Returns a promise that resolves when token is set
 */
function showGitHubTokenModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('github-token-modal');
        const tokenInput = document.getElementById('github-token-input');
        const testBtn = document.getElementById('test-token-btn');
        const errorDiv = document.getElementById('token-error');

        // Show modal
        modal.classList.add('show');

        // Handle test button click
        testBtn.onclick = async () => {
            const token = tokenInput.value.trim();
            
            if (!token) {
                errorDiv.textContent = 'Please enter a GitHub token';
                errorDiv.classList.remove('hidden');
                return;
            }

            if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
                errorDiv.textContent = 'Invalid token format. Token should start with "ghp_" or "github_pat_"';
                errorDiv.classList.remove('hidden');
                return;
            }

            // Disable button and show loading
            testBtn.disabled = true;
            testBtn.textContent = 'Testing...';
            errorDiv.classList.add('hidden');

            try {
                // Test token validity
                const tempStorage = window.githubStorage;
                const valid = await tempStorage.init(token);

                if (valid) {
                    // Save token to localStorage
                    localStorage.setItem('github_api_token', token);
                    
                    // Hide modal
                    modal.classList.remove('show');
                    
                    // Show success message
                    console.log('✅ GitHub token saved successfully');
                    
                    resolve(true);
                } else {
                    errorDiv.textContent = 'Invalid token or no access to repository. Please check your token and repository settings.';
                    errorDiv.classList.remove('hidden');
                }
            } catch (error) {
                console.error('Token test error:', error);
                errorDiv.textContent = 'Error: ' + error.message;
                errorDiv.classList.remove('hidden');
            } finally {
                // Re-enable button
                testBtn.disabled = false;
                testBtn.textContent = 'Test & Save Token';
            }
        };

        // Allow Enter key to test token
        tokenInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                testBtn.click();
            }
        });
    });
}

// ============================================================================
// SECTION 2: Replace loadUsers() function (around line 90)
// ============================================================================

// REPLACE the existing loadUsers() function with this:
async function loadUsers() {
    try {
        // Ensure GitHub storage is initialized
        if (!githubReady) {
            await initGitHubStorage();
        }

        // Load users from GitHub
        const data = await githubStorage.loadUsers();
        displayUsers(data.users);
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('user-list').innerHTML = 
            '<p class="error-text">Error loading users from GitHub. Please check your connection and token.</p>';
    }
}

// ============================================================================
// SECTION 3: Replace storage functions (around line 600-650)
// ============================================================================

// REPLACE getAnnotationFromStorage() with this:
async function getAnnotationFromStorage(entryId) {
    if (!githubReady) {
        await initGitHubStorage();
    }

    try {
        const annotation = await githubStorage.loadAnnotation(currentUsername, entryId);
        if (annotation) {
            console.log(`✅ Loaded annotation for ${entryId}`);
        }
        return annotation;
    } catch (error) {
        console.error(`Error loading annotation ${entryId}:`, error);
        return null;
    }
}

// REPLACE saveAnnotationToStorage() with this:
async function saveAnnotationToStorage(entryId, annotation) {
    if (!githubReady) {
        await initGitHubStorage();
    }

    try {
        await githubStorage.saveAnnotation(currentUsername, entryId, annotation);
        console.log(`✅ Saved annotation for ${entryId}`);
        return true;
    } catch (error) {
        console.error(`Error saving annotation ${entryId}:`, error);
        throw error;
    }
}

// ============================================================================
// SECTION 4: Replace checkAnnotationProgress() (around line 140)
// ============================================================================

// REPLACE the existing checkAnnotationProgress() with this:
async function checkAnnotationProgress() {
    if (!githubReady) {
        await initGitHubStorage();
    }

    let annotatedCount = 0;
    
    try {
        // Get list of all annotated dialogues for current user from GitHub
        const annotatedDialogues = await githubStorage.getUserAnnotations(currentUsername);
        
        // Check each dialogue
        for (let i = 0; i < allDialogues.length; i++) {
            const dialogue = allDialogues[i];
            const isAnnotated = annotatedDialogues.includes(dialogue.entry_id);
            
            annotationStatus[dialogue.entry_id] = isAnnotated;
            
            if (isAnnotated) {
                annotatedCount++;
            }
        }
        
        console.log(`📊 Progress: ${annotatedCount}/${allDialogues.length} dialogues annotated`);
    } catch (error) {
        console.error('Error checking annotation progress:', error);
    }
    
    updateProgressBar(annotatedCount, allDialogues.length);
}

// ============================================================================
// SECTION 5: Update handleRegister() (around line 1200)
// ============================================================================

// REPLACE handleRegister() with this version:
async function handleRegister() {
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value;
    const confirmPassword = document.getElementById('confirm-password-input').value;
    
    if (!username) {
        showLoginError('Please enter a username');
        return;
    }
    
    if (!password) {
        showLoginError('Please enter a password');
        return;
    }
    
    // Validate username
    if (username.length < 3) {
        showLoginError('Username must be at least 3 characters');
        return;
    }
    
    if (username.length > 20) {
        showLoginError('Username must be at most 20 characters');
        return;
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        showLoginError('Username can only contain letters, numbers, underscore, and hyphen');
        return;
    }
    
    // Validate password
    if (password.length < 6) {
        showLoginError('Password must be at least 6 characters');
        return;
    }
    
    if (password !== confirmPassword) {
        showLoginError('Passwords do not match');
        return;
    }
    
    try {
        // Ensure GitHub storage is ready
        if (!githubReady) {
            await initGitHubStorage();
        }

        // Load current users from GitHub
        const usersData = await githubStorage.loadUsers();
        
        // Check if username already exists
        if (usersData.users.includes(username)) {
            showLoginError('Username already exists');
            return;
        }
        
        // Hash password
        const hashedPassword = await hashPassword(password, username);
        
        // Add new user
        usersData.users.push(username);
        usersData.passwords[username] = hashedPassword;
        
        // Save to GitHub
        await githubStorage.saveUsers(usersData);
        
        // Set current user
        currentUsername = username;
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, username);
        
        // Hide login modal and initialize app
        hideLoginModal();
        await initializeApp();
        showStatus(`Welcome, ${username}! Registration successful.`, 'success');
        
        console.log(`✅ User ${username} registered successfully`);
    } catch (error) {
        console.error('Registration error:', error);
        showLoginError('Error registering user: ' + error.message);
    }
}

// ============================================================================
// SECTION 6: Update handleLogin() (around line 1170)
// ============================================================================

// REPLACE handleLogin() with this version:
async function handleLogin() {
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value;
    
    if (!username) {
        showLoginError('Please enter a username');
        return;
    }
    
    if (!password) {
        showLoginError('Please enter a password');
        return;
    }
    
    try {
        // Ensure GitHub storage is ready
        if (!githubReady) {
            await initGitHubStorage();
        }

        // Load users from GitHub
        const usersData = await githubStorage.loadUsers();
        
        // Check if user exists
        if (!usersData.users.includes(username)) {
            showLoginError('Username not found. Please register first.');
            return;
        }
        
        // Verify password
        const storedHash = usersData.passwords[username];
        const inputHash = await hashPassword(password, username);
        
        if (inputHash !== storedHash) {
            showLoginError('Incorrect password. Please try again.');
            return;
        }
        
        // Set current user
        currentUsername = username;
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, username);
        
        // Hide login modal and initialize app
        hideLoginModal();
        await initializeApp();
        
        console.log(`✅ User ${username} logged in successfully`);
    } catch (error) {
        console.error('Login error:', error);
        showLoginError('Error logging in: ' + error.message);
    }
}

// ============================================================================
// SECTION 7: Add token management utility functions (optional, add at end)
// ============================================================================

/**
 * Clear GitHub token (for logout or token reset)
 */
function clearGitHubToken() {
    localStorage.removeItem('github_api_token');
    githubReady = false;
    githubStorage = null;
    console.log('🔑 GitHub token cleared');
}

/**
 * Check GitHub API rate limit
 */
async function checkGitHubRateLimit() {
    if (!githubReady || !githubStorage) {
        console.warn('GitHub storage not initialized');
        return null;
    }
    
    const rateLimit = await githubStorage.getRateLimit();
    if (rateLimit) {
        console.log(`⚡ GitHub API: ${rateLimit.remaining}/${rateLimit.limit} requests remaining`);
        
        if (rateLimit.remaining < 100) {
            console.warn('⚠️ Approaching GitHub API rate limit!');
        }
    }
    return rateLimit;
}

/**
 * Test GitHub connection
 */
async function testGitHubConnection() {
    if (!githubReady) {
        console.error('GitHub storage not initialized');
        return false;
    }
    
    try {
        await githubStorage.testConnection();
        console.log('✅ GitHub connection OK');
        return true;
    } catch (error) {
        console.error('❌ GitHub connection failed:', error);
        return false;
    }
}

// ============================================================================
// INTEGRATION CHECKLIST
// ============================================================================

/*
 * ✅ INTEGRATION CHECKLIST:
 * 
 * 1. [ ] Add github-storage.js script to index.html (before script.js)
 * 2. [ ] Add GitHub token modal to index.html
 * 3. [ ] Update github-storage.js with your GitHub username
 * 4. [ ] Add Section 1 code (initGitHubStorage functions)
 * 5. [ ] Replace loadUsers() with Section 2 code
 * 6. [ ] Replace storage functions with Section 3 code
 * 7. [ ] Replace checkAnnotationProgress() with Section 4 code
 * 8. [ ] Replace handleRegister() with Section 5 code
 * 9. [ ] Replace handleLogin() with Section 6 code
 * 10. [ ] Optionally add Section 7 utility functions
 * 11. [ ] Create private 'annotation-data' repository on GitHub
 * 12. [ ] Generate GitHub Personal Access Token (repo scope)
 * 13. [ ] Test locally
 * 14. [ ] Deploy to GitHub Pages
 * 
 * TESTING:
 * - [ ] Token modal appears on first load
 * - [ ] Token is validated and saved
 * - [ ] User registration creates file in GitHub
 * - [ ] User login reads from GitHub
 * - [ ] Annotations save to GitHub
 * - [ ] Annotations load from GitHub
 * - [ ] Progress tracking works
 * - [ ] Check GitHub repository for created files
 */

