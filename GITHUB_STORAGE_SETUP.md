# GitHub API Storage Setup Guide

Complete guide to migrate from localStorage to GitHub API storage.

## 📋 Overview

**What we're building:**
- Store user data and annotations in a private GitHub repository
- Use GitHub API to read/write files
- Keep GitHub Pages for the frontend
- All data backed up automatically with version control

**Architecture:**
```
┌─────────────────────────────────────────┐
│  GitHub Pages (esc-tom.github.io)      │
│  - Frontend HTML/CSS/JS                 │
│  - Public facing                        │
└──────────────┬──────────────────────────┘
               │ GitHub API calls
               ↓
┌─────────────────────────────────────────┐
│  Private Repo (annotation-data)         │
│  - User credentials                     │
│  - Annotation files                     │
│  - Version controlled                   │
└─────────────────────────────────────────┘
```

---

## 🎯 Step 1: Create Private Data Repository

### 1.1 Create Repository

1. Go to https://github.com/new
2. Repository name: `annotation-data` (or your choice)
3. **Important:** Select **Private** (to protect user data)
4. Initialize with README: ✓
5. Click "Create repository"

### 1.2 Create Folder Structure

In your new `annotation-data` repository, create this structure:

```
annotation-data/
├── users/
│   └── credentials.json
├── annotations/
│   └── .gitkeep
└── README.md
```

**Create initial files:**

1. Click "Add file" → "Create new file"
2. Filename: `users/credentials.json`
3. Content:
```json
{
  "users": [],
  "passwords": {}
}
```
4. Commit: "Initialize user credentials"

5. Create another file: `annotations/.gitkeep`
6. Content: (empty)
7. Commit: "Initialize annotations folder"

---

## 🔑 Step 2: Create GitHub Personal Access Token

### 2.1 Generate Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Note: `Annotation Tool Access`
4. Expiration: `No expiration` (or set to 1 year)
5. Scopes: Check **only** `repo` (Full control of private repositories)
6. Click "Generate token"
7. **COPY THE TOKEN NOW** - you won't see it again!

**Your token looks like:** `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 2.2 Secure Token Storage

**Option A: Environment Variable (Recommended for production)**
```javascript
// Store token as environment variable
// In production, use build-time injection
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
```

**Option B: User Entry (Best for research tool)**
```javascript
// User enters token on first use
// Stored encrypted in localStorage
const GITHUB_TOKEN = localStorage.getItem('github_api_token');
```

**Option C: Admin-Only (Simplest)**
```javascript
// Hard-code for admin use (not recommended for production)
// Only for testing or single-admin scenarios
const GITHUB_TOKEN = 'ghp_your_token_here';
```

For this guide, we'll use **Option B** (user entry) with encryption.

---

## 🔧 Step 3: Install GitHub API Client

### 3.1 Add GitHub API Functions

Create a new file: `scripts/github-storage.js`

```javascript
/**
 * GitHub API Storage Client
 * Handles all GitHub API interactions for storing user data and annotations
 */

class GitHubStorage {
    constructor() {
        this.owner = 'YOUR_GITHUB_USERNAME'; // Replace with your username
        this.repo = 'annotation-data';
        this.token = null;
        this.baseUrl = `https://api.github.com/repos/${this.owner}/${this.repo}/contents`;
    }

    /**
     * Initialize with token
     */
    async init(token) {
        this.token = token;
        
        // Test token validity
        try {
            await this.testConnection();
            return true;
        } catch (error) {
            console.error('Token validation failed:', error);
            return false;
        }
    }

