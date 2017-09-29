﻿/// <reference path="../coalesce.dependencies.d.ts" />

class EnumValue {
    id: number;
    value: string;
}

module Coalesce {
    interface ComputedConfiguration<T> extends KnockoutComputed<T> {
        raw: () => T
    };

    class CoalesceConfiguration<T> {
        protected parentConfig: CoalesceConfiguration<any>;

        constructor(parentConfig?: CoalesceConfiguration<any>) {
            this.parentConfig = parentConfig;
        }

        protected prop = <TProp>(name: string): ComputedConfiguration<TProp> => {
            var k = "_" + name;
            var raw = this[k] = ko.observable<TProp>(null);
            var computed: ComputedConfiguration<TProp>;
            computed = ko.computed<TProp>({
                deferEvaluation: true, // This is essential. If not deferred, the observable will be immediately evaluated without parentConfig being set.
                read: () => {
                    var rawValue = raw();
                    if (rawValue !== null) return rawValue;
                    return this.parentConfig && this.parentConfig[name] ? this.parentConfig[name]() : null
                },
                write: raw
            }) as any as ComputedConfiguration<TProp>;
            computed.raw = raw;
            return computed;
        }

        /** The relative url where the API may be found. */
        public baseApiUrl = this.prop<string>("baseApiUrl");
        /** The relative url where the generated views may be found. */
        public baseViewUrl = this.prop<string>("baseViewUrl");
        /** Whether or not the callback specified for onFailure will be called or not. */
        public showFailureAlerts = this.prop<boolean>("showFailureAlerts");

        /** A callback to be called when a failure response is received from the server. */
        public onFailure = this.prop<(object: T, message: string) => void>("onFailure");
        /** A callback to be called when an AJAX request begins. */
        public onStartBusy = this.prop<(object: T) => void>("onStartBusy");
        /** A callback to be called when an AJAX request completes. */
        public onFinishBusy = this.prop<(object: T) => void>("onFinishBusy");
    }

    export class ViewModelConfiguration<T extends BaseViewModel<T>> extends CoalesceConfiguration<T> {
        /** Time to wait after a change is seen before auto-saving (if autoSaveEnabled is true). Acts as a debouncing timer for multiple simultaneous changes. */
        public saveTimeoutMs = this.prop<number>("saveTimeoutMs");
        /** Determines whether changes to a model will be automatically saved after saveTimeoutMs milliseconds have elapsed. */
        public autoSaveEnabled = this.prop<boolean>("autoSaveEnabled");
        /** Determines whether or not changes to many-to-many collection properties will automatically trigger a save call to the server or not. */
        public autoSaveCollectionsEnabled = this.prop<boolean>("autoSaveCollectionsEnabled");
        /** Whether to invoke onStartBusy and onFinishBusy during saves. */
        public showBusyWhenSaving = this.prop<boolean>("showBusyWhenSaving");
        /** Whether or not to reload the ViewModel with the state of the object received from the server after a call to .save(). */
        public loadResponseFromSaves = this.prop<boolean>("loadResponseFromSaves");
        /**
            An optional callback to be called when an object is loaded from a response from the server.
            Callback will be called after all properties on the ViewModel have been set from the server response.
        */
        public onLoadFromDto = this.prop<(object: T) => void>("onLoadFromDto");

        /**
            Gets the underlying observable that stores the object's explicit configuration value.
        */
        public raw = (name: keyof ViewModelConfiguration<T>): KnockoutObservable<any> => {
            return this["_" + name];
        }
    }

    export class ListViewModelConfiguration<T extends BaseListViewModel<T, TItem>, TItem extends BaseViewModel<TItem>> extends CoalesceConfiguration<T> {

        /**
            Gets the underlying observable that stores the object's explicit configuration value.
        */
        public raw = (name: keyof ListViewModelConfiguration<T, TItem>): KnockoutObservable<any> => {
            return this["_" + name];
        }
    }

    class RootConfig extends CoalesceConfiguration<any> {
        public viewModel = new ViewModelConfiguration<BaseViewModel<any>>(this);
        public listViewModel = new ListViewModelConfiguration<BaseListViewModel<any, BaseViewModel<any>>, BaseViewModel<any>>(this);
    }

