const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

// --- Configuration ---

// 1. Define the list of source directories to archive.
const sourceDirs = [
  path.join(__dirname, "../logs"),
  path.join(__dirname, "../RPA-logs"),
  path.join(__dirname, "../jobLogs"),
  path.join(__dirname, "../ICS-logs"),
  path.join(__dirname, "../sflogs"),
  path.join(__dirname, "../wa-logs"),
];

// Define paths for final archives.
const finalArchiveDir = path.join(__dirname, "../archives");

// --- Utility for timestamps ---
const getTimestamp = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(
    now.getSeconds()
  )}`;
  return `${date}_${time}`;
};

// --- Main Execution ---
const run = async () => {
  try {
    console.log("Starting archive process with history preservation...");

    // Create archive directories if missing
    fs.mkdirSync(finalArchiveDir, { recursive: true });

    // Unique folder name for this run
    const timestamp = getTimestamp();
    const tempArchiveDir = path.join(finalArchiveDir, `temp_${timestamp}`);
    fs.mkdirSync(tempArchiveDir, { recursive: true });

    // --- Step 1: Create individual zip archives for each source directory ---
    const individualArchivePaths = await Promise.all(
      sourceDirs.map((dir) => archiveSourceDirectory(dir, tempArchiveDir))
    );

    const validArchivePaths = individualArchivePaths.filter(Boolean);

    if (validArchivePaths.length === 0) {
      console.log("No valid source directories found. Exiting.");
      return;
    }

    // --- Step 2: Create master archive ---
    const masterArchiveName = `all_logs_${timestamp}.zip`;
    await createMasterArchive(validArchivePaths, masterArchiveName);

    // --- Step 3: Clean up temporary zips ---
    console.log("Cleaning up temporary zips...");
    validArchivePaths.forEach((filePath) => {
      fs.unlink(filePath, (err) => {
        if (err) console.error(`Failed to delete temp file ${filePath}:`, err);
      });
    });

    // Optional: remove the temporary directory
    // fs.rmdirSync(tempArchiveDir, { recursive: true });

    console.log(`✅ Created master archive: ${masterArchiveName}`);
  } catch (error) {
    console.error("❌ Archiving failed:", error);
  }
};

// --- Helper Functions ---

const archiveSourceDirectory = (dirPath, tempArchiveDir) => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(dirPath)) {
      console.warn(`- Directory not found, skipping: ${dirPath}`);
      return resolve(null);
    }

    const dirName = path.basename(dirPath);
    const outputFileName = `${dirName}.zip`;
    const outputPath = path.join(tempArchiveDir, outputFileName);

    console.log(`- Archiving ${dirName}...`);

    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(`  ✔︎ Created: ${outputFileName}`);
      // Optional cleanup of original log files after archiving
      fs.readdir(dirPath, (err, files) => {
        if (err) return reject(err);
        for (const file of files) {
          fs.unlink(path.join(dirPath, file), (err) => {
            if (err)
              console.error(
                `Failed to delete file ${file} in ${dirName}:`,
                err
              );
          });
        }
      });
      resolve(outputPath);
    });

    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(dirPath, false);
    archive.finalize();
  });
};

const createMasterArchive = (zipFilePaths, archiveName) => {
  return new Promise((resolve, reject) => {
    const masterOutputPath = path.join(finalArchiveDir, archiveName);
    console.log(`\nCreating master archive: ${archiveName}...`);

    const output = fs.createWriteStream(masterOutputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(
        `  ✔︎ Master archive created. Total size: ${Math.round(
          archive.pointer() / 1024
        )} KB.`
      );
      resolve();
    });

    archive.on("error", reject);
    archive.pipe(output);

    zipFilePaths.forEach((filePath) => {
      archive.file(filePath, { name: path.basename(filePath) });
    });

    archive.finalize();
  });
};

// Run the archiver
run();
