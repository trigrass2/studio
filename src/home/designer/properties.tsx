import * as React from "react";
import { observer } from "mobx-react";
import * as classNames from "classnames";

import { Box } from "shared/ui/box";
import { PanelTitle } from "shared/ui/panel";
import { Splitter } from "shared/ui/splitter";

import { IObject } from "home/store";

import { History } from "home/history/history";

@observer
export class Properties extends React.Component<
    {
        selectedObjects: IObject[];
        className?: string;
    },
    {}
> {
    render() {
        let className = classNames("EezStudio_Workbench_Designer_Properties", this.props.className);

        if (this.props.selectedObjects.length === 0) {
            return <div className={className} />;
        }

        let history = (
            <Box direction="column" background="panel-header" style={{ height: "100%" }}>
                <PanelTitle title="History" />
                <Box scrollable={true} background="white">
                    <History
                        oids={this.props.selectedObjects.map(selectedObject => selectedObject.oid)}
                    />
                </Box>
            </Box>
        );

        if (this.props.selectedObjects.length === 1) {
            return (
                <Splitter
                    type="vertical"
                    sizes="100%|240px"
                    className={className}
                    persistId="home/designer/properties/splitter"
                >
                    {this.props.selectedObjects[0].details}
                    {history}
                </Splitter>
            );
        }

        return <div className={className}>{history}</div>;
    }
}
