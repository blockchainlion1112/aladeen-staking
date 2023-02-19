import { tryGetAccount } from "@cardinal/common";
import { BN } from "@project-serum/anchor";
import { Keypair, Transaction } from "@solana/web3.js";
import { getGroupRewardEntry } from "./programs/groupRewardDistributor/accounts";
import { findGroupRewardEntryId } from "./programs/groupRewardDistributor/pda";
import { withClaimGroupRewards, withCloseGroupRewardEntry, withInitGroupRewardDistributor, withInitGroupRewardEntry, withUpdateGroupRewardDistributor, } from "./programs/groupRewardDistributor/transaction";
import { findRewardDistributorId } from "./programs/rewardDistributor/pda";
import { withClaimRewards, withInitRewardDistributor, withInitRewardEntry, } from "./programs/rewardDistributor/transaction";
import { ReceiptType } from "./programs/stakePool";
import { getStakeEntries, getStakeEntry, getStakePool, } from "./programs/stakePool/accounts";
import { withAddToGroupEntry, withAuthorizeStakeEntry, withClaimReceiptMint, withInitGroupStakeEntry, withInitStakeEntry, withInitStakeMint, withInitStakePool, withInitUngrouping, withRemoveFromGroupEntry, withStake, withUnstake, withUpdateTotalStakeSeconds, } from "./programs/stakePool/transaction";
import { findStakeEntryIdFromMint } from "./programs/stakePool/utils";
import { getMintSupply } from "./utils";
/**
 * Convenience call to create a stake pool
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param requiresCollections - (Optional) List of required collections pubkeys
 * @param requiresCreators - (Optional) List of required creators pubkeys
 * @param requiresAuthorization - (Optional) Boolean to require authorization
 * @param overlayText - (Optional) Text to overlay on receipt mint tokens
 * @param imageUri - (Optional) Image URI for stake pool
 * @param resetOnStake - (Optional) Boolean to reset an entry's total stake seconds on unstake
 * @param cooldownSeconds - (Optional) Number of seconds for token to cool down before returned to the staker
 * @param rewardDistributor - (Optional) Parameters to creat reward distributor
 * @returns
 */
export const createStakePool = async (connection, wallet, params) => {
    const transaction = new Transaction();
    const rewardTransaction = new Transaction();
    const [, stakePoolId] = await withInitStakePool(transaction, connection, wallet, params);
    let rewardDistributorIds = [];
    if (params.rewardDistributors) {
        let rewardMintTokenAccountCreationRecord = params.rewardDistributors.reduce((acc, _dist) => ({ ...acc, [_dist.rewardMintId.toString()]: false }), {});
        for (const [index, rewardDistributor,] of params.rewardDistributors.entries()) {
            const [, rewardDistributorId] = await withInitRewardDistributor(rewardTransaction, connection, wallet, {
                distributorId: new BN(index),
                stakePoolId: stakePoolId,
                rewardMintId: rewardDistributor.rewardMintId,
                rewardAmount: rewardDistributor.rewardAmount,
                rewardDurationSeconds: rewardDistributor.rewardDurationSeconds,
                kind: rewardDistributor.rewardDistributorKind,
                maxSupply: rewardDistributor.maxSupply,
                supply: rewardDistributor.supply,
                stakePoolDuration: rewardDistributor.duration,
                createRewardDistributorMintTokenAccount: !rewardMintTokenAccountCreationRecord[rewardDistributor.rewardMintId.toString()],
            });
            rewardMintTokenAccountCreationRecord[rewardDistributor.rewardMintId.toString()] = true;
            rewardDistributorIds.push([
                new BN(index).toNumber(),
                rewardDistributorId,
            ]);
        }
    }
    return [[transaction, rewardTransaction], stakePoolId, rewardDistributorIds];
};
/**
 * Convenience call to create a reward distributor
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param rewardMintId - (Optional) Reward mint id
 * @param rewardAmount - (Optional) Reward amount
 * @param rewardDurationSeconds - (Optional) Reward duration in seconds
 * @param rewardDistributorKind - (Optional) Reward distributor kind Mint or Treasury
 * @param maxSupply - (Optional) Max supply
 * @param supply - (Optional) Supply
 * @returns
 */
export const createRewardDistributor = async (connection, wallet, params) => withInitRewardDistributor(new Transaction(), connection, wallet, params);
/**
 * Convenience call to create a stake entry
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param stakePoolId - Stake pool ID
 * @param originalMintId - Original mint ID
 * @param user - (Optional) User pubkey in case the person paying for the transaction and
 * stake entry owner are different
 * @returns
 */
