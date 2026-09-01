// oxlint-disable oxc/no-async-await -- async/await required by transaction callbacks, test callbacks, and tryPromise wrappers
import { describe, expect, it, vi } from "vitest";
import { Effect, Exit } from "effect";

import {
  encodeScgiRequest,
  makeHttpTransport,
  makeTransportFromUrl,
  splitScgiResponse,
} from "@/features/operations/rtorrent/scgi-transport.ts";
import {
  decodeXmlRpcResponse,
  encodeXmlRpcCall,
  int,
  str,
} from "@/features/operations/rtorrent/xmlrpc.ts";
import { makeRtorrentClient } from "@/features/operations/rtorrent/rtorrent-client.ts";
import type { ScgiTransportShape } from "@/features/operations/rtorrent/scgi-transport.ts";

const methodResponse = (payload: string) =>
  `<?xml version="1.0"?><methodResponse><params><param><value>${payload}</value></param></params></methodResponse>`;

type RecordedCall = { method: string; params: readonly string[] };

function makeStubTransport(responseBody: string, calls?: Array<RecordedCall>): ScgiTransportShape {
  return {
    request: (xml: string) =>
      Effect.sync(() => {
        const methodMatch = /<methodName>([^<]+)<\/methodName>/.exec(xml);
        const stringParams = [
          ...xml.matchAll(/<param><value>(?:<string>|<i8>|<int>)?([^<]*)/g),
        ].map((match) => match[1] ?? "");

        calls?.push({ method: methodMatch?.[1] ?? "", params: stringParams });

        return responseBody;
      }),
  };
}

function makeTestClient(transport: ScgiTransportShape, options?: { savePath?: string }) {
  const exit = Effect.runSyncExit(makeRtorrentClient(transport, options));
  if (exit._tag !== "Success") {
    throw new Error("makeRtorrentClient unexpectedly failed in test");
  }
  return exit.value;
}

function expectSuccess<A, E>(exit: Exit.Exit<A, E>): A {
  if (exit._tag !== "Success") {
    throw new Error(`Expected success but failed with: ${String(exit.cause)}`);
  }
  return exit.value;
}

const runPromiseExit = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromiseExit(effect);

describe("scgi-transport", () => {
  it("encodes netstring-framed SCGI headers", () => {
    const encoded = encodeScgiRequest({ CONTENT_LENGTH: "5", SCGI: "1" }, "hello");

    const text = Buffer.from(encoded).toString("utf8");
    // netstring: "24:" + NUL-terminated header pairs + "," + body
    expect(text).toBe("24:CONTENT_LENGTH\u00005\u0000SCGI\u00001\u0000,hello");
  });

  it("splits HTTP-style header block from the XML payload", () => {
    const raw = "Status: 200 OK\r\nContent-Length: 4\r\n\r\n<xml>";
    expect(splitScgiResponse(raw)).toBe("<xml>");
  });

  it("returns the body unchanged when no header block exists", () => {
    expect(splitScgiResponse("<xml/>")).toBe("<xml/>");
  });

  it("resolves http(s) URLs to the reverse-proxy transport and scgi:// to raw SCGI", async () => {
    const http = expectSuccess(
      await runPromiseExit(makeTransportFromUrl("https://rtorrent.local/RPC2")),
    );
    expect(http.request).toBeTypeOf("function");

    const tcp = expectSuccess(await runPromiseExit(makeTransportFromUrl("scgi://localhost:5000")));
    expect(tcp.request).toBeTypeOf("function");

    const unix = expectSuccess(await runPromiseExit(makeTransportFromUrl("scgi:///tmp/rt.sock")));
    expect(unix.request).toBeTypeOf("function");

    const invalidExit = await runPromiseExit(makeTransportFromUrl("ftp://nope"));
    expect(invalidExit._tag).toBe("Failure");

    const badScgiExit = await runPromiseExit(makeTransportFromUrl("scgi://host:notaport"));
    expect(badScgiExit._tag).toBe("Failure");
  });

  it("posts XML to reverse-proxied endpoints and maps failures", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      requests.push({ url, init });
      return Promise.resolve(new Response(methodResponse("<i8>0</i8>"), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const transport = makeHttpTransport("https://rtorrent.local/RPC2");
    const reply = expectSuccess(
      await runPromiseExit(transport.request(encodeXmlRpcCall("d.name", [str("feed")]))),
    );
    expect(reply).toContain("<i8>0</i8>");
    expect(fetchMock).toHaveBeenCalledOnce();

    const first = requests[0];
    expect(first?.url).toBe("https://rtorrent.local/RPC2");
    expect(first?.init.method).toBe("POST");
    expect(new Headers(first?.init.headers).get("Content-Type")).toBe("text/xml");

    vi.unstubAllGlobals();
  });

  it("fails the http transport on non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("nope", { status: 401 }))),
    );

    const exit = await runPromiseExit(
      makeHttpTransport("https://rtorrent.local/RPC2").request("<x/>"),
    );
    expect(exit._tag).toBe("Failure");

    vi.unstubAllGlobals();
  });
});

