import { IdentityApp } from "@connext/contracts";
import { getMemoryStore } from "@connext/store";
import { OutcomeType, ProtocolNames, ProtocolParams, MinimalTransaction } from "@connext/types";
import {
  getRandomAddress,
  getSignerAddressFromPublicIdentifier,
  toBNJson,
} from "@connext/utils";
import { Contract, ContractFactory } from "ethers";
import { One, Two, Zero, HashZero, AddressZero } from "ethers/constants";
import { JsonRpcProvider } from "ethers/providers";
import { BigNumber, bigNumberify } from "ethers/utils";

import { getCreate2MultisigAddress } from "../utils";

import { toBeEq } from "./bignumber-jest-matcher";
import { MessageRouter } from "./message-router";
import { MiniNode } from "./mininode";
import { newWallet } from "./utils";
import { StateChannel } from "../models";

expect.extend({ toBeEq });

export enum Participant {
  A,
  B,
  C,
}

export class TestRunner {
  static readonly TEST_TOKEN_ADDRESS: string = "0x88a5C2d9919e46F883EB62F7b8Dd9d0CC45bc290";

  private identityApp!: Contract;
  public mininodeA!: MiniNode;
  public mininodeB!: MiniNode;
  public mininodeC!: MiniNode;
  public multisigAB!: string;
  public multisigAC!: string;
  public multisigBC!: string;
  public provider!: JsonRpcProvider;
  public defaultTimeout!: BigNumber;
  private mr!: MessageRouter;

  async connectToGanache(): Promise<void> {
    const wallet = newWallet(global["wallet"]);
    const contractAddresses = global["contracts"];
    this.provider = wallet.provider as JsonRpcProvider;
    const network = { contractAddresses, provider: this.provider };

    this.identityApp = await new ContractFactory(
      IdentityApp.abi,
      IdentityApp.bytecode,
      wallet,
    ).deploy();

    this.defaultTimeout = bigNumberify(100);

    this.mininodeA = new MiniNode(network, getMemoryStore());
    await this.mininodeA.store.init();
    this.mininodeB = new MiniNode(network, getMemoryStore());
    await this.mininodeB.store.init();
    this.mininodeC = new MiniNode(network, getMemoryStore());
    await this.mininodeC.store.init();

    this.multisigAB = await getCreate2MultisigAddress(
      this.mininodeA.publicIdentifier,
      this.mininodeB.publicIdentifier,
      contractAddresses,
      this.provider,
    );

    this.multisigAC = await getCreate2MultisigAddress(
      this.mininodeA.publicIdentifier,
      this.mininodeC.publicIdentifier,
      contractAddresses,
      this.provider,
    );

    this.multisigBC = await getCreate2MultisigAddress(
      this.mininodeB.publicIdentifier,
      this.mininodeC.publicIdentifier,
      contractAddresses, 
      this.provider,
    );

    this.mr = new MessageRouter([this.mininodeA, this.mininodeB, this.mininodeC]);
  }

  /*
  Run the setup protocol to create the AB and BC channels, and update the
  state channel maps accordingly
  */
  async setup() {
    await this.mininodeA.protocolRunner.runSetupProtocol({
      initiatorIdentifier: this.mininodeA.publicIdentifier,
      responderIdentifier: this.mininodeB.publicIdentifier,
      multisigAddress: this.multisigAB,
    });

    const jsonAB = await this.mininodeA.store.getStateChannel(this.multisigAB);
    this.mininodeA.scm.set(this.multisigAB, StateChannel.fromJson(jsonAB!));

    await this.mr.waitForAllPendingPromises();

    await this.mininodeB.protocolRunner.runSetupProtocol({
      initiatorIdentifier: this.mininodeB.publicIdentifier,
      responderIdentifier: this.mininodeC.publicIdentifier,
      multisigAddress: this.multisigBC,
    });

    const jsonBC = await this.mininodeB.store.getStateChannel(this.multisigBC);
    this.mininodeB.scm.set(this.multisigBC, StateChannel.fromJson(jsonBC!));

    await this.mr.waitForAllPendingPromises();
  }

