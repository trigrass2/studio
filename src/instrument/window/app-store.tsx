import * as React from "react";
import { observable, action, reaction, ObservableMap, autorun } from "mobx";
import { bind } from "bind-decorator";

import { scheduleTask, Priority } from "shared/scheduler";
import { IStore } from "shared/store";

import { IEditor } from "shared/extensions/extension";

import { IShortcut } from "shortcuts/interfaces";
import { bindShortcuts } from "shortcuts/mousetrap";

import { InstrumentObject, instruments } from "instrument/instrument-object";

import { App } from "instrument/window/app";
import { NavigationStore } from "instrument/window/navigation-store";
import { ScriptsModel, ScriptView } from "instrument/window/scripts";
import * as ScriptModule from "instrument/window/script";
import { ShortcutsStore, GroupsStore } from "instrument/window/shortcuts";
import { UndoManager } from "instrument/window/undo";

import { History, DeletedItemsHistory } from "instrument/window/history/history";
import { IHistoryItem } from "instrument/window/history/item";

import { Filters } from "instrument/window/search/filters";

import { Terminal } from "instrument/window/terminal/terminal";
import { CommandsTree } from "instrument/window/terminal/commands-tree";

import { createInstrumentListStore } from "instrument/window/lists/store";
import { BaseList, createInstrumentLists } from "instrument/window/lists/store-renderer";

////////////////////////////////////////////////////////////////////////////////

type SelectableHistoryItemTypes = "chart" | "all";

interface SelectHistoryItemsSpecification {
    historyItemType: SelectableHistoryItemTypes;
    message: string;
    alertDanger?: boolean;
    okButtonText: string;
    okButtonTitle: string;
    onOk(): void;
}

export class AppStore implements IEditor {
    @observable instrument: InstrumentObject | undefined = undefined;
    @observable helpVisible: boolean = false;
    @observable searchVisible: boolean = false;
    @observable filtersVisible: boolean = false;
    @observable filters: Filters = new Filters();
    @observable searchViewSection: "calendar" | "sessions" = "calendar";
    @observable
    selectHistoryItemsSpecification: SelectHistoryItemsSpecification | undefined = undefined;
    @observable selectedHistoryItems: Map<string, boolean> = new Map<string, boolean>();

    navigationStore = new NavigationStore(this);
    scriptsModel = new ScriptsModel(this);
    shortcutsStore = new ShortcutsStore(this);
    groupsStore = new GroupsStore(this);

    commandsTree = new CommandsTree();

    history = new History(this);
    deletedItemsHistory = new DeletedItemsHistory(this);

    undoManager = new UndoManager();

    instrumentListStore: IStore;
    instrumentLists: ObservableMap<string, BaseList>;

    editor: JSX.Element | null = null;

    terminal: Terminal | null = null;

    scriptView: ScriptView | null = null;

    autorunDisposer: any;
    reactionDisposer: any;

    constructor(private instrumentId: string) {}

    onCreate() {
        scheduleTask(
            "Load instrument",
            Priority.High,
            action(() => {
                this.instrument = instruments.get(this.instrumentId);

                this.helpVisible =
                    localStorage.getItem(
                        `instrument/${this.instrument!.id}/window/help-visible`
                    ) === "1" || false;

                this.searchVisible =
                    localStorage.getItem(
                        `instrument/${this.instrument!.id}/window/search-visible`
                    ) === "1" || true;

                this.filtersVisible =
                    localStorage.getItem(
                        `instrument/${this.instrument!.id}/window/filters-visible`
                    ) === "1" || true;

                this.filters = this.getFiltersFromLocalStorage();

                this.searchViewSection =
                    (localStorage.getItem(
                        `instrument/${this.instrument!.id}/window/search/view-section`
                    ) as any) || "calendar";

                scheduleTask("Load commands tree", Priority.Low, () => {
                    this.commandsTree.load(this.instrument!.instrumentExtensionId);
                });

                bindShortcuts(this.shortcutsStore.instrumentShortcuts, (shortcut: IShortcut) => {
                    const {
                        executeShortcut
                    } = require("instrument/window/script") as typeof ScriptModule;
                    executeShortcut(this, shortcut);
                });

                // @todo
                // this is autorun because instrument extension is loaded asynchronously,
                // so getListsProperty would eventually become true
                this.autorunDisposer = autorun(() => {
                    if (this.instrument!.listsProperty) {
                        this.instrumentListStore = createInstrumentListStore(this);
                        this.instrumentLists = createInstrumentLists(this);
                    }
                });
            })
        );

        this.reactionDisposer = reaction(
            () => JSON.stringify(this.filters),
            filters => {
                localStorage.setItem(`instrument/${this.instrument!.id}/window/filters`, filters);
            }
        );

        EEZStudio.electron.ipcRenderer.on("beforeClose", this.onBeforeClose);
    }

