// Score modifier: ≥10M -> 2.0; 9.8M–9.999M -> 1 + (score-9800000)/200000; ≤9.8M -> (score-9500000)/300000
export const calculateScoreModifier = (score: number): number => {
  if (score >= 10000000) return 2.0;
  if (score >= 9800000) return 1.0 + (score - 9800000) / 200000;
  return (score - 9500000) / 300000;
};

// Play rating = max(constant + score modifier, 0)
export const calculatePlayRating = (constant: number, score: number): number => {
  const modifier = calculateScoreModifier(score);
  return Math.max(constant + modifier, 0);
};

export const difficultyTypes = ["Past", "Present", "Future", "Eternal", "Beyond"];

export const getDifficultyColor = (difficulty: string): string => {
  // Normalize checking? The UI usually passes capitalized, but good to be safe if needed.
  // Assuming strict matching based on current usage.
  switch (difficulty) {
    case "Past":
      return "#4caed1";
    case "Present":
      return "#8fad4c";
    case "Future":
      return "#822c68";
    case "Eternal":
      return "#8571a3";
    case "Beyond":
      return "#b5112e";
    default:
      return "#64748b";
  }
};
