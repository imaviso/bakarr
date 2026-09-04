// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { XMLParser } from "fast-xml-parser";

import { TorrentClientUnavailableError } from "@/features/operations/torrent/torrent-domain.ts";
import { Effect, Record } from "effect";

export interface XmlRpcValue {
  readonly kind: "int" | "string" | "boolean" | "double" | "array" | "struct";
  readonly intValue?: number | undefined;
  readonly stringValue?: string | undefined;
  readonly boolValue?: boolean | undefined;
  readonly arrayValue?: readonly XmlRpcValue[] | undefined;
  readonly structValue?: Readonly<Record<string, XmlRpcValue>> | undefined;
}

export const int = (value: number): XmlRpcValue => ({ kind: "int", intValue: value });
export const str = (value: string): XmlRpcValue => ({ kind: "string", stringValue: value });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getField(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

export function encodeXmlRpcCall(methodName: string, params: readonly XmlRpcValue[]): string {
  const renderValue = (value: XmlRpcValue): string => {
    switch (value.kind) {
      case "int":
        return `<int>${value.intValue ?? 0}</int>`;
      case "string":
        return `<string>${escapeXml(value.stringValue ?? "")}</string>`;
      case "boolean":
        return `<boolean>${value.boolValue ? 1 : 0}</boolean>`;
      case "double":
        return `<double>${value.intValue ?? 0}</double>`;
      case "array": {
        const items = (value.arrayValue ?? []).map(renderValue).join("");
        return `<array><data>${items}</data></array>`;
      }
      case "struct": {
        const members = Object.entries(value.structValue ?? {})
          .map(
            ([key, member]) =>
              `<member><name>${escapeXml(key)}</name>${renderValue(member)}</member>`,
          )
          .join("");
        return `<struct>${members}</struct>`;
      }
      default:
        throw new Error("Unknown XmlRpcValue kind");
    }
  };

  const renderedParams = params
    .map((param) => `<param><value>${renderValue(param)}</value></param>`)
    .join("");

  return `<?xml version="1.0"?>
<methodCall>
<methodName>${escapeXml(methodName)}</methodName>
<params>${renderedParams}</params>
</methodCall>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

const decodeError = (cause: unknown, message: string) =>
  TorrentClientUnavailableError.make({ cause, message });

/** fast-xml-parser shape: `{ string: "abc" }`, `{ i8: "100" }`, `{ array: { data } }`, `{ struct: { member } }`. */
type RawValue = {
  array?: unknown;
  boolean?: string;
  double?: string;
  int?: string;
  i8?: string;
  string?: string;
  struct?: unknown;
};

function toRawValue(value: unknown): RawValue {
  if (!isRecord(value)) return {};
  const out: RawValue = {};
  if ("array" in value) out.array = getField(value, "array");
  if ("boolean" in value) {
    const v = getField(value, "boolean");
    if (typeof v === "string") out.boolean = v;
  }
  if ("double" in value) {
    const v = getField(value, "double");
    if (typeof v === "string") out.double = v;
  }
  if ("int" in value) {
    const v = getField(value, "int");
    if (typeof v === "string") out.int = v;
  }
  if ("i8" in value) {
    const v = getField(value, "i8");
    if (typeof v === "string") out.i8 = v;
  }
  if ("string" in value) {
    const v = getField(value, "string");
    if (typeof v === "string") out.string = v;
  }
  if ("struct" in value) out.struct = getField(value, "struct");
  return out;
}

export const decodeXmlRpcResponse = Effect.fn("XmlRpc.decodeXmlRpcResponse")(function* (
  body: string,
) {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(body);
  } catch (cause) {
    return yield* decodeError(cause, "rTorrent returned malformed XML-RPC");
  }

  const parsedRecord = isRecord(parsed) ? parsed : undefined;
  const methodResponseRaw = parsedRecord ? getField(parsedRecord, "methodResponse") : undefined;
  const response = isRecord(methodResponseRaw) ? methodResponseRaw : undefined;

  if (response && getField(response, "fault") !== undefined) {
    return yield* decodeError(
      undefined,
      `rTorrent RPC fault: ${extractFaultString(getField(response, "fault"))}`,
    );
  }

  const paramsRaw = response ? getField(response, "params") : undefined;
  const paramsRecord = isRecord(paramsRaw) ? paramsRaw : undefined;
  if (paramsRecord === undefined || getField(paramsRecord, "param") === undefined) {
    return yield* decodeError(undefined, "rTorrent RPC response has no params");
  }

  return convertRpcValue(getField(paramsRecord, "param"));
});

function extractFaultString(fault: unknown): string {
  const faultRecord = isRecord(fault) ? fault : undefined;
  const valueRaw = faultRecord ? getField(faultRecord, "value") : undefined;
  const valueRecord = isRecord(valueRaw) ? valueRaw : undefined;
  const structRaw = valueRecord ? getField(valueRecord, "struct") : undefined;
  const structRecord = isRecord(structRaw) ? structRaw : undefined;
  const members = toList(structRecord ? getField(structRecord, "member") : undefined);
  for (const entry of members) {
    if (!isRecord(entry)) continue;
    const name = getField(entry, "name");
    if (name === "faultString") {
      const valueField = getField(entry, "value");
      const raw = toRawValue(valueField);
      return raw.string ?? "unknown fault";
    }
  }
  return "unknown fault";
}

function convertRpcValue(raw: unknown): XmlRpcValue {
  // <param> and <value> wrapper: param -> { value: {...} }, value may wrap again.
  let value: unknown = raw;
  for (let depth = 0; depth < 2; depth += 1) {
    if (!isRecord(value)) break;
    if (!("value" in value)) break;
    value = getField(value, "value");
  }

  if (value === undefined || value === null || value === "") {
    return { kind: "string", stringValue: "" };
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return scalarFromString(globalThis.String(value));
  }

  if (!isRecord(value)) {
    return { kind: "string", stringValue: "" };
  }

  const tagged = toRawValue(value);

  if (tagged.struct !== undefined) {
    const structValue: Record<string, XmlRpcValue> = {};
    const structRecord = isRecord(tagged.struct) ? tagged.struct : undefined;
    const memberField = structRecord ? getField(structRecord, "member") : undefined;
    const members = toList(memberField);
    for (const entry of members) {
      if (!isRecord(entry)) continue;
      const nameField = getField(entry, "name");
      if (typeof nameField !== "string") continue;
      const memberValue = getField(entry, "value");
      structValue[nameField] = convertRpcValue(memberValue);
    }
    return { kind: "struct", structValue };
  }

  if (tagged.array !== undefined) {
    const arrayRecord = isRecord(tagged.array) ? tagged.array : undefined;
    const dataRaw = arrayRecord ? getField(arrayRecord, "data") : undefined;
    const dataRecord = isRecord(dataRaw) ? dataRaw : undefined;
    const rawItems = dataRecord ? getField(dataRecord, "value") : undefined;
    const items = rawItems === undefined ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];
    return { kind: "array", arrayValue: items.map(convertRpcValue) };
  }

  return scalarFromString(
    tagged.string ?? tagged.int ?? tagged.i8 ?? tagged.double ?? tagged.boolean ?? "",
  );
}

/** fast-xml-parser collapses single children from arrays; re-list them. */
function toList(node: unknown): readonly unknown[] {
  if (node === undefined || node === null) return [];
  if (Array.isArray(node)) return node;
  return [node];
}

function scalarFromString(text: string): XmlRpcValue {
  if (text === "true") return { kind: "boolean", boolValue: true };
  if (text === "false") return { kind: "boolean", boolValue: false };
  if (/^-?\d+$/.test(text)) return { kind: "int", intValue: Number(text) };
  if (/^-?\d*\.\d+$/.test(text)) return { kind: "double", intValue: Number(text) };
  return { kind: "string", stringValue: text };
}

export function structGetString(value: XmlRpcValue, key: string): string | undefined {
  const member = value.structValue?.[key];
  if (member?.stringValue !== undefined) return member.stringValue;
  if (member?.intValue !== undefined) return globalThis.String(member.intValue);
  return undefined;
}

export function structGetInt(value: XmlRpcValue, key: string): number | undefined {
  const member = value.structValue?.[key];
  if (member?.intValue !== undefined) return member.intValue;
  if (member?.stringValue !== undefined && /^-?\d+$/.test(member.stringValue)) {
    return Number(member.stringValue);
  }
  return undefined;
}

export function expectArray(value: XmlRpcValue): readonly XmlRpcValue[] {
  if (value.kind !== "array") {
    throw new Error("Unexpected rTorrent RPC response shape: expected array");
  }
  return value.arrayValue ?? [];
}

export function expectString(value: XmlRpcValue): string {
  if (value.kind !== "string" && value.kind !== "int") {
    throw new Error("Unexpected rTorrent RPC response shape: expected scalar");
  }
  return value.stringValue ?? globalThis.String(value.intValue ?? "");
}
