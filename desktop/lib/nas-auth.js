const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { app } = require("electron");

function credentialsPath() {
  return path.join(app.getPath("userData"), "nas-credentials.json");
}

function loadNasCredentials() {
  try {
    const raw = JSON.parse(fs.readFileSync(credentialsPath(), "utf8"));
    return {
      username: raw.username || "",
      password: raw.password || ""
    };
  } catch {
    return { username: "", password: "" };
  }
}

function saveNasCredentials({ username, password }) {
  fs.mkdirSync(path.dirname(credentialsPath()), { recursive: true });
  fs.writeFileSync(
    credentialsPath(),
    JSON.stringify(
      {
        username: String(username || "").trim(),
        password: String(password || "")
      },
      null,
      2
    )
  );
}

function clearNasCredentials() {
  try {
    fs.unlinkSync(credentialsPath());
  } catch {
    // No saved credentials.
  }
}

function missingNasFolderError() {
  if (process.platform === "darwin") {
    return (
      "No NAS video folder is configured. Create desktop/nas-config.json with a mounted path " +
      "(for example, /Volumes/Media/Videos) or an SMB/UNC share (for example, smb://NAS/Media/Videos)."
    );
  }

  return (
    "No NAS video folder is configured. Set NAS_VIDEO_FOLDER or create desktop/nas-config.json " +
    '(for example, "\\\\NAS\\Media\\Videos").'
  );
}

function uncPathParts(folderPath) {
  if (!folderPath || !folderPath.startsWith("\\\\")) return null;
  const parts = folderPath.replace(/^\\\\+/, "").split("\\").filter(Boolean);
  if (parts.length < 2) return null;
  return {
    server: parts[0],
    share: parts[1],
    shareRoot: `\\\\${parts[0]}\\${parts[1]}`,
    subPath: parts.length > 2 ? parts.slice(2).join("\\") : "",
    folderPath
  };
}

function uncShareRoot(folderPath) {
  return uncPathParts(folderPath)?.shareRoot || null;
}

