import * as React from "react";
import { observable, computed, autorun, toJS } from "mobx";

import { objectEqual, formatDateTimeLong } from "shared/util";
import { capitalize } from "shared/string";
import { logUpdate, IActivityLogEntry } from "shared/activity-log";
import { IUnit, TIME_UNIT, VOLTAGE_UNIT, CURRENT_UNIT, POWER_UNIT } from "shared/units";

import {
    AxisController,
    ChartController,
    ChartMode,
    ChartsController,
    IAxisModel,
    ZoomMode,
    LineController
} from "shared/ui/chart";

import { AppStore } from "instrument/window/app-store";
import { ChartPreview } from "instrument/window/chart-preview";

import { FileHistoryItem } from "instrument/window/history/items/file";

import { MIME_EEZ_DLOG, checkMime } from "instrument/connection/file-type";

import { WaveformFormat, initValuesAccesor } from "instrument/window/waveform/buffer";
import { ViewOptions } from "instrument/window/waveform/generic";
import { IWaveform } from "instrument/window/waveform/render";
import { WaveformTimeAxisModel } from "instrument/window/waveform/time-axis";
import { WaveformLineView } from "instrument/window/waveform/line-view";
import { WaveformToolbar } from "instrument/window/waveform/toolbar";

////////////////////////////////////////////////////////////////////////////////

export function isDlogWaveform(activityLogEntry: IActivityLogEntry) {
    return checkMime(activityLogEntry.message, [MIME_EEZ_DLOG]);
}

////////////////////////////////////////////////////////////////////////////////

export class DlogWaveformAxisModel implements IAxisModel {
    constructor(public iChannel: number, public unit: IUnit) {}

    get minValue() {
        return 0;
    }

    get maxValue() {
        if (this.unit.name === "voltage") {
            return 40;
        }
        if (this.unit.name === "current") {
            return 5;
        }
        return 200;
    }

    get defaultFrom() {
        return this.minValue;
    }

    get defaultTo() {
        return this.maxValue;
    }

    @observable
    dynamic: {
        zoomMode: ZoomMode;
        from: number;
        to: number;
    } = {
        zoomMode: "default",
        from: 0,
        to: 0
    };

    @observable
    fixed: {
        zoomMode: ZoomMode;
        subdivisionOffset: number;
        subdivisonScale: number;
    } = {
        zoomMode: "default",
        subdivisionOffset: 0,
        subdivisonScale: 0
    };
    defaultSubdivisionOffset: number | undefined = undefined;
    defaultSubdivisionScale: number | undefined = undefined;

    @computed
    get label() {
        return `Channel ${this.iChannel + 1} ${capitalize(this.unit.name)}`;
    }

    @computed
    get color() {
        return this.unit.color;
    }

    @computed
    get colorInverse() {
        return this.unit.colorInverse;
    }
}

////////////////////////////////////////////////////////////////////////////////

class DlogWaveformLineController extends LineController {
    constructor(
        public id: string,
        public dlogWaveform: DlogWaveform,
        public yAxisController: AxisController,
        channel: IChannel,
        values: any
    ) {
        super(id, yAxisController);

        let rowOffset = 7 * 4;
        const rowBytes =
            4 * ((this.dlogWaveform.hasJitterColumn ? 1 : 0) + this.dlogWaveform.channels.length);
        const length = (values.length - rowOffset) / rowBytes;

        if (this.dlogWaveform.hasJitterColumn) {
            rowOffset += 4; // skip jitter column
        }

        for (let i = 0; i < this.dlogWaveform.channels.length; ++i) {
            if (
                this.dlogWaveform.channels[i].iChannel === channel.iChannel &&
                this.dlogWaveform.channels[i].unit === channel.unit
            ) {
                break;
            }
            rowOffset += 4;
        }

        this.waveform = {
            isVisible: true,
            format: WaveformFormat.EEZ_DLOG,
            values,
            length,
            value: undefined as any,
            offset: rowOffset,
            scale: rowBytes,
            samplingRate: this.dlogWaveform.samplingRate,
            waveformData: undefined as any
        };

        initValuesAccesor(this.waveform);
    }

    waveform: IWaveform;

    @computed
    get yMin(): number {
        return this.yAxisController.axisModel.minValue;
    }

    @computed
    get yMax(): number {
        return this.yAxisController.axisModel.maxValue;
    }

    render(): JSX.Element {
        return <WaveformLineView key={this.id} waveformLineController={this} useWorker={true} />;
    }
}

////////////////////////////////////////////////////////////////////////////////

class DlogWaveformChartsController extends ChartsController {
    constructor(public dlogWaveform: DlogWaveform, mode: ChartMode, xAxisModel: IAxisModel) {
        super(mode, xAxisModel, dlogWaveform.viewOptions);
    }
}

////////////////////////////////////////////////////////////////////////////////

const buffer = Buffer.allocUnsafe(4);

function readFloat(data: any, i: number) {
    buffer[0] = data[i];
    buffer[1] = data[i + 1];
    buffer[2] = data[i + 2];
    buffer[3] = data[i + 3];
    return buffer.readFloatLE(0);
}

function readUInt16(data: any, i: number) {
    buffer[0] = data[i];
    buffer[1] = data[i + 1];
    return buffer.readUInt16LE(0);
}

function readUInt32(data: any, i: number) {
    buffer[0] = data[i];
    buffer[1] = data[i + 1];
    buffer[2] = data[i + 2];
    buffer[3] = data[i + 3];
    return buffer.readUInt32LE(0);
}

