import { NetworkContextForTestSuite } from "@counterfactual/local-ganache-server";

import { Node, NODE_EVENTS, ProposeMessage } from "../../src";
import { ProposeInstallParams } from "../../src/machine/types";
import { toBeLt } from "../machine/integration/bignumber-jest-matcher";

import { setup, SetupContext } from "./setup";
import {
  collateralizeChannel,
  createChannel,
  getAppInstanceProposal,
  getProposedAppInstances,
  makeProposeCall,
} from "./utils";

expect.extend({ toBeLt });

const { TicTacToeApp } = global["networkContext"] as NetworkContextForTestSuite;

async function assertEqualProposedApps(
  nodeA: Node,
  nodeB: Node,
  expectedAppIds: string[],
): Promise<void> {
  const proposedA = await getProposedAppInstances(nodeA);
  const proposedB = await getProposedAppInstances(nodeB);
  expect(proposedB.length).toEqual(proposedB.length);
  expect(proposedB.length).toEqual(expectedAppIds.length);
  expect(proposedA).toEqual(proposedB);
  // check each appID
  for (const id of expectedAppIds) {
    const appA = await getAppInstanceProposal(nodeA, id);
    const appB = await getAppInstanceProposal(nodeB, id);
    expect(appA).toEqual(appB);
  }
}

function assertMessageStructure(
  msg: ProposeMessage,
  expectedParams: ProposeInstallParams,
  proposerXpub: string,
): void {
  const {
    from,
    type,
    data: { params, appInstanceId },
  } = msg;
  // TODO: y
  expect(from).toBe(params.responderXpub);
  expect(params).toEqual(expectedParams);
  expect(type).toEqual(NODE_EVENTS.PROPOSE_INSTALL);
  expect(appInstanceId).toBeDefined();
}

describe("Node method follows spec - propose install", () => {
  let multisigAddress: string;
  let nodeA: Node;
  let nodeB: Node;

  describe("NodeA initiates proposal, nodeB approves, found in both stores", () => {
    beforeEach(async () => {
      const context: SetupContext = await setup(global);
      nodeA = context["A"].node;
      nodeB = context["B"].node;

      multisigAddress = await createChannel(nodeA, nodeB);
      await collateralizeChannel(multisigAddress, nodeA, nodeB);
    });

    it("propose install an app with eth and a meta", async (done: jest.DoneCallback) => {
      const rpc = makeProposeCall(nodeB, TicTacToeApp);
      const paramsWithMeta = {
        ...(rpc.parameters as ProposeInstallParams),
        meta: {
          info: "Provided meta",
        },
      };

      nodeB.once(NODE_EVENTS.PROPOSE_INSTALL, async (msg: ProposeMessage) => {
        // make sure message has the right structure
        const expectedParams = {
          ...paramsWithMeta,
          // not inc. in controller params
          initiatorXpub: nodeA.publicIdentifier,
          multisigAddress,
          responderXpub: nodeB.publicIdentifier,
        };
        assertMessageStructure(msg, expectedParams, nodeA.publicIdentifier);
        // both nodes should have 1 app, they should be the same
        await assertEqualProposedApps(nodeA, nodeB, [msg.data.appInstanceId]);
        done();
      });

      await nodeA.rpcRouter.dispatch({
        ...rpc,
        parameters: paramsWithMeta,
      });
    });
  });
});