export const createStakeEntry = async (connection, wallet, params) => {
    return withInitStakeEntry(new Transaction(), connection, wallet, {
        stakePoolId: params.stakePoolId,
        originalMintId: params.originalMintId,
    });
};
/**
 * Convenience call to create a stake entry
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param stakePoolId - Stake pool ID
 * @param originalMintId - Original mint ID
 * @returns
 */
export const initializeRewardEntry = async (connection, wallet, params) => {
    const stakeEntryId = await findStakeEntryIdFromMint(params.stakePoolId, params.originalMintId);
    const transaction = new Transaction();
    const rewardDistributorId = findRewardDistributorId(params.stakePoolId, params.distributorId, params.duration);
    await withInitRewardEntry(transaction, connection, wallet, {
        stakeEntryId: stakeEntryId,
        rewardDistributorId: rewardDistributorId,
    });
    return transaction;
};
/**
 * Convenience call to authorize a stake entry
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param stakePoolId - Stake pool ID
 * @param originalMintId - Original mint ID
 * @returns
 */
export const authorizeStakeEntry = (connection, wallet, params) => {
    return withAuthorizeStakeEntry(new Transaction(), connection, wallet, {
        stakePoolId: params.stakePoolId,
        originalMintId: params.originalMintId,
    });
};
/**
 * Convenience call to create a stake entry and a stake mint
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param stakePoolId - Stake pool ID
 * @param originalMintId - Original mint ID
 * @param amount - (Optional) Amount of tokens to be staked, defaults to 1
 * @returns
 */
export const createStakeEntryAndStakeMint = async (connection, wallet, params) => {
    var _a;
    let transaction = new Transaction();
    const stakeEntryId = await findStakeEntryIdFromMint(params.stakePoolId, params.originalMintId);
    const stakeEntryData = await tryGetAccount(() => getStakeEntry(connection, stakeEntryId));
    if (!stakeEntryData) {
        transaction = (await createStakeEntry(connection, wallet, {
            stakePoolId: params.stakePoolId,
            originalMintId: params.originalMintId,
        }))[0];
    }
    let stakeMintKeypair;
    if (!(stakeEntryData === null || stakeEntryData === void 0 ? void 0 : stakeEntryData.parsed.stakeMint)) {
        stakeMintKeypair = Keypair.generate();
        const stakePool = await getStakePool(connection, params.stakePoolId);
        await withInitStakeMint(transaction, connection, wallet, {
            stakePoolId: params.stakePoolId,
            stakeEntryId: stakeEntryId,
            originalMintId: params.originalMintId,
            stakeMintKeypair,
            name: (_a = params.receiptName) !== null && _a !== void 0 ? _a : `POOl${stakePool.parsed.identifier.toString()} RECEIPT`,
            symbol: `POOl${stakePool.parsed.identifier.toString()}`,
        });
    }
    return [transaction, stakeEntryId, stakeMintKeypair];
};
/**
 * Convenience method to claim rewards
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param stakePoolId - Stake pool id
 * @param stakeEntryId - Original mint id
 * @returns
 */
export const claimRewards = async (connection, wallet, params) => {
    var _a;
    const transaction = new Transaction();
    await withUpdateTotalStakeSeconds(transaction, connection, wallet, {
        stakeEntryId: params.stakeEntryId,
        lastStaker: wallet.publicKey,
    });
    await withClaimRewards(transaction, connection, wallet, {
        distributorId: params.distributorId,
        stakePoolId: params.stakePoolId,
        stakeEntryId: params.stakeEntryId,
        lastStaker: (_a = params.lastStaker) !== null && _a !== void 0 ? _a : wallet.publicKey,
        payer: params.payer,
        skipRewardMintTokenAccount: params.skipRewardMintTokenAccount,
        authority: params.authority,
        stakePoolDuration: params.stakePoolDuration,
    });
    return transaction;
};
/**
 * Convenience method to stake tokens
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param stakePoolId - Stake pool id
 * @param originalMintId - Original mint id
 * @param userOriginalMintTokenAccountId - User's original mint token account id
 * @param receiptType - (Optional) ReceiptType to be received back. If none provided, none will be claimed
 * @param user - (Optional) User pubkey in case the person paying for the transaction and
 * stake entry owner are different
 * @param amount - (Optional) Amount of tokens to be staked, defaults to 1
 * @returns
 */
