const fs = require("node:fs");

// Fallback for environments where rename across directories returns EXDEV.

async function moveWithCopy(src, dest) {
  const stat = await fs.promises.stat(src);
  if (stat.isDirectory()) {
    await fs.promises.cp(src, dest, { recursive: true, force: true });
    await fs.promises.rm(src, { recursive: true, force: true });
    return;
  }

  await fs.promises.copyFile(src, dest);
  await fs.promises.unlink(src);
}

const originalRename = fs.rename.bind(fs);
const originalRenameSync = fs.renameSync.bind(fs);
const originalPromisedRename = fs.promises.rename.bind(fs.promises);

fs.rename = (src, dest, callback) => {
  originalRename(src, dest, (error) => {
    if (!error) {
      callback(null);
      return;
    }
    if (error.code !== "EXDEV") {
      callback(error);
      return;
    }
    moveWithCopy(src, dest).then(() => callback(null)).catch(callback);
  });
};

fs.renameSync = (src, dest) => {
  try {
    return originalRenameSync(src, dest);
  } catch (error) {
    if (error && error.code === "EXDEV") {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        fs.cpSync(src, dest, { recursive: true, force: true });
        fs.rmSync(src, { recursive: true, force: true });
        return;
      }
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
      return;
    }
    throw error;
  }
};

fs.promises.rename = async (src, dest) => {
  try {
    await originalPromisedRename(src, dest);
  } catch (error) {
    if (error && error.code === "EXDEV") {
      await moveWithCopy(src, dest);
      return;
    }
    throw error;
  }
};
