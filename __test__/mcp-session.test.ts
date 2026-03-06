import { EventEmitter } from "events";
import { spawn } from "child_process";
import { MCPSession } from "../commands/mcp/session";

jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));

jest.mock("ora", () => ({
  __esModule: true,
  default: () => ({
    start() {
      return this;
    },
    succeed: jest.fn(),
    fail: jest.fn(),
  }),
}));

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: jest.Mock };
  pid: number;
  killed: boolean;
  kill: jest.Mock;
};

const spawnMock = spawn as unknown as jest.Mock;

function createMockChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: jest.fn() };
  child.pid = 12345;
  child.killed = false;
  child.kill = jest.fn(() => {
    child.killed = true;
    return true;
  });
  return child;
}

const globalConfig = {
  verbose: false,
  quiet: true,
  color: false,
};

describe("MCPSession", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("allows initialize retry after initialization failure", async () => {
    const session = new MCPSession({}, globalConfig);
    const sendMessageSpy = jest
      .spyOn(session, "sendMessage")
      .mockRejectedValueOnce(new Error("init fail"))
      .mockResolvedValueOnce({
        jsonrpc: "2.0",
        id: 1,
        result: { ok: true },
      });

    await expect(session.initialize({ client: "first" })).rejects.toThrow(
      "Initialization failed: init fail"
    );

    await expect(session.initialize({ client: "second" })).resolves.toMatchObject({
      result: { ok: true },
    });

    expect(sendMessageSpy).toHaveBeenCalledTimes(2);
  });

  it("processes responses after notifications in the same chunk", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const session = new MCPSession({}, globalConfig);
    session.startMCPProcess("node", ["server.js"]);

    const responsePromise = session.sendMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "ping",
      params: {},
    });

    child.stdout.emit(
      "data",
      Buffer.from(
        '{"jsonrpc":"2.0","method":"notifications/progress"}\n' +
          '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n'
      )
    );

    await expect(responsePromise).resolves.toMatchObject({ id: 1, result: { ok: true } });
  });

  it("tracks callbacks for JSON-RPC id=0", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const session = new MCPSession({}, globalConfig);
    session.startMCPProcess("node", ["server.js"]);

    const responsePromise = session.sendMessage({
      jsonrpc: "2.0",
      id: 0,
      method: "ping",
      params: {},
    });

    child.stdout.emit("data", Buffer.from('{"jsonrpc":"2.0","id":0,"result":{"ok":true}}\n'));

    await expect(responsePromise).resolves.toMatchObject({ id: 0, result: { ok: true } });
  });

  it("does not throw from process error handlers and rejects pending requests", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const session = new MCPSession({}, globalConfig);
    session.startMCPProcess("node", ["server.js"]);

    const responsePromise = session.sendMessage({
      jsonrpc: "2.0",
      id: 7,
      method: "ping",
      params: {},
    });

    expect(() => child.emit("error", new Error("spawn failed"))).not.toThrow();

    await expect(responsePromise).rejects.toThrow("MCP process failure: spawn failed");
  });
});