export const stake = async (connection, wallet, params) => {
    var _a;
    const supply = await getMintSupply(connection, params.originalMintId);
    if ((supply.gt(new BN(1)) || ((_a = params.amount) === null || _a === void 0 ? void 0 : _a.gt(new BN(1)))) &&
        params.receiptType === ReceiptType.Original) {
        throw new Error("Fungible with receipt type Original is not supported yet");
    }
    let transaction = new Transaction();
    const stakeEntryId = await findStakeEntryIdFromMint(params.stakePoolId, params.originalMintId);
    const stakeEntryData = await tryGetAccount(() => getStakeEntry(connection, stakeEntryId));
    if (!stakeEntryData) {
        [transaction] = await createStakeEntry(connection, wallet, {
            stakePoolId: params.stakePoolId,
            originalMintId: params.originalMintId,
        });
    }
    await withStake(transaction, connection, wallet, {
        stakePoolId: params.stakePoolId,
        originalMintId: params.originalMintId,
        userOriginalMintTokenAccountId: params.userOriginalMintTokenAccountId,
        amount: params.amount,
        duration: 0,
    });
    if (params.receiptType && params.receiptType !== ReceiptType.None) {
        const receiptMintId = params.receiptType === ReceiptType.Receipt
            ? stakeEntryData === null || stakeEntryData === void 0 ? void 0 : stakeEntryData.parsed.stakeMint
            : params.originalMintId;
        if (!receiptMintId) {
            throw new Error("Stake entry has no stake mint. Initialize stake mint first.");
        }
        if ((stakeEntryData === null || stakeEntryData === void 0 ? void 0 : stakeEntryData.parsed.stakeMintClaimed) ||
            (stakeEntryData === null || stakeEntryData === void 0 ? void 0 : stakeEntryData.parsed.originalMintClaimed)) {
            throw new Error("Receipt has already been claimed.");
        }
        if (!(stakeEntryData === null || stakeEntryData === void 0 ? void 0 : stakeEntryData.parsed) ||
            stakeEntryData.parsed.amount.toNumber() === 0) {
            await withClaimReceiptMint(transaction, connection, wallet, {
                stakePoolId: params.stakePoolId,
                stakeEntryId: stakeEntryId,
                originalMintId: params.originalMintId,
                receiptMintId: receiptMintId,
                receiptType: params.receiptType,
            });
        }
    }
    return transaction;
};
/**
 * Convenience method to unstake tokens
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param stakePoolId - Stake pool ID
 * @param originalMintId - Original mint ID
 * @returns
 */
export const unstake = async (connection, wallet, params) => withUnstake(new Transaction(), connection, wallet, params);
/**
 * Convenience call to create a group entry
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param params
 * stakePoolId - Stake pool ID
 * originalMintId - Original mint ID
 * user - (Optional) User pubkey in case the person paying for the transaction and
 * stake entry owner are different
 * @returns
 */
export const createGroupEntry = async (connection, wallet, params) => {
    if (!params.stakeEntryIds.length)
        throw new Error("No stake entry found");
    const [transaction, groupEntryId] = await withInitGroupStakeEntry(new Transaction(), connection, wallet, {
        groupCooldownSeconds: params.groupCooldownSeconds,
        groupStakeSeconds: params.groupStakeSeconds,
    });
    await Promise.all(params.stakeEntryIds.map((stakeEntryId) => withAddToGroupEntry(transaction, connection, wallet, {
        groupEntryId,
        stakeEntryId,
    })));
    return [transaction, groupEntryId];
};
/**
 * Convenience call to create a group reward distributor
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param params
 *  rewardMintId - (Optional) Reward mint id
 *  authorizedPools - Authorized stake pool ids
 *  rewardAmount - (Optional) Reward amount
 *  rewardDurationSeconds - (Optional) Reward duration in seconds
 *  rewardKind - (Optional) Reward distributor kind Mint or Treasury
 *  poolKind - (Optional) Reward distributor pool validation kind NoRestriction, AllFromSinglePool or EachFromSeparatePool
 *  metadataKind - (Optional) Reward distributor metadata validation kind NoRestriction, UniqueNames or UniqueSymbols
 *  supply - (Optional) Supply
 *  baseAdder - (Optional) Base adder value that will be add to the calculated multiplier
 *  baseAdderDecimals - (Optional) Base adder decimals
 *  baseMultiplier - (Optional) Base multiplier value that will be multiplied by the calculated multiplier
 *  baseMultiplierDecimals - (Optional) Base multiplier decimals
 *  multiplierDecimals - (Optional) Multiplier decimals
 *  maxSupply - (Optional) Max supply
 *  minCooldownSeconds - (Optional) number;
 *  minStakeSeconds - (Optional) number;
 *  groupCountMultiplier - (Optional) Group Count Multiplier if provided will multiplied the total reward to this number and total groups that this user has
 *  groupCountMultiplierDecimals - (Optional) Group Count Multiplier decimals
 *  minGroupSize - (Optional) min group size
 *  maxRewardSecondsReceived - (Optional) max reward seconds received
 * @returns
 */
