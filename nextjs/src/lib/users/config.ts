const JUDGE_IMAGE_USER_IDS = [
  "y-matsumoto",
  "t-nishimoto",
  "n-tsuchiya",
  "m-kubouchi",
] as const;

const judgeImageUserSet = new Set<string>(JUDGE_IMAGE_USER_IDS);

export function getJudgeImageUsers(): string[] {
  return [...JUDGE_IMAGE_USER_IDS];
}

export function isJudgeImageUser(userId: string): boolean {
  if (!userId) {
    return false;
  }
  return judgeImageUserSet.has(userId);
}
