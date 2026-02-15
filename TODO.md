# 🎯 Arcaea Charts - TODO List

## 🚨 Critical Issues (Fix ASAP)

## New Features

```markdown
### Media Integration
- [x] **Add fixed rating calculations** ✅
  - Shows required score for 9.8, 9.9, and PM (10.0) on each song card when constant is set

- [ ] **YouTube chart view videos** - Show top 3 chart views on each song card
  - Search for "{title} chart view" videos using YouTube API
  - Button called "Chart View" that full screens a YT video and locks the screen with an overlay
    - unlock by pressing a lock button that appears
  - Another button for playing official uploaded song
  - Priority: HIGH

- [ ] **Bookmarked Times Feature** - Allow users to bookmark specific timestamps
  - Add bookmark button next to play time display
  - Save/load bookmarked times for each video
  - Quick jump to saved timestamps
  - Visual indicators for bookmarked moments
  - Priority: MEDIUM

- [ ] **Local Video Upload** - Support for local video files
  - Upload button to select local video files
  - Temporary frontend storage (no backend required)
  - Same chart practice controls for local videos
  - Support common video formats (mp4, webm, etc.)
  - Priority: MEDIUM

- ✅ **Potential Calculation** - Calculate Arcaea player potential ratings (**COMPLETED**)
  - ✅ Implemented exact formula for potential calculation (score vs chart constant)
  - ✅ Reference: https://arcaea.fandom.com/wiki/Potential#Score_Modifier

```

## 🔧 Bug Fixes

### UI/UX Issues
- [ ] **Images not loading consistently** - CORS proxy sometimes fails
  - Current: Using `corsproxy.io` which can be unreliable
  - Solution: Download and host images locally or find better proxy
  - Priority: MEDIUM

- [ ] **Responsive design issues** - Check mobile layout
  - Test difficulty filter buttons on small screens
  - Ensure proper spacing and wrapping
  - Priority: MEDIUM

### Functionality
- [ ] **Search optimization** - Improve search functionality
  - Add search by chart constant
  - Add search by version
  - Case-insensitive partial matching
  - Priority: LOW

## 🚀 Feature Enhancements

### Filtering & Search
- [ ] **Advanced filters [Datadog Tags]**
  - Filter by version/update
  - Filter by song pack
  - Priority: LOW

- [ ] **Sort options**
  - Sort by release date
  - Sort by difficulty
  - Priority: LOW

- [ ] **Search history** - Remember recent searches
  - Local storage for search terms
  - Quick access to recent filters
  - Priority: LOW

### Performance Optimizations
- [ ] **Implement virtual scrolling** - For large song lists
  - Use react-window or similar
  - Only render visible items
  - Priority: LOW

- [ ] **Add loading states** - Better UX during data fetching
  - Skeleton loaders for song cards
  - Loading spinner for search
  - Priority: MEDIUM

### Data Features
- [ ] **Favorites system** - Let users save favorite songs
  - Local storage or user accounts
  - Heart/star icon on cards
  - Favorites page/filter
  - Priority: LOW

- [ ] **Song details modal** - Show more info on click
  - BPM, length, pack info
  - Chart preview if available
  - Priority: LOW

## 🎨 UI/UX Improvements

### Visual Polish
- [ ] **Improve difficulty button styling**
  - Color-code by difficulty (Past=blue, Present=green, etc.)
  - Better hover states
  - Clear selection indicators
  - Priority: MEDIUM

- [ ] **Better empty states** - When no songs match filters
  - Helpful message
  - Suggestions to adjust filters
  - Clear filters button
  - Priority: LOW

- [ ] **Dark mode support** - Theme toggle
  - Respect system preference
  - Persistent theme selection
  - Priority: LOW

### Accessibility
- [ ] **Keyboard navigation** - Full keyboard support
  - Tab through filter buttons
  - Keyboard shortcuts for common actions
  - Screen reader improvements
  - Priority: MEDIUM

- [ ] **ARIA labels** - Better screen reader support
  - Proper labels for all interactive elements
  - Meaningful alt text for images
  - Priority: LOW

## 🏗️ Technical Debt

### Code Quality
- [ ] **Add error boundaries** - Handle React errors gracefully
  - Catch and display errors nicely
  - Fallback UI for crashes
  - Priority: LOW

- [ ] **Add proper error handling** - API call failures
  - Retry logic for failed requests
  - User-friendly error messages
  - Offline state handling
  - Priority: MEDIUM

- [ ] **Add tests** - Unit and integration tests
  - Test filtering logic
  - Test API calls
  - Test UI components
  - Priority: LOW

### Development Experience
- [ ] **Add TypeScript strict mode** - Better type safety
  - Fix any type issues
  - Stricter configuration
  - Priority: LOW

- [ ] **Add linting rules** - Code consistency
  - ESLint configuration
  - Prettier setup
  - Pre-commit hooks
  - Priority: LOW

## 🌟 Future Ideas

### Advanced Features
- [ ] **Chart difficulty estimator** - ML-based difficulty prediction
- [ ] **Song recommendation system** - Based on user preferences
- [ ] **Progress tracking** - Track which songs user has played
- [ ] **Leaderboards** - High scores and rankings
- [ ] **Social features** - Share favorite songs, compare progress

### Integrations
- [ ] **Official Arcaea API** - If available in future
- [ ] **Music streaming links** - Link to Spotify/YouTube if available
- [ ] **Chart download links** - If officially supported

---

## 📝 Notes

### Priority Legend
- **HIGH**: Blocking issues that affect core functionality
- **MEDIUM**: Important improvements that enhance UX
- **LOW**: Nice-to-have features and optimizations

### Next Steps
1. Implement bookmarked times feature for better practice workflow
2. Add local video upload capability for offline practice
3. Then focus on UI polish and additional features

### Development Tips
- Test performance improvements with large datasets
- Consider mobile-first design for new features
- Keep accessibility in mind for all new UI elements
- Document any API changes or new features 

## ✅ **Recently Completed Features:**

### Chart View Video Overlay (Previous Work)
- ✅ **Gesture Prevention System** - Blocks mobile taps/gestures on video area while keeping buttons functional
- ✅ **YouTube Player API Integration** - PostMessage communication for play/pause/seek/speed without iframe reloads
- ✅ **Dynamic Speed-Based Controls** - Rewind/forward time scales with playback speed (0.5x = 5s, 2x = 20s jumps)
- ✅ **Automatic Speed Retention** - Maintains custom playback speed after pause/seek operations
- ✅ **Manual Time Tracking** - Independent time display that works alongside YouTube API
- ✅ **Organized Control Layout** - Play controls (top-left), speed controls (top-right), proper spacing
- ✅ **Mobile-Friendly Interface** - All buttons work correctly on mobile while video stays non-interactive
- ✅ **Custom Time Slider** - Slider changes video time smoothly with a toggle button

### Previously Completed
1. **Performance Issues** - ✅ Fixed with debouncing and pre-processing
2. **Slider lagging** - ✅ Resolved with optimized filtering
3. **Sort options** - ✅ Implemented dropdown with Title/Artist/Constant
4. **Difficulty button styling** - ✅ Added custom colors and styling
5. **Pagination** - ✅ Added with 10/25/50/100 options
6. **Supabase migration** - ✅ Completed
7. **Responsive design basics** - ✅ Improved significantly