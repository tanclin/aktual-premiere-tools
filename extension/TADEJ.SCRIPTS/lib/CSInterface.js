(function () {
    'use strict';

    function CSInterface() {}

    CSInterface.prototype.evalScript = function (script, callback) {
        if (callback) {
            window.__adobe_cep__.evalScript(script, callback);
        } else {
            window.__adobe_cep__.evalScript(script);
        }
    };

    CSInterface.prototype.getSystemPath = function (pathType) {
        return window.__adobe_cep__.getSystemPath(pathType);
    };

    window.CSInterface = CSInterface;

    window.SystemPath = {
        USER_DATA: "userData",
        COMMON_FILES: "commonFiles",
        EXTENSION: "extension"
    };

})();