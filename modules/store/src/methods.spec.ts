import {
  STORE_SCHEMA_VERSION,
  StoredAppChallengeStatus,
  StateChannelJSON,
  SetStateCommitmentJSON,
} from "@connext/types";
import { toBNJson, toBN, getRandomBytes32 } from "@connext/utils";

import {
  expect,
  MockBackupService,
  createConnextStore,
  TEST_STORE_ETH_ADDRESS,
  TEST_STORE_CHANNEL,
  TEST_STORE_MINIMAL_TX,
  TEST_STORE_SET_STATE_COMMITMENT,
  TEST_STORE_CONDITIONAL_COMMITMENT,
  TEST_STORE_APP_CHALLENGE,
  TEST_STORE_STATE_PROGRESSED_EVENT,
  TEST_STORE_CHALLENGE_UPDATED_EVENT,
} from "./test-utils";
import { StoreTypes } from "./types";

export const storeTypes = Object.keys(StoreTypes);

describe("ConnextStore", () => {
  const fileDir = "./.test-store";

  describe("getSchemaVersion", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should work`, async () => {
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        const schema = await store.getSchemaVersion();
        expect(schema).to.be.eq(0);
        await store.updateSchemaVersion();
        const updated = await store.getSchemaVersion();
        expect(updated).to.be.eq(STORE_SCHEMA_VERSION);
      });
    });
  });

  describe("createStateChannel + getStateChannel + getSetupCommitment + getSetStateCommitment", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should work`, async () => {
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        await store.updateSchemaVersion();
        const channel = TEST_STORE_CHANNEL;
        const nullValue = await store.getStateChannel(channel.multisigAddress);
        expect(nullValue).to.be.undefined;

        // can be called multiple times in a row and preserve the data
        for (let i = 0; i < 3; i++) {
          await store.createStateChannel(
            channel,
            TEST_STORE_MINIMAL_TX,
            TEST_STORE_SET_STATE_COMMITMENT,
          );
          const retrieved = await store.getStateChannel(channel.multisigAddress);
          expect(retrieved).to.deep.eq(channel);

          const setup = await store.getSetupCommitment(channel.multisigAddress);
          expect(setup).to.containSubset(TEST_STORE_MINIMAL_TX);

          const setState = await store.getSetStateCommitments(
            channel.freeBalanceAppInstance!.identityHash,
          );
          expect(setState.length).to.be.eq(1);
          expect(setState[0]).to.containSubset(TEST_STORE_SET_STATE_COMMITMENT);
        }

        await store.clear();
      });
    });
  });

  describe("getStateChannelByOwners", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should work`, async () => {
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        await store.updateSchemaVersion();
        const channel = TEST_STORE_CHANNEL;
        const owners = channel.userIdentifiers;
        const nullValue = await store.getStateChannelByOwners(owners);
        expect(nullValue).to.be.undefined;
        await store.createStateChannel(
          channel,
          TEST_STORE_MINIMAL_TX,
          TEST_STORE_SET_STATE_COMMITMENT,
        );
        const retrieved = await store.getStateChannelByOwners(owners);
        expect(retrieved).to.deep.eq(channel);
        await store.clear();
      });
    });
  });

  describe("getStateChannelByAppIdentityHash", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should work`, async () => {
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        await store.updateSchemaVersion();
        const channel = TEST_STORE_CHANNEL;
        const appIdentityHash = channel.appInstances[0][0];
        const nullValue = await store.getStateChannelByAppIdentityHash(appIdentityHash);
        expect(nullValue).to.be.undefined;
        await store.createStateChannel(
          channel,
          TEST_STORE_MINIMAL_TX,
          TEST_STORE_SET_STATE_COMMITMENT,
        );
        const retrieved = await store.getStateChannelByAppIdentityHash(appIdentityHash);
        expect(retrieved).to.deep.eq(channel);
        await store.clear();
      });
    });
  });

  describe("createAppInstance + updateAppInstance + getAppInstance + getConditionalTransactionCommitment", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should work`, async () => {
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        const channel = { ...TEST_STORE_CHANNEL, appInstances: [], proposedAppInstances: [] };
        const app = TEST_STORE_CHANNEL.appInstances[0][1];
        const freeBalanceSetState0 = {
          ...TEST_STORE_SET_STATE_COMMITMENT,
          appIdentityHash: channel.freeBalanceAppInstance!.identityHash,
        };
        const freeBalanceSetState1 = {
          ...freeBalanceSetState0,
          versionNumber: toBNJson(3),
        };
        const appSetState: SetStateCommitmentJSON = {
          ...TEST_STORE_SET_STATE_COMMITMENT,
          appIdentityHash: app.identityHash,
          versionNumber: toBNJson(app.latestVersionNumber),
        };

        const multisigAddress = channel.multisigAddress;
        await store.createStateChannel(channel, TEST_STORE_MINIMAL_TX, freeBalanceSetState0);
        const edited = { ...app, latestVersionNumber: 14 };
        const editedSetState = {
          ...appSetState,
          versionNumber: toBNJson(edited.latestVersionNumber),
        };

        // can be called multiple times in a row and preserve the data
        for (let i = 0; i < 3; i++) {
          await store.createAppInstance(
            multisigAddress,
            app,
            channel.freeBalanceAppInstance!,
            freeBalanceSetState1,
            TEST_STORE_CONDITIONAL_COMMITMENT,
          );
          const retrieved = await store.getAppInstance(app.identityHash);
          expect(retrieved).to.deep.eq(app);
          const freeBalance = await store.getSetStateCommitments(
            channel.freeBalanceAppInstance!.identityHash,
          );
          expect(freeBalance.length).to.be.eq(1);
          expect(freeBalance[0]).to.containSubset(freeBalanceSetState1);
          const conditional = await store.getConditionalTransactionCommitment(app.identityHash);
          expect(conditional).to.containSubset({
            ...TEST_STORE_CONDITIONAL_COMMITMENT,
            appIdentityHash: app.identityHash,
          });
        }

        // can be called multiple times in a row and preserve the data
        for (let i = 0; i < 3; i++) {
          await store.updateAppInstance(multisigAddress, edited, editedSetState);
          const editedRetrieved = await store.getAppInstance(app.identityHash);
          expect(editedRetrieved).to.deep.eq(edited);
          const updatedState = await store.getSetStateCommitments(app.identityHash);
          expect(updatedState.length).to.be.eq(1);
          expect(updatedState[0]).to.containSubset(editedSetState);
          const chan = await store.getStateChannel(multisigAddress);
          expect(chan.appInstances).to.deep.eq([[app.identityHash, edited]]);
        }
        await store.clear();
      });
    });
  });

  describe("removeAppInstance", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should work`, async () => {
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        const app = TEST_STORE_CHANNEL.appInstances[0][1];
        const channel = {
          ...TEST_STORE_CHANNEL,
          proposedAppInstances: [[app.identityHash, app]],
          appInstances: [],
        };
        const freeBalanceSetState0 = {
          ...TEST_STORE_SET_STATE_COMMITMENT,
          appIdentityHash: channel.freeBalanceAppInstance!.identityHash,
        };
        const freeBalanceSetState1 = {
          ...freeBalanceSetState0,
          versionNumber: toBNJson(154),
        };
        const freeBalanceSetState2 = {
          ...freeBalanceSetState0,
          versionNumber: toBNJson(1136),
        };
        const multisigAddress = channel.multisigAddress;
        await store.createStateChannel(
          channel as StateChannelJSON,
          TEST_STORE_MINIMAL_TX,
          freeBalanceSetState0,
        );
        await store.createAppInstance(
          multisigAddress,
          app,
          channel.freeBalanceAppInstance!,
          freeBalanceSetState1,
          TEST_STORE_CONDITIONAL_COMMITMENT,
        );

        // can be called multiple times in a row and preserve the data
        for (let i = 0; i < 3; i++) {
          await store.removeAppInstance(
            multisigAddress,
            app.identityHash,
            channel.freeBalanceAppInstance!,
            freeBalanceSetState2,
          );
          const retrieved = await store.getAppInstance(app.identityHash);
          expect(retrieved).to.be.undefined;
          const chan = await store.getStateChannel(multisigAddress);
          expect(chan).to.deep.eq({
            ...channel,
            proposedAppInstances: [],
          });
          const freeBalance = await store.getSetStateCommitments(
            channel.freeBalanceAppInstance!.identityHash,
          );
          expect(freeBalance.length).to.be.eq(1);
          expect(freeBalance[0]).to.containSubset(freeBalanceSetState2);
        }
        await store.clear();
      });
    });
  });

  describe("createAppProposal + getAppProposal", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should work`, async () => {
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        const channel = { ...TEST_STORE_CHANNEL, appInstances: [], proposedAppInstances: [] };
        const proposal = TEST_STORE_CHANNEL.proposedAppInstances[0][1];
        const multisigAddress = channel.multisigAddress;
        await store.createStateChannel(
          channel,
          TEST_STORE_MINIMAL_TX,
          TEST_STORE_SET_STATE_COMMITMENT,
        );
        // can be called multiple times in a row and preserve the data
        for (let i = 0; i < 3; i++) {
          await store.createAppProposal(
            multisigAddress,
            proposal,
            channel.monotonicNumProposedApps,
            TEST_STORE_SET_STATE_COMMITMENT,
          );
          const retrieved = await store.getAppProposal(proposal.identityHash);
          expect(retrieved).to.deep.eq(proposal);
          const chan = await store.getStateChannel(multisigAddress);
          expect(chan.monotonicNumProposedApps).to.be.eq(channel.monotonicNumProposedApps);
          expect(chan.proposedAppInstances).to.deep.eq([[proposal.identityHash, proposal]]);
        }
        await store.clear();
      });
    });
  });

  describe("removeAppProposal", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should work`, async () => {
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        const channel = { ...TEST_STORE_CHANNEL, appInstances: [], proposedAppInstances: [] };
        const proposal = TEST_STORE_CHANNEL.proposedAppInstances[0][1];
        const multisigAddress = channel.multisigAddress;
        await store.createStateChannel(
          channel,
          TEST_STORE_MINIMAL_TX,
          TEST_STORE_SET_STATE_COMMITMENT,
        );
        await store.createAppProposal(
          multisigAddress,
          proposal,
          channel.monotonicNumProposedApps,
          TEST_STORE_SET_STATE_COMMITMENT,
        );
        // can be called multiple times in a row and preserve the data
        for (let i = 0; i < 3; i++) {
          await store.removeAppProposal(multisigAddress, proposal.identityHash);
          const retrieved = await store.getAppProposal(proposal.identityHash);
          expect(retrieved).to.be.undefined;
          const chan = await store.getStateChannel(multisigAddress);
          expect(chan.proposedAppInstances).to.deep.eq([]);
        }
        await store.clear();
      });
    });
  });

  describe("getFreeBalance", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should work`, async () => {
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        const channel = { ...TEST_STORE_CHANNEL, appInstances: [], proposedAppInstances: [] };
        const freeBalance = channel.freeBalanceAppInstance!;
        const multisigAddress = channel.multisigAddress;
        const nullValue = await store.getFreeBalance(multisigAddress);
        expect(nullValue).to.deep.eq(undefined);
        await store.createStateChannel(
          channel,
          TEST_STORE_MINIMAL_TX,
          TEST_STORE_SET_STATE_COMMITMENT,
        );
        const retrieved = await store.getFreeBalance(multisigAddress);
        expect(retrieved).to.deep.eq(freeBalance);
        const chan = await store.getStateChannel(multisigAddress);
        expect(chan.freeBalanceAppInstance).to.deep.eq(freeBalance);
        await store.clear();
      });
    });
  });

  describe("clear", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should work`, async () => {
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        await store.updateSchemaVersion();
        const multisigAddress = TEST_STORE_ETH_ADDRESS;
        await store.createStateChannel(
          TEST_STORE_CHANNEL,
          TEST_STORE_MINIMAL_TX,
          TEST_STORE_SET_STATE_COMMITMENT,
        );
        const retrieved = await store.getStateChannel(multisigAddress);
        expect(retrieved).to.containSubset(TEST_STORE_CHANNEL);
        await store.clear();
        expect(await store.getStateChannel(multisigAddress)).to.containSubset(undefined);
      });
    });
  });

  describe("restore", async () => {
    storeTypes.forEach((type) => {
      it(`${type} - should restore empty state when not provided with a backup service`, async () => {
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        await store.updateSchemaVersion();
        const multisigAddress = TEST_STORE_ETH_ADDRESS;
        await store.createStateChannel(
          TEST_STORE_CHANNEL,
          TEST_STORE_MINIMAL_TX,
          TEST_STORE_SET_STATE_COMMITMENT,
        );
        const retrieved = await store.getStateChannel(multisigAddress);
        expect(retrieved).to.containSubset(TEST_STORE_CHANNEL);

        await expect(store.restore()).to.be.rejectedWith(`No backup provided, store cleared`);
        expect(await store.getStateChannel(multisigAddress)).to.containSubset(undefined);
        await store.clear();
      });

      it(`${type} - should backup state when provided with a backup service`, async () => {
        const store = await createConnextStore(type as StoreTypes, {
          backupService: new MockBackupService(),
          fileDir,
        });
        await store.updateSchemaVersion();
        const multisigAddress = TEST_STORE_ETH_ADDRESS;
        await store.createStateChannel(
          TEST_STORE_CHANNEL,
          TEST_STORE_MINIMAL_TX,
          TEST_STORE_SET_STATE_COMMITMENT,
        );
        const retrieved = await store.getStateChannel(multisigAddress);
        expect(retrieved).to.containSubset(TEST_STORE_CHANNEL);
        await store.restore();
        expect(await store.getStateChannel(multisigAddress)).to.containSubset(TEST_STORE_CHANNEL);
        await store.clear();
      });
    });
  });

  describe("getAppChallenge / saveAppChallenge", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should be able to create, get, and update app challenges`, async () => {
        const value = { ...TEST_STORE_APP_CHALLENGE };
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        await store.clear();

        const empty = await store.getAppChallenge(value.identityHash);
        expect(empty).to.be.undefined;

        // can be called multiple times in a row and preserve the data
        for (let i = 0; i < 3; i++) {
          await store.saveAppChallenge(value);
          expect(await store.getAppChallenge(value.identityHash)).to.containSubset(value);
        }
        await store.clear();
      });
    });

    storeTypes.forEach((type) => {
      it(`${type} -- should be able to handle concurrent writes properly`, async () => {
        const value0 = { ...TEST_STORE_APP_CHALLENGE };
        const value1 = { ...value0, versionNumber: toBN(value0.versionNumber).add(1) };
        const value2 = { ...value0, status: StoredAppChallengeStatus.IN_ONCHAIN_PROGRESSION };
        const value3 = { ...value0, identityHash: getRandomBytes32() };
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        await store.clear();
        // write all values concurrently
        await Promise.all([
          store.createChallengeUpdatedEvent(value0 as any),
          store.saveAppChallenge(value0),
          store.createChallengeUpdatedEvent(value1 as any),
          store.saveAppChallenge(value1),
          store.saveAppChallenge(value2),
          store.createChallengeUpdatedEvent(value3 as any),
          store.saveAppChallenge(value3),
        ]);
        // assert final stored is value with highest nonce
        expect(await store.getAppChallenge(value0.identityHash)).to.containSubset(value1);
        expect(await store.getAppChallenge(value3.identityHash)).to.containSubset(value3);
        expect(await store.getChallengeUpdatedEvents(value3.identityHash)).to.containSubset([
          value3,
        ]);
        const events = await store.getChallengeUpdatedEvents(value0.identityHash);
        expect(events.sort()).to.containSubset([value0, value1].sort());
        await store.clear();
      });
    });
  });

  describe("getActiveChallenges", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should be able to retrieve active challenges for a channel`, async () => {
        const store = await createConnextStore(type as StoreTypes, { fileDir });
        await store.clear();
        const challenge = {
          ...TEST_STORE_APP_CHALLENGE,
          status: StoredAppChallengeStatus.IN_DISPUTE,
        };

        const empty = await store.getActiveChallenges();
        expect(empty.length).to.be.eq(0);

        await store.saveAppChallenge(challenge);
        const vals = await store.getActiveChallenges();
        expect(vals.length).to.be.eq(1);
        expect(vals[0]).to.containSubset(challenge);
        await store.clear();
      });
    });
  });

  describe("getLatestProcessedBlock / updateLatestProcessedBlock", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should be able to get/update latest processed blocks`, async () => {
        const block = 200;
        const store = await createConnextStore(type as StoreTypes, { fileDir });

        expect(await store.getLatestProcessedBlock()).to.be.eq(0);
        await store.updateLatestProcessedBlock(block);
        expect(await store.getLatestProcessedBlock()).to.be.eq(block);
        await store.clear();
      });
    });
  });

  describe("getStateProgressedEvents / createStateProgressedEvent", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should be able to get/create state progressed events`, async () => {
        const value = { ...TEST_STORE_STATE_PROGRESSED_EVENT };
        const store = await createConnextStore(type as StoreTypes, { fileDir });

        const empty = await store.getStateProgressedEvents(value.identityHash);
        expect(empty).to.containSubset([]);

        await store.createStateProgressedEvent(value);
        const vals = await store.getStateProgressedEvents(value.identityHash);
        expect(vals.length).to.be.eq(1);
        expect(vals[0]).to.containSubset(value);
        await store.clear();
      });
    });
  });

  describe("getChallengeUpdatedEvents / createChallengeUpdatedEvent", () => {
    storeTypes.forEach((type) => {
      it(`${type} - should be able to get/create state progressed events`, async () => {
        const value = { ...TEST_STORE_CHALLENGE_UPDATED_EVENT };
        const store = await createConnextStore(type as StoreTypes, { fileDir });

        const empty = await store.getChallengeUpdatedEvents(value.identityHash);
        expect(empty).to.containSubset([]);

        await store.createChallengeUpdatedEvent(value);
        const vals = await store.getChallengeUpdatedEvents(value.identityHash);
        expect(vals.length).to.be.eq(1);
        expect(vals[0]).to.containSubset(value);
        await store.clear();
      });
    });
  });
});
