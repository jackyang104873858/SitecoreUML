define(function(require, exports, module) {
    "use strict";    

    // eager-load the required modules
    var PreferenceManager = app.getModule("core/PreferenceManager");
    var AppInit = app.getModule("utils/AppInit");

    // set the ID of the Sitecore preferences tab
    var preferenceId = "sitecore";

    // set the IDs of each of the preferences
    var sitecoreUrlId = "sitecore.url";
    var sitecoreDeployRouteId = "sitecore.deployroute";
    var sitecoreImportRouteId = "sitecore.importroute";

    // configure the preferences
    var sitecorePreferences = {
        "sitecore.url": {
            text: "Sitecore URL",
            description: "URL of the Sitecore instance that you want to connect to",
            type: "String",
            default: "http://localhost"
        },
        "sitecore.deployroute": {
            text: "Deploy Route",
            description: "Route to POST to when deploying data to Sitecore",
            type: "String",
            default: "/sitecoreuml/templates/deploy"
        },
        "sitecore.importroute": {
            text: "Import Route",
            description: "Route to GET when importing data from Sitecore",
            type: "String",
            default: "/sitecoreuml/templates/export"
        }
    };

    // register the preferences tab to add it to the UI
    AppInit.htmlReady(function () {
        PreferenceManager.register(preferenceId, "Sitecore", sitecorePreferences);
    });

    exports.sitecorePreferenceId = preferenceId;
    exports.sitecoreUrlId = sitecoreUrlId;
    exports.sitecoreDeployRouteId = sitecoreDeployRouteId;
    exports.sitecoreImportRouteId = sitecoreImportRouteId;
    exports.getSitecoreUrl = function() { return PreferenceManager.get(sitecoreUrlId); };
    exports.getSitecoreDeployRoute = function() { return PreferenceManager.get(sitecoreDeployRouteId); };
    exports.getSitecoreImportRoute = function() { return PreferenceManager.get(sitecoreImportRouteId); };
});