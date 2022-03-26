import type { TokenManagerKind } from "@cardinal/token-manager/dist/cjs/programs/tokenManager";
import {
  getRemainingAccountsForKind,
  TOKEN_MANAGER_ADDRESS,
} from "@cardinal/token-manager/dist/cjs/programs/tokenManager";
import { MetadataProgram } from "@metaplex-foundation/mpl-token-metadata";
import type { BN } from "@project-serum/anchor";
import { Program, Provider } from "@project-serum/anchor";
import type { Wallet } from "@saberhq/solana-contrib";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type {
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";

import type { STAKE_POOL_PROGRAM } from ".";
import { STAKE_POOL_ADDRESS, STAKE_POOL_IDL } from ".";

export const initStakePool = (
  connection: Connection,
  wallet: Wallet,
  params: { identifier: BN; stakePoolId: PublicKey }
): TransactionInstruction => {
  const provider = new Provider(connection, wallet, {});
  const stakePoolProgram = new Program<STAKE_POOL_PROGRAM>(
    STAKE_POOL_IDL,
    STAKE_POOL_ADDRESS,
    provider
  );
  return stakePoolProgram.instruction.initPool(
    {
      identifier: params.identifier,
    },
    {
      accounts: {
        stakePool: params.stakePoolId,
        payer: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      },
    }
  );
};

export const initStakeEntry = (
  connection: Connection,
  wallet: Wallet,
  params: {
    stakePoolId: PublicKey;
    stakeEntryId: PublicKey;
    originalMintId: PublicKey;
    stakeEntryReceiptMintTokenAccountId: PublicKey;
    receiptMintMetadata: PublicKey;
    receiptMintId: PublicKey;
    mintManager: PublicKey;
    name: string;
    symbol: string;
    textOverlay: string;
  }
): TransactionInstruction => {
  const provider = new Provider(connection, wallet, {});
  const stakePoolProgram = new Program<STAKE_POOL_PROGRAM>(
    STAKE_POOL_IDL,
    STAKE_POOL_ADDRESS,
    provider
  );

  return stakePoolProgram.instruction.initEntry(
    {
      name: params.name,
      symbol: params.symbol,
      textOverlay: params.textOverlay,
    },
    {
      accounts: {
        stakeEntry: params.stakeEntryId,
        stakePool: params.stakePoolId,
        originalMint: params.originalMintId,
        receiptMint: params.receiptMintId,
        mintManager: params.mintManager,
        stakeEntryReceiptMintTokenAccount:
          params.stakeEntryReceiptMintTokenAccountId,
        receiptMintMetadata: params.receiptMintMetadata,
        payer: wallet.publicKey,
        rent: SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenManagerProgram: TOKEN_MANAGER_ADDRESS,
        associatedToken: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenMetadataProgram: MetadataProgram.PUBKEY,
        systemProgram: SystemProgram.programId,
      },
    }
  );
};

export const stake = async (
  connection: Connection,
  wallet: Wallet,
  params: {
    stakeEntryId: PublicKey;
    tokenManagerId: PublicKey;
    mintCounterId: PublicKey;
    stakePoolIdentifier: BN;
    originalMintId: PublicKey;
    mintId: PublicKey;
    stakeEntryOriginalMintTokenAccountId: PublicKey;
    stakeEntryReceiptMintTokenAccountId: PublicKey;
    user: PublicKey;
    userOriginalMintTokenAccountId: PublicKey;
    userReceiptMintTokenAccountId: PublicKey;
    tokenManagerMintAccountId: PublicKey;
    tokenManagerKind: TokenManagerKind;
  }
): Promise<TransactionInstruction> => {
  const provider = new Provider(connection, wallet, {});
  const stakePoolProgram = new Program<STAKE_POOL_PROGRAM>(
    STAKE_POOL_IDL,
    STAKE_POOL_ADDRESS,
    provider
  );

  const remainingAccounts = await getRemainingAccountsForKind(
    params.mintId,
    params.tokenManagerKind
  );

  return stakePoolProgram.instruction.stake({
    accounts: {
      stakeEntry: params.stakeEntryId,
      originalMint: params.originalMintId,
      mint: params.mintId,
      tokenManager: params.tokenManagerId,
      mintCounter: params.mintCounterId,
      stakeEntryOriginalMintTokenAccount:
        params.stakeEntryOriginalMintTokenAccountId,
      stakeEntryReceiptMintTokenAccount:
        params.stakeEntryReceiptMintTokenAccountId,
      user: params.user,
      userOriginalMintTokenAccount: params.userOriginalMintTokenAccountId,
      userReceiptMintTokenAccount: params.userReceiptMintTokenAccountId,
      tokenManagerMintAccount: params.tokenManagerMintAccountId,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenManagerProgram: TOKEN_MANAGER_ADDRESS,
      associatedToken: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
    },
    remainingAccounts: remainingAccounts,
  });
};

export const unstake = (
  connection: Connection,
  wallet: Wallet,
  params: {
    stakeEntryId: PublicKey;
    tokenManagerId: PublicKey;
    mint: PublicKey;
    stakeEntryOriginalMintTokenAccount: PublicKey;
    stakeEntryMintTokenAccount: PublicKey;
    user: PublicKey;
    userOriginalMintTokenAccount: PublicKey;
    userMintTokenAccount: PublicKey;
    tokenManagerMintAccount: PublicKey;
  }
): TransactionInstruction => {
  const provider = new Provider(connection, wallet, {});
  const stakePoolProgram = new Program<STAKE_POOL_PROGRAM>(
    STAKE_POOL_IDL,
    STAKE_POOL_ADDRESS,
    provider
  );

  return stakePoolProgram.instruction.unstake({
    accounts: {
      stakeEntry: params.stakeEntryId,
      tokenManager: params.tokenManagerId,
      mint: params.mint,
      stakeEntryOriginalMintTokenAccount:
        params.stakeEntryOriginalMintTokenAccount,
      stakeEntryMintTokenAccount: params.stakeEntryMintTokenAccount,
      user: params.user,
      userOriginalMintTokenAccount: params.userOriginalMintTokenAccount,
      userMintTokenAccount: params.userMintTokenAccount,
      tokenManagerMintAccount: params.tokenManagerMintAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenManagerProgram: TOKEN_MANAGER_ADDRESS,
    },
  });
};
