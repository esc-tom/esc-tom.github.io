# GitHub API Storage - Complete Implementation Guide

## 📚 Documentation Files

I've created several files to help you implement GitHub API storage:

1. **GITHUB_STORAGE_QUICKSTART.md** - 5-minute setup guide ⭐ START HERE
2. **GITHUB_STORAGE_SETUP.md** - Detailed step-by-step guide
3. **scripts/github-storage.js** - GitHub API client (ready to use)
4. **scripts/script-github-integration.js** - Integration code snippets
5. **This file** - Implementation roadmap

## 🎯 Implementation Roadmap

### Phase 1: Prerequisites (5 minutes)

1. **Create Private GitHub Repository**
   - Go to: https://github.com/new
   - Name: `annotation-data`
   - Visibility: **Private** ⚠️
   - Initialize with README
   - Create files:
     - `users/credentials.json` → `{"users":[],"passwords":{}}`
     - `annotations/.gitkeep` → (empty)

2. **Generate GitHub Token**
   - Go to: https://github.com/settings/tokens/new
   - Note: "Annotation Tool Access"
   - Scopes: **repo** only
   - Generate and **SAVE TOKEN**
   - Format: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Phase 2: Update Code (10 minutes)

3. **Update GitHub Storage Client**
   ```javascript
   // Edit: scripts/github-storage.js (line 22)
   
   // Change from:
   this.owner = 'YOUR_GITHUB_USERNAME';
   
   // To:
   this.owner = 'your-actual-github-username';
   ```

4. **Add GitHub Storage Script**
   ```html
   <!-- Edit: index.html -->
   <!-- Add before </body>: -->
   
   <script src="scripts/github-storage.js"></script>
   <script src="scripts/script.js"></script>
   ```

5. **Add GitHub Token Modal**
   ```html
   <!-- Edit: index.html -->
   <!-- Add before closing </body>, after other modals: -->
   
   <!-- See index.html for the complete modal HTML -->
   ```

6. **Integrate GitHub Storage into Main Script**
   
   **Option A: Manual Integration** (Recommended)
   - Open `scripts/script-github-integration.js`
   - Follow the 7 sections to update `scripts/script.js`
   - Each section has clear comments showing what to add/replace
   
   **Option B: Helper Script** (Coming soon)
   - We can create an automated migration script

### Phase 3: Test Locally (5 minutes)

7. **Start Local Server**
   ```bash
   cd /Users/seacow/Documents/github/esc-tom.github.io
   python3 -m http.server 8000
   ```

8. **Test Workflow**
   - Open http://localhost:8000
   - GitHub token modal should appear
   - Enter your token → "Test & Save Token"
   - Should see: "✅ Connected to repository"
   - Register a new user
   - Create an annotation
   - Check GitHub repository for files:
     - `users/credentials.json` (updated)
     - `annotations/{username}/{dialogue_id}.json` (new)

### Phase 4: Deploy (2 minutes)

9. **Commit and Push**
   ```bash
   git add scripts/github-storage.js
   git add scripts/script-github-integration.js
   git add GITHUB_STORAGE_*.md
   git add index.html
   git commit -m "Implement GitHub API storage for annotations"
   git push origin main
   ```

10. **Verify Deployment**
    - Wait 1-2 minutes
    - Visit your GitHub Pages URL
    - Test the same workflow as step 8

## 📋 Integration Checklist

### Setup Tasks
- [ ] Create `annotation-data` repository (private)
- [ ] Create `users/credentials.json` file
- [ ] Create `annotations/.gitkeep` file
- [ ] Generate GitHub Personal Access Token
- [ ] Save token securely

### Code Updates
- [ ] Update `github-storage.js` with your username
- [ ] Add `github-storage.js` script to `index.html`
- [ ] Add GitHub token modal to `index.html`
- [ ] Add `initGitHubStorage()` functions to `script.js`
- [ ] Replace `loadUsers()` function
- [ ] Replace `getAnnotationFromStorage()` function
- [ ] Replace `saveAnnotationToStorage()` function
- [ ] Replace `checkAnnotationProgress()` function
- [ ] Replace `handleRegister()` function
- [ ] Replace `handleLogin()` function

### Testing
- [ ] Token modal appears on first load
- [ ] Token validation works
- [ ] User registration creates GitHub file
- [ ] User login reads from GitHub
- [ ] Annotations save to GitHub
- [ ] Annotations load from GitHub
- [ ] Progress tracking accurate
- [ ] Verify files in `annotation-data` repo

### Deployment
- [ ] Committed all changes
- [ ] Pushed to GitHub
- [ ] GitHub Pages deployed
- [ ] Live site works correctly
- [ ] Tested with real annotator workflow

## 🔄 Data Migration

### From localStorage to GitHub

If you have existing users in localStorage:

```javascript
// Run in browser console on old version
const users = JSON.parse(localStorage.getItem('annotation_users')) || [];
const passwords = JSON.parse(localStorage.getItem('annotation_passwords')) || {};

const migrationData = {
    users: users,
    passwords: passwords
};

console.log(JSON.stringify(migrationData, null, 2));
// Copy this output
```

Then manually create `users/credentials.json` in GitHub with this data.

### Annotation Data Migration

For each user's annotations:

```javascript
// Run in browser console
const username = 'user_to_migrate';
const annotations = {};

for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(`annotation_data_${username}_`)) {
        const dialogueId = key.replace(`annotation_data_${username}_`, '');
        annotations[dialogueId] = JSON.parse(localStorage.getItem(key));
    }
}

console.log(JSON.stringify(annotations, null, 2));
// Create files manually in GitHub for each dialogue
```

