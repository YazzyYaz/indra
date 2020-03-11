import { getAddress, hexlify, Interface, randomBytes, TransactionDescription } from "ethers/utils";

import { appIdentityToHash, SetupCommitment } from "../../../../src/ethereum";
import { MultisigTransaction } from "../../../../src/types";
import { StateChannel } from "../../../../src/models";
import { ConditionalTransactionDelegateTarget } from "../../../contracts";
import { getRandomExtendedPubKey } from "../../integration/random-signing-keys";
import { generateRandomNetworkContext } from "../../mocks";

/**
 * This test suite decodes a constructed SetupCommitment transaction object according
 * to the specifications defined by Counterfactual as can be found here:
 * https://specs.counterfactual.com/04-setup-protocol#commitments
 *
 */
describe("SetupCommitment", () => {
  let tx: MultisigTransaction;

  // Dummy network context
  const networkContext = generateRandomNetworkContext();

  // General interaction testing values
  const interaction = {
    sender: getRandomExtendedPubKey(),
    receiver: getRandomExtendedPubKey(),
  };

  // State channel testing values
  const stateChannel = StateChannel.setupChannel(
    networkContext.IdentityApp,
    {
      proxyFactory: networkContext.ProxyFactory,
      multisigMastercopy: networkContext.MinimumViableMultisig,
    },
    getAddress(hexlify(randomBytes(20))),
    [interaction.sender, interaction.receiver],
  );

  const freeBalance = stateChannel.freeBalance;

  beforeAll(() => {
    tx = new SetupCommitment(
      networkContext,
      stateChannel.multisigAddress,
      stateChannel.multisigOwners,
      freeBalance.identity,
    ).getTransactionDetails();
  });

  it("should be to ConditionalTransactionDelegateTarget", () => {
    expect(tx.to).toBe(networkContext.ConditionalTransactionDelegateTarget);
  });

  it("should have no value", () => {
    expect(tx.value).toBe(0);
  });

  describe("the calldata", () => {
    const iface = new Interface(ConditionalTransactionDelegateTarget.abi);
    let desc: TransactionDescription;

    beforeAll(() => {
      const { data } = tx;
      desc = iface.parseTransaction({ data });
    });

    it("should be to the executeEffectOfFreeBalance method", () => {
      expect(desc.sighash).toBe(iface.functions.executeEffectOfFreeBalance.sighash);
    });

    it("should contain expected arguments", () => {
      const [appRegistry, appIdentityHash, interpreterAddress] = desc.args;
      expect(appRegistry).toBe(networkContext.ChallengeRegistry);
      expect(appIdentityHash).toBe(appIdentityToHash(freeBalance.identity));
      expect(interpreterAddress).toBe(networkContext.MultiAssetMultiPartyCoinTransferInterpreter);
    });
  });
});