interface IDlogChart {}

interface IChannel {
    iChannel: number;
    unit: IUnit;
    axisModel: IAxisModel;
}

export class DlogWaveform extends FileHistoryItem {
    constructor(activityLogEntry: IActivityLogEntry | FileHistoryItem, appStore: AppStore) {
        super(activityLogEntry, appStore);
        if (activityLogEntry instanceof FileHistoryItem) {
            this.isVisible = activityLogEntry.isVisible;
        }

        // save viewOptions when changed
        autorun(() => {
            let message = JSON.parse(this.message);
            let viewOptions = toJS(this.viewOptions);

            if (!objectEqual(message.viewOptions, viewOptions)) {
                logUpdate(
                    {
                        id: this.id,
                        oid: this.oid,
                        message: JSON.stringify(
                            Object.assign(message, {
                                viewOptions
                            })
                        )
                    },
                    {
                        undoable: false
                    }
                );
            }
        });
    }

    @computed
    get values() {
        if (!this.isVisible) {
            return undefined;
        }

        if (!this.transferSucceeded) {
            return undefined;
        }

        if (typeof this.data === "string") {
            return new Uint8Array(new Buffer(this.data, "binary").buffer);
        }

        return this.data;
    }

    readFloat(offset: number) {
        return readFloat(this.values, offset);
    }

    readUInt32(offset: number) {
        return readUInt32(this.values, offset);
    }

    readUInt16(offset: number) {
        return readUInt16(this.values, offset);
    }

    @computed
    get period() {
        return this.values ? this.readFloat(16) : 1;
    }

    @computed
    get samplingRate() {
        return 1 / this.period;
    }

    @computed
    get time() {
        return this.values ? this.readFloat(20) : 0;
    }

    @computed
    get startTime() {
        return this.values ? new Date(this.readUInt32(24) * 1000) : new Date();
    }

    @computed
    get channels() {
        const channels: IChannel[] = [];

        if (this.values) {
            const columns = this.readUInt32(12);
            for (let iChannel = 0; iChannel < 8; ++iChannel) {
                if (columns & (1 << (4 * iChannel))) {
                    channels.push({
                        iChannel,
                        unit: VOLTAGE_UNIT,
                        axisModel: new DlogWaveformAxisModel(iChannel, VOLTAGE_UNIT)
                    });
                }

                if (columns & (2 << (4 * iChannel))) {
                    channels.push({
                        iChannel,
                        unit: CURRENT_UNIT,
                        axisModel: new DlogWaveformAxisModel(iChannel, CURRENT_UNIT)
                    });
                }

                if (columns & (4 << (4 * iChannel))) {
                    channels.push({
                        iChannel,
                        unit: POWER_UNIT,
                        axisModel: new DlogWaveformAxisModel(iChannel, POWER_UNIT)
                    });
                }
            }
        }

        return channels;
    }

    @observable
    get hasJitterColumn() {
        if (!this.values) {
            return false;
        }
        const flag = this.readUInt16(10);
        return !!(flag & 0x0001);
    }

    @computed
    get length() {
        if (!this.values) {
            return 0;
        }
        let rowOffset = 7 * 4;
        const rowBytes = 4 * ((this.hasJitterColumn ? 1 : 0) + this.channels.length);
        return (this.values.length - rowOffset) / rowBytes;
    }

    @observable charts: IDlogChart = [];

    @computed
    get description() {
        if (!this.values) {
            return null;
        }

        return (
            <div>
                `Start time: ${formatDateTimeLong(this.startTime)}, Period: ${TIME_UNIT.formatValue(
                    this.period,
                    4
                )}, Duration: ${TIME_UNIT.formatValue(this.time)}`
            </div>
        );
    }

    createChartController(chartsController: ChartsController, channel: IChannel) {
        const id = `ch${channel.iChannel + 1}_${channel.unit.name}`;

        const chartController = new ChartController(chartsController, id);

        chartController.createYAxisController(channel.unit, channel.axisModel);

        chartController.lineControllers.push(
            new DlogWaveformLineController(
                "waveform-" + chartController.yAxisController.position,
                this,
                chartController.yAxisController,
                channel,
                this.values || ""
            )
        );

        return chartController;
    }

    @computed
    get viewOptions() {
        let message = JSON.parse(this.message);
        let viewOptions: ViewOptions;
        if (message.viewOptions) {
            viewOptions = new ViewOptions(message.viewOptions);
        } else {
            viewOptions = new ViewOptions();
        }
        return viewOptions;
    }

    xAxisModel = new WaveformTimeAxisModel(this);

    createChartsController(mode: ChartMode): ChartsController {
        const chartsController = new DlogWaveformChartsController(this, mode, this.xAxisModel);

        this.xAxisModel.chartsController = chartsController;

        chartsController.chartControllers = this.channels.map(channel =>
            this.createChartController(chartsController, channel)
        );

        return chartsController;
    }

    renderToolbar(chartsController: ChartsController): JSX.Element {
        return <WaveformToolbar chartsController={chartsController} waveform={this} />;
    }

    get xAxisDefaultSubdivisionOffset(): number | undefined {
        return undefined;
    }

    get xAxisDefaultSubdivisionScale(): number | undefined {
        return undefined;
    }

    get yAxisDefaultSubdivisionOffset(): number | undefined {
        return undefined;
    }

    get yAxisDefaultSubdivisionScale(): number | undefined {
        return undefined;
    }

    get previewElement() {
        return <ChartPreview data={this} />;
    }
}