    export var GlobalConfiguration = new RootConfig();
    GlobalConfiguration.baseApiUrl("/api");
    GlobalConfiguration.baseViewUrl("");
    GlobalConfiguration.showFailureAlerts(true);
    GlobalConfiguration.onFailure((obj, message) => alert(message));
    GlobalConfiguration.onStartBusy(obj => Coalesce.Utilities.showBusy());
    GlobalConfiguration.onFinishBusy(obj => Coalesce.Utilities.hideBusy());

    GlobalConfiguration.viewModel.saveTimeoutMs(500);
    GlobalConfiguration.viewModel.autoSaveEnabled(true);
    GlobalConfiguration.viewModel.autoSaveCollectionsEnabled(true);
    GlobalConfiguration.viewModel.showBusyWhenSaving(false);
    GlobalConfiguration.viewModel.loadResponseFromSaves(true);


    export class BaseViewModel<T extends BaseViewModel<T>> {

        protected modelName: string;
        protected modelDisplayName: string;
        protected primaryKeyName: string;

        protected apiController: string;
        protected viewController: string;

        /**
            List of all possible data sources that can be set on the dataSource property.
        */
        public dataSources: any;

        /**
            The custom data source that will be invoked on the server to provide the data for this list.
        */
        public dataSource: any;

        /**
            Properties which determine how this object behaves.
        */
        public coalesceConfig: ViewModelConfiguration<BaseViewModel<T>> = null;

        /** Stack for number of times loading has been called. */
        protected loadingCount: number = 0;
        /** Stores the return value of setInterval for automatic save delays. */
        protected saveTimeout: number = 0;

     
        /** Callbacks to call after a save. */
        protected saveCallbacks: Array<(self: T) => void> = [];
        
        /**
            String that will be passed to the server when loading and saving that allows for data trimming via C# Attributes & loading control via IIncludable.
        */
        public includes: string = "";

        /**
            If true, the busy indicator is shown when loading.
            @deprecated Use coalesceConfig.showBusyWhenSaving instead.
        */
        get showBusyWhenSaving() { return this.coalesceConfig.showBusyWhenSaving() }
        set showBusyWhenSaving(value) { this.coalesceConfig.showBusyWhenSaving(value) }

        /**
            Whether or not alerts should be shown when loading fails.
            @deprecated Use coalesceConfig.showFailureAlerts instead.
        */
        get showFailureAlerts() { return this.coalesceConfig.showFailureAlerts() }
        set showFailureAlerts(value) { this.coalesceConfig.showFailureAlerts(value) }

        /** Parent of this object, if this object was loaded as part of a hierarchy. */
        public parent: any = null;
        /** Parent of this object, if this object was loaded as part of list of objects. */
        public parentCollection: KnockoutObservableArray<T> = null;
        /**
            Primary Key of the object.
            @deprecated Use the strongly-typed property of the key for this model whenever possible. This property will be removed once Coalesce supports composite keys.
        */
        public myId: any = 0;

        /** Dirty Flag. Set when a value on the model changes. Reset when the model is saved or reloaded. */
        public isDirty: KnockoutObservable<boolean> = ko.observable(false);
        /** Contains the error message from the last failed call to the server. */
        public errorMessage: KnockoutObservable<string> = ko.observable(null);
        /** ValidationIssues returned from the server when trying to persist data */
        public validationIssues: any = ko.observableArray([]);

        /**
            If this is true, all changes will be saved automatically.
            @deprecated Use coalesceConfig.autoSaveEnabled instead.
        */
        get isSavingAutomatically() { return this.coalesceConfig.autoSaveEnabled() }
        set isSavingAutomatically(value) { this.coalesceConfig.autoSaveEnabled(value) }