export const createGroupRewardDistributor = async (connection, wallet, params) => withInitGroupRewardDistributor(new Transaction(), connection, wallet, params);
/**
 * Convenience call to update a group reward distributor
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param params
 * groupRewardDistributorId - Group reward distributor id
 * authorizedPools - Authorized stake pool ids
 * rewardAmount - (Optional) Reward amount
 * rewardDurationSeconds - (Optional) Reward duration in seconds
 * poolKind - (Optional) Reward distributor pool validation kind NoRestriction, AllFromSinglePool or EachFromSeparatePool
 * metadataKind - (Optional) Reward distributor metadata validation kind NoRestriction, UniqueNames or UniqueSymbols
 * baseAdder - (Optional) Base adder value that will be add to the calculated multiplier
 * baseAdderDecimals - (Optional) Base adder decimals
 * baseMultiplier - (Optional) Base multiplier value that will be multiplied by the calculated multiplier
 * baseMultiplierDecimals - (Optional) Base multiplier decimals
 * multiplierDecimals - (Optional) Multiplier decimals
 * maxSupply - (Optional) Max supply
 * minCooldownSeconds - (Optional) number;
 * minStakeSeconds - (Optional) number;
 * groupCountMultiplier - (Optional) Group Count Multiplier if provided will multiplied the total reward to this number and total groups that this user has
 * groupCountMultiplierDecimals - (Optional) Group Count Multiplier decimals
 * minGroupSize - (Optional) min group size
 * maxRewardSecondsReceived - (Optional) max reward seconds received
 * @returns
 */
export const updateGroupRewardDistributor = async (connection, wallet, params) => withUpdateGroupRewardDistributor(new Transaction(), connection, wallet, params);
/**
 * Convenience method to claim rewards
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param params
 * groupRewardDistributorId - Group reward distributor ID
 * groupEntryId - Group entry ID
 * stakeEntryIds - Stake entry IDs
 * @returns
 */
export const claimGroupRewards = async (connection, wallet, params) => {
    const transaction = new Transaction();
    const groupRewardEntryId = findGroupRewardEntryId(params.groupRewardDistributorId, params.groupEntryId);
    const groupRewardEntry = await tryGetAccount(() => getGroupRewardEntry(connection, groupRewardEntryId));
    if (!groupRewardEntry) {
        const stakeEntriesData = await getStakeEntries(connection, params.stakeEntryIds);
        const stakeEntries = await Promise.all(stakeEntriesData.map((stakeEntry) => {
            const rewardDistributorId = findRewardDistributorId(stakeEntry.parsed.pool, params.distributorId, 0);
            return {
                stakeEntryId: stakeEntry.pubkey,
                originalMint: stakeEntry.parsed.originalMint,
                rewardDistributorId,
            };
        }));
        await withInitGroupRewardEntry(transaction, connection, wallet, {
            groupRewardDistributorId: params.groupRewardDistributorId,
            groupEntryId: params.groupEntryId,
            stakeEntries,
        });
    }
    await withClaimGroupRewards(transaction, connection, wallet, {
        groupRewardDistributorId: params.groupRewardDistributorId,
        groupEntryId: params.groupEntryId,
    });
    return [transaction];
};
/**
 * Convenience method to close group stake entry
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param params
 * groupRewardDistributorId - Group reward distributor ID
 * groupEntryId - Group entry ID
 * stakeEntryIds - Stake entry IDs
 * @returns
 */
export const closeGroupEntry = async (connection, wallet, params) => {
    const [transaction] = await claimGroupRewards(connection, wallet, params);
    await withCloseGroupRewardEntry(transaction, connection, wallet, {
        groupEntryId: params.groupEntryId,
        groupRewardDistributorId: params.groupRewardDistributorId,
    });
    await Promise.all(params.stakeEntryIds.map((stakeEntryId) => withRemoveFromGroupEntry(transaction, connection, wallet, {
        groupEntryId: params.groupEntryId,
        stakeEntryId,
    })));
    return [transaction];
};
/**
 * Convenience method to init ungrouping
 * @param connection - Connection to use
 * @param wallet - Wallet to use
 * @param params
 * groupRewardDistributorId - Group reward distributor ID
 * groupEntryId - Group entry ID
 * stakeEntryIds - Stake entry IDs
 * @returns
 */
export const initUngrouping = async (connection, wallet, params) => {
    const transaction = new Transaction();
    await withInitUngrouping(transaction, connection, wallet, {
        groupEntryId: params.groupEntryId,
    });
    return [transaction];
};
//# sourceMappingURL=api.js.map