    /**
     * Test GitHub API connection
     */
    async testConnection() {
        const response = await fetch(
            `https://api.github.com/repos/${this.owner}/${this.repo}`,
            {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (!response.ok) {
            throw new Error('Invalid token or repository access denied');
        }

        return true;
    }

    /**
     * Get file from GitHub
     */
    async getFile(path) {
        const url = `${this.baseUrl}/${path}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.status === 404) {
            return null; // File doesn't exist
        }

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.json();
        
        // Decode base64 content
        const content = atob(data.content);
        
        return {
            content: content,
            sha: data.sha // Needed for updates
        };
    }

    /**
     * Save file to GitHub
     */
    async saveFile(path, content, message, sha = null) {
        const url = `${this.baseUrl}/${path}`;
        
        // Encode content as base64
        const encodedContent = btoa(
            typeof content === 'string' ? content : JSON.stringify(content, null, 2)
        );

        const body = {
            message: message,
            content: encodedContent
        };

        // Include sha if updating existing file
        if (sha) {
            body.sha = sha;
        }

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`GitHub API error: ${error.message}`);
        }

        return await response.json();
    }

    /**
     * Load user credentials
     */
    async loadUsers() {
        try {
            const file = await this.getFile('users/credentials.json');
            if (!file) {
                return { users: [], passwords: {} };
            }
            return JSON.parse(file.content);
        } catch (error) {
            console.error('Error loading users:', error);
            return { users: [], passwords: {} };
        }
    }

    /**
     * Save user credentials
     */
    async saveUsers(usersData) {
        try {
            // Get current file to get SHA
            const currentFile = await this.getFile('users/credentials.json');
            const sha = currentFile ? currentFile.sha : null;

            await this.saveFile(
                'users/credentials.json',
                usersData,
                'Update user credentials',
                sha
            );

            return true;
        } catch (error) {
            console.error('Error saving users:', error);
            throw error;
        }
    }

    /**
     * Load annotation for user
     */
    async loadAnnotation(username, dialogueId) {
        try {
            const path = `annotations/${username}/${dialogueId}.json`;
            const file = await this.getFile(path);
            
            if (!file) {
                return null;
            }

            return JSON.parse(file.content);
        } catch (error) {
            console.error('Error loading annotation:', error);
            return null;
        }
    }

    /**
     * Save annotation for user
     */
    async saveAnnotation(username, dialogueId, annotation) {
        try {
            const path = `annotations/${username}/${dialogueId}.json`;
            
            // Get current file SHA if it exists
            const currentFile = await this.getFile(path);
            const sha = currentFile ? currentFile.sha : null;

            await this.saveFile(
                path,
                annotation,
                `Update annotation ${dialogueId} by ${username}`,
                sha
            );

            return true;
        } catch (error) {
            console.error('Error saving annotation:', error);
            throw error;
        }
    }

    /**
     * Get all annotations for a user
     */
    async getUserAnnotations(username) {
        try {
            const url = `${this.baseUrl}/annotations/${username}`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.status === 404) {
                return []; // User folder doesn't exist yet
            }

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const files = await response.json();
            
            // Return list of dialogue IDs
            return files
                .filter(f => f.name.endsWith('.json'))
                .map(f => f.name.replace('.json', ''));
                
        } catch (error) {
            console.error('Error getting user annotations:', error);
            return [];
        }
    }

    /**
     * Check if annotation exists
     */
    async annotationExists(username, dialogueId) {
        const path = `annotations/${username}/${dialogueId}.json`;
        const file = await this.getFile(path);
        return file !== null;
    }
}

// Create global instance
window.githubStorage = new GitHubStorage();
```

### 3.2 Add Token Management UI

Add to `index.html` after the login modal:

```html
<!-- GitHub Token Setup Modal -->
<div id="github-token-modal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h3>🔑 GitHub API Setup</h3>
        </div>
        <div class="modal-body">
            <p>This tool uses GitHub to store your annotations securely.</p>
            <p>Please enter your GitHub Personal Access Token:</p>
            
            <div class="form-group">
                <label for="github-token-input">GitHub Token:</label>
                <input type="password" id="github-token-input" class="login-input" 
                       placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
                <p class="help-text">
                    Don't have a token? 
                    <a href="https://github.com/settings/tokens/new" target="_blank">
                        Create one here
                    </a>
                    (requires 'repo' scope)
                </p>
            </div>
            
            <div id="token-error" class="login-error hidden"></div>
        </div>
        <div class="modal-footer">
            <button id="test-token-btn" class="btn btn-primary">Test & Save Token</button>
        </div>
    </div>
</div>
```

---

## 📝 Step 4: Update scripts/script.js

### 4.1 Add GitHub Storage Integration

Add after the password hashing functions:

```javascript
// GitHub Storage Instance
let githubStorage = null;
let githubReady = false;

// Initialize GitHub Storage
async function initGitHubStorage() {
    // Check if token exists
    let token = localStorage.getItem('github_api_token');
    
    if (!token) {
        // Show token setup modal
        await showGitHubTokenModal();
        token = localStorage.getItem('github_api_token');
        
        if (!token) {
            throw new Error('GitHub token required');
        }
    }

    // Initialize GitHub storage
    githubStorage = window.githubStorage;
    const success = await githubStorage.init(token);
    
    if (!success) {
        localStorage.removeItem('github_api_token');
        throw new Error('Invalid GitHub token');
    }

    githubReady = true;
    return true;
}

// Show GitHub token setup modal
function showGitHubTokenModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('github-token-modal');
        const tokenInput = document.getElementById('github-token-input');
        const testBtn = document.getElementById('test-token-btn');
        const errorDiv = document.getElementById('token-error');

        modal.classList.add('show');

        testBtn.onclick = async () => {
            const token = tokenInput.value.trim();
            
            if (!token) {
                errorDiv.textContent = 'Please enter a token';
                errorDiv.classList.remove('hidden');
                return;
            }

            // Test token
            testBtn.disabled = true;
            testBtn.textContent = 'Testing...';

            try {
                const tempStorage = window.githubStorage;
                const valid = await tempStorage.init(token);

                if (valid) {
                    // Save token
                    localStorage.setItem('github_api_token', token);
                    modal.classList.remove('show');
                    resolve(true);
                } else {
                    errorDiv.textContent = 'Invalid token or no access to repository';
                    errorDiv.classList.remove('hidden');
                }
            } catch (error) {
                errorDiv.textContent = 'Error: ' + error.message;
                errorDiv.classList.remove('hidden');
            }

            testBtn.disabled = false;
            testBtn.textContent = 'Test & Save Token';
        };
    });
}
```

### 4.2 Replace localStorage Functions

Replace the existing functions with GitHub versions:

```javascript
// Load existing users from GitHub
async function loadUsers() {
    try {
        if (!githubReady) {
            await initGitHubStorage();
        }

        const data = await githubStorage.loadUsers();
        displayUsers(data.users);
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('user-list').innerHTML = 
            '<p class="error-text">Error loading users from GitHub</p>';
    }
}

// Get annotation from GitHub
async function getAnnotationFromStorage(entryId) {
    if (!githubReady) {
        await initGitHubStorage();
    }

    try {
        return await githubStorage.loadAnnotation(currentUsername, entryId);
    } catch (error) {
        console.error('Error loading annotation:', error);
        return null;
    }
}

// Save annotation to GitHub
async function saveAnnotationToStorage(entryId, annotation) {
    if (!githubReady) {
        await initGitHubStorage();
    }

    try {
        await githubStorage.saveAnnotation(currentUsername, entryId, annotation);
        return true;
    } catch (error) {
        console.error('Error saving annotation:', error);
        throw error;
    }
}

// Check annotation progress from GitHub
async function checkAnnotationProgress() {
    if (!githubReady) {
        await initGitHubStorage();
    }

    let annotatedCount = 0;
    
    try {
        // Get list of annotated dialogues for current user
        const annotatedDialogues = await githubStorage.getUserAnnotations(currentUsername);
        
        for (let i = 0; i < allDialogues.length; i++) {
            const dialogue = allDialogues[i];
            const isAnnotated = annotatedDialogues.includes(dialogue.entry_id);
            annotationStatus[dialogue.entry_id] = isAnnotated;
            if (isAnnotated) {
                annotatedCount++;
            }
        }
    } catch (error) {
        console.error('Error checking progress:', error);
    }
    
    updateProgressBar(annotatedCount, allDialogues.length);
}
```

### 4.3 Update User Registration

```javascript
async function handleRegister() {
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value;
    const confirmPassword = document.getElementById('confirm-password-input').value;
    
    // ... existing validation code ...
    
    try {
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
        
        // Store password hash
        const hashedPassword = await hashPassword(password, username);
        usersData.users.push(username);
        usersData.passwords[username] = hashedPassword;
        
        // Save to GitHub
        await githubStorage.saveUsers(usersData);
        
        currentUsername = username;
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, username);
        hideLoginModal();
        await initializeApp();
        showStatus(`Welcome, ${username}! Registration successful.`, 'success');
    } catch (error) {
        console.error('Registration error:', error);
        showLoginError('Error registering user: ' + error.message);
    }
}
```

### 4.4 Update User Login

```javascript
async function handleLogin() {
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value;
    
    // ... existing validation code ...
    
    try {
        if (!githubReady) {
            await initGitHubStorage();
        }

        // Load users from GitHub
        const usersData = await githubStorage.loadUsers();
        
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
        
        currentUsername = username;
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, username);
        hideLoginModal();
        await initializeApp();
    } catch (error) {
        console.error('Login error:', error);
        showLoginError('Error logging in: ' + error.message);
    }
}
```

---

## 🎨 Step 5: Update index.html

Add the GitHub storage script before your main script:

```html
<!-- Add before </body> -->
<script src="scripts/github-storage.js"></script>
<script src="scripts/script.js"></script>
```

---

## ✅ Step 6: Configure and Test

### 6.1 Update Configuration

In `scripts/github-storage.js`, replace:

```javascript
this.owner = 'YOUR_GITHUB_USERNAME'; // Replace with your GitHub username
this.repo = 'annotation-data';        // Your data repository name
```

### 6.2 Test Locally

```bash
cd /Users/seacow/Documents/github/esc-tom.github.io
python3 -m http.server 8000
# Open http://localhost:8000
```

### 6.3 Test Workflow

1. **Open the app** → Should show GitHub token modal
2. **Enter your token** → Click "Test & Save Token"
3. **Register a user** → Should create file in GitHub repo
4. **Annotate a dialogue** → Should create annotation file
5. **Check GitHub repo** → Verify files were created:
   - `users/credentials.json` updated
   - `annotations/{username}/{dialogue_id}.json` created

---

## 🚀 Step 7: Deploy

```bash
cd /Users/seacow/Documents/github/esc-tom.github.io

# Add new files
git add scripts/github-storage.js
git add GITHUB_STORAGE_SETUP.md

# Update existing files
git add index.html scripts/script.js

# Commit
git commit -m "Migrate storage to GitHub API

- Add GitHub API storage client
- Replace localStorage with GitHub repository
- Add token management UI
- Store users and annotations in private repo
- Automatic version control and backup"

# Push
git push origin main
```

---

## 🔒 Security Best Practices

### Token Security

1. **Never commit tokens to Git**
   ```bash
   # Add to .gitignore
   echo "*.token" >> .gitignore
   echo ".env" >> .gitignore
   ```

2. **Use fine-grained tokens** (when available)
   - Limit to specific repository
   - Set expiration date
   - Minimal permissions

3. **Token rotation**
   - Regenerate tokens periodically
   - Provide update mechanism for users

### Repository Security

1. **Keep data repo private**
2. **Enable branch protection**
3. **Regular backups** (GitHub already does this)
4. **Monitor access logs**

---

## 📊 Benefits vs. localStorage

| Feature | localStorage | GitHub API |
|---------|--------------|------------|
| **Persistence** | Per-browser | Cloud |
| **Backup** | Manual | Automatic |
| **Sync** | None | Cross-device |
| **Version Control** | None | Full history |
| **Collaboration** | None | Supported |
| **Recovery** | Difficult | Easy |
| **Capacity** | 5-10 MB | 100 GB |

---

## 🐛 Troubleshooting

### "Invalid token" error
- Check token has `repo` scope
- Verify token hasn't expired
- Ensure repository name is correct

### "404 Not Found" error
- Verify repository exists
- Check repository is private
- Confirm you have access

### Rate limit errors
- Authenticated: 5000 requests/hour
- Should be sufficient for annotation tool
- Add rate limit handling if needed

### CORS errors
- GitHub API supports CORS
- If issues, check browser console
- Verify API endpoints are correct

---

## 🎉 Done!

Your annotation tool now stores data in GitHub!

**What happens now:**
- Users enter GitHub token on first use
- All data stored in private `annotation-data` repository
- Automatic version control
- Cloud backup
- Can access from any device with same token

**Next steps:**
1. Test thoroughly
2. Deploy to GitHub Pages
3. Share token generation instructions with users
4. Monitor repository for data

---

## 📚 Additional Resources

- [GitHub REST API Documentation](https://docs.github.com/en/rest)
- [Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [Rate Limits](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting)