        /** Flag to use to determine if this item is shown. Provided for convenience. */
        public isVisible: KnockoutObservable<boolean> = ko.observable(false);
        /** Flag to use to determine if this item is expanded. Provided for convenience. */
        public isExpanded: KnockoutObservable<boolean> = ko.observable(false);
        /** Flag to use to determine if this item is selected. Provided for convenience. */
        public isSelected: KnockoutObservable<boolean> = ko.observable(false);
        /** Flag to use to determine if this item is checked. Provided for convenience. */
        public isChecked: KnockoutObservable<boolean> = ko.observable(false);
        /** Flag to use to determine if this item is being edited. Only for convenience. */
        public isEditing: KnockoutObservable<boolean> = ko.observable(false);

        /** Toggles the isExpanded flag. Use with a click binding for a button. */
        public toggleIsExpanded = (): void => this.isExpanded(!this.isExpanded());

        /** Toggles the isEditing flag. Use with a click binding for a button. */
        public toggleIsEditing = (): void => this.isEditing(!this.isEditing());

        /** Toggles the isSelected flag. Use with a click binding for a button. */
        public toggleIsSelected = (): void => this.isSelected(!this.isSelected());

        /**
            Sets isSelected(true) on this object and clears on the rest of the items in the parent collection.
            @returns true to bubble additional click events.
        */
        public selectSingle = (): boolean => {
            if (this.parentCollection()) {
                $.each(this.parentCollection(), (i, obj) => {
                    obj.isSelected(false);
                });
            }
            this.isSelected(true);
            return true; // Allow other click events
        };


        /** List of errors found during validation. Any errors present will prevent saving. */
        public errors: KnockoutValidationErrors = null;
        /** List of warnings found during validation. Saving is still allowed with warnings present. */
        public warnings: KnockoutValidationErrors = null;

        /** True if the object is currently saving. */
        public isSaving: KnockoutObservable<boolean> = ko.observable(false);
        /** Internal count of child objects that are saving. */
        protected savingChildCount: KnockoutObservable<number> = ko.observable(0);

        /** 
            Returns true if there are no client-side validation issues.
            Saves will be prevented if this returns false.
        */
        public isValid = (): boolean => this.errors().length == 0;

        /**
            Triggers any validation messages to be shown, and returns a bool that indicates if there are any validation errors.
        */
        public validate = (): boolean => {
            this.errors.showAllMessages();
            this.warnings.showAllMessages();
            return this.isValid();
        };

        /** True if the object is loading. */
        public isLoading: KnockoutObservable<boolean> = ko.observable(false);
        /**  True once the data has been loaded. */
        public isLoaded: KnockoutObservable<boolean> = ko.observable(false);
        /** URL to a stock editor for this object. */
        public editUrl: KnockoutComputed<string>;


        /**
          * Loads this object from a data transfer object received from the server.
          * @param force - Will override the check against isLoading that is done to prevent recursion.
          * @param allowCollectionDeletes - Set true when entire collections are loaded. True is the default.
                In some cases only a partial collection is returned, set to false to only add/update collections.
        */
        public loadFromDto: (data: any, force?: boolean, allowCollectionDeletes?: boolean) => void;

        /** Saves this object into a data transfer object to send to the server. */
        public saveToDto: () => any;

        /**
            Loads any child objects that have an ID set, but not the full object.
            This is useful when creating an object that has a parent object and the ID is set on the new child.
        */
        public loadChildren: (callback?: () => void) => void;


        /** Returns true if the current object, or any of its children, are saving. */
        public isThisOrChildSaving: KnockoutComputed<boolean> = ko.computed(() => {
            if (this.isSaving()) return true;
            if (this.savingChildCount() > 0) return true;
            return false;
        });

        // Handle children that are saving.
        // Internally used member to count the number of saving children.
        protected onSavingChildChange = (isSaving: boolean): void => {
            if (isSaving)
                this.savingChildCount(this.savingChildCount() + 1);
            else
                this.savingChildCount(this.savingChildCount() - 1);

            if (this.parent && $.isFunction(this.parent.onSavingChildChange)) {
                this.parent.onSavingChildChange(isSaving);
            }
        };

