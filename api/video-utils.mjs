export function normalizeCharacters(str) {
  if (!str) return '';
  return str
    // Normalize unicode characters to canonical decomposition
    .normalize('NFKD') 
    // Replace smart quotes/apostrophes with straight ones
    .replace(/[\u2018\u2019\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033\u2036]/g, '"')
    .trim();
}

export function normalizeSongTitle(songTitle) {
  let title = songTitle || '';

  // 1. Normalize characters first (handle smart quotes, etc)
  title = normalizeCharacters(title);

  // 2. Exact replacements / Normalizations for weird characters
  // " ͟͝͞Ⅱ́̕ " -> "II"
  if (title.includes(' ͟͝͞Ⅱ́̕')) {
      title = title.replace(/ ͟͝͞Ⅱ́̕/g, 'II');
  }

  // 3. Subtitle stripping (The Hyphen Rule) - RESTORED
  // Fixes matching for long titles like "Misdeed -la bonté de Dieu et l'origine du mal-"
  // "Misdeed -la..." becomes "Misdeed"
  if (title.includes(' -')) {
      title = title.split(' -')[0];
  }

  
  return title.trim();
}

// Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export function fuzzyTitleMatch(videoTitle, songTitle) {
   // 1. Check strict inclusion first (fastest)
   if (videoTitle.includes(songTitle)) return true;

   // 2. Token-based fuzzy match
   // Split into words, removing punctuation
   const tokenize = (str) => str.split(/[\s\-_:;,.()\[\]{}'"]+/).filter(s => s.length > 0);
   
   const videoTokens = tokenize(videoTitle);
   const songTokens = tokenize(songTitle);

   if (songTokens.length === 0) return false;

   let matchedTokens = 0;

   // For each word in the song title, try to find a close match in the video title
   for (const songToken of songTokens) {
     let bestDistance = Infinity;
     
     for (const videoToken of videoTokens) {
        // If exact match found, distance is 0
        if (videoToken === songToken) {
           bestDistance = 0;
           break;
        }
        
        // Only calculate Levenshtein if lengths are somewhat similar
        if (Math.abs(videoToken.length - songToken.length) <= 2) {
           const dist = levenshteinDistance(videoToken, songToken);
           if (dist < bestDistance) {
              bestDistance = dist;
           }
        }
     }

     // Allow 1 edit for short words (length > 3), 2 edits for longer words (length > 6)
     // Strict for very short words
     const allowedEdits = songToken.length > 6 ? 2 : (songToken.length > 3 ? 1 : 0);

     if (bestDistance <= allowedEdits) {
       matchedTokens++;
     }
   }

   // If we matched at least 80% of the song title words, call it a match
   const matchPercentage = matchedTokens / songTokens.length;
   return matchPercentage >= 0.8; 
}

export function processYouTubeItems(items, songTitle, difficulty) {
  if (!items || items.length === 0) return [];

  // Prepare the search term: normalized and lowercased
  const normalizedSongTitle = normalizeSongTitle(songTitle).toLowerCase();
  
  const specializedTerms = ['Future', 'Beyond', 'Eternal', 'Past', 'Present'];
  const normalizedDifficulty = difficulty ? difficulty.toLowerCase() : '';

  // Score each item
  const scoredItems = items.map(item => {
    // Clean the video title for comparison (normalize smart quotes, etc)
    const rawTitle = item.snippet.title;
    let title = normalizeCharacters(rawTitle).toLowerCase();
    
    // Special case: Normalize ' ͟͝͞Ⅱ́̕ ' to 'ii'
    if (title.includes(' ͟͝͞Ⅱ́̕ ')) {
        title = title.replace(/ ͟͝͞Ⅱ́̕ /g, 'ii');
    }
    let score = 0;
    const reasons = [];

    // 1. Check for song title match (Essential)
    // Use fuzzy matching to handle typos (e.g. "Hiro" vs "Hiiro")
    if (fuzzyTitleMatch(title, normalizedSongTitle)) {
      score += 10;
      reasons.push('+10 Song Title');
    } else {
      reasons.push('No Song Title Match');
    }

    // 2. Check for difficulty match
    const difficultyMap = {
      'beyond': ['beyond', 'byd'],
      'future': ['future', 'ftr'],
      'eternal': ['eternal', 'etr'],
      'present': ['present', 'prs'],
      'past': ['past', 'pst']
    };

    if (normalizedDifficulty) {
       const allowedTerms = difficultyMap[normalizedDifficulty] || [normalizedDifficulty];
       // Check if ANY allowed term is in the title
       const hasMatch = allowedTerms.some(term => title.includes(term));
       
       if (hasMatch) {
         score += 5;
         reasons.push('+5 Difficulty Match');
       } else {
         // Conflict Penalty REMOVED
         // We simply don't add points if the difficulty doesn't match.
         // Fuzzy match + Chart View preference should still bubble the right video to the top.
         reasons.push('No Difficulty Match');
       }
    }
    
    // 3. prioritized "Chart View"
    if (title.includes('chart view') || title.includes('chart_view')) {
       score += 2;
       reasons.push('+2 Chart View');
    }

    return { item, score };
  });

  // Filter and sort
  // We only accept items that at least matched the song title (score >= 10)
  const filteredSorted = scoredItems
    .filter(entry => entry.score >= 10)
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.item);
  
  if (filteredSorted.length > 0) {
    return filteredSorted;
  } else {
    return []; 
  }
}

export function getSearchQuery(songTitle, difficulty) {
  const queryTitle = normalizeSongTitle(songTitle);

  // 4. Construct Query
  // Always prefix with "Arcaea"
  if (['Future', 'Beyond', 'Eternal'].includes(difficulty)) {
    return `Arcaea ${queryTitle} ${difficulty} chart view`;
  } else if (['Past', 'Present'].includes(difficulty)) {
     // Past/Present often have fewer "chart view" videos, exact match is often better
    return `Arcaea ${queryTitle} ${difficulty}`;
  } else {
     // Default fallback
    return `Arcaea ${queryTitle} chart view`;
  }
}
