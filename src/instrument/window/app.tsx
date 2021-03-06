import * as React from "react";
import { computed } from "mobx";
import { observer } from "mobx-react";
import { bind } from "bind-decorator";

import { AppRootComponent } from "shared/ui/app";
import { AlertDanger } from "shared/ui/alert";
import { Loader } from "shared/ui/loader";
import { Toolbar } from "shared/ui/toolbar";

import { InstrumentObject } from "instrument/instrument-object";
import { AppStore } from "instrument/window/app-store";
import { getConnection } from "instrument/window/connection";
import { IInstrumentWindowNavigationItem } from "instrument/window/navigation-store";

////////////////////////////////////////////////////////////////////////////////

@observer
export class AppBar extends React.Component<
    {
        instrument: InstrumentObject;
        selectedItem: IInstrumentWindowNavigationItem;
    },
    {}
> {
    get connection() {
        return getConnection(this.props.instrument);
    }

    @bind
    handleConnectClick() {
        this.connection.openConnectDialog();
    }

    @bind
    handleDisconnectClick() {
        this.props.instrument.connection.disconnect();
    }

    render() {
        let connectionStatus;
        if (this.props.instrument.connection.isIdle) {
            connectionStatus = (
                <div>
                    <button className="btn btn-success btn-sm" onClick={this.handleConnectClick}>
                        Connect
                    </button>
                </div>
            );
        } else if (this.props.instrument.connection.isConnected) {
            connectionStatus = (
                <div>
                    <div>{this.connection.interfaceInfo}</div>
                    <button className="btn btn-danger btn-sm" onClick={this.handleDisconnectClick}>
                        Disconnect
                    </button>
                </div>
            );
        } else {
            connectionStatus = (
                <div>
                    <div style={{ display: "inline-block" }}>
                        <Loader size={25} />
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={this.handleDisconnectClick}>
                        Abort
                    </button>
                </div>
            );
        }

        let toolbarButtons =
            this.props.selectedItem && this.props.selectedItem.renderToolbarButtons();

        return (
            <div className="EezStudio_ConnectionBar">
                <div>
                    <img src={this.props.instrument.image} draggable={false} />
                </div>

                <div>
                    <div>{this.props.instrument.name}</div>
                    {connectionStatus}
                </div>

                <Toolbar>{toolbarButtons}</Toolbar>
            </div>
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

@observer
export class App extends React.Component<{ appStore: AppStore }> {
    constructor(props: any) {
        super(props);
    }

    @bind
    onSelectionChange(item: IInstrumentWindowNavigationItem) {
        this.props.appStore.navigationStore.mainNavigationSelectedItem = item;
    }

    @computed
    get appBar() {
        const instrument = this.props.appStore.instrument;
        if (!instrument) {
            return undefined;
        }

        return (
            <div>
                {instrument.connection.error && (
                    <AlertDanger
                        className="mb-0"
                        onDismiss={() => instrument.connection.dismissError()}
                    >
                        {instrument.connection.error}
                    </AlertDanger>
                )}
                {
                    <AppBar
                        instrument={instrument}
                        selectedItem={
                            this.props.appStore.navigationStore.mainNavigationSelectedItem
                        }
                    />
                }
            </div>
        );
    }

    render() {
        return (
            <AppRootComponent
                className="EezStudio_AppRootComponent"
                navigationItems={this.props.appStore.navigationStore.navigationItems}
                appBar={this.appBar}
                selectedItem={this.props.appStore.navigationStore.mainNavigationSelectedItem}
                onSelectionChange={this.onSelectionChange}
            />
        );
    }
}