        /**
            Saves the object to the server and then calls a callback.
            Returns false if there are validation errors.
        */
        public save = (callback?: (self: T) => void): JQueryPromise<any> | boolean | undefined => {
            if (!this.isLoading()) {
                if (this.validate()) {
                    if (this.coalesceConfig.showBusyWhenSaving()) this.coalesceConfig.onStartBusy()(this);
                    this.isSaving(true);

                    var url = this.coalesceConfig.baseApiUrl() + this.apiController + "/Save?includes=" + this.includes + '&dataSource=';
                    if (typeof this.dataSource === "string") url += this.dataSource;
                    else url += this.dataSources[this.dataSource];

                    return $.ajax({ method: "POST", url: url, data: this.saveToDto(), xhrFields: { withCredentials: true } })
                        .done((data) => {
                            this.isDirty(false);
                            this.errorMessage('');
                            if (this.coalesceConfig.loadResponseFromSaves()) {
                                this.loadFromDto(data.object, true);
                            }
                            // The object is now saved. Call any callback.
                            for (var i in this.saveCallbacks) {
                                this.saveCallbacks[i](this as any as T);
                            }
                        })
                        .fail((xhr) => {
                            var errorMsg = "Unknown Error";
                            var validationIssues = [];
                            if (xhr.responseJSON && xhr.responseJSON.message) errorMsg = xhr.responseJSON.message;
                            if (xhr.responseJSON && xhr.responseJSON.validationIssues) validationIssues = xhr.responseJSON.validationIssues;
                            this.errorMessage(errorMsg);
                            this.validationIssues(validationIssues);
                            // If an object was returned, load that object.
                            if (xhr.responseJSON && xhr.responseJSON.object) {
                                this.loadFromDto(xhr.responseJSON.object, true);
                            }
                            if (this.coalesceConfig.showFailureAlerts())
                                this.coalesceConfig.onFailure()(this, "Could not save the item: " + errorMsg);
                        })
                        .always(() => {
                            this.isSaving(false);
                            if ($.isFunction(callback)) {
                                callback(this as any as T);
                            }
                            if (this.coalesceConfig.showBusyWhenSaving()) this.coalesceConfig.onFinishBusy()(this);
                        });
                }
                else {
                    // If validation fails, we still want to try and load any child objects which may have just been set.
                    // Normally, we get these from the result of the save.
                    this.loadChildren();
                    return false;
                }
            }
        }


        /** Loads the object from the server based on the id specified. If no id is specified, the current id, is used if one is set. */
        public load = (id: any, callback?: (self: T) => void): JQueryPromise<any> | undefined => {
            if (!id) {
                id = this[this.primaryKeyName]();
            }
            if (id) {
                this.isLoading(true);
                this.coalesceConfig.onStartBusy()(this);

                var url = this.coalesceConfig.baseApiUrl() + this.apiController + "/Get/" + id + '?includes=' + this.includes + '&dataSource=';
                if (typeof this.dataSource === "string") url += this.dataSource;
                else url += this.dataSources[this.dataSource];

                return $.ajax({ method: "GET", url: url, xhrFields: { withCredentials: true } })
                    .done((data) => {
                        this.loadFromDto(data, true);
                        this.isLoaded(true);
                        if ($.isFunction(callback)) callback(this as any as T);
                    })
                    .fail(() => {
                        this.isLoaded(false);
                        if (this.coalesceConfig.showFailureAlerts())
                            this.coalesceConfig.onFailure()(this, "Could not load " + this.modelName + " with ID = " + id);
                    })
                    .always(() => {
                        this.coalesceConfig.onFinishBusy()(this);
                        this.isLoading(false);
                    });
            }
        };