  /*
  Adds one ETH and one TEST_TOKEN to the free balance of everyone. Note this
  does not actually transfer any tokens.
  */
  async unsafeFund() {
    for (const mininode of [this.mininodeA, this.mininodeB]) {
      const json = await mininode.store.getStateChannel(this.multisigAB)!;
      const sc = StateChannel.fromJson(json!);
      const updatedSc = sc.addActiveAppAndIncrementFreeBalance(HashZero, {
        [AddressZero]: {
          [this.mininodeA.address]: One,
          [this.mininodeB.address]: One,
        },
        [TestRunner.TEST_TOKEN_ADDRESS]: {
          [this.mininodeA.address]: One,
          [this.mininodeB.address]: One,
        },
      });
      await mininode.store.createStateChannel(
        updatedSc.toJson(),
        { to: updatedSc.multisigAddress, value: 0, data: HashZero } as MinimalTransaction,
        {
          appIdentity: updatedSc.freeBalance.identity,
          appIdentityHash: updatedSc.freeBalance.identityHash,
          appStasteHash: updatedSc.freeBalance.hashOfLatestState,
          challengeRegistryAddress: getRandomAddress(),
          signatures: [HashZero, HashZero],
          versionNumber: toBNJson(updatedSc.freeBalance.latestVersionNumber),
        } as any,
      );
      mininode.scm.set(this.multisigAB, updatedSc);
    }

    for (const mininode of [this.mininodeB, this.mininodeC]) {
      const json = await mininode.store.getStateChannel(this.multisigBC)!;
      const sc = StateChannel.fromJson(json!);
      const updatedSc = sc.addActiveAppAndIncrementFreeBalance(HashZero, {
        [AddressZero]: {
          [this.mininodeB.address]: One,
          [this.mininodeC.address]: One,
        },
        [TestRunner.TEST_TOKEN_ADDRESS]: {
          [this.mininodeB.address]: One,
          [this.mininodeC.address]: One,
        },
      });
      await mininode.store.createStateChannel(
        updatedSc.toJson(),
        { to: updatedSc.multisigAddress, value: 0, data: HashZero } as MinimalTransaction,
        {
          appIdentity: updatedSc.freeBalance.identity,
          appIdentityHash: updatedSc.freeBalance.identityHash,
          appStasteHash: updatedSc.freeBalance.hashOfLatestState,
          challengeRegistryAddress: getRandomAddress(),
          signatures: [HashZero, HashZero],
          versionNumber: toBNJson(updatedSc.freeBalance.latestVersionNumber),
        } as any,
      );
      mininode.scm.set(this.multisigBC, updatedSc);
    }
  }

  async installEqualDeposits(outcomeType: OutcomeType, tokenAddress: string) {
    const stateEncoding = {
      [OutcomeType.TWO_PARTY_FIXED_OUTCOME]: "uint8",
      [OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER]: "tuple(address to, uint256 amount)[2]",
      [OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER]: "tuple(address to, uint256 amount)[][]",
    }[outcomeType];

    const initialState = {
      [OutcomeType.TWO_PARTY_FIXED_OUTCOME]: 0,
      [OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER]: [
        {
          to: this.mininodeA.address,
          amount: Two,
        },
        {
          to: this.mininodeB.address,
          amount: Zero,
        },
      ],
      [OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER]: [
        [
          {
            to: this.mininodeA.address,
            amount: Two,
          },
          {
            to: this.mininodeB.address,
            amount: Zero,
          },
        ],
      ],
    }[outcomeType];

    await this.mininodeA.protocolRunner.initiateProtocol(ProtocolNames.propose, {
      multisigAddress: this.multisigAB,
      initiatorIdentifier: this.mininodeA.publicIdentifier,
      responderIdentifier: this.mininodeB.publicIdentifier,
      appDefinition: this.identityApp.address,
      abiEncodings: {
        stateEncoding,
        actionEncoding: undefined,
      },
      initiatorDeposit: One,
      initiatorDepositAssetId: tokenAddress,
      responderDeposit: One,
      responderDepositAssetId: tokenAddress,
      defaultTimeout: this.defaultTimeout,
      stateTimeout: Zero,
      initialState,
      outcomeType,
    } as ProtocolParams.Propose);

    const postProposalStateChannel = await this.mininodeA.store.getStateChannel(this.multisigAB);
    const [proposal] = [
      ...StateChannel.fromJson(postProposalStateChannel!).proposedAppInstances.values(),
    ];

    await this.mininodeA.protocolRunner.initiateProtocol(ProtocolNames.install, {
      appInterface: {
        stateEncoding,
        addr: this.identityApp.address,
        actionEncoding: undefined,
      },
      appSeqNo: proposal.appSeqNo,
      defaultTimeout: this.defaultTimeout,
      stateTimeout: Zero,
      disableLimit: false,
      initialState,
      initiatorBalanceDecrement: One,
      initiatorDepositAssetId: tokenAddress,
      initiatorIdentifier: this.mininodeA.publicIdentifier,
      multisigAddress: this.multisigAB,
      outcomeType,
      responderBalanceDecrement: One,
      responderDepositAssetId: tokenAddress,
      responderIdentifier: this.mininodeB.publicIdentifier,
      appInitiatorIdentifier: this.mininodeA.publicIdentifier,
      appResponderIdentifier: this.mininodeB.publicIdentifier,
    } as ProtocolParams.Install);
  }

