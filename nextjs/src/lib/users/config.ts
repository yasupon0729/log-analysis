const rawJudgeImageUsers = process.env.JUDGE_IMAGE_USERS ?? "";

const parsedJudgeImageUsers = rawJudgeImageUsers
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

const judgeImageUserSet = new Set(parsedJudgeImageUsers);

export function getJudgeImageUsers(): string[] {
  return [...judgeImageUserSet];
}

export function isJudgeImageUser(userId: string): boolean {
  if (!userId) {
    return false;
  }
  return judgeImageUserSet.has(userId);
}