        /** Deletes the object without any prompt for confirmation. */
        public deleteItem = (callback?: (self: T) => void): JQueryPromise<any> | undefined => {
            var currentId = this[this.primaryKeyName]();
            if (currentId) {
                return $.ajax({ method: "POST", url: this.coalesceConfig.baseApiUrl() + this.apiController + "/Delete/" + currentId, xhrFields: { withCredentials: true } })
                    .done((data) => {
                        if (data) {
                            this.errorMessage('');

                            // Remove it from the parent collection
                            if (this.parentCollection && this.parent) {
                                this.parent.isLoading(true);
                                this.parentCollection.splice(this.parentCollection().indexOf(this as any as T), 1);
                                this.parent.isLoading(false);
                            }
                        } else {
                            this.errorMessage(data.message);
                        }
                    })
                    .fail(() => {
                        if (this.coalesceConfig.showFailureAlerts())
                            this.coalesceConfig.onFailure()(this, "Could not delete the item");
                    })
                    .always(() => {
                        if ($.isFunction(callback)) {
                            callback(this as any as T);
                        }
                    });
            } else {
                // No ID has been assigned yet, just remove it.
                if (this.parentCollection && this.parent) {
                    this.parent.isLoading(true);
                    this.parentCollection.splice(this.parentCollection().indexOf(this as any as T), 1);
                    this.parent.isLoading(false);
                }
                if ($.isFunction(callback)) {
                    callback(this as any as T);
                }
            }
        };

        /**
            Deletes the object if a prompt for confirmation is answered affirmatively.
        */
        public deleteItemWithConfirmation = (callback?: () => void, message?: string): JQueryPromise<any> | undefined => {
            if (typeof message != 'string') {
                message = "Delete this item?";
            }
            if (confirm(message)) {
                return this.deleteItem(callback);
            }
        };

        /** Saves a many-to-many collection change. This is done automatically and doesn't need to be called. */
        protected saveCollection = (propertyName: string, childId: any, operation: string): JQueryPromise<any> => {
            var method = (operation === "added" ? "AddToCollection" : "RemoveFromCollection");
            var currentId = this[this.primaryKeyName]();
            return $.ajax({ method: "POST", url: this.coalesceConfig.baseApiUrl() + this.apiController + '/' + method + '?id=' + currentId + '&propertyName=' + propertyName + '&childId=' + childId, xhrFields: { withCredentials: true } })
                .done((data) => {
                    this.errorMessage('');
                    this.loadFromDto(data.object, true);
                    // The object is now saved. Call any callback.
                    for (var i in this.saveCallbacks) {
                        this.saveCallbacks[i](this as any as T);
                    }
                })
                .fail((xhr) => {
                    var errorMsg = "Unknown Error";
                    var validationIssues = [];
                    if (xhr.responseJSON && xhr.responseJSON.message) errorMsg = xhr.responseJSON.message;
                    if (xhr.responseJSON && xhr.responseJSON.validationIssues) errorMsg = xhr.responseJSON.validationIssues;
                    this.errorMessage(errorMsg);
                    this.validationIssues(validationIssues);

                    if (this.coalesceConfig.showFailureAlerts())
                        this.coalesceConfig.onFailure()(this, "Could not save the item: " + errorMsg);
                })
                .always(() => {
                    // Nothing here yet.
                });
        };

        /** Saves a many to many collection if coalesceConfig.autoSaveCollectionsEnabled is true. */
        protected autoSaveCollection = (property: string, id: any, changeStatus: string) => {
            if (!this.isLoading() && this.coalesceConfig.autoSaveCollectionsEnabled()) {
                // TODO: Eventually Batch saves for many-to-many collections.
                if (changeStatus === 'added') {
                    this.saveCollection(property, id, "added");
                } else if (changeStatus === 'deleted') {
                    this.saveCollection(property, id, "deleted");
                }
            }
        };

        
        /**
            Register a callback to be called when a save is done.
            @returns true if the callback was registered. false if the callback was already registered. 
        */
        public onSave = (callback: (self: T) => void): boolean => {
            if ($.isFunction(callback) && !this.saveCallbacks.filter(c => c == callback).length) {
                this.saveCallbacks.push(callback);
                return true;
            }
            return false;
        };

        /** Saves the object is coalesceConfig.autoSaveEnabled is true. */
        protected autoSave = (): void => {
            if (!this.isLoading()) {
                this.isDirty(true);
                if (this.coalesceConfig.autoSaveEnabled()) {
                    // Batch saves.
                    if (this.saveTimeout) clearTimeout(this.saveTimeout);
                    this.saveTimeout = setTimeout(() => {
                        this.saveTimeout = 0;
                        // If we have a save in progress, wait...
                        if (this.isSaving()) {
                            this.autoSave();
                        } else if (this.coalesceConfig.autoSaveEnabled()) {
                            this.save();
                        }
                    }, this.coalesceConfig.saveTimeoutMs());
                }
            }
        }

