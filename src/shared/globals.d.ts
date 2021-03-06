/// <reference path="../../node_modules/electron/electron.d.ts"/>

declare const EEZStudio: {
    title: string;
    electron: Electron.RendererInterface;
    require: any;
    windowType: string;
};

declare module "serialport";

declare module "quill";

declare module "react-visibility-sensor";

//
interface HTMLCanvasElement {
    transferControlToOffscreen(): HTMLCanvasElement;
}
interface CanvasRenderingContext2D {
    commit(): void;
}
