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