  async installSplitDeposits(
    outcomeType: OutcomeType,
    tokenAddressA: string,
    tokenAddressB: string,
  ) {
    const stateEncoding = {
      [OutcomeType.TWO_PARTY_FIXED_OUTCOME]: "uint8",
      [OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER]: "tuple(address to, uint256 amount)[2]",
      [OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER]: "tuple(address to, uint256 amount)[][]",
    }[outcomeType];

    const initialState = {
      [OutcomeType.TWO_PARTY_FIXED_OUTCOME]: 0,
      [OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER]: [
        {
          to: this.mininodeA.address,
          amount: Two,
        },
        {
          to: this.mininodeB.address,
          amount: Zero,
        },
      ],
      [OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER]: [
        [
          {
            to: this.mininodeA.address,
            amount: Two,
          },
          {
            to: this.mininodeB.address,
            amount: Zero,
          },
        ],
      ],
    }[outcomeType];

    await this.mininodeA.protocolRunner.initiateProtocol(ProtocolNames.propose, {
      multisigAddress: this.multisigAB,
      initiatorIdentifier: this.mininodeA.publicIdentifier,
      responderIdentifier: this.mininodeB.publicIdentifier,
      appDefinition: this.identityApp.address,
      abiEncodings: {
        stateEncoding,
        actionEncoding: undefined,
      },
      initiatorDeposit: One,
      initiatorDepositAssetId: tokenAddressA,
      responderDeposit: One,
      responderDepositAssetId: tokenAddressB,
      defaultTimeout: this.defaultTimeout,
      stateTimeout: Zero,
      initialState,
      outcomeType,
    } as ProtocolParams.Propose);

    const postProposalStateChannel = await this.mininodeA.store.getStateChannel(this.multisigAB);
    const [proposal] = [
      ...StateChannel.fromJson(postProposalStateChannel!).proposedAppInstances.values(),
    ];

    await this.mininodeA.protocolRunner.initiateProtocol(ProtocolNames.install, {
      outcomeType,
      initialState,
      initiatorIdentifier: this.mininodeA.publicIdentifier,
      responderIdentifier: this.mininodeB.publicIdentifier,
      multisigAddress: this.multisigAB,
      initiatorBalanceDecrement: One,
      responderBalanceDecrement: One,
      appInterface: {
        stateEncoding,
        addr: this.identityApp.address,
        actionEncoding: undefined,
      },
      appSeqNo: proposal.appSeqNo,
      defaultTimeout: this.defaultTimeout,
      stateTimeout: Zero,
      initiatorDepositAssetId: tokenAddressA,
      responderDepositAssetId: tokenAddressB,
      disableLimit: false,
      appInitiatorIdentifier: this.mininodeA.publicIdentifier,
      appResponderIdentifier: this.mininodeB.publicIdentifier,
    } as ProtocolParams.Install);
  }

  async uninstall() {
    const multisig = await this.mininodeA.store.getStateChannel(this.multisigAB);
    if (!multisig) {
      throw new Error(`uninstall: Couldn't find multisig for ${this.multisigAC}`);
    }
    const appInstances = StateChannel.fromJson(multisig!).appInstances;

    const [key] = [...appInstances.keys()].filter(key => {
      return key !== this.mininodeA.scm.get(this.multisigAB)!.freeBalance.identityHash;
    });

    await this.mininodeA.protocolRunner.initiateProtocol(ProtocolNames.uninstall, {
      appIdentityHash: key,
      initiatorIdentifier: this.mininodeA.publicIdentifier,
      responderIdentifier: this.mininodeB.publicIdentifier,
      multisigAddress: this.multisigAB,
    });

    await this.mr.waitForAllPendingPromises();
  }

  assertFB(participant: Participant, tokenAddress: string, expected: BigNumber) {
    const mininode = {
      [Participant.A]: this.mininodeA,
      [Participant.B]: this.mininodeB,
      [Participant.C]: this.mininodeC,
    }[participant];
    for (const multisig in [this.multisigAB, this.multisigBC, this.multisigAC]) {
      if (mininode.scm.has(multisig)) {
        expect(
          mininode.scm
            .get(multisig)!
            .getFreeBalanceClass()
            .getBalance(
              tokenAddress,
              getSignerAddressFromPublicIdentifier(mininode.publicIdentifier),
            ),
        ).toBeEq(expected);
      }
    }
  }
}
