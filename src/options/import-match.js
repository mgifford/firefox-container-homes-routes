// Finds the container on this install that an exported entry belongs to.
// Container ids (firefox-container-N) differ between Firefox installs, so
// the exported name ("label") decides when the id does not fit.
//
// - "firefox-default" always maps to itself.
// - An id that exists here with the same name is kept.
// - Otherwise exactly one container with that name is used.
// - No match, or several containers with that name: returns null, so the
//   caller can skip the entry instead of guessing.
// An entry without a label (not written by Export) keeps an id that exists.
export function findContainerId({ cookieStoreId, label }, containers) {
  if (cookieStoreId === "firefox-default") return cookieStoreId;

  const sameId = containers.find((c) => c.cookieStoreId === cookieStoreId);
  if (typeof label !== "string") return sameId ? cookieStoreId : null;
  if (sameId && sameId.name === label) return cookieStoreId;

  const sameName = containers.filter((c) => c.name === label);
  return sameName.length === 1 ? sameName[0].cookieStoreId : null;
}
