import fs from 'fs';
import path from 'path';

const type = process.argv[2] || 'patch';

const packageJsonPath = path.resolve('package.json');
const tauriConfPath = path.resolve('src-tauri/tauri.conf.json');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));

const currentVersion = packageJson.version;
const versionParts = currentVersion.split('.');
let [major, minor, patch] = versionParts.map(Number);

// Handle cases like "1.0.0-beta.1" if necessary, but the user asked for 0.0.0 format
if (isNaN(patch)) {
    // If patch is not a number (e.g. 1.0.0-beta), just treat it as 0 for bumping
    patch = 0;
}

let newVersion;
if (type === 'major') {
  newVersion = `${major + 1}.0.0`;
} else if (type === 'minor') {
  newVersion = `${major}.${minor + 1}.0`;
} else {
  newVersion = `${major}.${minor}.${patch + 1}`;
}

packageJson.version = newVersion;
tauriConf.version = newVersion;

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

console.log(`Version bumped from ${currentVersion} to ${newVersion}`);
console.log(newVersion); // Output new version for shell scripts
