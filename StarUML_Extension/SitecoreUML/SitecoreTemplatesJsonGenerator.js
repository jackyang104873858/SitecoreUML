define(function(require, exports, module) {
    "use strict";

    // dependencies
    var SitecoreMenuLoader = require("SitecoreMenuLoader");

    // backing fields for lazy-loaded variables - do NOT use these values except from the lazy loaded variable assignments
    var _backingFields = {
        _repository: undefined,
        _fileSystem: undefined,
        _fileUtils: undefined,
        _dialogs: undefined
    };
    
    // lazy-loaded StarUML modules
    var Repository = _backingFields._repository || (_backingFields._repository = app.getModule("core/Repository"));
    var FileSystem = _backingFields._fileSystem || (_backingFields._fileSystem = app.getModule("filesystem/FileSystem"));
    var FileUtils  = _backingFields._fileUtils || (_backingFields._fileUtils = app.getModule("file/FileUtils"));
    var Dialogs = _backingFields._dialogs || (_backingFields._dialogs = app.getModule("dialogs/Dialogs"));

    // eagerly-loaded SitecoreUML modules
    var SitecorePreferencesLoader = require("SitecorePreferencesLoader");

    // generates the JSON templates from the diagrams and models
    function generateJsonTemplates() {
        var SitecoreTemplateField = function(
                name, 
                fieldType, 
                sortOrder,
                title,
                source,
                standardValue,
                shared,
                unversioned,
                sectionName) {
            this.Name = name;
            this.FieldType = fieldType;
            this.SortOrder = sortOrder;
            this.Title = title;
            this.Source = source;
            this.StandardValue = standardValue;
            this.Shared = shared;
            this.Unversioned = unversioned;
            this.SectionName = sectionName;
        };
        
        var SitecoreTemplate = function(
                referenceId,
                name,
                fields,
                path,
                baseTemplates) {
            this.ReferenceId = referenceId;
            this.Name = name;
            this.Fields = fields;
            this.Path = path;
            this.BaseTemplates = baseTemplates;
        };

        // get the folders
        var umlPackages = Repository.select("@UMLPackage");
        var sitecorePathMap = [];

        // recursively adds the folder and its ancestors to the path map
        var recursivelyBuildFolderPathMap = function (umlPackage) {
            var folderPath = sitecorePathMap[umlPackage._id];
            // if the folder path was already set then nothing more to do
            if (folderPath) {
                return folderPath;
            } 
            
            // if there is no parent folder then make the folder path, store and return it
            if (!umlPackage._parent || umlPackage._parent.constructor.name != "UMLPackage") {
                // folder path should just be the current folder
                folderPath = "/" + umlPackage.name;
                // store the folder path
                sitecorePathMap[umlPackage._id] = folderPath;
                return folderPath;
            } else {
                // ensure the path was added for the parent
                recursivelyBuildFolderPathMap(umlPackage._parent);
                // add the path for the current folder to its parent's folder path
                sitecorePathMap[umlPackage._id] = 
                    sitecorePathMap[umlPackage._parent._id] + "/" + umlPackage.name;
            }
        };

        // populate the path map with the folder paths
        umlPackages.forEach(recursivelyBuildFolderPathMap);

        // get the templates
        var umlInterfaces = Repository.select("@UMLInterface");

        var inheritanceMap = [];
        // get an array of sitecore templates
        var defaultFieldSectionName = SitecorePreferencesLoader.getSitecoreDeployDefaultFieldSectionName();
        var sitecoreTemplates = umlInterfaces.map(function(umlInterface, index) {            
            var fields = umlInterface.attributes.map(function(attribute, index) {  
                var field = new SitecoreTemplateField(
                    attribute.name,
                    attribute.type,
                    index); 

                try {
                    var fieldAttributeMap = {};        
                    attribute.ownedElements.forEach(function(element) {
                        if (element instanceof type.Tag) {
                            fieldAttributeMap[element.name] = element.value;
                        }
                    });

                    field.Title = fieldAttributeMap["Title"] || null;
                    field.Source = fieldAttributeMap["Source"] || null;
                    field.Shared = fieldAttributeMap["Shared"] || false; // by default, fields are not shared
                    field.Unversioned = fieldAttributeMap["Unversioned"] || false; // by default, fields are not shared
                    field.SectionName = (fieldAttributeMap["SectionName"] || "").trim() || defaultFieldSectionName; // fall back to the default name set in preferences
                    field.StandardValue = fieldAttributeMap["StandardValue"];
                } catch (e) {
                    console.error("Eval error occurred while trying to retrieve the extended field info for " + umlInterface.name + "::" + attribute.name, e);
                }

                return field;
            });

            // add inheriting templates to inheritance map
            umlInterface.ownedElements.forEach(function(ele) {
                if (inheritanceMap[ele.source._id]) {
                    inheritanceMap[ele.source._id].push(ele.target._id);
                } else {
                    inheritanceMap[ele.source._id] = [ ele.target._id ];
                }
            });

            // build the path to the template
            var parentPath = umlInterface._parent 
                ? (sitecorePathMap[umlInterface._parent._id] || "")
                : "";
            var templatePath = parentPath + "/" + umlInterface.name;
            sitecorePathMap[umlInterface._id] = templatePath;
            
            return new SitecoreTemplate(
                umlInterface._id,
                umlInterface.name, 
                fields,
                templatePath);
        });

        // add each template's base templates
        sitecoreTemplates = sitecoreTemplates.map(function(sitecoreTemplate) {
            var baseTemplateReferences = inheritanceMap[sitecoreTemplate.ReferenceId];
            if (baseTemplateReferences) {
                var baseTemplates = baseTemplateReferences.map(function(referenceId) {
                    return sitecorePathMap[referenceId];
                });
                sitecoreTemplate.BaseTemplates = baseTemplates;
            }

            return sitecoreTemplate;
        });

        // write the sitecore templates to the console for debugging purposes
        console.log(sitecoreTemplates);

        return sitecoreTemplates;
    };
    
    // TODO: move this to a separate module
    // serialize and save the Sitecore templates to a path specified by the user
    function serializeAndSaveSitecoreTemplates() {        
        FileSystem.showSaveDialog("Save serialized Sitecore templates as...", null, "Untitled.json", function (err, filename) {
            if (!err) {
                if (filename) {
                    // save the file
                    var file = FileSystem.getFileForPath(filename);
                    var templates = generateJsonTemplates();
                    var json = JSON.stringify(templates);
    
                    // write the json to the file
                    FileUtils.writeText(file, json, true)
                        .done(function () {
                            Dialogs.showInfoDialog("File saved successfully!")
                        })
                        .fail(function (err) {
                            console.error(err);
                            Dialogs.showErrorDialog("Uh oh! An error occurred while saving. See the DevTools console for details.");
                            return;
                        });  
                } else { // User canceled
                    return; 
                }
            } else {
                console.error(err);
                Dialogs.showErrorDialog("Uh oh! An error occurred while saving the serialized Sitecore templates. See the DevTools console for more information");
            }
        });  
    };
    
    // command ID constant
    var CMD_SAVESERIALIZEDTEMPLATES = "sitecore.saveserializedtemplates";

    exports.initialize = function() {
        // eager-load the requisite modules
        var CommandManager = app.getModule("command/CommandManager");

        // register the command
        CommandManager.register("Export Template Diagrams as Serialized JSON", CMD_SAVESERIALIZEDTEMPLATES, serializeAndSaveSitecoreTemplates);
        // add the menu item
        SitecoreMenuLoader.sitecoreMenu.addMenuItem(CMD_SAVESERIALIZEDTEMPLATES, ["Ctrl-Shift-B"]);
    };
    exports.generateJsonTemplates = generateJsonTemplates;
    exports.serializeAndSaveSitecoreTemplates = serializeAndSaveSitecoreTemplates;
    exports.CMD_SAVESERIALIZEDTEMPLATES = CMD_SAVESERIALIZEDTEMPLATES;
});

