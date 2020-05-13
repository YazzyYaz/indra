import { env } from "../setup";
import { Node } from "../../node";
import { createChannel, makeProposeCall } from "../utils";
import { MemoryMessagingServiceWithLimits } from "../services/memory-messaging-service-limits";
import { deBigNumberifyJson, ChannelSigner, stringify, delay } from "@connext/utils";
import { A_PRIVATE_KEY, B_PRIVATE_KEY } from "../test-constants.jest";
import { NetworkContextForTestSuite } from "../contracts";
import {
  MethodParams,
  JsonRpcProvider,
  IClientStore,
  MethodNames,
  EventNames,
  EventPayloads,
} from "@connext/types";
import { getMemoryStore } from "@connext/store";
import { MemoryLockService } from "../services";
import { Logger } from "../logger";
import { EventEmitter } from "events";

const { TicTacToeApp } = global["network"] as NetworkContextForTestSuite;

describe("Node method follows spec - propose install", () => {
  let multisigAddress: string;
  let nodeA: Node;
  let nodeB: Node;
  let storeServiceA: IClientStore;
  let storeServiceB: IClientStore;
  let sharedEventEmitter: EventEmitter;
  let ethUrl: string;
  let provider: JsonRpcProvider;
  let nodeConfig: any;
  let lockService: MemoryLockService;
  let channelSignerA: ChannelSigner;

  beforeEach(async () => {});

  describe("NodeA initiates proposal, nodeB approves, found in both stores", () => {
    beforeEach(async () => {
      sharedEventEmitter = new EventEmitter();

      ethUrl = global["network"]["provider"].connection.url;
      provider = new JsonRpcProvider(ethUrl);
      nodeConfig = { STORE_KEY_PREFIX: "test" };
      lockService = new MemoryLockService();

      const messagingServiceA = new MemoryMessagingServiceWithLimits(
        sharedEventEmitter,
        1,
        "propose",
      );
      storeServiceA = getMemoryStore();
      channelSignerA = new ChannelSigner(A_PRIVATE_KEY, ethUrl);
      await storeServiceA.init();
      nodeA = await Node.create(
        messagingServiceA,
        storeServiceA,
        global["network"],
        nodeConfig,
        provider,
        channelSignerA,
        lockService,
        0,
        new Logger("CreateClient", env.logLevel, true, "A"),
      );

      const messagingServiceB = new MemoryMessagingServiceWithLimits(sharedEventEmitter);
      storeServiceB = getMemoryStore();
      const channelSignerB = new ChannelSigner(B_PRIVATE_KEY, ethUrl);
      await storeServiceB.init();
      nodeB = await Node.create(
        messagingServiceB,
        storeServiceB,
        global["network"],
        nodeConfig,
        provider,
        channelSignerB,
        lockService,
        0,
        new Logger("CreateClient", env.logLevel, true, "A"),
      );

      multisigAddress = await createChannel(nodeA, nodeB);
    });

    it("propose install an app with eth and a meta", async () => {
      const rpc = makeProposeCall(nodeB, TicTacToeApp, multisigAddress);
      const params = {
        ...(rpc.parameters as MethodParams.ProposeInstall),
        multisigAddress: undefined,
        meta: {
          info: "Provided meta",
        },
      };
      await new Promise(async (res) => {
        nodeB.once("PROPOSE_INSTALL_EVENT", res);
        try {
          await nodeA.rpcRouter.dispatch({
            ...rpc,
            parameters: deBigNumberifyJson(params),
          });
        } catch (e) {
          console.log(`Caught error sending rpc: ${stringify(e)}`);
        }
      });
      nodeA = await Node.create(
        new MemoryMessagingServiceWithLimits(sharedEventEmitter),
        storeServiceA,
        global["network"],
        nodeConfig,
        provider,
        channelSignerA,
        lockService,
        0,
        new Logger("CreateClient", env.logLevel, true, "A"),
      );

      const expectedChannel = (await storeServiceB.getStateChannel(multisigAddress))!;

      const [eventData, rpcResult] = await Promise.all([
        new Promise((resolve) => {
          nodeB.on(EventNames.SYNC, (data) => resolve(data));
        }),
        nodeA.rpcRouter.dispatch({
          methodName: MethodNames.chan_sync,
          parameters: { multisigAddress } as MethodParams.Sync,
          id: Date.now(),
        }),
      ]) as [EventPayloads.Sync, any];

      const { result: { result: syncedChannel } } = rpcResult;
      expect(eventData).toMatchObject({
        from: nodeA.publicIdentifier,
        type: EventNames.SYNC,
        data: { syncedChannel: expectedChannel },
      });
      expect(syncedChannel).toMatchObject(expectedChannel);
    }, 30_000);
  });
});