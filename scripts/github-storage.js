/**
 * GitHub API Storage Client for Annotation Tool
 * 
 * Handles all GitHub API interactions for storing:
 * - User credentials
 * - Annotation data
 * 
 * Repository structure:
 * annotation-data/
 * ├── users/
 * │   └── credentials.json
 * └── annotations/
 *     ├── user1/
 *     │   ├── dialogue_001.json
 *     │   └── dialogue_002.json
 *     └── user2/
 *         └── dialogue_001.json
 */

class GitHubStorage {
    constructor() {
        // IMPORTANT: Replace 'YOUR_GITHUB_USERNAME' with your actual GitHub username
        this.owner = 'YOUR_GITHUB_USERNAME';
        this.repo = 'annotation-data';
        this.token = null;
        this.baseUrl = `https://api.github.com/repos/${this.owner}/${this.repo}/contents`;
        
        // Cache for file SHAs to optimize API calls
        this.shaCache = new Map();
    }

    /**
     * Initialize with GitHub token
     * @param {string} token - GitHub personal access token
     * @returns {Promise<boolean>} - True if initialization successful
     */
    async init(token) {
        this.token = token;
        
        try {
            await this.testConnection();
            console.log('✅ GitHub Storage initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ GitHub Storage initialization failed:', error);
            return false;
        }
    }

