function createBacksellSequences() {
    try {

        if (!app || !app.project) {
            return "❌ No project";
        }

        var project = app.project;
        var projectName = project.name.replace(".prproj", "");

        // =============================
        // FIND BASE SEQUENCE
        // =============================
        var baseSeq = null;

        for (var i = 0; i < project.sequences.numSequences; i++) {
            if (project.sequences[i].name === "TV IN FB sekvenca") {
                baseSeq = project.sequences[i];
                break;
            }
        }

        if (!baseSeq) {
            return "❌ Base sequence not found";
        }

        // =============================
        // BIN
        // =============================
        var root = project.rootItem;
        var sekvenceBin = null;

        for (var i = 0; i < root.children.numItems; i++) {
            if (root.children[i].name === "SEKVENCE") {
                sekvenceBin = root.children[i];
                break;
            }
        }

        if (!sekvenceBin) {
            sekvenceBin = root.createBin("SEKVENCE");
        }

        // =============================
        // FIND LAST COPY
        // =============================
        function findLastCopy() {
            for (var i = project.sequences.numSequences - 1; i >= 0; i--) {
                var seq = project.sequences[i];
                if (seq.name.indexOf("Copy") !== -1) {
                    return seq;
                }
            }
            return null;
        }

        // =============================
        // DUPLICATE + RENAME
        // =============================
        function duplicateAndRename(baseSeq, newName) {

            baseSeq.clone();

            var seq = findLastCopy();
            if (!seq) return null;

            for (var i = 0; i < 5; i++) {
                try {
                    seq.projectItem.name = newName;
                } catch (e) {}
            }

            try {
                seq.projectItem.moveBin(sekvenceBin);
            } catch (e) {}

            return seq;
        }

        // =============================
        // ENABLE ALL CLIPS (REAL FIX)
        // =============================
        function enableAllClips(sequence) {
            try {
                var tracks = sequence.videoTracks;

                for (var t = 0; t < tracks.numTracks; t++) {
                    var track = tracks[t];

                    for (var c = 0; c < track.clips.numItems; c++) {
                        track.clips[c].setEnabled(true);
                    }
                }
            } catch (e) {}
        }

        // =============================
        // DELETE WATERMARK
        // =============================
        function deleteWatermark(sequence) {
            try {
                var tracks = sequence.videoTracks;

                for (var t = 0; t < tracks.numTracks; t++) {
                    var track = tracks[t];

                    for (var c = track.clips.numItems - 1; c >= 0; c--) {
                        var clip = track.clips[c];

                        if (clip.name.toLowerCase().indexOf("watermark") !== -1) {
                            clip.remove(0, 0);
                        }
                    }
                }
            } catch (e) {}
        }

        // =============================
        // ENABLE WATERMARK (FB)
        // =============================
        function enableWatermark(sequence) {
            try {
                var tracks = sequence.videoTracks;

                for (var t = 0; t < tracks.numTracks; t++) {
                    var track = tracks[t];

                    for (var c = 0; c < track.clips.numItems; c++) {
                        var clip = track.clips[c];

                        if (clip.name.toLowerCase().indexOf("watermark") !== -1) {
                            clip.setEnabled(true);
                        }
                    }
                }
            } catch (e) {}
        }

        // =============================
        // TV → DELETE watermark
        // =============================
        var tvSeq = duplicateAndRename(baseSeq, "TV " + projectName);
        if (!tvSeq) return "❌ TV failed";

        enableAllClips(tvSeq);
        deleteWatermark(tvSeq);

        // =============================
        // FB → KEEP + FORCE ENABLE
        // =============================
        var fbSeq = duplicateAndRename(baseSeq, "FB " + projectName);
        if (!fbSeq) return "❌ FB failed";

        enableAllClips(fbSeq);
        enableWatermark(fbSeq);

        // =============================
        // STORY → DELETE watermark
        // =============================
        var storySeq = duplicateAndRename(baseSeq, "STORY " + projectName);
        if (!storySeq) return "❌ STORY failed";

        enableAllClips(storySeq);
        deleteWatermark(storySeq);

        // resize (best effort)
        try {
            var settings = storySeq.getSettings();
            settings.videoFrameWidth = 608;
            settings.videoFrameHeight = 1080;
            storySeq.setSettings(settings);
        } catch (e) {}

        return "✅ DONE:\nTV delete\nFB enabled\nSTORY delete";

    } catch (e) {
        return "❌ ERROR: " + e.toString();
    }
}

function renameSelectedSequence(prefix) {
    try {

        var project = app.project;
        if (!project) return "❌ No project";

        var seq = project.activeSequence;
        if (!seq) return "❌ No active sequence";

        // project name clean
        var projectName = project.name.replace(".prproj", "");

        var newName = prefix + " " + projectName;

        // 🔥 rename hack (da vedno prime)
        for (var i = 0; i < 5; i++) {
            try {
                seq.projectItem.name = newName;
            } catch (e) {}
        }

        return "✅ Renamed to:\n" + newName;

    } catch (e) {
        return "❌ ERROR: " + e.toString();
    }
}

function organizeProject() {
    try {

        var project = app.project;
        if (!project) return "❌ No project";

        var root = project.rootItem;

        // =============================
        // CONFIG
        // =============================
        var STRUCTURE = {
            "SEKVENCE": {
                ".old": [],
                ".precomps": []
            },
            "ASSETS": ["jpg", "png", "tiff", "ai", "gif", "psd"],
            "AUDIO": ["mp3", "wav", "aac"],
            "FOOTAGE": ["mp4", "mov", "mxf", "avi"]
        };

        // =============================
        // CREATE BIN
        // =============================
        function getOrCreateBin(parent, name) {
            for (var i = 0; i < parent.children.numItems; i++) {
                if (parent.children[i].name === name) {
                    return parent.children[i];
                }
            }
            return parent.createBin(name);
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

        // =============================
        // EXTENSION
        // =============================
        function getExtension(name) {
            var parts = name.split(".");
            return parts.length > 1 ? parts.pop().toLowerCase() : "";
        }

        // =============================
        // PROCESS ITEM
        // =============================
        function processItem(item) {

            if (item.type === ProjectItemType.BIN) return;

            // 🔥 FIX 1: sequence detection
            if (item.isSequence && item.isSequence()) {
                item.moveBin(bins["SEKVENCE"]);
                return;
            }

            var name = item.name;
            var ext = getExtension(name);

            // 🔥 FIX 2: no extension (Color Matte, adjustment layer, etc.)
            if (!ext) {
                item.moveBin(bins["ASSETS"]);
                return;
            }

            // NORMAL SORT
            for (var key in STRUCTURE) {

                var rule = STRUCTURE[key];

                if (rule instanceof Array) {
                    for (var i = 0; i < rule.length; i++) {
                        if (ext === rule[i]) {
                            item.moveBin(bins[key]);
                            return;
                        }
                    }
                }
            }
        }

        // =============================
        // LOOP ROOT
        // =============================
        for (var i = root.children.numItems - 1; i >= 0; i--) {
            processItem(root.children[i]);
        }

        return "✅ Project organized";

    } catch (e) {
        return "❌ ERROR: " + e.toString();
    }
}