describe("xmlrpc", () => {
  it("decodes multicall struct rows with i8 fields", async () => {
    const body = methodResponse(
      `<array><data>
        <value><struct>
          <member><name>d.hash</name><value><string>feed</string></value></member>
          <member><name>d.size_bytes</name><value><i8>100</i8></value></member>
        </struct></value>
        <value><struct>
          <member><name>d.hash</name><value><string>beef</string></value></member>
          <member><name>d.size_bytes</name><value><i8>200</i8></value></member>
        </struct></value>
      </data></array>`,
    );

    const value = expectSuccess(await runPromiseExit(decodeXmlRpcResponse(body)));
    expect(value.kind).toBe("array");
    expect(value.arrayValue).toHaveLength(2);
    expect(value.arrayValue?.[0]?.structValue?.["d.hash"]).toEqual({
      kind: "string",
      stringValue: "feed",
    });
    expect(value.arrayValue?.[0]?.structValue?.["d.size_bytes"]).toEqual({
      kind: "int",
      intValue: 100,
    });
  });

  it("decodes arrays with a single collapsed element", async () => {
    const body = methodResponse(`<array><data><value><string>only</string></value></data></array>`);
    const value = expectSuccess(await runPromiseExit(decodeXmlRpcResponse(body)));
    expect(value.arrayValue).toEqual([{ kind: "string", stringValue: "only" }]);
  });

  it("decodes an empty array", async () => {
    const value = expectSuccess(
      await runPromiseExit(decodeXmlRpcResponse(methodResponse(`<array><data></data></array>`))),
    );
    expect(value.arrayValue).toEqual([]);
  });

  it("fails on fault responses", async () => {
    const body = `<?xml version="1.0"?><methodResponse><fault><value><struct>
      <member><name>faultString</name><value><string>boom</string></value></member>
    </struct></value></fault></methodResponse>`;

    const exit = await runPromiseExit(decodeXmlRpcResponse(body));
    expect(exit._tag).toBe("Failure");
  });

  it("escapes XML-sensitive characters in params", () => {
    const call = encodeXmlRpcCall("load.start", [str(""), str("magnet:?a=1&b=<2>")]);
    expect(call).toContain("magnet:?a=1&amp;b=&lt;2&gt;");
    expect(call).toContain("<methodName>load.start</methodName>");
  });

  it("renders integer params", () => {
    const call = encodeXmlRpcCall("t.set", [str("hash"), int(60)]);
    expect(call).toContain("<param><value><int>60</int></value></param>");
  });
});

const torrentRow = (cells: string) =>
  methodResponse(`<array><data><value><array><data>${cells}</data></array></value></data></array>`);

