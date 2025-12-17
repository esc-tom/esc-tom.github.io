# GitHub Storage - Quick Start (5 Minutes)

Get your annotation tool using GitHub for storage in 5 simple steps.

## ⚡ Quick Setup

### Step 1: Create Private Repository (2 min)

```bash
# Go to: https://github.com/new

Repository name: annotation-data
Description: Private storage for annotation tool
Visibility: ✓ Private
Initialize: ✓ Add a README

[Create repository]
```

### Step 2: Create Initial Structure (1 min)

In your new `annotation-data` repository:

**Create file: `users/credentials.json`**
```json
{
  "users": [],
  "passwords": {}
}
```

**Create file: `annotations/.gitkeep`**
```
(leave empty)
```

### Step 3: Generate GitHub Token (1 min)

```bash
# Go to: https://github.com/settings/tokens/new

Note: Annotation Tool Access
Expiration: No expiration (or 1 year)
Scopes: ✓ repo (Full control of private repositories)

[Generate token]
```

**Copy your token:** `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

⚠️ **Save it now - you won't see it again!**

### Step 4: Update Configuration (30 sec)

Edit `scripts/github-storage.js` line 22:

```javascript
// Change this:
this.owner = 'YOUR_GITHUB_USERNAME';

// To your actual username:
this.owner = 'your-actual-username';
```

### Step 5: Add GitHub Storage Script (30 sec)

Edit `index.html`, add before `</body>`:

```html
<!-- GitHub Storage -->
<script src="scripts/github-storage.js"></script>
<script src="scripts/script.js"></script>
```

## ✅ Done!

Deploy and test:

```bash
git add scripts/github-storage.js GITHUB_STORAGE_SETUP.md
git commit -m "Add GitHub API storage"
git push origin main
```

Visit your GitHub Pages URL → Enter your token → Start annotating!

---

## 🧪 Quick Test

1. Open your GitHub Pages site
2. Enter your GitHub token when prompted
3. Register a new user
4. Check your `annotation-data` repository:
   - `users/credentials.json` should be updated
5. Create an annotation
6. Check `annotations/{username}/` folder appears with files

---

## 🔧 Configuration Reference

**Repository Settings:**
```javascript
// In scripts/github-storage.js
this.owner = 'your-github-username';  // Your GitHub username
this.repo = 'annotation-data';         // Repository name
```

**Token Permissions:**
- ✓ `repo` (required)
- ✗ Everything else (not needed)

**Repository Structure:**
```
annotation-data/ (private repo)
├── README.md
├── users/
│   └── credentials.json       # User accounts
└── annotations/
    ├── user1/
    │   ├── dialogue_001.json  # Annotations
    │   └── dialogue_002.json
    └── user2/
        └── dialogue_001.json
```

---

## 🆘 Troubleshooting

### "Invalid token" error
✅ Check token has `repo` scope  
✅ Verify repository exists and is accessible  
✅ Confirm username in `github-storage.js` is correct

### "Repository not found"
✅ Repository must exist first  
✅ Repository name must match exactly  
✅ Check for typos in username/repo name

### Files not appearing
✅ Check browser console for errors  
✅ Verify token is entered and saved  
✅ Refresh GitHub repository page

---

## 📊 What Gets Stored

**User Credentials** (`users/credentials.json`):
```json
{
  "users": ["john", "sarah"],
  "passwords": {
    "john": "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    "sarah": "9af15b336e6a9619928537df30b2e773eccede65606529a0"
  }
}
```

**Annotations** (`annotations/{username}/{dialogue_id}.json`):
```json
{
  "entry_id": "example_001",
  "username": "john",
  "belief": "I believe that...",
  "desire": "I wish to...",
  "intention": "I intend to...",
  "cognitive_appraisals": [...],
  "timestamp": "2025-12-17T10:30:00.000Z"
}
```

---

## 🔐 Security Tips

1. **Keep repository private** ✓
2. **Don't share your token** ✓
3. **Rotate token periodically** ✓
4. **Use minimal token permissions** ✓
5. **Never commit token to Git** ✓

---

## 📈 Benefits

✅ **Cloud Storage** - Data safe in GitHub  
✅ **Version Control** - Full edit history  
✅ **Backup** - Automatic backups by GitHub  
✅ **Sync** - Access from any device  
✅ **Free** - GitHub provides free private repos  
✅ **Reliable** - GitHub's infrastructure  

---

## 🎯 Next Steps

1. Test locally first
2. Deploy to GitHub Pages
3. Share token instructions with annotators
4. Monitor `annotation-data` repository for activity

**Full documentation:** See `GITHUB_STORAGE_SETUP.md`

---

**Setup time:** 5 minutes  
**Cost:** $0  
**Difficulty:** ⭐⭐ Easy

🎉 You're all set! Your annotations are now stored securely in GitHub.

