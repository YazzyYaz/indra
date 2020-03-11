import { ProtocolTypes } from "@connext/types";
import { jsonRpcDeserialize } from "rpc-server";

import { Node } from "../../src";
import { setup, SetupContext } from "./setup";

describe(`Node method follows spec - getStateDepositHolderAddress`, () => {
  let nodeA: Node;
  let nodeB: Node;

  beforeAll(async () => {
    const context: SetupContext = await setup(global);
    nodeA = context[`A`].node;
    nodeB = context[`B`].node;
  });

  it(`can accept a valid call and return correctly formatted address`, async () => {
    const owners = [nodeA.publicIdentifier, nodeB.publicIdentifier];

    const {
      result: {
        result: { address },
      },
    } = await nodeA.rpcRouter.dispatch(
      jsonRpcDeserialize({
        id: Date.now(),
        method: ProtocolTypes.chan_getStateDepositHolderAddress,
        params: { owners },
        jsonrpc: `2.0`,
      }),
    );

    expect(address.length).toBe(42);
  });
});