    onActivate() {
        EEZStudio.electron.ipcRenderer.on("undo", this.undoManager.undo);
        EEZStudio.electron.ipcRenderer.on("redo", this.undoManager.redo);
        EEZStudio.electron.ipcRenderer.on("save", this.onSave);
        EEZStudio.electron.ipcRenderer.on("delete", this.onDeleteShortcut);
    }

    onDeactivate() {
        EEZStudio.electron.ipcRenderer.removeListener("undo", this.undoManager.undo);
        EEZStudio.electron.ipcRenderer.removeListener("redo", this.undoManager.redo);
        EEZStudio.electron.ipcRenderer.removeListener("save", this.onSave);
        EEZStudio.electron.ipcRenderer.removeListener("delete", this.onDeleteShortcut);
    }

    onTerminate() {
        console.error("TODO");
        EEZStudio.electron.ipcRenderer.removeListener("beforeClose", this.onBeforeClose);
        this.editor = null;
        this.terminal = null;
        this.scriptView = null;
        if (this.autorunDisposer) {
            this.autorunDisposer();
        }
        if (this.reactionDisposer) {
            this.reactionDisposer();
        }
        this.undoManager.onTerminate();
        this.history.onTerminate();
    }

    render() {
        if (!this.editor) {
            this.editor = <App appStore={this} />;
        }
        return this.editor;
    }

    @bind
    onSave() {
        if (this.undoManager.modified) {
            this.undoManager.commit();
        }
    }

    @bind
    onBeforeClose() {
        this.undoManager.confirmSave(() => {
            EEZStudio.electron.ipcRenderer.send("readyToClose");
        });
    }

    @bind
    onDeleteShortcut() {
        if ($(document.activeElement).hasClass("EezStudio_History_Container")) {
            this.history.deleteSelectedHistoryItems();
        } else if ($(document.activeElement).hasClass("EezStudio_DeletedHistory_Container")) {
            this.deletedItemsHistory.deleteSelectedHistoryItems();
        }
    }

    getFiltersFromLocalStorage(): Filters {
        const filters = new Filters();

        let filtersJSON = localStorage.getItem(`instrument/${this.instrument!.id}/window/filters`);
        if (filtersJSON) {
            try {
                Object.assign(filters, JSON.parse(filtersJSON));
            } catch (err) {
                console.error("getFiltersFromLocalStorage", err);
            }
        }

        return filters;
    }

    @action
    toggleHelpVisible() {
        this.helpVisible = !this.helpVisible;
        localStorage.setItem(
            `instrument/${this.instrument!.id}/window/help-visible`,
            this.helpVisible ? "1" : "0"
        );
    }

    @action
    toggleSearchVisible() {
        this.searchVisible = !this.searchVisible;
        localStorage.setItem(
            `instrument/${this.instrument!.id}/window/search-visible`,
            this.searchVisible ? "1" : "0"
        );
    }

    @action
    toggleFiltersVisible() {
        this.filtersVisible = !this.filtersVisible;
        localStorage.setItem(
            `instrument/${this.instrument!.id}/window/filters-visible`,
            this.filtersVisible ? "1" : "0"
        );
    }

    @action
    setSearchViewSection(value: "calendar" | "sessions") {
        this.searchViewSection = value;
        localStorage.setItem(`instrument/${this.instrument!.id}/window/search/view-section`, value);
    }

    @action
    selectHistoryItems(specification: SelectHistoryItemsSpecification | undefined) {
        this.selectHistoryItemsSpecification = specification;
        this.selectedHistoryItems.clear();
    }

    isHistoryItemSelected(id: string) {
        return this.selectedHistoryItems.has(id);
    }

    @action
    selectHistoryItem(id: string, selected: boolean) {
        if (selected) {
            this.selectedHistoryItems.set(id, true);
        } else {
            this.selectedHistoryItems.delete(id);
        }
    }

    moveToTopOfConnectionHistory() {
        if (this.terminal) {
            this.terminal.moveToTopOfConnectionHistory();
        }
    }

    moveToBottomOfConnectionHistory() {
        if (this.terminal) {
            this.terminal.moveToBottomOfConnectionHistory();
        }
    }

    showHistoryItem(historyItem: IHistoryItem) {
        if (this.terminal) {
            this.terminal.showHistoryItem(historyItem);
        }
    }
}
