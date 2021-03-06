const fileType = require("file-type");

import { getFileNameExtension } from "shared/util";
import { FileState } from "instrument/connection/file-state";

export const SAMPLE_LENGTH = 4096;

export const MIME_EEZ_DLOG = "application/eez-dlog";

function getUint8Array(data: string | Buffer) {
    if (typeof data === "string") {
        return new Uint8Array(new Buffer(data.slice(0, SAMPLE_LENGTH), "binary"));
    } else {
        return new Uint8Array(data);
    }
}

function isDlog(dataSample: Uint8Array) {
    const DLOG_MAGIC1 = 0x2d5a4545;
    const DLOG_MAGIC2 = 0x474f4c44;
    const DLOG_VERSION = 0x0001;

    let i = 0;

    function isEqual16(value: number) {
        const result =
            dataSample[i] === (value & 0xff) && dataSample[i + 1] === ((value >> 8) & 0xff);

        i += 2;

        return result;
    }

    function isEqual32(value: number) {
        const result =
            dataSample[i] === (value & 0xff) &&
            dataSample[i + 1] === ((value >> 8) & 0xff) &&
            dataSample[i + 2] === ((value >> 16) & 0xff) &&
            dataSample[i + 3] === value >> 24;

        i += 4;

        return result;
    }

    return isEqual32(DLOG_MAGIC1) && isEqual32(DLOG_MAGIC2) && isEqual16(DLOG_VERSION);
}

export function detectFileType(data: string | Buffer, fileName?: string) {
    const dataSample = getUint8Array(data);

    if (isDlog(dataSample)) {
        return {
            ext: "dlog",
            mime: MIME_EEZ_DLOG
        };
    }

    let type = fileType(dataSample, "binary");

    if (type) {
        return type;
    }

    if (isCSV(data)) {
        return {
            ext: "csv",
            mime: "text/csv"
        };
    }

    let ext: string | undefined = undefined;
    if (fileName) {
        ext = getFileNameExtension(fileName);
        if (ext) {
            if (ext.toLowerCase() === "raw") {
                return {
                    ext,
                    mime: "application/eez-raw"
                };
            }
        }
    }

    return {
        ext,
        mime: "application/octet-stream"
    };
}

export function convertToPng(data: string) {
    const BMP = require("bmp-js");
    var bmpData = BMP.decode(Buffer.from(data, "binary"));
    const PNG = require("pngjs").PNG;
    var png = new PNG({ width: bmpData.width, height: bmpData.height });

    var srcBuffer = bmpData.data;
    var dstBuffer = new Buffer(bmpData.width * bmpData.height * 4);
    for (let i = 0, j = 0; i < srcBuffer.length; i += 4) {
        dstBuffer[j++] = srcBuffer[i + 0];
        dstBuffer[j++] = srcBuffer[i + 1];
        dstBuffer[j++] = srcBuffer[i + 2];
        dstBuffer[j++] = srcBuffer[i + 3];
    }

    png.data = dstBuffer;
    var pngData = PNG.sync.write(png);
    data = pngData.toString("binary");
    return data;
}

export function isCSV(data: string | Buffer) {
    if (data instanceof Buffer) {
        data = data.toString("binary");
    }

    // is CSV file?
    let lines = data.split("\n");
    if (lines.length === 0) {
        return false;
    }
    for (let line of lines) {
        let numbers = line.split(",");
        if (numbers.find(number => number !== "=" && isNaN(parseFloat(number)))) {
            return false;
        }
    }
    return true;
}

export function checkMime(message: string, list: string[]) {
    const fileState: FileState = JSON.parse(message);
    if (fileState.state !== "success" && fileState.state !== "upload-finish") {
        return false;
    }

    const mime =
        fileState &&
        (typeof fileState.fileType === "string"
            ? fileState.fileType
            : fileState.fileType && fileState.fileType.mime);

    return list.indexOf(mime) !== -1;
}
