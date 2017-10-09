define(function (require, exports, module) {
    "use strict";

    // dependencies    
    var SitecoreMenuLoader = require("SitecoreMenuLoader");

    // backing fields for lazy-loaded variables - do NOT use these values except from the lazy loaded variable assignments
    var _backingFields = {
        _repository: undefined,
        _factory: undefined,
        _fileSystem: undefined,
        _fileUtils: undefined,
        _dialogs: undefined,
        _modelExplorerView: undefined,
        _stringUtils: undefined,
        _diagramUtils: undefined
    };

    // lazy-loaded StarUML modules
    var Repository_get =  function() { return _backingFields._repository || (_backingFields._repository = app.getModule("core/Repository")); };
    var Factory = _backingFields._factory || (_backingFields._factory = app.getModule("engine/Factory"));
    var FileSystem = _backingFields._fileSystem || (_backingFields._fileSystem = app.getModule("filesystem/FileSystem"));
    var FileUtils = _backingFields._fileUtils || (_backingFields._fileUtils = app.getModule("file/FileUtils"));
    var Dialogs = _backingFields._dialogs || (_backingFields._dialogs = app.getModule("dialogs/Dialogs"));
    var ModelExplorerView_get = function() { return _backingFields._modelExplorerView || (_backingFields._modelExplorerView = app.getModule("explorer/ModelExplorerView")); };

    // lazy-loaded custom modules
    var StringUtils = _backingFields._stringUtils || (_backingFields._stringUtils = require("StringUtils"));
    var DiagramUtils = _backingFields._diagramUtils || (_backingFields._diagramUtils = require("DiagramUtils"));

    // eagerly-loaded (make lazy later)
    var ProgressDialog = require("ProgressDialog"); 

    // progress dialog constants
    var progressDialogClassId = "dialog-progress__sitecoreuml--import";
    var progressDialogTitle = "Import Progress";
    
    // gets the import progress message that should be displayed
    function getImportProgressMessage(actionLabel, path, index, total, type) {
        type = type ? " (" + type + ")" : "";
        return "<div><b>" + actionLabel + ": </b>" + path + type
            + "<br/><b>Completed: </b>" + index
            + "<br/><b>Remaining: </b>" + (total - index)
            + "</div>";
    };

    // generate the diagrams from the given JSON data
    function generateTemplateDiagrams(jsonTemplates) {
        // settings for the progress dialog
        var totalTemplates = jsonTemplates.length;

        // get the project to generate our UML things in
        var project = Repository_get().select("@Project")[0];

        // create the model to be the root for all generated things
        var rootModelOptions = {
            modelInitializer: function (modelEle) {
                modelEle.name = "Sitecore Templates Data Model";
            }
        };
        var rootModel = Factory.createModel(
            "UMLModel",
            project,
            "ownedElements",
            rootModelOptions);

        // create the template folders (package) diagram
        var folderDiagramOptions = {
            diagramInitializer: function (diagram) {
                diagram.name = "Template Folders Diagram";
            }
        };
        var templateFoldersDiagram =
            Factory.createDiagram("UMLPackageDiagram", rootModel, folderDiagramOptions);

        // create the templates (class) diagram, and make it the default diagram
        var templateDiagramOptions = {
            diagramInitializer: function (diagram) {
                diagram.name = "Templates Diagram";
                diagram.defaultDiagram = true;
            }
        };
        var templatesDiagram =
            Factory.createDiagram("UMLClassDiagram", rootModel, templateDiagramOptions);

        // loop through the JSON templates and build out the folder (package) map
        //   Build packages map such that it lists each package (folder) once and excludes the template name
        // 
        //   Structure by example:
        //     Path: 
        //       /Feature/Pages/BasePage
        //
        //     -->
        //
        //     Resulting Entries:
        //       "/Feature": { Name: "Feature", ParentKey: undefined, ReferenceId: "<StarUML ID>" } 
        //       "Feature/Pages": { Name: "Pages", ParentKey: "/Feature", ReferenceId: "<StarUML ID>"  }
        var packagesMap = [];
        var jsonTemplatesArray = JSON.parse(jsonTemplates);
        jsonTemplatesArray.forEach(function (jsonTemplate, templateIndex) {
            // update the progress dialog      
            console.log("Dialog should update");
            // ProgressDialog.queueProgressBarMessageForDialog(
            //     progressDialogClassId, 
            //     progressDialogTitle, 
            //     getImportProgressMessage("Processing Paths", jsonTemplate.Path, templateIndex, totalTemplates), 
            //     templateIndex, 
            //     totalTemplates);
            ProgressDialog.showOrUpdateDialogWithProgressBar(
                progressDialogClassId, 
                progressDialogTitle, 
                getImportProgressMessage("Processing Paths", jsonTemplate.Path, templateIndex, totalTemplates), 
                { currentStep: templateIndex, totalSteps: totalTemplates});

            // get the path parts            
            // e.g. "/Feature/Pages/BasePage"
            //      -->
            //      [ "", "Feature", "Pages", "BasePage" ]
            var templatePathParts = jsonTemplate.Path.split("/");

            var previousPathPartKey;
            // loop through the template path parts, skipping the last one (template name)
            for (var i = 0; i < templatePathParts.length - 1; i++) {
                var pathPart = templatePathParts[i];

                // skip empty entries
                if (pathPart == "") {
                    continue;
                }

                // create the package entry key
                var pathPartKey = (previousPathPartKey || "") + "/" + pathPart;

                // localize the prevPathPartKey and update the outer one for the next iteration
                var prevPathPartKey = previousPathPartKey;
                previousPathPartKey = pathPartKey;

                // if the key already exists then skip this part
                if (packagesMap[pathPartKey]) {
                    continue;
                }

                // add the new package (ReferenceId will be supplied later)
                packagesMap[pathPartKey] = {
                    Name: pathPart,
                    ParentKey: prevPathPartKey
                };
            }
        });

        // sort the package map keys by level
        //   Inherently, creating in sorted order means that parents will be created before
        //   children, as each level of packages will be built out breadth-first
        var packagesMapKeys = Object.keys(packagesMap).sort(function (a, b) {
            var levelA = StringUtils.occurrences(a, "/");
            var levelB = StringUtils.occurrences(b, "/");

            return levelA > levelB
                ? 1 // a is deeper level than b
                : levelA == levelB
                    ? 0 // a and b are at the same level
                    : -1; // b is a deeper level than a
        });

        // create package elements
        var addedPackageElements = []; // packagesMapKey is the key, value is the element
        var totalPackages = packagesMapKeys.length; // to be used for the progress dialogs
        packagesMapKeys.forEach(function (packageMapKey, entryIndex) {
            // get the entry from the packages map
            var entry = packagesMap[packageMapKey];
            
            // update the progress dialog      
            console.log("Dialog should update");
            ProgressDialog.showOrUpdateDialogWithProgressBar(
                progressDialogClassId, 
                progressDialogTitle, 
                getImportProgressMessage("Importing", (entry.ParentKey + entry.Name), entryIndex, totalPackages, "Folder"), 
                { currentStep: entryIndex, totalSteps: totalPackages });

            // set up the options for the package to be created
            var packageOptions = {
                modelInitializer: function (modelEle) {
                    modelEle.name = entry.Name;
                },
                viewInitializer: function (viewEle) {
                    viewEle.name = entry.Name;
                }
            };

            // get the parent from the addedPackageElements
            var parentElement;
            var parentModel
            var hasParent = entry.ParentKey;
            if (hasParent) {
                parentElement = addedPackageElements[entry.ParentKey];
                parentModel = parentElement.model;
            } else {
                // use the root model, since no parent
                parentModel = rootModel;
            }

            // add the package
            var addedPackage = Factory.createModelAndView(
                "UMLPackage",
                parentModel,
                templateFoldersDiagram,
                packageOptions);

            // add the package to the list of added packages
            addedPackageElements[packageMapKey] = addedPackage;

            // add the visual containment for the parent-child relationship
            if (hasParent) {
                // build the relationship options
                var relationshipOptions = {
                    headModel: parentModel,
                    tailModel: addedPackage.model,
                    tailView: addedPackage,
                    headView: parentElement
                };

                // add the view for the relationship
                Factory.createModelAndView(
                    "UMLContainment",
                    rootModel,
                    templateFoldersDiagram,
                    relationshipOptions);
            }
        });
        
        // update the progress dialog      
        console.log("Dialog should update");
        ProgressDialog.showOrUpdateDialog(
            progressDialogClassId, 
            progressDialogTitle, 
            "<div>Template folders imported.</div><div>Template Folders Diagram generation complete.</div><div>Reformatting diagram layout...</div>");

        // reformat the template folders diagram to be legible
        DiagramUtils.reformatDiagramLayout(templateFoldersDiagram);

        // create template elements
        var addedInterfaceElements = [];
        jsonTemplatesArray.forEach(function (jsonTemplate, templateIndex) {   
            // update the progress dialog      
            console.log("Dialog should update");
            ProgressDialog.showOrUpdateDialogWithProgressBar(
                progressDialogClassId, 
                progressDialogTitle, 
                getImportProgressMessage("Importing", jsonTemplate.Path, templateIndex, totalTemplates, "Template"), 
                { currentStep: templateIndex, totalSteps: totalTemplates });

            // options for the template model and view
            var interfaceOptions = {
                modelInitializer: function (ele) {
                    ele.name = jsonTemplate.Name;
                },
                viewInitializer: function (ele) {
                    ele.suppressAttributes = false;
                }
            };

            // get the parent key from the path
            var parentKey = jsonTemplate.Path.substring(0, jsonTemplate.Path.lastIndexOf("/"));

            // get the parent model 
            var parentModel = parentKey
                ? addedPackageElements[parentKey].model  // get the parent from the added package elements
                : rootModel; // if no parent, use the root model as the parent

            // add the template model and view
            var addedInterfaceElement = Factory.createModelAndView(
                "UMLInterface",
                parentModel,
                templatesDiagram,
                interfaceOptions);

            // add the newly added element to the collection
            addedInterfaceElements[jsonTemplate.Path] = addedInterfaceElement;

            // sort the fields by their SortOrder
            var jsonFields = jsonTemplate.Fields.sort(function (a, b) {
                return a.SortOrder > b.SortOrder
                    ? 1 // a has a higher sort order than b
                    : a.SortOrder == b.SortOrder
                        ? 0 // a and b have the same sort order
                        : -1; // a has a lower sort order than b
            });

            // add the fields to the interface
            jsonFields.forEach(function (jsonField) {
                // options for the template field to be added
                var attributeModelOptions = {
                    modelInitializer: function (ele) {
                        ele.name = jsonField.Name;
                        ele.visibility = "public"; // all fields are visible in Sitecore to admin so they are public here
                        ele.type = jsonField.FieldType;
                    }
                };

                // add the template field to the template's model
                Factory.createModel(
                    "UMLAttribute",
                    addedInterfaceElement.model,
                    "attributes",
                    attributeModelOptions);
            });
        });

        // generate the template inheritance relationships
        jsonTemplatesArray.forEach(function (jsonTemplate, templateIndex) {
            // update the progress dialog      
            console.log("Dialog should update");
            ProgressDialog.showOrUpdateDialogWithProgressBar(
                progressDialogClassId, 
                progressDialogTitle, 
                getImportProgressMessage("Setting Relationships", jsonTemplate.Path, templateIndex, totalTemplates, "Base Templates"), 
                { currentStep: templateIndex, totalSteps: totalTemplates});

            // if the template has no base templates then nothing more to do
            if (jsonTemplate.BaseTemplates && jsonTemplate.BaseTemplates.length) {
                jsonTemplate.BaseTemplates.forEach(function (baseTemplatePath) {
                    var templateView = addedInterfaceElements[jsonTemplate.Path];
                    var baseTemplateView = addedInterfaceElements[baseTemplatePath];

                    // set up the options
                    var relationshipOptions = {
                        headView: baseTemplateView,
                        headModel: baseTemplateView.model,
                        tailView: templateView,
                        tailModel: templateView.model
                    };

                    // add the inheritance relationship
                    Factory.createModelAndView(
                        "UMLGeneralization",
                        baseTemplateView.model,
                        templatesDiagram,
                        relationshipOptions
                    );
                });
            }
        });
        
        // update the progress dialog 
        console.log("Dialog should update");
        ProgressDialog.showOrUpdateDialog(
            progressDialogClassId, 
            progressDialogTitle, 
            "<div>Templates imported.</div><div>Templates Diagram generation complete.</div><div>Reformatting diagram layout...</div>");        
        
        // collapse all of the templates in the Model Explorer
        var allTemplates = Repository_get().select("@UMLInterface");
        allTemplates.forEach(ModelExplorerView_get().collapse);

        // collapse all of the template folders in the Model Explorer
        var allTemplateFolders = Repository_get().select("@UMLPackage");
        allTemplateFolders.forEach(ModelExplorerView_get().collapse);

        // reformat the templates diagram to be legible
        DiagramUtils.reformatDiagramLayout(templatesDiagram)
            // update the progress dialog to reflect completion once the reformatting is done
            .done(function() {
                console.log("Dialog should update");
                ProgressDialog.showOrUpdateDialog(
                    progressDialogClassId, 
                    "Import Completed Successfully", 
                    "<p>Sitecore templates and template folders have been imported successfully. Diagram generation and reformatting complete.</p><p>Click \"Finish\" to close this dialog.</p>",
                    [
                        { 
                            id: Dialogs.DIALOG_BTN_CANCEL, 
                            text: "Finish",
                            className: ""
                        }
                    ]);
            });
    };

    // generates the template diagrams and models from specified JSON file
    function generateTemplateDiagramsFromFile() {

        function generateDiagramsForFilePath(filePath) {
            var file = FileSystem.getFileForPath(filePath);
            FileUtils.readAsText(file)
                .done(function (data) {
                    console.log("JSON data read successfully from file path " + filePath);
                    // generate the template diagrams
                    generateTemplateDiagrams(data); 
                })
                .fail(function (err) {
                    console.error(err);
                    Dialogs.showErrorDialog("Uh oh! An error occurred while attempting to read the input file, " + filePath);
                });
        };

        // prompt user to select an input file      
        FileSystem.showOpenDialog(false, false, "Select Serialized Sitecore Templates", null, ["json"], function (err, files) {
            if (!err) {
                if (files.length == 1) {
                    var filePath = files[0];
                    generateDiagramsForFilePath(filePath);
                } else { // user cancelled
                    return; // nothing more to do
                }
            } else {
                console.error(err);
                Dialogs.showErrorDialog("Uh oh! An error occurred while attempting to prompt user for/read user input. See the DevTools console for more details");
            }
        });
    };

    // command ID constant
    var CMD_GENERATETEMPLATEDIAGRAMSFROMFILE = "sitecore.generatetemplatediagramsfromfile";

    exports.initialize = function () {
        // eager-load the requisite modules
        var CommandManager = app.getModule("command/CommandManager");

        // register the command
        CommandManager.register("Import Template Diagrams from Serialized JSON", CMD_GENERATETEMPLATEDIAGRAMSFROMFILE, generateTemplateDiagramsFromFile);
        // add the menu item
        SitecoreMenuLoader.sitecoreMenu.addMenuItem(CMD_GENERATETEMPLATEDIAGRAMSFROMFILE, ["Ctrl-Shift-D"]);
    };
    exports.generateTemplateDiagramsFromFile = generateTemplateDiagramsFromFile;
    exports.generateTemplateDiagrams = generateTemplateDiagrams;
    exports.CMD_GENERATETEMPLATEDIAGRAMSFROMFILE = CMD_GENERATETEMPLATEDIAGRAMSFROMFILE;
});