// Row order mirrors TORRENT_CALL_KEYS: name, hash, base_path, size, left,
// down.rate, is_open, is_active, complete, message, directory.
const torrentCells = (overrides: Partial<Record<string, string>> = {}) => {
  const cells: Record<string, string> = {
    complete: `<value><i8>0</i8></value>`,
    directory: `<value><string>/data</string></value>`,
    downRate: `<value><i8>1024</i8></value>`,
    hash: `<value><string>FEEDFACE</string></value>`,
    isActive: `<value><i8>1</i8></value>`,
    isOpen: `<value><i8>1</i8></value>`,
    left: `<value><i8>10</i8></value>`,
    message: `<value><string></string></value>`,
    name: `<value><string>Ubuntu ISO</string></value>`,
    base_path: `<value><string>/data/ubuntu</string></value>`,
    size: `<value><i8>100</i8></value>`,
    ...overrides,
  };
  return [
    cells["name"],
    cells["hash"],
    cells["base_path"],
    cells["size"],
    cells["left"],
    cells["downRate"],
    cells["isOpen"],
    cells["isActive"],
    cells["complete"],
    cells["message"],
    cells["directory"],
  ].join("\n");
};

describe("rtorrent-client", () => {
  it("maps multicall rows into normalized snapshots", () => {
    const calls: Array<RecordedCall> = [];
    const client = makeTestClient(makeStubTransport(torrentRow(torrentCells()), calls));

    const torrents = Effect.runSync(client.listTorrents());
    expect(calls[0]?.method).toBe("d.multicall2");
    // Empty view so torrents in every view are listed (Sonarr's call shape).
    expect(calls[0]?.params[0]).toBe("");
    expect(calls[0]?.params[1]).toBe("");
    expect(torrents).toHaveLength(1);

    const torrent = torrents[0]!;
    expect(torrent.hash).toBe("feedface");
    expect(torrent.name).toBe("Ubuntu ISO");
    expect(torrent.progress).toBeCloseTo(0.9);
    expect(torrent.state).toBe("downloading");
    expect(torrent.contentPath).toBeNull();
    expect(torrent.savePath).toBe("/data");
    expect(torrent.rawState).toBe("downloading");
    expect(torrent.downloadedBytes).toBe(90);
    expect(torrent.size).toBe(100);
    expect(torrent.speed).toBe(1024);
    expect(torrent.eta).toBe(Math.ceil(10 / 1024));
  });

  it("marks completed torrents as completed with a content path", () => {
    const client = makeTestClient(
      makeStubTransport(
        torrentRow(
          torrentCells({
            complete: `<value><i8>1</i8></value>`,
            downRate: `<value><i8>0</i8></value>`,
            isActive: `<value><i8>0</i8></value>`,
            left: `<value><i8>0</i8></value>`,
          }),
        ),
      ),
    );

    const [torrent] = Effect.runSync(client.listTorrents());
    expect(torrent?.state).toBe("completed");
    expect(torrent?.contentPath).toBe("/data/ubuntu");
  });

  it("maps inactive open torrents to paused (Sonarr's mapping)", () => {
    const client = makeTestClient(
      makeStubTransport(
        torrentRow(
          torrentCells({
            isActive: `<value><i8>0</i8></value>`,
            downRate: `<value><i8>0</i8></value>`,
          }),
        ),
      ),
    );

    const [torrent] = Effect.runSync(client.listTorrents());
    expect(torrent?.state).toBe("paused");
    expect(torrent?.rawState).toBe("idle");
  });

  it("maps stopped torrents to paused with stopped raw state", () => {
    const client = makeTestClient(
      makeStubTransport(
        torrentRow(
          torrentCells({
            isActive: `<value><i8>0</i8></value>`,
            isOpen: `<value><i8>0</i8></value>`,
            downRate: `<value><i8>0</i8></value>`,
          }),
        ),
      ),
    );

    const [torrent] = Effect.runSync(client.listTorrents());
    expect(torrent?.state).toBe("paused");
    expect(torrent?.rawState).toBe("stopped");
  });

  it("maps error messages to the error state", () => {
    const client = makeTestClient(
      makeStubTransport(
        torrentRow(
          torrentCells({
            message: `<value><string>Torrent error: tracker down</string></value>`,
          }),
        ),
      ),
    );

    const [torrent] = Effect.runSync(client.listTorrents());
    expect(torrent?.state).toBe("error");
    expect(torrent?.rawState).toBe("Torrent error: tracker down");
  });

  it("lists torrent files from f.multicall", () => {
    const calls: Array<RecordedCall> = [];
    const client = makeTestClient(
      makeStubTransport(
        torrentRow(
          `<value><string>Season 01/EP 01.mkv</string></value>
           <value><i8>100</i8></value>
           <value><i8>4</i8></value>
           <value><i8>4</i8></value>`,
        ),
        calls,
      ),
    );

    const files = Effect.runSync(client.listTorrentContents("feed"));
    expect(calls[0]?.method).toBe("f.multicall");
    expect(calls[0]?.params[0]).toBe("feed");
    expect(files).toEqual([{ name: "Season 01/EP 01.mkv", progress: 1, size: 100 }]);
  });

  it("sends load.start for magnet adds and waits for magnet resolution", async () => {
    const calls: Array<RecordedCall> = [];
    const magnet = "magnet:?xt=urn:btih:" + "a".repeat(40);
    // Every request (load.start and the d.name polls) succeeds.
    const responses = [methodResponse(`<i8>0</i8>`), methodResponse(`<string>Ubuntu ISO</string>`)];
    const transport: ScgiTransportShape = {
      request: (xml) =>
        Effect.sync(() => {
          const methodMatch = /<methodName>([^<]+)<\/methodName>/.exec(xml);
          const stringParams = [
            ...xml.matchAll(/<param><value>(?:<string>|<i8>|<int>)?([^<]*)/g),
          ].map((match) => match[1] ?? "");
          calls.push({ method: methodMatch?.[1] ?? "", params: stringParams });
          const response = responses[calls.length - 1] ?? responses[responses.length - 1]!;
          return response;
        }),
    };

    await Effect.runPromise(makeTestClient(transport).addTorrentUrl(magnet));
    expect(calls[0]?.method).toBe("load.start");
    expect(calls[0]?.params).toEqual(["", magnet]);
    // Magnet hash was polled until it resolved.
    expect(calls[1]?.method).toBe("d.name");
  });

  it("fails the add when load.start returns non-zero", async () => {
    const client = makeTestClient(makeStubTransport(methodResponse(`<i8>1</i8>`)));

    const exit = await runPromiseExit(
      client.addTorrentUrl("magnet:?xt=urn:btih:" + "b".repeat(40)),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("binds the configured save path via d.directory_base.set on load.start", async () => {
    const calls: Array<RecordedCall> = [];
    const client = makeTestClient(makeStubTransport(methodResponse(`<i8>0</i8>`), calls), {
      savePath: "/downloads/anime",
    });

    await Effect.runPromise(client.addTorrentUrl("https://example.com/torrent.torrent"));
    expect(calls[0]?.method).toBe("load.start");
    expect(calls[0]?.params).toEqual([
      "",
      "https://example.com/torrent.torrent",
      "d.directory_base.set=/downloads/anime",
    ]);
  });

  it("omits the directory binding when no save path is configured", async () => {
    const calls: Array<RecordedCall> = [];
    const client = makeTestClient(makeStubTransport(methodResponse(`<i8>0</i8>`), calls));

    await Effect.runPromise(client.addTorrentUrl("https://example.com/torrent.torrent"));
    expect(calls[0]?.params).toEqual(["", "https://example.com/torrent.torrent"]);
  });

  it("erases torrents via d.erase", async () => {
    const calls: Array<RecordedCall> = [];
    const client = makeTestClient(makeStubTransport(methodResponse(`<i8>0</i8>`), calls));

    await Effect.runPromise(client.deleteTorrent("feed", false));
    expect(calls[0]?.method).toBe("d.erase");
    expect(calls[0]?.params).toEqual(["feed"]);
  });
});