function parseSmbUrl(folderPath) {
  if (!/^smb:\/\//i.test(folderPath || "")) return null;

  try {
    const url = new URL(folderPath);
    const segments = url.pathname.split("/").filter(Boolean);
    if (!url.hostname || !segments.length) return null;

    return {
      server: url.hostname,
      share: segments[0],
      shareRoot: `\\\\${url.hostname}\\${segments[0]}`,
      subPath: segments.slice(1).join("/"),
      folderPath
    };
  } catch {
    return null;
  }
}

function parseNetworkNasPath(folderPath) {
  return uncPathParts(folderPath) || parseSmbUrl(folderPath);
}

function findMountedShare(shareName) {
  const candidate = path.join("/Volumes", shareName);
  if (!fs.existsSync(candidate)) return null;

  try {
    fs.accessSync(candidate, fs.constants.R_OK | fs.constants.W_OK);
    return candidate;
  } catch {
    return null;
  }
}

function connectSmbShareDarwin(network, username, password) {
  const { server, share } = network;
  if (!server || !share) {
    return { ok: false, error: "Invalid NAS share path." };
  }

  const existing = findMountedShare(share);
  if (existing) {
    return { ok: true, mountPoint: existing };
  }

  if (!username) {
    return {
      ok: false,
      needsCredentials: true,
      error: "NAS sign-in required. Enter your NAS username and password."
    };
  }

  const mountPoint = path.join("/Volumes", share);
  const mountBinary = fs.existsSync("/sbin/mount_smbfs") ? "/sbin/mount_smbfs" : "mount_smbfs";
  const auth = password
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : `${encodeURIComponent(username)}@`;
  const smbSource = `//${auth}${server}/${share}`;

  const result = spawnSync(mountBinary, [smbSource, mountPoint], {
    encoding: "utf8"
  });

  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  const mounted = findMountedShare(share);

  if (mounted) {
    return { ok: true, mountPoint: mounted };
  }

  if (/authentication|password|denied|logon|perm/i.test(output)) {
    return {
      ok: false,
      error: "NAS sign-in failed. Check your username and password."
    };
  }

  return {
    ok: false,
    error: output || `Could not mount smb://${server}/${share}.`
  };
}

function resolveNasFolderPath(folderPath, credentials) {
  if (process.platform !== "darwin") {
    return { ok: true, path: folderPath };
  }

  if (folderPath.startsWith("/")) {
    return { ok: true, path: folderPath };
  }

  const network = parseNetworkNasPath(folderPath);
  if (!network) {
    return { ok: true, path: folderPath };
  }

  const mounted = connectSmbShareDarwin(network, credentials.username, credentials.password);
  if (!mounted.ok) {
    return mounted;
  }

  let resolved = mounted.mountPoint;
  if (network.subPath) {
    resolved = path.join(resolved, ...network.subPath.split(/[\\/]+/).filter(Boolean));
  }

  return { ok: true, path: resolved };
}

function ensureUncTargetFolder(folderPath) {
  const parsed = uncPathParts(folderPath);
  if (!parsed) return;

  fs.accessSync(parsed.shareRoot, fs.constants.R_OK | fs.constants.W_OK);

  if (!parsed.subPath) return;

  if (!fs.existsSync(parsed.folderPath)) {
    fs.mkdirSync(parsed.folderPath, { recursive: true });
  }
}

function ensureTargetFolder(folderPath) {
  const parsed = uncPathParts(folderPath);
  if (parsed) {
    ensureUncTargetFolder(folderPath);
    return;
  }

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
}

function isPermissionError(error) {
  const code = error?.code || "";
  const message = String(error?.message || error || "").toLowerCase();
  return (
    code === "EACCES" ||
    code === "EPERM" ||
    /access is denied|permission|credentials|logon|1326|5\b/.test(message)
  );
}

function connectUncShare(shareRoot, username, password) {
  if (process.platform !== "win32") {
    return { ok: true };
  }

  if (!username) {
    return {
      ok: false,
      needsCredentials: true,
      error: "NAS sign-in required. Enter your NAS username and password."
    };
  }

  const args = ["use", shareRoot, `/user:${username}`];
  if (password) args.push(password);

  const result = spawnSync("net", args, {
    encoding: "utf8",
    windowsHide: true
  });

  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  if (result.status === 0) {
    return { ok: true };
  }

  if (/already connected|1219|multiple connections to a server/i.test(output)) {
    return { ok: true };
  }

  if (/1326|86|user name or password|access is denied|logon failure/i.test(output)) {
    return {
      ok: false,
      error: "NAS sign-in failed. Check your username and password."
    };
  }

  return {
    ok: false,
    error: output || "Could not sign in to the NAS share."
  };
}

function isNetworkPathNotFoundError(error) {
  const message = String(error?.message || error || "");
  return (
    /system error 67|network name cannot be found|bad network path|bad netpath|ENOENT/i.test(
      message
    ) || error?.code === "ENOENT"
  );
}

function isMissingPathError(error) {
  const code = error?.code || "";
  const message = String(error?.message || error || "").toLowerCase();
  return code === "ENOENT" || /no such file or directory|not found/.test(message);
}

function networkPathHint(folderPath, shareRoot, error = null) {
  if (!String(folderPath || "").trim()) {
    return missingNasFolderError();
  }

  if (error && isNetworkPathNotFoundError(error)) {
    if (process.platform === "darwin") {
      return (
        `macOS cannot reach the NAS share. Set videoFolder in nas-config.json to a mounted path ` +
        `such as /Volumes/Media/Videos, or use smb://NAS/Media/Videos or \\\\NAS\\Media\\Videos.`
      );
    }

    return (
      `Windows cannot reach "${shareRoot || folderPath}". Confirm the UNC path in nas-config.json ` +
      `(for example, \\\\NAS\\Media\\Videos).`
    );
  }

  if (shareRoot) {
    return "Check that the NAS is online and your account can write to this folder.";
  }

  return "Check that the folder exists and you have write access.";
}

function prepareNasAccess(folderPath, credentials = null) {
  const trimmed = String(folderPath || "").trim();
  if (!trimmed) {
    return {
      ok: false,
      path: "",
      error: missingNasFolderError()
    };
  }

  const creds = credentials || loadNasCredentials();

  if (process.env.NAS_USERNAME) {
    creds.username = process.env.NAS_USERNAME;
  }
  if (process.env.NAS_PASSWORD) {
    creds.password = process.env.NAS_PASSWORD;
  }

  const parsed = parseNetworkNasPath(trimmed);
  const shareRoot = parsed?.shareRoot || null;

  if (process.platform === "win32" && shareRoot) {
    const connected = connectUncShare(shareRoot, creds.username, creds.password);
    if (!connected.ok) {
      return connected;
    }
  }

  const resolved = resolveNasFolderPath(trimmed, creds);
  if (!resolved.ok) {
    return resolved;
  }

  const targetPath = resolved.path;

  try {
    ensureTargetFolder(targetPath);
    fs.accessSync(targetPath, fs.constants.R_OK | fs.constants.W_OK);
    return { ok: true, path: targetPath };
  } catch (error) {
    if (isMissingPathError(error)) {
      try {
        ensureTargetFolder(targetPath);
        fs.accessSync(targetPath, fs.constants.R_OK | fs.constants.W_OK);
        return { ok: true, path: targetPath, createdFolder: true };
      } catch (retryError) {
        return {
          ok: false,
          error:
            `NAS folder "${targetPath}" does not exist and could not be created.` +
            (shareRoot ? ` Confirm the share "${shareRoot}" is correct.` : "") +
            ` (${retryError.message})`
        };
      }
    }

    if (isPermissionError(error) && !creds.username && (shareRoot || process.platform === "darwin")) {
      return {
        ok: false,
        needsCredentials: true,
        error: "NAS folder is not writable. Sign in with your NAS username and password."
      };
    }

    const hint = networkPathHint(trimmed, shareRoot, error);

    return {
      ok: false,
      error: `Could not write to NAS folder "${targetPath}". ${hint} (${error.message})`
    };
  }
}

module.exports = {
  loadNasCredentials,
  saveNasCredentials,
  clearNasCredentials,
  uncShareRoot,
  uncPathParts,
  parseNetworkNasPath,
  connectUncShare,
  prepareNasAccess,
  missingNasFolderError,
  isPermissionError
};