        /**
            Displays an editor for the object in a modal dialog.
        */
        public showEditor = (callback?: any): JQueryPromise<any> => {
            // Close any existing modal
            $('#modal-dialog').modal('hide');
            // Get new modal content
            this.coalesceConfig.onStartBusy()(this);
            return $.ajax({
                method: "GET",
                url: this.coalesceConfig.baseViewUrl() + this.viewController + '/EditorHtml',
                data: { simple: true },
                xhrFields: { withCredentials: true }
            })
                .done((data) => {
                    // Add to DOM
                    Coalesce.ModalHelpers.setupModal('Edit ' + this.modelDisplayName, data, true, false);
                    // Data bind
                    var lastValue = this.coalesceConfig.autoSaveEnabled.raw();
                    this.coalesceConfig.autoSaveEnabled(false);
                    ko.applyBindings(this, document.getElementById("modal-dialog"));
                    this.coalesceConfig.autoSaveEnabled(lastValue);
                    // Show the dialog
                    $('#modal-dialog').modal('show');
                    // Make the callback when the form closes.
                    $("#modal-dialog").on("hidden.bs.modal", () => {
                        if ($.isFunction(callback)) callback(this);
                    });
                })
                .always(() => {
                    this.coalesceConfig.onFinishBusy()(this);
                });
        }

        constructor() {
            // Handles setting the parent savingChildChange
            this.isSaving.subscribe((newValue: boolean) => {
                if (this.parent && $.isFunction(this.parent.onSavingChildChange)) {
                    this.parent.onSavingChildChange(newValue);
                }
            })
        }
    }

    export class BaseListViewModel<T, TItem extends BaseViewModel<any>> {

        protected modelName: string;

        protected apiController: string;

        /**
            List of all possible data sources that can be set on the dataSource property.
        */
        public dataSources: any;

        /**
            The custom data source that will be invoked on the server to provide the data for this list.
        */
        public dataSource: any;

        /**
            Name of the primary key of the model that this list represents.
        */
        public modelKeyName: string;

        // Reference to the class which this list represents.
        protected itemClass: typeof BaseViewModel;

        /**
            Properties which determine how this object behaves.
        */
        public coalesceConfig: ListViewModelConfiguration<BaseListViewModel<T, TItem>, TItem> = null;

        /**
            Query string to append to the API call when loading the list of items.
            If query is non-null, this value will not be used.
        */
        public queryString: string = "";
        /**
            Object that will be serialized to a query string and passed to the API call.
            Supercedes queryString if set.
        */
        public query: any = null;

        /** String that is used to control loading and serialization on the server. */
        public includes: string = "";

        /**
            Whether or not alerts should be shown when loading fails.
            @deprecated Use coalesceConfig.showFailureAlerts instead.
        */
        get showFailureAlerts() { return this.coalesceConfig.showFailureAlerts() }
        set showFailureAlerts(value) { this.coalesceConfig.showFailureAlerts(value) }

        /** The collection of items that have been loaded from the server. */
        public items: KnockoutObservableArray<TItem> = ko.observableArray([]);