    /**
     * Test GitHub API connection
     * @returns {Promise<boolean>}
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
            const error = await response.json();
            throw new Error(error.message || 'Invalid token or repository access denied');
        }

        const repo = await response.json();
        console.log(`📦 Connected to repository: ${repo.full_name}`);
        return true;
    }

    /**
     * Get file from GitHub repository
     * @param {string} path - File path in repository
     * @returns {Promise<Object|null>} - File content and SHA, or null if not found
     */
    async getFile(path) {
        const url = `${this.baseUrl}/${path}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.status === 404) {
                console.log(`📄 File not found: ${path}`);
                return null;
            }

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            // Decode base64 content
            const content = decodeURIComponent(escape(atob(data.content)));
            
            // Cache SHA for future updates
            this.shaCache.set(path, data.sha);
            
            console.log(`📥 Loaded file: ${path}`);
            
            return {
                content: content,
                sha: data.sha
            };
        } catch (error) {
            console.error(`Error getting file ${path}:`, error);
            throw error;
        }
    }

    /**
     * Save file to GitHub repository
     * @param {string} path - File path in repository
     * @param {string|Object} content - File content (string or JSON object)
     * @param {string} message - Commit message
     * @param {string|null} sha - File SHA for updates (null for new files)
     * @returns {Promise<Object>} - GitHub API response
     */
    async saveFile(path, content, message, sha = null) {
        const url = `${this.baseUrl}/${path}`;
        
        // Convert content to string if it's an object
        const contentString = typeof content === 'string' 
            ? content 
            : JSON.stringify(content, null, 2);
        
        // Encode content as base64
        const encodedContent = btoa(unescape(encodeURIComponent(contentString)));

        const body = {
            message: message,
            content: encodedContent
        };

        // Use cached SHA if not provided
        if (sha) {
            body.sha = sha;
        } else if (this.shaCache.has(path)) {
            body.sha = this.shaCache.get(path);
        }

        try {
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

            const result = await response.json();
            
            // Update SHA cache
            this.shaCache.set(path, result.content.sha);
            
            console.log(`📤 Saved file: ${path}`);
            
            return result;
        } catch (error) {
            console.error(`Error saving file ${path}:`, error);
            throw error;
        }
    }

    /**
     * Load user credentials from GitHub
     * @returns {Promise<Object>} - Users data {users: [], passwords: {}}
     */
    async loadUsers() {
        try {
            const file = await this.getFile('users/credentials.json');
            
            if (!file) {
                console.log('📝 Creating new credentials file');
                return { users: [], passwords: {} };
            }
            
            const data = JSON.parse(file.content);
            console.log(`👥 Loaded ${data.users.length} users`);
            return data;
        } catch (error) {
            console.error('Error loading users:', error);
            return { users: [], passwords: {} };
        }
    }

    /**
     * Save user credentials to GitHub
     * @param {Object} usersData - {users: [], passwords: {}}
     * @returns {Promise<boolean>}
     */
    async saveUsers(usersData) {
        try {
            // Get current file to get SHA
            const currentFile = await this.getFile('users/credentials.json');
            const sha = currentFile ? currentFile.sha : null;

            await this.saveFile(
                'users/credentials.json',
                usersData,
                `Update user credentials - ${usersData.users.length} users`,
                sha
            );

            console.log('✅ User credentials saved');
            return true;
        } catch (error) {
            console.error('Error saving users:', error);
            throw error;
        }
    }

    /**
     * Load annotation for specific user and dialogue
     * @param {string} username - Username
     * @param {string} dialogueId - Dialogue ID
     * @returns {Promise<Object|null>} - Annotation data or null
     */
    async loadAnnotation(username, dialogueId) {
        try {
            const path = `annotations/${username}/${dialogueId}.json`;
            const file = await this.getFile(path);
            
            if (!file) {
                return null;
            }

            const annotation = JSON.parse(file.content);
            console.log(`📋 Loaded annotation: ${username}/${dialogueId}`);
            return annotation;
        } catch (error) {
            console.error(`Error loading annotation ${username}/${dialogueId}:`, error);
            return null;
        }
    }

    /**
     * Save annotation for user
     * @param {string} username - Username
     * @param {string} dialogueId - Dialogue ID
     * @param {Object} annotation - Annotation data
     * @returns {Promise<boolean>}
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

            console.log(`✅ Saved annotation: ${username}/${dialogueId}`);
            return true;
        } catch (error) {
            console.error(`Error saving annotation ${username}/${dialogueId}:`, error);
            throw error;
        }
    }

    /**
     * Get list of all annotations for a user
     * @param {string} username - Username
     * @returns {Promise<string[]>} - Array of dialogue IDs
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
                console.log(`📁 No annotations folder for user: ${username}`);
                return [];
            }

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const files = await response.json();
            
            // Extract dialogue IDs from filenames
            const dialogueIds = files
                .filter(f => f.type === 'file' && f.name.endsWith('.json'))
                .map(f => f.name.replace('.json', ''));
            
            console.log(`📊 Found ${dialogueIds.length} annotations for ${username}`);
            return dialogueIds;
                
        } catch (error) {
            console.error(`Error getting user annotations for ${username}:`, error);
            return [];
        }
    }

    /**
     * Check if annotation exists
     * @param {string} username - Username
     * @param {string} dialogueId - Dialogue ID
     * @returns {Promise<boolean>}
     */
    async annotationExists(username, dialogueId) {
        const path = `annotations/${username}/${dialogueId}.json`;
        const file = await this.getFile(path);
        return file !== null;
    }

    /**
     * Delete annotation (optional - for cleanup)
     * @param {string} username - Username
     * @param {string} dialogueId - Dialogue ID
     * @returns {Promise<boolean>}
     */
    async deleteAnnotation(username, dialogueId) {
        try {
            const path = `annotations/${username}/${dialogueId}.json`;
            
            // Get file SHA
            const file = await this.getFile(path);
            if (!file) {
                return false;
            }

            const url = `${this.baseUrl}/${path}`;
            
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Delete annotation ${dialogueId} by ${username}`,
                    sha: file.sha
                })
            });

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            console.log(`🗑️ Deleted annotation: ${username}/${dialogueId}`);
            this.shaCache.delete(path);
            return true;
        } catch (error) {
            console.error(`Error deleting annotation ${username}/${dialogueId}:`, error);
            throw error;
        }
    }

    /**
     * Get API rate limit information
     * @returns {Promise<Object>} - Rate limit info
     */
    async getRateLimit() {
        try {
            const response = await fetch('https://api.github.com/rate_limit', {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to get rate limit');
            }

            const data = await response.json();
            const core = data.resources.core;
            
            console.log(`⚡ API Rate Limit: ${core.remaining}/${core.limit} (resets at ${new Date(core.reset * 1000).toLocaleTimeString()})`);
            
            return core;
        } catch (error) {
            console.error('Error getting rate limit:', error);
            return null;
        }
    }

    /**
     * Clear SHA cache
     */
    clearCache() {
        this.shaCache.clear();
        console.log('🧹 SHA cache cleared');
    }
}

// Create and export global instance
if (typeof window !== 'undefined') {
    window.GitHubStorage = GitHubStorage;
    window.githubStorage = new GitHubStorage();
    console.log('🚀 GitHub Storage client loaded');
}

