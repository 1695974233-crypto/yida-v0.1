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
