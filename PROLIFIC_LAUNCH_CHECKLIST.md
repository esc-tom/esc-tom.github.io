# Prolific Launch Checklist

Use this checklist before launching your study on Prolific.

## Pre-Launch Configuration

### 1. Update Completion Code ⚠️ CRITICAL
- [ ] Open `scripts/prolific-config.js`
- [ ] Find the line: `completionCode: 'C1A2B3D4'`
- [ ] Replace `'C1A2B3D4'` with YOUR actual Prolific completion code
- [ ] Save the file
- [ ] Commit and push to GitHub

### 2. Test Your Configuration
- [ ] Wait for GitHub Pages to deploy (usually 1-2 minutes)
- [ ] Visit: `https://your-username.github.io/?PROLIFIC_PID=test123&STUDY_ID=test&SESSION_ID=test`
- [ ] Verify you see "Welcome Prolific Participant!" message
- [ ] Check that NO login modal appears
- [ ] Confirm 10 dialogues are assigned

## Functional Testing

### 3. Complete Full Annotation Flow
- [ ] Start from dialogue 1
- [ ] Complete at least 2 full annotations
- [ ] Verify save works correctly
- [ ] Check progress updates
- [ ] Navigate to next dialogue
- [ ] Verify data saved in Firebase Console

### 4. Test Completion
- [ ] Complete all 10 assigned dialogues
- [ ] Verify completion screen appears
- [ ] Check that completion code displays
- [ ] Confirm 5-second countdown appears
- [ ] Test automatic redirect (wait for countdown)
- [ ] Verify redirect goes to Prolific

### 5. Test Duplicate Prevention
- [ ] After completing above test, clear browser/use incognito
- [ ] Visit same URL: `https://your-username.github.io/?PROLIFIC_PID=test123&STUDY_ID=test&SESSION_ID=test`
- [ ] Verify you see "Already Participated" error
- [ ] Confirm you cannot access the study again

### 6. Browser Compatibility
- [ ] Test on Chrome
- [ ] Test on Firefox
- [ ] Test on Safari
- [ ] Test on mobile device
- [ ] Check responsive design

### 7. Prolific Preview Mode
- [ ] Create draft study on Prolific
- [ ] Set study URL with redirect parameters
- [ ] Use Prolific's "Preview" button
- [ ] Go through entire flow
- [ ] Verify redirect works from Prolific's perspective

## Study Setup on Prolific

### 8. Create Study
- [ ] Log into Prolific
- [ ] Click "New Study"
- [ ] Fill in study description
- [ ] Set study name

### 9. Set Study URL
- [ ] Choose "I'll use URL parameters"
- [ ] Enter URL: `https://your-username.github.io/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}`
- [ ] Replace `your-username` with your actual GitHub username
- [ ] Verify template variables are correct

### 10. Configure Completion
- [ ] Choose "I'll redirect them using a URL"
- [ ] Copy the completion code shown
- [ ] Verify it matches the code in your `prolific-config.js`
- [ ] If different, update your config and re-deploy

### 11. Set Compensation
- [ ] Calculate average completion time from testing
- [ ] Set appropriate reward (minimum £12/hour UK)
- [ ] Example: 30 minutes = £6.00
- [ ] Consider rounding up for goodwill

### 12. Configure Eligibility
- [ ] Set age requirements if needed
- [ ] Set language requirements (English proficiency)
- [ ] Add custom screeners if desired
- [ ] Set approval rating threshold (e.g., ≥95%)

### 13. Set Sample Size
- [ ] Calculate: How many participants do you need?
- [ ] Remember: Each gets 10 unique dialogues
- [ ] Max capacity: 214 participants (2,148 dialogues ÷ 10)
- [ ] Set your desired number

## Quality Control

### 14. Review Data Collection
- [ ] Open Firebase Console
- [ ] Check `users` collection structure
- [ ] Check `annotations` collection structure
- [ ] Verify prolific metadata is stored
- [ ] Test data export if needed

### 15. Plan Quality Checks
- [ ] Decide on minimum completion time threshold
- [ ] Plan to review outliers (too fast/too slow)
- [ ] Consider post-hoc attention check analysis
- [ ] Plan data validation approach

## Final Checks

### 16. Documentation
- [ ] Read `PROLIFIC_INTEGRATION_GUIDE.md` fully
- [ ] Bookmark Firebase Console URL
- [ ] Save Prolific study URL
- [ ] Note study ID for reference

### 17. Backup Plan
- [ ] Have completion code written down separately
- [ ] Plan for what to do if Firebase goes down
- [ ] Have manual completion code ready for emergencies
- [ ] Know how to contact participants if needed

### 18. Monitoring Setup
- [ ] Open Firebase Console in a tab
- [ ] Set up notifications if available
- [ ] Plan to check progress regularly
- [ ] Know how to pause study if needed

## Launch!

### 19. Publish Study
- [ ] Review all settings one final time
- [ ] Click "Publish" on Prolific
- [ ] Study goes live!

### 20. Monitor First Submissions
- [ ] Watch first 3-5 submissions closely
- [ ] Check completion times
- [ ] Review data quality
- [ ] Verify redirect works for all
- [ ] Check for any error reports

## Post-Launch

### 21. During Study
- [ ] Check Firebase Console daily
- [ ] Monitor completion rate
- [ ] Respond to participant messages
- [ ] Watch for any issues

### 22. After Completion
- [ ] Export data from Firebase
- [ ] Review all annotations
- [ ] Approve participants on Prolific
- [ ] Consider quality filtering
- [ ] Analyze data

## Emergency Procedures

### If Something Goes Wrong

**Issue: Redirect not working**
1. Check Firebase Console for errors
2. Verify completion code is correct
3. Provide manual completion code to participants
4. Use Prolific's message system

**Issue: Firebase down**
1. Check Firebase status page
2. Pause Prolific study
3. Wait for Firebase to recover
4. Resume study
5. May need to manually compensate affected participants

**Issue: Too many errors reported**
1. Pause study immediately
2. Test the flow yourself
3. Check browser console logs
4. Fix issue and re-deploy
5. Resume study

**Issue: Participants can't access**
1. Verify URL is correct
2. Check prolific-config.js enabled: true
3. Test URL yourself
4. Check GitHub Pages deployment

## Contact Information

**For Technical Issues:**
- GitHub Pages: Check deployment status
- Firebase: Check Firebase Console
- Browser Console: Enable debug mode

**For Prolific Issues:**
- Prolific Support: support@prolific.co
- Prolific Help Center: https://researcher-help.prolific.co

---

## Quick Test Command

Paste this in your browser to quick test:
```
https://YOUR-GITHUB-USERNAME.github.io/?PROLIFIC_PID=test123&STUDY_ID=test&SESSION_ID=test
```

Replace `YOUR-GITHUB-USERNAME` with your actual username!

---

**Remember:** 
- ⚠️ MOST CRITICAL: Update completion code before launch!
- Test thoroughly with preview mode
- Monitor first few submissions
- Have backup plan ready

Good luck with your study! 🚀

