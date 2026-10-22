# Install Kinetic

Kinetic targets **After Effects 2025/2026 (25.x/26.x)** using **CEP 12**. It is an unsigned development extension. The installers copy files into your user account's CEP directory and enable Adobe's unsigned-extension developer mode for that account.

Native AE execution, rendering, and installation on either operating system still need real-host validation. Start with a disposable composition.

## Download

1. Open [GitHub Releases](https://github.com/KNN-07/kinetic/releases).
2. Download the attached Kinetic release ZIP and extract the whole archive.
3. Close After Effects before installing.

The extracted folder must contain `CSXS/manifest.xml`, `index.html`, the `css`, `js`, and `jsx` folders, and the installer scripts. The prebuilt `jsx/kinetic.jsx` is required; do not copy only the HTML file.

## Windows

Double-click **Install Windows.cmd**. Administrator rights are not required.

The installer copies the extension to:

```text
%APPDATA%\Adobe\CEP\extensions\com.kinetic.panel
```

It also sets the current user's registry string `PlayerDebugMode` to `1` under:

```text
HKEY_CURRENT_USER\Software\Adobe\CSXS.12
```

Restart AE and choose **Window → Extensions → Kinetic**.

## macOS

Open Terminal, type `bash ` with a trailing space, drag **install-macos.command** from the extracted folder into Terminal, then press Return. Running it through Bash avoids requiring executable permissions on the downloaded script.

The installer copies the extension to:

```text
~/Library/Application Support/Adobe/CEP/extensions/com.kinetic.panel
```

It enables unsigned CEP 12 extensions for your account with:

```sh
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

Restart AE and choose **Window → Extensions → Kinetic**. If the preference has not taken effect, log out and back in before reopening AE.

## Upgrade

1. Export your saved curve library from Kinetic before upgrading or clearing CEP caches.
2. Close AE.
3. Move the existing **com.kinetic.panel** folder out of the CEP extensions directory as a backup.
4. Run the new version's installer, restart AE, and import your library if needed.

The installers stop when the destination already exists. Saved curves live in CEP's browser storage rather than the extension folder; export is the portable backup.

## First check

Open a disposable composition and select two adjacent Opacity keyframes. Open Kinetic's **Ease** tab, choose a curve, and apply it. Confirm the result in AE's Graph Editor, then Undo.

For a broader check, choose **File → Scripts → Run Script File** and run `tests/ae-smoke.jsx` from the complete extracted release. It creates a test composition and leaves a text animation for visual review. See the [verification guide](DEVELOPMENT.md#real-host-verification).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Kinetic is absent from Extensions | Confirm `com.kinetic.panel/CSXS/manifest.xml` is directly inside the CEP extensions directory, with no extra archive folder around it. Confirm CEP 12 developer mode and restart AE. |
| “Host script did not load” | Reinstall the complete release, including `jsx/kinetic.jsx`, and restart AE. If using source, run `npm run build` before installing. |
| Preview mode appears | You opened the browser preview. Open Kinetic from AE's Extensions menu to edit the composition. |
| A command asks for a composition or selection | Activate the intended composition and select the relevant layers, properties, or keyframes in AE. Use the panel's refresh control if the context display is stale. |
| Targets are skipped | Read the returned reasons. Locked layers, unsupported property types, existing user expressions, and unsupported transforms are preserved. |
| AE has not replied | Check for an open modal dialog. Do not repeat the action: a timed-out command may still be running, and the bridge remains locked until AE replies. |

## Remove

Close AE, then remove only the **com.kinetic.panel** folder from the installation path above. Export your curve library first if you want to keep a portable copy. Removing the folder does not clear CEP's browser storage.

Developer mode is shared by other unsigned CEP extensions. If none of your other extensions need it, set the Windows `PlayerDebugMode` registry string to `0`, or on macOS run:

```sh
defaults write com.adobe.CSXS.12 PlayerDebugMode 0
```

The installers do not modify the After Effects application files.