        /**
            Load the list using current parameters for paging, searching, etc
            Result is placed into the items property.
        */
        public load = (callback?: any): JQueryPromise<any> => {
            this.coalesceConfig.onStartBusy()(this);
            if (this.query) {
                this.queryString = $.param(this.query);
            }
            this.isLoading(true);

            var url = this.coalesceConfig.baseApiUrl() + this.apiController + "/List?" + this.queryParams();

            if (this.queryString !== null && this.queryString !== "") url += "&" + this.queryString;

            return $.ajax({
                    method: "GET",
                    url: url,
                    xhrFields: { withCredentials: true }
            })
                .done((data) => {

                    Coalesce.KnockoutUtilities.RebuildArray(this.items, data.list, this.modelKeyName, this.itemClass, this, true);
                    $.each(this.items(), (_, model) => {
                        model.includes = this.includes;
                    });
                    this.count(data.list.length);
                    this.totalCount(data.totalCount);
                    this.pageCount(data.pageCount);
                    this.page(data.page);
                    this.message(data.message);
                    this.isLoaded(true);
                    if ($.isFunction(callback)) callback(this);
                })
                .fail((xhr) => {
                    var errorMsg = "Unknown Error";
                    if (xhr.responseJSON && xhr.responseJSON.message) errorMsg = xhr.responseJSON.message;
                    this.message(errorMsg);
                    this.isLoaded(false);

                    if (this.coalesceConfig.showFailureAlerts())
                        this.coalesceConfig.onFailure()(this, "Could not get list of " + this.modelName + " items: " + errorMsg);
                })
                .always(() => {
                    this.coalesceConfig.onFinishBusy()(this);
                    this.isLoading(false);
                });
        };


        /** Returns a query string built from the list's `query` parameter. */
        protected queryParams = (pageSize?: number): string => {
            return $.param({
                includes: this.includes,
                page: this.page(),
                pageSize: pageSize || this.pageSize(),
                search: this.search(),
                orderBy: this.orderBy(),
                orderByDescending: this.orderByDescending(),
                dataSource: this.dataSources[this.dataSource]
            });
        };

        /** Method which will instantiate a new item of the list's model type. */
        protected createItem: (newItem?: any, parent?: any) => TItem;

        /** Adds a new item to the collection. */
        public addNewItem = (): TItem => {
            var item = this.createItem();
            this.items.push(item);
            return item;
        };

        /** Deletes an item. */
        public deleteItem = (item: TItem): JQueryPromise<any> => {
            return item.deleteItem();
        };

        /** True if the list is loading. */
        public isLoading: KnockoutObservable<boolean> = ko.observable(false);

        /** True once the list has been loaded. */
        public isLoaded: KnockoutObservable<boolean> = ko.observable(false);

        /** Gets the count of items without getting all the items. Result is placed into the count property. */
        public getCount = (callback?: any): JQueryPromise<any> => {
            this.coalesceConfig.onStartBusy()(this);
            if (this.query) {
                this.queryString = $.param(this.query);
            }
            return $.ajax({
                method: "GET",
                url: this.coalesceConfig.baseApiUrl() + this.apiController + "/Count?" + "dataSource="
                    + this.dataSources[this.dataSource] + "&" + this.queryString,
                xhrFields: { withCredentials: true } })
            .done((data) => {
                this.count(data);
                if ($.isFunction(callback)) callback();
            })
            .fail(() => {
                if (this.coalesceConfig.showFailureAlerts())
                    this.coalesceConfig.onFailure()(this, "Could not get count of " + this.modelName + " items.");
            })
            .always(() => {
                this.coalesceConfig.onFinishBusy()(this);
            });
        };

        /** The result of getCount() or the total on this page. */
        public count: KnockoutObservable<number> = ko.observable(null);
        /** Total count of items, even ones that are not on the page. */
        public totalCount: KnockoutObservable<number> = ko.observable(null);
        /** Total page count */
        public pageCount: KnockoutObservable<number> = ko.observable(null);
        /** Page number. This can be set to get a new page. */
        public page: KnockoutObservable<number> = ko.observable(1);
        /** Number of items on a page. */
        public pageSize: KnockoutObservable<number> = ko.observable(10);
        /** If a load failed, this is a message about why it failed. */
        public message: KnockoutObservable<string> = ko.observable(null);
        /** Search criteria for the list. This can be exposed as a text box for searching. */
        public search: KnockoutObservable<string> = ko.observable("");

        /** True if there is another page after the current page. */
        public nextPageEnabled: KnockoutComputed<boolean> = ko.computed(() => this.page() < this.pageCount());

        /** True if there is another page before the current page. */
        public previousPageEnabled: KnockoutComputed<boolean> = ko.computed(() => this.page() > 1);

