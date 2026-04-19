function createBacksellSequences() {
    try {

        if (!app || !app.project) {
            return "ERROR: No project";
        }

        var project = app.project;
        var projectName = project.name.replace(".prproj", "");

        var baseSeq = null;

        for (var i = 0; i < project.sequences.numSequences; i++) {
            if (project.sequences[i].name === "TV IN FB sekvenca") {
                baseSeq = project.sequences[i];
                break;
            }
        }

        if (!baseSeq) {
            return "ERROR: Base sequence not found";
        }

        var root = project.rootItem;
        var sekvenceBin = null;

        for (var j = 0; j < root.children.numItems; j++) {
            if (root.children[j].name === "SEKVENCE") {
                sekvenceBin = root.children[j];
                break;
            }
        }

        if (!sekvenceBin) {
            sekvenceBin = root.createBin("SEKVENCE");
        }

        function findLastCopy() {
            for (var index = project.sequences.numSequences - 1; index >= 0; index--) {
                var seq = project.sequences[index];
                if (seq.name.indexOf("Copy") !== -1) {
                    return seq;
                }
            }
            return null;
        }

        function duplicateAndRename(sourceSequence, newName) {
            sourceSequence.clone();

            var clonedSequence = findLastCopy();
            if (!clonedSequence) return null;

            for (var renameTry = 0; renameTry < 5; renameTry++) {
                try {
                    clonedSequence.projectItem.name = newName;
                } catch (e) {}
            }

            try {
                clonedSequence.projectItem.moveBin(sekvenceBin);
            } catch (e) {}

            return clonedSequence;
        }

        function enableAllClips(sequence) {
            try {
                var tracks = sequence.videoTracks;

                for (var trackIndex = 0; trackIndex < tracks.numTracks; trackIndex++) {
                    var track = tracks[trackIndex];

                    for (var clipIndex = 0; clipIndex < track.clips.numItems; clipIndex++) {
                        track.clips[clipIndex].setEnabled(true);
                    }
                }
            } catch (e) {}
        }

        function deleteWatermark(sequence) {
            try {
                var tracks = sequence.videoTracks;

                for (var trackIndex = 0; trackIndex < tracks.numTracks; trackIndex++) {
                    var track = tracks[trackIndex];

                    for (var clipIndex = track.clips.numItems - 1; clipIndex >= 0; clipIndex--) {
                        var clip = track.clips[clipIndex];

                        if (clip.name.toLowerCase().indexOf("watermark") !== -1) {
                            clip.remove(0, 0);
                        }
                    }
                }
            } catch (e) {}
        }

        function enableWatermark(sequence) {
            try {
                var tracks = sequence.videoTracks;

                for (var trackIndex = 0; trackIndex < tracks.numTracks; trackIndex++) {
                    var track = tracks[trackIndex];

                    for (var clipIndex = 0; clipIndex < track.clips.numItems; clipIndex++) {
                        var clip = track.clips[clipIndex];

                        if (clip.name.toLowerCase().indexOf("watermark") !== -1) {
                            clip.setEnabled(true);
                        }
                    }
                }
            } catch (e) {}
        }

        var tvSeq = duplicateAndRename(baseSeq, "TV " + projectName);
        if (!tvSeq) return "ERROR: TV failed";

        enableAllClips(tvSeq);
        deleteWatermark(tvSeq);

        var fbSeq = duplicateAndRename(baseSeq, "FB " + projectName);
        if (!fbSeq) return "ERROR: FB failed";

        enableAllClips(fbSeq);
        enableWatermark(fbSeq);

        var storySeq = duplicateAndRename(baseSeq, "STORY " + projectName);
        if (!storySeq) return "ERROR: STORY failed";

        enableAllClips(storySeq);
        deleteWatermark(storySeq);

        try {
            var settings = storySeq.getSettings();
            settings.videoFrameWidth = 608;
            settings.videoFrameHeight = 1080;
            storySeq.setSettings(settings);
        } catch (e) {}

        return "DONE:\nTV delete\nFB enabled\nSTORY delete";

    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

function getSelectedVideoDurationSummary() {
    var TICKS_PER_SECOND = 254016000000;

    function zeroPad(value, size) {
        var text = String(value);
        while (text.length < size) {
            text = "0" + text;
        }
        return text;
    }

    function formatTimecodeFallback(totalTicks, ticksPerFrame) {
        if (!ticksPerFrame || ticksPerFrame <= 0) {
            return "00:00:00:00";
        }

        var totalFrames = Math.round(totalTicks / ticksPerFrame);
        if (totalFrames < 0) {
            totalFrames = 0;
        }

        var fps = Math.round(TICKS_PER_SECOND / ticksPerFrame);
        if (fps <= 0) {
            fps = 25;
        }

        var frames = totalFrames % fps;
        var totalSeconds = Math.floor(totalFrames / fps);
        var seconds = totalSeconds % 60;
        var totalMinutes = Math.floor(totalSeconds / 60);
        var minutes = totalMinutes % 60;
        var hours = Math.floor(totalMinutes / 60);

        return zeroPad(hours, 2) + ":" +
            zeroPad(minutes, 2) + ":" +
            zeroPad(seconds, 2) + ":" +
            zeroPad(frames, 2);
    }

    try {
        var project = app.project;
        if (!project || !project.activeSequence) {
            return '{"label":"0 selected items Duration: 00:00:00:00","totalTicks":0}';
        }

        var sequence = project.activeSequence;
        var selection = sequence.getSelection();
        if (!selection || !selection.length) {
            return '{"label":"0 selected items Duration: 00:00:00:00","totalTicks":0}';
        }

        var totalTicks = 0;
        var videoCount = 0;
        var ticksPerFrame = Number(sequence.timebase);
        var displayFormat = null;
        var intervals = [];

        try {
            displayFormat = sequence.getSettings().videoDisplayFormat;
        } catch (e) {}

        for (var i = 0; i < selection.length; i++) {
            var item = selection[i];
            if (!item || item.mediaType !== "Video") {
                continue;
            }

            var startTicks = 0;
            var endTicks = 0;

            try {
                startTicks = Number(item.start.ticks);
                endTicks = Number(item.end.ticks);
            } catch (e) {
                startTicks = 0;
                endTicks = 0;
            }

            if (endTicks > startTicks) {
                intervals.push({
                    start: startTicks,
                    end: endTicks
                });
                videoCount++;
            }
        }

        if (videoCount === 0) {
            return '{"label":"0 selected items Duration: 00:00:00:00","totalTicks":0}';
        }

        intervals.sort(function(a, b) {
            return a.start - b.start;
        });

        var currentStart = intervals[0].start;
        var currentEnd = intervals[0].end;

        for (var j = 1; j < intervals.length; j++) {
            var interval = intervals[j];

            if (interval.start <= currentEnd) {
                if (interval.end > currentEnd) {
                    currentEnd = interval.end;
                }
            } else {
                totalTicks += currentEnd - currentStart;
                currentStart = interval.start;
                currentEnd = interval.end;
            }
        }

        totalTicks += currentEnd - currentStart;

        var formattedDuration = null;

        try {
            if (displayFormat !== null && ticksPerFrame > 0) {
                var totalTime = new Time();
                totalTime.ticks = totalTicks;

                var frameRate = new Time();
                frameRate.ticks = ticksPerFrame;

                formattedDuration = totalTime.getFormatted(frameRate, displayFormat);
            }
        } catch (e) {
            formattedDuration = null;
        }

        if (!formattedDuration) {
            formattedDuration = formatTimecodeFallback(totalTicks, ticksPerFrame);
        }

        return '{"label":"' + videoCount + ' selected items Duration: ' + formattedDuration + '","totalTicks":' + totalTicks + '}';
    } catch (e) {
        return '{"label":"0 selected items Duration: 00:00:00:00","totalTicks":0}';
    }
}

function renameSelectedSequence(prefix) {
    try {
        var project = app.project;
        if (!project) return "ERROR: No project";

        var seq = project.activeSequence;
        if (!seq) return "ERROR: No active sequence";

        var projectName = project.name.replace(".prproj", "");
        var newName = prefix + " " + projectName;

        for (var i = 0; i < 5; i++) {
            try {
                seq.projectItem.name = newName;
            } catch (e) {}
        }

        return "Renamed to:\n" + newName;

    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

function projectItemHasChildren(item) {
    try {
        return item && item.children && typeof item.children.numItems !== "undefined";
    } catch (e) {
        return false;
    }
}

function sanitizeFileNamePart(value) {
    return String(value).replace(/[\\\/:*?"<>|]+/g, "_");
}

function trimText(value) {
    return String(value).replace(/^\s+|\s+$/g, "");
}

function parseJsonText(text) {
    try {
        if (typeof JSON !== "undefined" && JSON.parse) {
            return JSON.parse(text);
        }
    } catch (e) {}

    try {
        return eval("(" + text + ")");
    } catch (e) {
        return null;
    }
}

function shellQuoteWindowsPath(value) {
    return '"' + String(value).replace(/"/g, '""') + '"';
}

function isBinLikeItem(item) {
    if (!item) {
        return false;
    }

    try {
        if (item.type === "BIN" || item.type === "ROOT") {
            return true;
        }
    } catch (e) {}

    try {
        if (typeof ProjectItemType !== "undefined" && item.type === ProjectItemType.BIN) {
            return true;
        }
    } catch (e) {}

    return projectItemHasChildren(item);
}

function getFirstSelectedTrackItem() {
    var project = app.project;
    if (!project || !project.activeSequence) {
        return null;
    }

    var selection = project.activeSequence.getSelection();
    if (!selection || !selection.length) {
        return null;
    }

    for (var i = 0; i < selection.length; i++) {
        var item = selection[i];
        if (!item) {
            continue;
        }

        try {
            if (item.projectItem) {
                return item;
            }
        } catch (e) {}
    }

    return null;
}

function transcribeSelectedMedia() {
    return "comming soon";
}

function organizeProject() {
    try {
        var project = app.project;
        if (!project) return "ERROR: No project";

        var root = project.rootItem;
        var movedSequences = 0;
        var organizedRootItems = 0;
        var sekvenceBinName = " SEKVENCE";
        var STRUCTURE = {
            " SEKVENCE": {
                ".old": [],
                ".precomps": []
            },
            "ASSETS": ["jpg", "png", "tiff", "ai", "gif", "psd"],
            "AUDIO": ["mp3", "wav", "aac"],
            "FOOTAGE": ["mp4", "mov", "mxf", "avi"]
        };

        function getOrCreateBin(parent, name) {
            for (var i = 0; i < parent.children.numItems; i++) {
                if (parent.children[i].name === name) {
                    return parent.children[i];
                }
            }
            return parent.createBin(name);
        }

        function isSequenceItem(item) {
            return item && item.isSequence && item.isSequence();
        }

        function binNameContainsSekvence(item) {
            return isBinLikeItem(item) && item.name && item.name.toLowerCase().indexOf("sekvence") !== -1;
        }

        function getParentBin(item) {
            try {
                if (item && item.getParent) {
                    return item.getParent();
                }
            } catch (e) {}
            return null;
        }

        function getExtension(name) {
            var parts = name.split(".");
            return parts.length > 1 ? parts.pop().toLowerCase() : "";
        }

        function processItem(item) {
            if (isBinLikeItem(item)) {
                walkBin(item);
                return;
            }

            if (!isSequenceItem(item)) {
                return;
            }

            var parentBin = getParentBin(item);

            if (!binNameContainsSekvence(parentBin)) {
                try {
                    item.moveBin(bins.sekvence);
                    movedSequences++;
                } catch (e) {}
            }
        }

        function walkBin(bin) {
            if (!isBinLikeItem(bin)) {
                return;
            }

            var children = [];

            for (var i = 0; i < bin.children.numItems; i++) {
                children.push(bin.children[i]);
            }

            for (var j = 0; j < children.length; j++) {
                processItem(children[j]);
            }
        }

        function organizeRootItem(item) {
            if (!item || isBinLikeItem(item) || isSequenceItem(item)) {
                return;
            }

            var ext = getExtension(item.name || "");
            if (!ext) {
                return;
            }

            if (ext === "srt") {
                try {
                    if (!bins["SUBTITLES"]) {
                        bins["SUBTITLES"] = getOrCreateBin(root, "SUBTITLES");
                    }
                    item.moveBin(bins["SUBTITLES"]);
                    organizedRootItems++;
                } catch (e) {}
                return;
            }

            for (var key in STRUCTURE) {
                var rule = STRUCTURE[key];

                if (!(rule instanceof Array)) {
                    continue;
                }

                for (var i = 0; i < rule.length; i++) {
                    if (ext === rule[i]) {
                        try {
                            item.moveBin(bins[key]);
                            organizedRootItems++;
                        } catch (e) {}
                        return;
                    }
                }
            }
        }

        var bins = {};

        for (var key in STRUCTURE) {
            var mainBin = getOrCreateBin(root, key);
            bins[key] = mainBin;

            if (typeof STRUCTURE[key] === "object" && !(STRUCTURE[key] instanceof Array)) {
                for (var sub in STRUCTURE[key]) {
                    getOrCreateBin(mainBin, sub);
                }
            }
        }

        bins.sekvence = bins[sekvenceBinName];

        for (var itemIndex = root.children.numItems - 1; itemIndex >= 0; itemIndex--) {
            processItem(root.children[itemIndex]);
        }

        var rootItems = [];

        for (var rootIndex = 0; rootIndex < root.children.numItems; rootIndex++) {
            rootItems.push(root.children[rootIndex]);
        }

        for (var rootItemIndex = 0; rootItemIndex < rootItems.length; rootItemIndex++) {
            organizeRootItem(rootItems[rootItemIndex]);
        }

        return "Project organized\nMoved sequences: " + movedSequences + "\nOrganized root items: " + organizedRootItems;

    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

function removeEmptyProjectBins() {
    try {
        var project = app.project;
        if (!project) return "ERROR: No project";

        var root = project.rootItem;
        var removedEmptyBins = 0;

        function collectEmptyBins(bin, emptyBins) {
            if (!isBinLikeItem(bin)) {
                return;
            }

            for (var i = bin.children.numItems - 1; i >= 0; i--) {
                var child = bin.children[i];

                if (!isBinLikeItem(child)) {
                    continue;
                }

                collectEmptyBins(child, emptyBins);

                if (projectItemHasChildren(child) && child.children.numItems === 0) {
                    emptyBins.push(child);
                }
            }
        }

        while (true) {
            var emptyBins = [];

            collectEmptyBins(root, emptyBins);

            if (emptyBins.length === 0) {
                break;
            }

            var deletedThisPass = 0;

            for (var binIndex = 0; binIndex < emptyBins.length; binIndex++) {
                try {
                    if (emptyBins[binIndex].deleteBin() === 0) {
                        removedEmptyBins++;
                        deletedThisPass++;
                    }
                } catch (e) {}
            }

            if (deletedThisPass === 0) {
                break;
            }
        }

        return removedEmptyBins > 0
            ? "Removed empty bins: " + removedEmptyBins
            : "No empty bins found";

    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

function deleteNamedBin() {
    try {
        var project = app.project;
        if (!project) return "ERROR: No project";

        var root = project.rootItem;
        var matchingBins = [];
        var deletedBins = 0;
        var blockedBins = 0;

        function collectMatchingBins(bin) {
            if (!isBinLikeItem(bin)) {
                return;
            }

            for (var i = 0; i < bin.children.numItems; i++) {
                var child = bin.children[i];

                if (!isBinLikeItem(child)) {
                    continue;
                }

                collectMatchingBins(child);

                if (child.name && child.name.toLowerCase().replace(/^\s+|\s+$/g, "") === "bin") {
                    matchingBins.push(child);
                }
            }
        }

        collectMatchingBins(root);

        if (matchingBins.length === 0) {
            return 'No folder named "bin" found';
        }

        for (var binIndex = 0; binIndex < matchingBins.length; binIndex++) {
            try {
                if (matchingBins[binIndex].deleteBin() === 0) {
                    deletedBins++;
                } else {
                    blockedBins++;
                }
            } catch (e) {
                blockedBins++;
            }
        }

        if (deletedBins > 0 && blockedBins === 0) {
            return 'Deleted "bin" folders: ' + deletedBins;
        }

        if (deletedBins > 0) {
            return 'Deleted "bin" folders: ' + deletedBins + '\nBlocked: ' + blockedBins;
        }

        return 'Found "bin" folders, but none could be deleted';
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

function stringifyJsonText(value) {
    try {
        if (typeof JSON !== "undefined" && JSON.stringify) {
            return JSON.stringify(value);
        }
    } catch (e) {}

    return String(value);
}

function readTextFile(filePath) {
    var file = new File(filePath);
    if (!file.exists) {
        return "";
    }

    file.encoding = "UTF-8";
    if (!file.open("r")) {
        return "";
    }

    var text = file.read();
    file.close();
    return text;
}

function getWhisprRootPath() {
    return getInstallRootPath() + "\\runtime\\whispr";
}

function getInstallRootPath() {
    try {
        var userDataFolder = Folder.userData;
        if (userDataFolder && userDataFolder.parent && userDataFolder.parent.parent) {
            return normalizeWindowsPath(userDataFolder.parent.parent.fsName + "\\aktual-premiere-tools");
        }
    } catch (e) {}

    try {
        var documentsFolder = Folder.myDocuments;
        if (documentsFolder && documentsFolder.parent) {
            return normalizeWindowsPath(documentsFolder.parent.fsName + "\\aktual-premiere-tools");
        }
    } catch (e) {}

    return "C:\\Users\\Public\\aktual-premiere-tools";
}

function writeTextFile(filePath, contents) {
    var file = new File(filePath);
    file.encoding = "UTF-8";
    if (!file.open("w")) {
        return false;
    }

    file.write(contents);
    file.close();
    return true;
}

function writeJsonFile(filePath, value) {
    return writeTextFile(filePath, stringifyJsonText(value));
}

function writeWindowsCmdFile(filePath, lines) {
    return writeTextFile(filePath, lines.join("\r\n"));
}

function createFolderIfMissing(folderPath) {
    var folder = new Folder(folderPath);
    if (!folder.exists) {
        folder.create();
    }
    return folder.exists;
}

function copyFileIfExists(sourcePath, targetPath) {
    try {
        if (!sourcePath || !targetPath) {
            return false;
        }

        var sourceFile = new File(sourcePath);
        if (!sourceFile.exists) {
            return false;
        }

        var targetFile = new File(targetPath);
        if (targetFile.exists) {
            try {
                targetFile.remove();
            } catch (removeError) {}
        }

        return sourceFile.copy(targetPath);
    } catch (e) {
        return false;
    }
}

function getProjectStateRootInfo() {
    try {
        var project = app.project;
        if (!project || !project.name) {
            return {
                ok: false,
                error: "No active project"
            };
        }

        var projectPath = "";
        try {
            projectPath = String(project.path || "");
        } catch (e) {
            projectPath = "";
        }

        if (!projectPath) {
            return {
                ok: false,
                error: "Save the Premiere project first to persist sequence state next to the project."
            };
        }

        var projectFile = new File(projectPath);
        var projectFolder = projectFile.parent;
        if (!projectFolder || !projectFolder.exists) {
            return {
                ok: false,
                error: "Project folder could not be resolved"
            };
        }

        var projectStem = sanitizeFileNamePart(String(project.name).replace(/\.prproj$/i, ""));
        var stateRoot = projectFolder.fsName + "\\" + projectStem + "_AKTUAL_TOOLS";
        createFolderIfMissing(stateRoot);

        return {
            ok: true,
            rootPath: stateRoot,
            projectPath: projectPath,
            projectName: project.name
        };
    } catch (e) {
        return {
            ok: false,
            error: e.toString()
        };
    }
}

function cloneJsonCompatible(value) {
    return parseJsonText(stringifyJsonText(value));
}

function buildIsoTimestampText(dateValue) {
    var date = dateValue ? new Date(dateValue) : new Date();
    if (isNaN(date.getTime())) {
        date = new Date();
    }

    return date.getUTCFullYear() + "-" +
        zeroPadGlobal(date.getUTCMonth() + 1, 2) + "-" +
        zeroPadGlobal(date.getUTCDate(), 2) + "T" +
        zeroPadGlobal(date.getUTCHours(), 2) + ":" +
        zeroPadGlobal(date.getUTCMinutes(), 2) + ":" +
        zeroPadGlobal(date.getUTCSeconds(), 2) + "." +
        zeroPadGlobal(date.getUTCMilliseconds(), 3) + "Z";
}

function buildTimestampToken(dateValue) {
    return buildIsoTimestampText(dateValue).replace(/[-:.]/g, "");
}

function safeRemoveFile(filePath) {
    try {
        var file = new File(filePath);
        if (file.exists) {
            return file.remove();
        }
        return true;
    } catch (e) {
        return false;
    }
}

function atomicWriteTextFile(filePath, contents) {
    try {
        var targetFile = new File(filePath);
        var parentFolder = targetFile.parent;
        if (parentFolder && !parentFolder.exists) {
            parentFolder.create();
        }

        var tempPath = filePath + ".tmp_" + buildTimestampToken();
        if (!writeTextFile(tempPath, contents)) {
            return false;
        }

        var tempFile = new File(tempPath);
        if (!tempFile.exists) {
            return false;
        }

        if (targetFile.exists) {
            try {
                targetFile.remove();
            } catch (removeError) {
                safeRemoveFile(tempPath);
                return false;
            }
        }

        if (!tempFile.rename(targetFile.name)) {
            safeRemoveFile(tempPath);
            return false;
        }

        return true;
    } catch (e) {
        return false;
    }
}

function atomicWriteJsonFile(filePath, value) {
    return atomicWriteTextFile(filePath, stringifyJsonText(value));
}

function getTranscriptStoreInfo() {
    var rootInfo = getProjectStateRootInfo();
    if (!rootInfo.ok) {
        return rootInfo;
    }

    var storeRoot = rootInfo.rootPath + "\\transcripts_store";
    var transcriptsPath = storeRoot + "\\records";
    var stylesPath = storeRoot + "\\styles";
    var captionsPath = storeRoot + "\\captions";

    createFolderIfMissing(storeRoot);
    createFolderIfMissing(transcriptsPath);
    createFolderIfMissing(stylesPath);
    createFolderIfMissing(captionsPath);

    return {
        ok: true,
        baseRootPath: rootInfo.rootPath,
        rootPath: storeRoot,
        transcriptsPath: transcriptsPath,
        stylesPath: stylesPath,
        captionsPath: captionsPath,
        manifestPath: storeRoot + "\\manifest.json",
        projectPath: rootInfo.projectPath,
        projectName: rootInfo.projectName
    };
}

function normalizeSequenceNameSlug(sequenceName) {
    var slug = sanitizeFileNamePart(trimText(sequenceName || "")).toLowerCase();
    if (!slug) {
        slug = "untitled_sequence";
    }
    return slug;
}

function buildSequenceIdentity(sequenceId, sequenceName, sequenceKey) {
    var normalizedId = sequenceId ? String(sequenceId) : "";
    var normalizedName = trimText(sequenceName || "");
    var slug = normalizeSequenceNameSlug(normalizedName);
    var normalizedKey = sequenceKey
        ? sanitizeFileNamePart(String(sequenceKey)).toLowerCase()
        : (slug + "__" + sanitizeFileNamePart(normalizedId || "no_sequence_id").toLowerCase());

    return {
        sequenceId: normalizedId,
        sequenceName: normalizedName,
        sequenceNameSlug: slug,
        sequenceKey: normalizedKey
    };
}

function getEmptyTranscriptManifest(storeInfo) {
    return {
        schemaVersion: 1,
        plugin: "AKTUAL_TOOLS",
        project: {
            path: storeInfo.projectPath,
            name: storeInfo.projectName
        },
        sequences: {},
        aliases: {
            bySequenceId: {},
            bySequenceNameSlug: {}
        },
        updatedAt: buildIsoTimestampText()
    };
}

function normalizeTranscriptRecord(record) {
    var normalized = record || {};
    return {
        recordId: String(normalized.recordId || ""),
        createdAt: String(normalized.createdAt || buildIsoTimestampText()),
        status: normalized.status === "valid" ? "valid" : "invalid",
        transcriptJsonPath: String(normalized.transcriptJsonPath || ""),
        transcriptSrtPath: String(normalized.transcriptSrtPath || ""),
        sequenceId: String(normalized.sequenceId || ""),
        sequenceName: String(normalized.sequenceName || ""),
        sequenceKey: String(normalized.sequenceKey || ""),
        sequenceNameSlug: String(normalized.sequenceNameSlug || ""),
        source: String(normalized.source || "entire"),
        processingDevice: String(normalized.processingDevice || "cpu"),
        summary: String(normalized.summary || ""),
        language: String(normalized.language || ""),
        durationSeconds: Number(normalized.durationSeconds) || 0,
        segmentCount: Number(normalized.segmentCount) || 0,
        jobStatePath: String(normalized.jobStatePath || ""),
        validationError: String(normalized.validationError || "")
    };
}

function normalizeStringArray(value) {
    var normalized = [];
    var seen = {};
    var i = 0;

    function pushValue(candidate) {
        var text = String(candidate || "");
        if (!text || seen[text]) {
            return;
        }
        seen[text] = true;
        normalized.push(text);
    }

    if (value instanceof Array) {
        for (i = 0; i < value.length; i++) {
            pushValue(value[i]);
        }
        return normalized;
    }

    if (typeof value === "string" || typeof value === "number") {
        pushValue(value);
        return normalized;
    }

    if (value && typeof value === "object") {
        for (var key in value) {
            if (!value.hasOwnProperty(key)) {
                continue;
            }
            pushValue(value[key]);
        }
    }

    return normalized;
}

function normalizeTranscriptSequenceEntry(entry, sequenceKey) {
    var normalized = entry || {};
    var aliases = normalized.aliases || {};
    var records = normalized.records || [];
    var dedupedRecords = [];
    var seenRecordIds = {};

    for (var i = 0; i < records.length; i++) {
        var record = normalizeTranscriptRecord(records[i]);
        if (!record.recordId || seenRecordIds[record.recordId]) {
            continue;
        }
        seenRecordIds[record.recordId] = true;
        dedupedRecords.push(record);
    }

    return {
        sequenceKey: String(normalized.sequenceKey || sequenceKey || ""),
        sequenceName: String(normalized.sequenceName || ""),
        sequenceNameSlug: String(normalized.sequenceNameSlug || normalizeSequenceNameSlug(normalized.sequenceName || "")),
        aliases: {
            sequenceIds: normalizeStringArray(aliases.sequenceIds),
            sequenceNames: normalizeStringArray(aliases.sequenceNames)
        },
        latestValidRecordId: String(normalized.latestValidRecordId || ""),
        records: dedupedRecords
    };
}

function rebuildTranscriptManifestAliases(manifest) {
    var aliases = {
        bySequenceId: {},
        bySequenceNameSlug: {}
    };

    for (var sequenceKey in manifest.sequences) {
        if (!manifest.sequences.hasOwnProperty(sequenceKey)) {
            continue;
        }

        var entry = normalizeTranscriptSequenceEntry(manifest.sequences[sequenceKey], sequenceKey);
        manifest.sequences[sequenceKey] = entry;

        for (var idIndex = 0; idIndex < entry.aliases.sequenceIds.length; idIndex++) {
            var sequenceId = String(entry.aliases.sequenceIds[idIndex] || "");
            if (sequenceId) {
                aliases.bySequenceId[sequenceId] = sequenceKey;
            }
        }

        var slug = entry.sequenceNameSlug || normalizeSequenceNameSlug(entry.sequenceName || "");
        if (!aliases.bySequenceNameSlug[slug]) {
            aliases.bySequenceNameSlug[slug] = [];
        }
        if (aliases.bySequenceNameSlug[slug].indexOf(sequenceKey) === -1) {
            aliases.bySequenceNameSlug[slug].push(sequenceKey);
        }
    }

    manifest.aliases = aliases;
}

function loadTranscriptManifest(storeInfo) {
    var text = readTextFile(storeInfo.manifestPath);
    var parsed = text ? parseJsonText(text) : null;
    var manifest = parsed || getEmptyTranscriptManifest(storeInfo);
    var normalizedSequences = {};

    manifest.schemaVersion = 1;
    manifest.plugin = "AKTUAL_TOOLS";
    manifest.project = {
        path: storeInfo.projectPath,
        name: storeInfo.projectName
    };
    manifest.sequences = manifest.sequences || {};

    for (var sequenceKey in manifest.sequences) {
        if (!manifest.sequences.hasOwnProperty(sequenceKey)) {
            continue;
        }
        normalizedSequences[sequenceKey] = normalizeTranscriptSequenceEntry(manifest.sequences[sequenceKey], sequenceKey);
    }

    manifest.sequences = normalizedSequences;
    rebuildTranscriptManifestAliases(manifest);
    return manifest;
}

function saveTranscriptManifest(storeInfo, manifest) {
    manifest.updatedAt = buildIsoTimestampText();
    rebuildTranscriptManifestAliases(manifest);
    return atomicWriteJsonFile(storeInfo.manifestPath, manifest);
}

function ensureSequenceManifestEntry(manifest, sequenceInfo) {
    var sequenceKey = sequenceInfo.sequenceKey;
    if (!manifest.sequences[sequenceKey]) {
        manifest.sequences[sequenceKey] = normalizeTranscriptSequenceEntry({
            sequenceKey: sequenceKey,
            sequenceName: sequenceInfo.sequenceName,
            sequenceNameSlug: sequenceInfo.sequenceNameSlug,
            aliases: {
                sequenceIds: sequenceInfo.sequenceId ? [sequenceInfo.sequenceId] : [],
                sequenceNames: sequenceInfo.sequenceName ? [sequenceInfo.sequenceName] : []
            },
            latestValidRecordId: "",
            records: []
        }, sequenceKey);
    }

    var entry = manifest.sequences[sequenceKey];
    entry.sequenceName = sequenceInfo.sequenceName || entry.sequenceName || "";
    entry.sequenceNameSlug = sequenceInfo.sequenceNameSlug || entry.sequenceNameSlug || "";

    if (sequenceInfo.sequenceId && entry.aliases.sequenceIds.indexOf(sequenceInfo.sequenceId) === -1) {
        entry.aliases.sequenceIds.push(sequenceInfo.sequenceId);
    }
    if (sequenceInfo.sequenceName && entry.aliases.sequenceNames.indexOf(sequenceInfo.sequenceName) === -1) {
        entry.aliases.sequenceNames.push(sequenceInfo.sequenceName);
    }

    manifest.sequences[sequenceKey] = entry;
    return entry;
}

function buildTranscriptPaths(storeInfo, sequenceInfo, recordId) {
    var baseName = sequenceInfo.sequenceNameSlug + "__" + recordId;
    return {
        transcriptJsonPath: storeInfo.transcriptsPath + "\\" + baseName + ".json",
        transcriptSrtPath: storeInfo.transcriptsPath + "\\" + baseName + ".srt",
        captionStylePath: storeInfo.stylesPath + "\\" + sequenceInfo.sequenceKey + "__caption_style.json",
        captionsBasePath: storeInfo.captionsPath + "\\" + sequenceInfo.sequenceKey
    };
}

function isValidTranscriptResultData(data) {
    if (!data || !(data.segments instanceof Array) || !data.segments.length) {
        return false;
    }

    for (var i = 0; i < data.segments.length; i++) {
        var segment = data.segments[i] || {};
        if (isNaN(Number(segment.start)) || isNaN(Number(segment.end))) {
            return false;
        }
        if (String(segment.text || "") === "") {
            return false;
        }
    }

    return true;
}

function readValidatedTranscriptJson(filePath, expectedSequenceInfo) {
    var text = readTextFile(filePath);
    if (!text) {
        return {
            ok: false,
            error: "Transcript JSON missing"
        };
    }

    var data = parseJsonText(text);
    if (!isValidTranscriptResultData(data)) {
        return {
            ok: false,
            error: "Transcript JSON malformed"
        };
    }

    var metadata = data._aktualTranscript || null;
    if (metadata && expectedSequenceInfo) {
        if (metadata.sequenceKey && metadata.sequenceKey !== expectedSequenceInfo.sequenceKey) {
            return {
                ok: false,
                error: "Transcript belongs to a different sequence key"
            };
        }

        if (
            metadata.sequenceNameSlug &&
            expectedSequenceInfo.sequenceNameSlug &&
            metadata.sequenceNameSlug !== expectedSequenceInfo.sequenceNameSlug
        ) {
            return {
                ok: false,
                error: "Transcript belongs to a different sequence name"
            };
        }
    }

    return {
        ok: true,
        data: data,
        metadata: metadata
    };
}

function findLatestValidRecord(entry, sequenceInfo) {
    var sortedRecords = entry.records.slice(0);
    sortedRecords.sort(function(a, b) {
        var timeA = Date.parse(a.createdAt || "") || 0;
        var timeB = Date.parse(b.createdAt || "") || 0;
        if (timeA !== timeB) {
            return timeB - timeA;
        }
        return String(b.recordId || "").localeCompare(String(a.recordId || ""));
    });

    for (var i = 0; i < sortedRecords.length; i++) {
        var record = normalizeTranscriptRecord(sortedRecords[i]);
        if (record.status !== "valid" || !record.transcriptJsonPath) {
            continue;
        }

        var validated = readValidatedTranscriptJson(record.transcriptJsonPath, sequenceInfo);
        if (!validated.ok) {
            record.status = "invalid";
            record.validationError = validated.error;
            continue;
        }

        record.validationError = "";
        return {
            found: true,
            record: record,
            resultData: validated.data
        };
    }

    return {
        found: false
    };
}

function getLegacySequenceStatePaths(sequenceId, sequenceName) {
    var info = getProjectStateRootInfo();
    if (!info.ok) {
        return [];
    }

    var legacyPaths = [];
    var idKey = sanitizeFileNamePart(sequenceId || "unknown");
    var nameKey = sanitizeFileNamePart(sequenceName || "unknown");

    legacyPaths.push({
        statePath: info.rootPath + "\\sequence_id_" + idKey + "_panel_state.json",
        transcriptionJsonPath: info.rootPath + "\\sequence_id_" + idKey + "_transcription.json",
        transcriptionSrtPath: info.rootPath + "\\sequence_id_" + idKey + "_transcription.srt"
    });

    if (nameKey && nameKey !== idKey) {
        legacyPaths.push({
            statePath: info.rootPath + "\\sequence_name_" + nameKey + "_panel_state.json",
            transcriptionJsonPath: info.rootPath + "\\sequence_name_" + nameKey + "_transcription.json",
            transcriptionSrtPath: info.rootPath + "\\sequence_name_" + nameKey + "_transcription.srt"
        });
    }

    return legacyPaths;
}

function registerLegacyTranscriptIfPresent(storeInfo, manifest, sequenceInfo) {
    var legacyPaths = getLegacySequenceStatePaths(sequenceInfo.sequenceId, sequenceInfo.sequenceName);

    for (var i = 0; i < legacyPaths.length; i++) {
        var legacy = legacyPaths[i];
        var validation = readValidatedTranscriptJson(legacy.transcriptionJsonPath, null);
        if (!validation.ok) {
            continue;
        }

        var legacyPayload = parseJsonText(readTextFile(legacy.statePath)) || {};
        var recordId = "legacy_" + buildTimestampToken(legacyPayload.savedAt || legacyPayload.createdAt || buildIsoTimestampText());
        var entry = ensureSequenceManifestEntry(manifest, sequenceInfo);
        var alreadyPresent = false;

        for (var recordIndex = 0; recordIndex < entry.records.length; recordIndex++) {
            if (entry.records[recordIndex].recordId === recordId) {
                alreadyPresent = true;
                break;
            }
        }

        if (alreadyPresent) {
            return true;
        }

        var transcriptPaths = buildTranscriptPaths(storeInfo, sequenceInfo, recordId);
        var storedPayload = cloneJsonCompatible(validation.data) || {};
        storedPayload._aktualTranscript = {
            schemaVersion: 1,
            recordId: recordId,
            createdAt: buildIsoTimestampText(legacyPayload.savedAt || legacyPayload.createdAt || buildIsoTimestampText()),
            sequenceId: sequenceInfo.sequenceId,
            sequenceName: sequenceInfo.sequenceName,
            sequenceKey: sequenceInfo.sequenceKey,
            sequenceNameSlug: sequenceInfo.sequenceNameSlug,
            source: legacyPayload.transcriptionState && legacyPayload.transcriptionState.source ? legacyPayload.transcriptionState.source : "entire",
            processingDevice: legacyPayload.transcriptionState && legacyPayload.transcriptionState.processingDevice ? legacyPayload.transcriptionState.processingDevice : "cpu",
            transcriptSrtPath: "",
            jobStatePath: legacy.statePath
        };

        if (!atomicWriteJsonFile(transcriptPaths.transcriptJsonPath, storedPayload)) {
            continue;
        }

        var transcriptSrtPath = "";
        if ((new File(legacy.transcriptionSrtPath)).exists && copyFileIfExists(legacy.transcriptionSrtPath, transcriptPaths.transcriptSrtPath)) {
            transcriptSrtPath = transcriptPaths.transcriptSrtPath;
        }
        storedPayload._aktualTranscript.transcriptSrtPath = transcriptSrtPath;
        atomicWriteJsonFile(transcriptPaths.transcriptJsonPath, storedPayload);

        entry.records.push(normalizeTranscriptRecord({
            recordId: recordId,
            createdAt: storedPayload._aktualTranscript.createdAt,
            status: "valid",
            transcriptJsonPath: transcriptPaths.transcriptJsonPath,
            transcriptSrtPath: transcriptSrtPath,
            sequenceId: sequenceInfo.sequenceId,
            sequenceName: sequenceInfo.sequenceName,
            sequenceKey: sequenceInfo.sequenceKey,
            sequenceNameSlug: sequenceInfo.sequenceNameSlug,
            source: storedPayload._aktualTranscript.source,
            processingDevice: storedPayload._aktualTranscript.processingDevice,
            summary: legacyPayload.transcriptionState && legacyPayload.transcriptionState.summary ? legacyPayload.transcriptionState.summary : buildTranscriptionSummary(validation.data),
            language: validation.data.language || "",
            durationSeconds: Number(validation.data.duration_seconds) || 0,
            segmentCount: validation.data.segments.length,
            jobStatePath: legacy.statePath
        }));
        entry.latestValidRecordId = recordId;
        manifest.sequences[sequenceInfo.sequenceKey] = entry;
        return true;
    }

    return false;
}

function recoverManifestEntryFromStoredFiles(storeInfo, manifest, sequenceInfo) {
    var transcriptFolder = new Folder(storeInfo.transcriptsPath);
    if (!transcriptFolder.exists) {
        return false;
    }

    var files = transcriptFolder.getFiles("*.json");
    var recovered = false;

    for (var i = 0; i < files.length; i++) {
        var validation = readValidatedTranscriptJson(files[i].fsName, null);
        if (!validation.ok || !validation.metadata) {
            continue;
        }

        var metadata = validation.metadata;
        if (metadata.sequenceKey !== sequenceInfo.sequenceKey) {
            continue;
        }

        var entry = ensureSequenceManifestEntry(manifest, sequenceInfo);
        var exists = false;
        for (var recordIndex = 0; recordIndex < entry.records.length; recordIndex++) {
            if (entry.records[recordIndex].recordId === metadata.recordId) {
                exists = true;
                break;
            }
        }

        if (exists) {
            continue;
        }

        entry.records.push(normalizeTranscriptRecord({
            recordId: metadata.recordId,
            createdAt: metadata.createdAt,
            status: "valid",
            transcriptJsonPath: files[i].fsName,
            transcriptSrtPath: metadata.transcriptSrtPath || "",
            sequenceId: metadata.sequenceId || sequenceInfo.sequenceId,
            sequenceName: metadata.sequenceName || sequenceInfo.sequenceName,
            sequenceKey: metadata.sequenceKey || sequenceInfo.sequenceKey,
            sequenceNameSlug: metadata.sequenceNameSlug || sequenceInfo.sequenceNameSlug,
            source: metadata.source || "entire",
            processingDevice: metadata.processingDevice || "cpu",
            summary: buildTranscriptionSummary(validation.data),
            language: validation.data.language || "",
            durationSeconds: Number(validation.data.duration_seconds) || 0,
            segmentCount: validation.data.segments.length,
            jobStatePath: metadata.jobStatePath || ""
        }));
        recovered = true;
    }

    return recovered;
}

function buildCompletedTranscriptionState(record, sequenceInfo, storeInfo) {
    return {
        status: "completed",
        statusLabel: "Completed",
        jobId: "",
        statePath: "",
        sequenceId: sequenceInfo.sequenceId,
        sequenceName: sequenceInfo.sequenceName,
        sequenceKey: sequenceInfo.sequenceKey,
        source: record.source || "entire",
        processingDevice: record.processingDevice || "cpu",
        requestedLanguages: ["slo"],
        normalizedLanguages: [],
        resultJsonPath: record.transcriptJsonPath,
        resultSrtPath: record.transcriptSrtPath || "",
        activeTranscriptRecordId: record.recordId,
        manifestPath: storeInfo.manifestPath,
        storageRootPath: storeInfo.rootPath,
        audioPath: "",
        outputDir: "",
        workerStdoutPath: "",
        workerStderrPath: "",
        error: "",
        summary: record.summary || "",
        notificationShown: true,
        persistenceStatus: "registered",
        updatedAt: Date.parse(record.createdAt || "") || 0
    };
}

function resolveSequenceEntryKey(manifest, sequenceInfo) {
    if (manifest.sequences[sequenceInfo.sequenceKey]) {
        return sequenceInfo.sequenceKey;
    }

    if (sequenceInfo.sequenceId && manifest.aliases.bySequenceId[sequenceInfo.sequenceId]) {
        return manifest.aliases.bySequenceId[sequenceInfo.sequenceId];
    }

    var nameMatches = manifest.aliases.bySequenceNameSlug[sequenceInfo.sequenceNameSlug] || [];
    if (nameMatches.length === 1) {
        return nameMatches[0];
    }

    return "";
}

function resolveSequencePersistencePayload(sequenceId, sequenceName, sequenceKey) {
    var storeInfo = getTranscriptStoreInfo();
    if (!storeInfo.ok) {
        return storeInfo;
    }

    var sequenceInfo = buildSequenceIdentity(sequenceId, sequenceName, sequenceKey);
    var manifest = loadTranscriptManifest(storeInfo);
    var manifestChanged = false;
    var resolvedKey = resolveSequenceEntryKey(manifest, sequenceInfo);

    if (!resolvedKey && recoverManifestEntryFromStoredFiles(storeInfo, manifest, sequenceInfo)) {
        manifestChanged = true;
        resolvedKey = resolveSequenceEntryKey(manifest, sequenceInfo);
    }

    if (!resolvedKey && registerLegacyTranscriptIfPresent(storeInfo, manifest, sequenceInfo)) {
        manifestChanged = true;
        resolvedKey = resolveSequenceEntryKey(manifest, sequenceInfo);
    }

    var resolvedSequenceInfo = buildSequenceIdentity(sequenceId, sequenceName, resolvedKey || sequenceInfo.sequenceKey);
    var entry = resolvedKey ? ensureSequenceManifestEntry(manifest, resolvedSequenceInfo) : null;
    var latestRecord = entry ? findLatestValidRecord(entry, resolvedSequenceInfo) : { found: false };

    if (entry) {
        var previousLatestRecordId = entry.latestValidRecordId || "";
        entry.latestValidRecordId = latestRecord.found ? latestRecord.record.recordId : "";
        manifest.sequences[resolvedSequenceInfo.sequenceKey] = entry;
        if (entry.latestValidRecordId !== previousLatestRecordId) {
            manifestChanged = true;
        }
    }

    if (manifestChanged) {
        saveTranscriptManifest(storeInfo, manifest);
    }

    var stylePath = buildTranscriptPaths(storeInfo, resolvedSequenceInfo, "latest").captionStylePath;
    var captionStyle = parseJsonText(readTextFile(stylePath)) || null;

    if (!latestRecord.found) {
        return {
            ok: true,
            foundTranscript: false,
            transcriptionState: {
                status: "idle",
                statusLabel: "Idle",
                sequenceId: sequenceInfo.sequenceId,
                sequenceName: sequenceInfo.sequenceName,
                sequenceKey: sequenceInfo.sequenceKey,
                resultJsonPath: "",
                resultSrtPath: "",
                activeTranscriptRecordId: "",
                manifestPath: storeInfo.manifestPath,
                storageRootPath: storeInfo.rootPath,
                error: "",
                summary: "",
                persistenceStatus: ""
            },
            captionStyle: captionStyle
        };
    }

    return {
        ok: true,
        foundTranscript: true,
        transcriptionState: buildCompletedTranscriptionState(latestRecord.record, resolvedSequenceInfo, storeInfo),
        captionStyle: captionStyle
    };
}

function getSequenceById(sequenceId) {
    try {
        var project = app.project;
        if (!project || !project.sequences) {
            return null;
        }

        for (var i = 0; i < project.sequences.numSequences; i++) {
            var sequence = project.sequences[i];
            if (sequence && sequence.sequenceID === sequenceId) {
                return sequence;
            }
        }
    } catch (e) {}

    return null;
}

function getActiveSequenceInfo() {
    try {
        var project = app.project;
        if (!project || !project.activeSequence) {
            return '{"ok":true,"hasSequence":false,"sequenceId":"","sequenceName":"","sequenceKey":""}';
        }

        var sequence = project.activeSequence;
        var sequenceInfo = buildSequenceIdentity(sequence.sequenceID || "", sequence.name || "", "");
        return stringifyJsonText({
            ok: true,
            hasSequence: true,
            sequenceId: sequenceInfo.sequenceId,
            sequenceName: sequenceInfo.sequenceName,
            sequenceKey: sequenceInfo.sequenceKey
        });
    } catch (e) {
        return stringifyJsonText({
            ok: false,
            error: e.toString(),
            hasSequence: false,
            sequenceId: "",
            sequenceName: "",
            sequenceKey: ""
        });
    }
}

function findWavExportPreset(sequence) {
    var bundledPreset = new File(getInstallRootPath() + "\\presets\\wav-transcribe.epr");
    if (bundledPreset.exists) {
        try {
            var bundledExt = String(sequence.getExportFileExtension(bundledPreset.fsName) || "").toLowerCase();
            if (bundledExt === "wav") {
                return bundledPreset.fsName;
            }
        } catch (e) {}
    }

    var docRoot = new Folder(Folder.myDocuments.fsName + "\\Adobe\\Adobe Media Encoder");
    if (!docRoot.exists) {
        return "";
    }

    var versionFolders = docRoot.getFiles(function(item) {
        return item instanceof Folder;
    });

    for (var i = versionFolders.length - 1; i >= 0; i--) {
        var presetsFolder = new Folder(versionFolders[i].fsName + "\\Presets");
        if (!presetsFolder.exists) {
            continue;
        }

        var presetFiles = presetsFolder.getFiles("*.epr");
        for (var j = 0; j < presetFiles.length; j++) {
            var presetFile = presetFiles[j];
            try {
                var ext = String(sequence.getExportFileExtension(presetFile.fsName) || "").toLowerCase();
                if (ext === "wav") {
                    return presetFile.fsName;
                }
            } catch (e) {}
        }
    }

    return "";
}

function normalizeRequestedLanguages(values) {
    var normalized = [];
    var seen = {};
    var languageMap = {
        sl: "sl",
        hr: "hr",
        sr: "sr",
        bos: "hr",
        slo: "sl",
        cro: "hr",
        srb: "sr"
    };

    for (var i = 0; i < values.length; i++) {
        var key = String(values[i] || "").toLowerCase();
        var mapped = languageMap[key];
        if (!mapped || seen[mapped]) {
            continue;
        }
        seen[mapped] = true;
        normalized.push(mapped);
    }

    if (!normalized.length) {
        normalized.push("sl");
    }

    return normalized;
}

function normalizeWindowsPath(value) {
    var path = String(value || "");

    if (path.indexOf("file:///") === 0) {
        path = path.substring(8);
    } else if (path.indexOf("file://") === 0) {
        path = path.substring(7);
    }

    path = path.replace(/\//g, "\\");

    try {
        path = decodeURIComponent(path);
    } catch (e) {}

    return path;
}

function buildTranscriptionSummary(resultData) {
    var language = resultData && resultData.language ? resultData.language : "unknown";
    var segments = resultData && resultData.segments ? resultData.segments.length : 0;
    return "Language: " + language + " | Segments: " + segments;
}

function startTranscriptionJob(optionsJson) {
    try {
        var project = app.project;
        if (!project || !project.activeSequence) {
            return '{"ok":false,"error":"No active sequence"}';
        }

        var sequence = project.activeSequence;
        var sequenceInfo = buildSequenceIdentity(sequence.sequenceID || "", sequence.name || "", "");
        var options = parseJsonText(optionsJson) || {};
        var sourceMode = options.source === "inout" ? "inout" : "entire";
        var processingDevice = options.processingDevice === "gpu" ? "gpu" : "cpu";
        var normalizedLanguages = normalizeRequestedLanguages(options.languages || []);
        var extensionPath = normalizeWindowsPath(options.extensionPath || "");
        var whisprRoot = getWhisprRootPath();
        var pythonPath = whisprRoot + "\\.venv\\Scripts\\python.exe";
        var mainScriptPath = whisprRoot + "\\main.py";
        var bridgeScriptPath = extensionPath + "\\server\\transcribe_job.py";
        var presetPath = findWavExportPreset(sequence);

        if (!extensionPath) {
            return '{"ok":false,"error":"Missing extension path"}';
        }

        if (!(new File(pythonPath)).exists) {
            return '{"ok":false,"error":"WHISPR python not found"}';
        }

        if (!(new File(mainScriptPath)).exists) {
            return '{"ok":false,"error":"WHISPR main.py not found"}';
        }

        if (!(new File(bridgeScriptPath)).exists) {
            return '{"ok":false,"error":"Bridge script not found"}';
        }

        if (!presetPath) {
            return '{"ok":false,"error":"No WAV export preset found in Adobe Media Encoder presets"}';
        }

        if (sourceMode === "inout") {
            var inPoint = Number(sequence.getInPoint());
            var outPoint = Number(sequence.getOutPoint());
            if (!(outPoint > inPoint)) {
                return '{"ok":false,"error":"Set a valid sequence In-Out range first"}';
            }
        }

        var jobsRoot = whisprRoot + "\\jobs";
        var jobId = "job_" + new Date().getTime();
        var jobDir = jobsRoot + "\\" + jobId;
        var outputDir = jobDir + "\\output";
        var audioPath = jobDir + "\\sequence_audio.wav";
        var statePath = jobDir + "\\job-state.json";
        var stdoutPath = jobDir + "\\worker-stdout.log";
        var stderrPath = jobDir + "\\worker-stderr.log";
        var launchCmdPath = jobDir + "\\launch_worker.cmd";
        createFolderIfMissing(jobsRoot);
        createFolderIfMissing(jobDir);
        createFolderIfMissing(outputDir);

        var exportOk = sequence.exportAsMediaDirect(audioPath, presetPath, sourceMode === "inout" ? 1 : 0);
        if (!exportOk || !(new File(audioPath)).exists) {
            return '{"ok":false,"error":"Audio export failed"}';
        }

        var initialState = {
            jobId: jobId,
            status: "launching",
            statusLabel: "Transcribing",
            source: sourceMode,
            processingDevice: processingDevice,
            sequenceName: sequence.name,
            sequenceId: sequence.sequenceID,
            requestedLanguages: options.uiLanguages || [],
            normalizedLanguages: normalizedLanguages,
            audioPath: audioPath,
            outputDir: outputDir,
            resultJsonPath: "",
            resultSrtPath: "",
            error: "",
            summary: "",
            updatedAt: new Date().toUTCString()
        };

        writeJsonFile(statePath, initialState);
        writeWindowsCmdFile(launchCmdPath, [
            "@echo off",
            "chcp 65001>nul",
            shellQuoteWindowsPath(pythonPath) +
                " " + shellQuoteWindowsPath(bridgeScriptPath) +
                " --state-path " + shellQuoteWindowsPath(statePath) +
                " --input-path " + shellQuoteWindowsPath(audioPath) +
                " --output-dir " + shellQuoteWindowsPath(outputDir) +
                " --whispr-root " + shellQuoteWindowsPath(whisprRoot) +
                " --main-script " + shellQuoteWindowsPath(mainScriptPath) +
                " --languages " + shellQuoteWindowsPath(normalizedLanguages.join(",")) +
                " --processing-device " + shellQuoteWindowsPath(processingDevice) +
                " 1>" + shellQuoteWindowsPath(stdoutPath) +
                " 2>" + shellQuoteWindowsPath(stderrPath)
        ]);

        return stringifyJsonText({
            ok: true,
            jobId: jobId,
            status: "transcribing",
            statusLabel: "Transcribing",
            statePath: statePath,
            sequenceName: sequence.name,
            sequenceId: sequence.sequenceID,
            sequenceKey: sequenceInfo.sequenceKey,
            source: sourceMode,
            processingDevice: processingDevice,
            requestedLanguages: options.uiLanguages || [],
            normalizedLanguages: normalizedLanguages,
            audioPath: audioPath,
            outputDir: outputDir,
            launchCmdPath: launchCmdPath,
            workerStdoutPath: stdoutPath,
            workerStderrPath: stderrPath
        });
    } catch (e) {
        return stringifyJsonText({
            ok: false,
            error: e.toString()
        });
    }
}

function getTranscriptionJobSnapshot(statePath) {
    try {
        var text = readTextFile(statePath);
        if (!text) {
            return '{"ok":false,"error":"State file missing"}';
        }

        var data = parseJsonText(text);
        if (!data) {
            return '{"ok":false,"error":"State file parse failed"}';
        }

        return stringifyJsonText({
            ok: true,
            state: data
        });
    } catch (e) {
        return stringifyJsonText({
            ok: false,
            error: e.toString()
        });
    }
}

function saveSequenceCaptionStyle(stateJson) {
    try {
        var payload = parseJsonText(stateJson);
        if (!payload || !payload.sequenceId || !payload.sequenceKey) {
            return stringifyJsonText({
                ok: false,
                error: "Missing caption style payload"
            });
        }

        var storeInfo = getTranscriptStoreInfo();
        if (!storeInfo.ok) {
            return stringifyJsonText(storeInfo);
        }

        var sequenceInfo = buildSequenceIdentity(payload.sequenceId, payload.sequenceName, payload.sequenceKey);
        var stylePath = buildTranscriptPaths(storeInfo, sequenceInfo, "latest").captionStylePath;
        if (!atomicWriteJsonFile(stylePath, payload.captionStyle || {})) {
            return stringifyJsonText({
                ok: false,
                error: "Failed to save caption style"
            });
        }

        return stringifyJsonText({
            ok: true,
            stylePath: stylePath
        });
    } catch (e) {
        return stringifyJsonText({
            ok: false,
            error: e.toString()
        });
    }
}

function loadSequencePersistence(sequenceId, sequenceName, sequenceKey) {
    try {
        return stringifyJsonText(resolveSequencePersistencePayload(sequenceId, sequenceName, sequenceKey));
    } catch (e) {
        return stringifyJsonText({
            ok: false,
            error: e.toString()
        });
    }
}

function registerCompletedTranscription(payloadJson) {
    try {
        var payload = parseJsonText(payloadJson);
        if (!payload || !payload.statePath) {
            return stringifyJsonText({
                ok: false,
                error: "Missing completed transcription payload"
            });
        }

        var state = parseJsonText(readTextFile(payload.statePath));
        if (!state || state.status !== "completed" || !state.resultJsonPath) {
            return stringifyJsonText({
                ok: false,
                error: "Completed transcription state is missing or invalid"
            });
        }

        var storeInfo = getTranscriptStoreInfo();
        if (!storeInfo.ok) {
            return stringifyJsonText(storeInfo);
        }

        var sequenceInfo = buildSequenceIdentity(
            payload.sequenceId || state.sequenceId || "",
            payload.sequenceName || state.sequenceName || "",
            payload.sequenceKey || state.sequenceKey || ""
        );
        var validation = readValidatedTranscriptJson(state.resultJsonPath, null);
        if (!validation.ok) {
            return stringifyJsonText({
                ok: false,
                error: validation.error
            });
        }

        var manifest = loadTranscriptManifest(storeInfo);
        var entry = ensureSequenceManifestEntry(manifest, sequenceInfo);
        var createdAt = buildIsoTimestampText(state.finishedAt || state.updatedAt || buildIsoTimestampText());
        var recordId = buildTimestampToken(createdAt);
        var transcriptPaths = buildTranscriptPaths(storeInfo, sequenceInfo, recordId);
        var storedPayload = cloneJsonCompatible(validation.data) || {};
        var transcriptSrtPath = "";

        storedPayload._aktualTranscript = {
            schemaVersion: 1,
            recordId: recordId,
            createdAt: createdAt,
            sequenceId: sequenceInfo.sequenceId,
            sequenceName: sequenceInfo.sequenceName,
            sequenceKey: sequenceInfo.sequenceKey,
            sequenceNameSlug: sequenceInfo.sequenceNameSlug,
            source: state.source || "entire",
            processingDevice: state.processingDevice || "cpu",
            transcriptSrtPath: "",
            jobStatePath: payload.statePath
        };

        if (!atomicWriteJsonFile(transcriptPaths.transcriptJsonPath, storedPayload)) {
            return stringifyJsonText({
                ok: false,
                error: "Failed to store transcript JSON atomically"
            });
        }

        if (state.resultSrtPath && (new File(state.resultSrtPath)).exists) {
            if (copyFileIfExists(state.resultSrtPath, transcriptPaths.transcriptSrtPath)) {
                transcriptSrtPath = transcriptPaths.transcriptSrtPath;
            }
        }

        storedPayload._aktualTranscript.transcriptSrtPath = transcriptSrtPath;
        atomicWriteJsonFile(transcriptPaths.transcriptJsonPath, storedPayload);

        var record = normalizeTranscriptRecord({
            recordId: recordId,
            createdAt: createdAt,
            status: "valid",
            transcriptJsonPath: transcriptPaths.transcriptJsonPath,
            transcriptSrtPath: transcriptSrtPath,
            sequenceId: sequenceInfo.sequenceId,
            sequenceName: sequenceInfo.sequenceName,
            sequenceKey: sequenceInfo.sequenceKey,
            sequenceNameSlug: sequenceInfo.sequenceNameSlug,
            source: state.source || "entire",
            processingDevice: state.processingDevice || "cpu",
            summary: state.summary || buildTranscriptionSummary(validation.data),
            language: validation.data.language || "",
            durationSeconds: Number(validation.data.duration_seconds) || 0,
            segmentCount: validation.data.segments.length,
            jobStatePath: payload.statePath
        });

        var replaced = false;
        for (var i = 0; i < entry.records.length; i++) {
            if (entry.records[i].recordId === record.recordId) {
                entry.records[i] = record;
                replaced = true;
                break;
            }
        }
        if (!replaced) {
            entry.records.push(record);
        }
        entry.latestValidRecordId = record.recordId;
        manifest.sequences[sequenceInfo.sequenceKey] = entry;

        if (!saveTranscriptManifest(storeInfo, manifest)) {
            return stringifyJsonText({
                ok: false,
                error: "Failed to update transcript manifest"
            });
        }

        return stringifyJsonText({
            ok: true,
            transcriptionState: buildCompletedTranscriptionState(record, sequenceInfo, storeInfo)
        });
    } catch (e) {
        return stringifyJsonText({
            ok: false,
            error: e.toString()
        });
    }
}

function zeroPadGlobal(value, size) {
    var text = String(value);
    while (text.length < size) {
        text = "0" + text;
    }
    return text;
}

function formatSrtTimestamp(totalSeconds) {
    var milliseconds = Math.round(Number(totalSeconds) * 1000);
    if (milliseconds < 0) {
        milliseconds = 0;
    }

    var hours = Math.floor(milliseconds / 3600000);
    milliseconds -= hours * 3600000;
    var minutes = Math.floor(milliseconds / 60000);
    milliseconds -= minutes * 60000;
    var seconds = Math.floor(milliseconds / 1000);
    milliseconds -= seconds * 1000;

    return zeroPadGlobal(hours, 2) + ":" +
        zeroPadGlobal(minutes, 2) + ":" +
        zeroPadGlobal(seconds, 2) + "," +
        zeroPadGlobal(milliseconds, 3);
}

function splitTextIntoWords(text) {
    var cleanText = trimText(text || "");
    return cleanText ? cleanText.split(/\s+/) : [];
}

function normalizeCaptionWordEntries(words) {
    var normalized = [];

    for (var i = 0; i < (words || []).length; i++) {
        var item = words[i] || {};
        var wordText = trimText(item.word || item.text || "");
        var start = Number(item.start);
        var end = Number(item.end);

        if (!wordText) {
            continue;
        }

        if (!(end >= start) || isNaN(start) || isNaN(end)) {
            return null;
        }

        normalized.push({
            word: wordText,
            start: start,
            end: end
        });
    }

    return normalized;
}

function getDefaultCaptionStylePayload() {
    return {
        layout: {
            wordsPerLine: 4,
            maxLinesPerCaption: 2,
            maxCharsPerLine: 32
        }
    };
}

function normalizeCaptionStyle(styleInput) {
    var defaults = getDefaultCaptionStylePayload();
    var style = styleInput || {};

    function toNumber(value, fallback) {
        var parsed = Number(value);
        return isNaN(parsed) ? fallback : parsed;
    }

    function colorOrDefault(value, fallback) {
        var color = String(value || fallback).toUpperCase();
        return /^#[0-9A-F]{6}$/.test(color) ? color : fallback;
    }

    return {
        layout: {
            wordsPerLine: clampNumber(toNumber(style.layout && style.layout.wordsPerLine, defaults.layout.wordsPerLine), 1, 12),
            maxLinesPerCaption: clampNumber(toNumber(style.layout && style.layout.maxLinesPerCaption, defaults.layout.maxLinesPerCaption), 1, 2),
            maxCharsPerLine: clampNumber(toNumber(style.layout && style.layout.maxCharsPerLine, defaults.layout.maxCharsPerLine), 8, 80)
        }
    };
}

function transformCaptionWordForStyle(wordText, style) {
    return String(wordText || "");
}

function hasStrongBreakPunctuation(word) {
    return /[.!?…:;,-]$/.test(word || "");
}

function hasSoftBreakPunctuation(word) {
    return /[,;:-]$/.test(word || "");
}

function clampNumber(value, minValue, maxValue) {
    if (value < minValue) {
        return minValue;
    }
    if (value > maxValue) {
        return maxValue;
    }
    return value;
}

function findPreferredBreakIndex(words, startIndex, maxWords) {
    var endExclusive = Math.min(startIndex + maxWords, words.length);
    var idealIndex = endExclusive;
    var searchStart = Math.max(startIndex + 1, endExclusive - Math.max(2, Math.floor(maxWords / 2)));
    var bestSoft = -1;

    for (var index = endExclusive; index > searchStart; index--) {
        var word = words[index - 1];
        if (hasStrongBreakPunctuation(word)) {
            return index;
        }
        if (bestSoft === -1 && hasSoftBreakPunctuation(word)) {
            bestSoft = index;
        }
    }

    if (bestSoft !== -1) {
        return bestSoft;
    }

    return idealIndex;
}

function buildCaptionLinesFromWords(words, style) {
    var lines = [];
    var index = 0;
    var wordsPerLine = style.layout.wordsPerLine;
    var maxCharsPerLine = style.layout.maxCharsPerLine;

    while (index < words.length) {
        var candidateEnd = index;
        var currentLength = 0;

        while (candidateEnd < words.length) {
            var nextWord = transformCaptionWordForStyle(words[candidateEnd].word || words[candidateEnd], style);
            var nextLength = currentLength === 0 ? nextWord.length : currentLength + 1 + nextWord.length;
            var nextCount = candidateEnd - index + 1;

            if (nextCount > wordsPerLine) {
                break;
            }

            if (maxCharsPerLine > 0 && nextCount > 1 && nextLength > maxCharsPerLine) {
                break;
            }

            currentLength = nextLength;
            candidateEnd++;
        }

        if (candidateEnd === index) {
            candidateEnd = Math.min(index + 1, words.length);
        }

        var nextIndex = findPreferredBreakIndex(words, index, candidateEnd - index);
        if (nextIndex > candidateEnd || nextIndex <= index) {
            nextIndex = candidateEnd;
        }
        var lineWords = [];
        for (var i = index; i < nextIndex; i++) {
            lineWords.push(transformCaptionWordForStyle(words[i].word || words[i], style));
        }
        lines.push(lineWords.join(" "));
        index = nextIndex;
    }

    return lines;
}

function buildCaptionBlocksFromSegment(segment, style) {
    var words = normalizeCaptionWordEntries(segment && segment.words);
    var blocks = [];
    var index = 0;
    var maxLinesPerBlock = style.layout.maxLinesPerCaption;

    if (!words || !words.length) {
        return blocks;
    }

    while (index < words.length) {
        var blockStartIndex = index;
        var blockLines = [];
        var lineCounter = 0;

        while (index < words.length && lineCounter < maxLinesPerBlock) {
            var remainingWords = words.slice(index);
            var lineWords = buildCaptionLinesFromWords(remainingWords, style);
            if (!lineWords.length) {
                break;
            }

            var consumedWordCount = splitTextIntoWords(lineWords[0]).length;
            if (!consumedWordCount) {
                break;
            }

            blockLines.push(lineWords[0]);
            index += consumedWordCount;
            lineCounter++;
        }

        var blockWords = words.slice(blockStartIndex, index);
        if (!blockWords.length) {
            break;
        }

        blocks.push({
            start: blockWords[0].start,
            end: blockWords[blockWords.length - 1].end,
            text: blockLines.join("\r\n")
        });
    }

    return blocks;
}

function buildCaptionBlocksFromSegments(segments, style) {
    var blocks = [];

    for (var i = 0; i < segments.length; i++) {
        var segmentBlocks = buildCaptionBlocksFromSegment(segments[i], style);
        for (var j = 0; j < segmentBlocks.length; j++) {
            blocks.push(segmentBlocks[j]);
        }
    }

    return blocks;
}

function buildSrtFromSegments(segments, style) {
    var blocks = [];
    var captionIndex = 1;
    var captionBlocks = buildCaptionBlocksFromSegments(segments, style);

    for (var i = 0; i < captionBlocks.length; i++) {
        var block = captionBlocks[i];
        if (!trimText(block.text)) {
            continue;
        }

        blocks.push(
            String(captionIndex) + "\r\n" +
            formatSrtTimestamp(block.start || 0) + " --> " + formatSrtTimestamp(block.end || 0) + "\r\n" +
            block.text + "\r\n"
        );
        captionIndex++;
    }

    return blocks.join("\r\n");
}

function findProjectItemByMediaPath(mediaPath) {
    try {
        var matches = app.project.rootItem.findItemsMatchingMediaPath(mediaPath, 1);
        if (matches && matches.length && matches[0]) {
            return matches[0];
        }
    } catch (e) {}

    return null;
}

function buildCaptionImportPath(baseCaptionsPath) {
    var file = new File(baseCaptionsPath);
    var parentPath = file.parent ? file.parent.fsName : "";
    var stem = file.displayName ? String(file.displayName).replace(/\.srt$/i, "") : "captions";
    return parentPath + "\\" + stem + "_import_" + new Date().getTime() + ".srt";
}

function createCaptionsFromTranscription(stateJson, styleJson) {
    try {
        var state = parseJsonText(stateJson);
        if (!state) {
            return "ERROR: No finished transcription available";
        }

        var resultJsonPath = state.resultJsonPath || "";
        if (!resultJsonPath || !readTextFile(resultJsonPath)) {
            var resolvedPersistence = resolveSequencePersistencePayload(
                state.sequenceId || "",
                state.sequenceName || "",
                state.sequenceKey || ""
            );
            if (resolvedPersistence.ok && resolvedPersistence.foundTranscript && resolvedPersistence.transcriptionState) {
                resultJsonPath = resolvedPersistence.transcriptionState.resultJsonPath || "";
                if (!state.sequenceKey) {
                    state.sequenceKey = resolvedPersistence.transcriptionState.sequenceKey || "";
                }
            }
        }

        if (!resultJsonPath) {
            return "ERROR: No finished transcription available";
        }

        var resultText = readTextFile(resultJsonPath);
        if (!resultText) {
            return "ERROR: Transcription JSON missing";
        }

        var resultData = parseJsonText(resultText);
        if (!resultData || !resultData.segments || !resultData.segments.length) {
            return "ERROR: No transcription segments found";
        }

        var hasWordTimestamps = false;
        for (var segmentIndex = 0; segmentIndex < resultData.segments.length; segmentIndex++) {
            var segmentWords = normalizeCaptionWordEntries(resultData.segments[segmentIndex].words);
            if (segmentWords && segmentWords.length) {
                hasWordTimestamps = true;
                break;
            }
        }

        if (!hasWordTimestamps) {
            return "ERROR: Transcription JSON does not contain word-level timestamps";
        }

        var activeSequence = app.project && app.project.activeSequence ? app.project.activeSequence : null;
        if (!activeSequence) {
            return "ERROR: No active sequence";
        }

        if (state.sequenceId && activeSequence.sequenceID !== state.sequenceId) {
            if (!state.sequenceName || String(activeSequence.name || "") !== String(state.sequenceName || "")) {
                return "ERROR: Active sequence does not match the finished transcription";
            }
        }

        var normalizedStyle = normalizeCaptionStyle(parseJsonText(styleJson) || styleJson || {});
        var normalizedWordsPerLine = normalizedStyle.layout.wordsPerLine;
        var storeInfo = getTranscriptStoreInfo();
        var sequenceInfo = buildSequenceIdentity(
            state.sequenceId || activeSequence.sequenceID || "",
            state.sequenceName || activeSequence.name || "",
            state.sequenceKey || ""
        );
        var captionsPath = "";
        var stylePath = "";
        var srtText = buildSrtFromSegments(resultData.segments, normalizedStyle);

        if (storeInfo.ok) {
            var captionBasePath = buildTranscriptPaths(storeInfo, sequenceInfo, "latest");
            captionsPath = captionBasePath.captionsBasePath + "__" + normalizedWordsPerLine + "wpl_" + normalizedStyle.layout.maxLinesPerCaption + "lines.srt";
            stylePath = captionBasePath.captionStylePath;
        } else {
            var stateFile = new File(state.statePath);
            captionsPath = stateFile.parent.fsName + "\\captions_" + normalizedWordsPerLine + "wpl.srt";
            stylePath = stateFile.parent.fsName + "\\captions_style.json";
        }

        if (!srtText) {
            return "ERROR: Failed to build SRT text";
        }

        writeTextFile(captionsPath, srtText);
        writeTextFile(stylePath, stringifyJsonText({
            style: normalizedStyle,
            appliedNow: [
                "layout.wordsPerLine",
                "layout.maxLinesPerCaption",
                "layout.maxCharsPerLine"
            ],
            storedForLater: []
        }));

        var captionItem = findProjectItemByMediaPath(captionsPath);
        if (captionItem) {
            try {
                captionItem.refreshMedia();
            } catch (refreshError) {}
        }

        var importPath = captionsPath;
        if (!captionItem) {
            importPath = buildCaptionImportPath(captionsPath);
            writeTextFile(importPath, srtText);
        }

        var imported = app.project.importFiles([importPath], true, app.project.rootItem, false);
        if (!imported) {
            return "ERROR: Failed to import SRT into project";
        }

        if (!captionItem || importPath !== captionsPath) {
            captionItem = findProjectItemByMediaPath(importPath);
        }

        if (!captionItem) {
            return "ERROR: Imported SRT could not be resolved in project";
        }

        var created = false;
        try {
            created = activeSequence.createCaptionTrack(captionItem, 0, Sequence.CAPTION_FORMAT_SUBTITLE);
        } catch (e) {
            created = activeSequence.createCaptionTrack(captionItem, 0);
        }

        if (!created) {
            return "ERROR: Failed to create caption track";
        }

        return "Captions created" +
            "\nWords per line: " + normalizedWordsPerLine +
            "\nMax lines: " + normalizedStyle.layout.maxLinesPerCaption +
            "\nSRT: " + captionsPath +
            "\nImport source: " + importPath +
            "\nStyle JSON: " + stylePath +
            "\nApplied now: layout only";
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}