## 🎯 Quick Start Commands

```bash
# 1. Create repository structure (on GitHub website)
#    - Create annotation-data repo (private)
#    - Create users/credentials.json
#    - Create annotations/.gitkeep

# 2. Generate token (on GitHub website)
#    - https://github.com/settings/tokens/new
#    - Scope: repo
#    - Copy token

# 3. Update configuration
cd /Users/seacow/Documents/github/esc-tom.github.io
nano scripts/github-storage.js  # Update line 22 with your username

# 4. Test locally
python3 -m http.server 8000
# Open http://localhost:8000
# Test workflow

# 5. Deploy
git add .
git commit -m "Implement GitHub API storage"
git push origin main
```

## 📊 File Structure After Implementation

```
esc-tom.github.io/                  (Your GitHub Pages repo)
├── index.html                      (✏️ Modified - added modal)
├── scripts/
│   ├── script.js                   (✏️ Modified - integrated GitHub)
│   ├── github-storage.js           (✨ New - API client)
│   └── script-github-integration.js (📖 Reference - integration code)
├── GITHUB_STORAGE_QUICKSTART.md   (📖 Quick guide)
├── GITHUB_STORAGE_SETUP.md        (📖 Detailed guide)
└── GITHUB_STORAGE_IMPLEMENTATION.md (📖 This file)

annotation-data/                     (Your private data repo)
├── README.md
├── users/
│   └── credentials.json            (User accounts & passwords)
└── annotations/
    ├── john/
    │   ├── dialogue_001.json       (John's annotations)
    │   └── dialogue_002.json
    └── sarah/
        └── dialogue_001.json       (Sarah's annotations)
```

## 🆘 Troubleshooting

### Common Issues

**"Invalid token" error**
```
✓ Token must have 'repo' scope
✓ Token must be active (not expired)
✓ Repository must exist
✓ Username in github-storage.js must match
```

**"404 Not Found" error**
```
✓ Repository name must be exact: 'annotation-data'
✓ Repository must be accessible to token
✓ Files/folders must exist before accessing
```

**"Rate limit exceeded"**
```
✓ Authenticated: 5000 requests/hour
✓ Check with: githubStorage.getRateLimit()
✓ Should be plenty for annotation tool
```

**Token not saving**
```
✓ Check browser console for errors
✓ Verify localStorage is enabled
✓ Try clearing browser cache
```

**Files not appearing in GitHub**
```
✓ Check browser console for API errors
✓ Verify token has write permissions
✓ Refresh GitHub repository page
✓ Check commit history
```

## 🔐 Security Considerations

### Token Storage
- ✅ Stored in localStorage (encrypted at rest by browser)
- ✅ Not transmitted except to GitHub API
- ✅ Can be easily cleared/reset
- ⚠️ Accessible via browser dev tools
- ⚠️ Consider session tokens for production

### Repository Security
- ✅ Repository is private
- ✅ Only token holder can access
- ✅ Full audit log in commit history
- ✅ Can revoke token anytime

### Best Practices
1. Keep `annotation-data` repository private
2. Use fine-grained tokens when available
3. Set token expiration (1 year recommended)
4. Rotate tokens periodically
5. Never commit tokens to Git
6. Don't share tokens between users

## 📈 Performance Considerations

### API Rate Limits
- **Authenticated:** 5,000 requests/hour
- **Typical usage:** 10-50 requests/hour
- **Should be sufficient** for your use case

### Optimization
- ✅ SHA caching (implemented)
- ✅ Batch operations where possible
- ✅ Lazy loading of annotations
- ✅ Progress caching

### Monitoring
```javascript
// Check rate limit
await githubStorage.getRateLimit();

// Test connection
await githubStorage.testConnection();
```

## 🎓 Learning Resources

- [GitHub REST API Docs](https://docs.github.com/en/rest)
- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents)
- [Personal Access Tokens](https://docs.github.com/en/authentication)
- [API Rate Limiting](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting)

## ✅ Success Criteria

Your GitHub storage implementation is successful when:

1. ✅ Token modal appears on first use
2. ✅ Token is validated and saved
3. ✅ Users can register (creates GitHub file)
4. ✅ Users can login (reads from GitHub)
5. ✅ Annotations save to GitHub
6. ✅ Annotations load from GitHub on login
7. ✅ Progress tracking works correctly
8. ✅ Files visible in `annotation-data` repository
9. ✅ Version history shows commits
10. ✅ All data backed up in cloud

## 🚀 Next Steps

After successful implementation:

1. **Test thoroughly** with multiple users
2. **Document token generation** for annotators
3. **Set up monitoring** of data repository
4. **Plan data exports** for analysis
5. **Consider backup strategy** (GitHub already backs up)
6. **Train annotators** on token management

## 📞 Support

If you encounter issues:

1. Check browser console for errors
2. Review troubleshooting section above
3. Verify checklist items completed
4. Check GitHub repository access
5. Test with a new token

## 🎉 Conclusion

GitHub API storage provides:
- ✅ Free, reliable cloud storage
- ✅ Automatic backups
- ✅ Version control
- ✅ Cross-device sync
- ✅ Easy setup
- ✅ No server maintenance

**Estimated time:** 30 minutes total
**Cost:** $0
**Difficulty:** ⭐⭐ Medium

You're all set! Follow the quickstart guide and you'll have cloud storage working in no time.

---

**Created:** December 17, 2025  
**Last Updated:** December 17, 2025  
**Version:** 1.0