        /** Change to the next page */
        public nextPage = (): void => {
            if (this.nextPageEnabled()) {
                this.page(this.page() + 1);
            }
        };

        /** Change to the previous page */
        public previousPage = (): void => {
            if (this.previousPageEnabled()) {
                this.page(this.page() - 1);
            }
        };


        /** Name of a field by which this list will be loaded in ascending order */
        public orderBy: KnockoutObservable<string> = ko.observable("");

        /** Name of a field by which this list will be loaded in descending order */
        public orderByDescending: KnockoutObservable<string> = ko.observable("");

        /** Toggles sorting between ascending, descending, and no order on the specified field. */
        public orderByToggle = (field: string): void => {
            if (this.orderBy() == field && !this.orderByDescending()) {
                this.orderBy('');
                this.orderByDescending(field);
            }
            else if (!this.orderBy() && this.orderByDescending() == field) {
                this.orderBy('');
                this.orderByDescending('');
            }
            else {
                this.orderBy(field);
                this.orderByDescending('');
            }
        };

        /** Returns URL to download a CSV for the current list with all items. */
        public downloadAllCsvUrl: KnockoutComputed<string> = ko.computed<string>(() => {
            var url = this.coalesceConfig.baseApiUrl() + this.apiController + "/CsvDownload?" + this.queryParams(10000);
            return url;
        }, null, { deferEvaluation: true });

        /** Prompts to the user for a file to upload as a CSV. */
        public csvUploadUi = (callback?: () => void): void => {
            // Remove the form if it exists.
            $('#csv-upload').remove();
            // Add the form to the page to take the input
            $('body')
                .append('<form id="csv-upload" display="none"></form>'); 
            $('#csv-upload')
                .attr("action", this.coalesceConfig.baseApiUrl() + this.apiController + "/CsvUpload").attr("method", "post")
                .append('<input type="file" style="visibility: hidden;" name="file"/>');

            // Set up the click callback.
            $('#csv-upload input[type=file]').change(() => {
                // Get the files
                var fileInput = $('#csv-upload input[type=file]')[0] as any;
                var file = fileInput.files[0];
                if (file) {
                    var formData = new FormData();
                    formData.append('file', file);
                    this.coalesceConfig.onStartBusy()(this);
                    this.isLoading(true);
                    $.ajax({
                        url: this.coalesceConfig.baseApiUrl() + this.apiController + "/CsvUpload",
                        data: formData,
                        processData: false,
                        contentType: false,
                        type: 'POST'
                    } as any)
                    .done((data) => {
                        this.isLoading(false);
                        if ($.isFunction(callback)) callback();
                    })
                    .fail((data) => {
                        if (this.coalesceConfig.showFailureAlerts())
                            this.coalesceConfig.onFailure()(this, "CSV Upload Failed");
                    })
                    .always(() => {
                        this.load();
                        this.coalesceConfig.onFinishBusy()(this);
                    });
                }
                // Remove the form
                $('#csv-upload').remove();
            });
            // Click on the input box
            $('#csv-upload input[type=file]').click();
        };

        private loadTimeout: number = 0;

        /** reloads the list after a slight delay (100ms default) to ensure that all changes are made. */
        private delayedLoad = (milliseconds?: number): void => {
            if(this.loadTimeout) {
                clearTimeout(this.loadTimeout);
            }
            this.loadTimeout = setTimeout(() => {
                this.loadTimeout = 0;
                this.load();
            }, milliseconds || 100);
        }

        public constructor() {
            var searchTimeout: number = 0;

            this.pageSize.subscribe(() => {
                if (this.isLoaded()) {
                    this.load();
                }
            });
            this.page.subscribe(() => {
                if (this.isLoaded() && !this.isLoading()) {
                    this.delayedLoad(300);
                }
            });
            this.search.subscribe(() => {
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }
                searchTimeout = setTimeout(() => {
                    searchTimeout = 0;
                    this.load();
                }, 300);
            });
            this.orderBy.subscribe(() => { if (this.isLoaded()) this.delayedLoad(); });
            this.orderByDescending.subscribe(() => { if (this.isLoaded()) this.delayedLoad(); });
        }
    }
}