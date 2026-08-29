const COMMUNITY_COVERS = {
  fellowships: "/community/fellowships.jpg",
  scholarships: "/community/scholarships.jpg",
  internships: "/community/internships.jpg",
  study: "/community/study-support.jpg",
} as const;

export function getCommunityFallbackCover(value: string): string {
  const text = value.toLowerCase();

  if (/fellow|leadership|network|changemaker/.test(text)) {
    return COMMUNITY_COVERS.fellowships;
  }
  if (/scholar|fund|bursary|erasmus|grant/.test(text)) {
    return COMMUNITY_COVERS.scholarships;
  }
  if (/career|job|intern|work|graduate/.test(text)) {
    return COMMUNITY_COVERS.internships;
  }
  return COMMUNITY_COVERS.study;
}
