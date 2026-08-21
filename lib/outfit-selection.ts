type RecommendationGarment = {
  catalogKey?: string | null;
  category: string;
  name: string;
  colorName: string;
};

export function garmentRecommendationKey(item: RecommendationGarment) {
  if (item.catalogKey) return `catalog:${item.catalogKey}`;
  return [item.category, item.name.trim(), item.colorName.trim()].join(":");
}

export function dedupeGarmentsForRecommendations<T extends RecommendationGarment>(garments: T[]) {
  const unique = new Map<string, T>();
  for (const garment of garments) {
    const key = garmentRecommendationKey(garment);
    if (!unique.has(key)) unique.set(key, garment);
  }
  return [...unique.values()];
}

export function outfitCoreRecommendationKey(garments: RecommendationGarment[]) {
  return garments
    .filter((garment) => garment.category !== "鞋子" && garment.category !== "配饰")
    .map(garmentRecommendationKey)
    .sort()
    .join("|");
}

export function selectEligibleOutfits<T extends { key: string }>(
  generatedOutfits: T[],
  dislikedKeys: string[],
  rotation: number,
  pageSize = 3,
) {
  const excluded = new Set(dislikedKeys);
  const eligible = generatedOutfits.filter((outfit) => !excluded.has(outfit.key));
  if (!eligible.length) return { eligible, visible: [] as T[] };

  const normalizedRotation = ((rotation % eligible.length) + eligible.length) % eligible.length;
  const visibleCount = Math.min(pageSize, eligible.length);
  const visible = Array.from(
    { length: visibleCount },
    (_, index) => eligible[(normalizedRotation + index) % eligible.length],
  );
  return { eligible, visible };
}
