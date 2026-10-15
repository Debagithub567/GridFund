import assert from "node:assert/strict";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Fixture, INITIAL_FAN_A, INITIAL_FAN_B, INITIAL_SUPPLY, TEST_MINT, U64_MAX,
  assertEvent, failure, instruction, profilePda, seasonPda, success,
} from "./helpers.js";

function contributionAccounts(f: Fixture, overrides: Record<string, PublicKey> = {}): Record<string, PublicKey> {
  return {
    fan: f.fanA.publicKey,
    rider_profile: profilePda(f.rider.publicKey),
    mock_usdc_mint: TEST_MINT,
    fan_token_account: f.ata(f.fanA.publicKey),
    rider_token_account: f.ata(f.rider.publicKey),
    ...overrides,
  };
}

function balances(f: Fixture): [bigint, bigint, bigint] {
  return [
    f.balance(f.ata(f.fanA.publicKey)),
    f.balance(f.ata(f.fanB.publicKey)),
    f.balance(f.ata(f.rider.publicKey)),
  ];
}

describe("contribute_direct", () => {
  it("executes a checked SPL transfer with exact balance changes and no in-kind accounting change", () => {
    const f = new Fixture();
    success(f.initialize());
    success(f.createSeason(5_000n));
    const season = seasonPda(profilePda(f.rider.publicKey));
    const expense = f.addExpense(5_000n).address;
    success(f.sponsor(expense, 1_000n).result);
    const seasonBefore = f.accountData(season);
    const expenseBefore = f.accountData(expense);
    const supplyBefore = f.supply();

    const meta = success(f.contribute(2_000_000n));
    assert.deepEqual(balances(f), [INITIAL_FAN_A - 2_000_000n, INITIAL_FAN_B, 2_000_000n]);
    assert.equal(f.supply(), supplyBefore);
    assert.equal(f.supply(), INITIAL_SUPPLY);
    assert.deepEqual(f.accountData(season), seasonBefore);
    assert.deepEqual(f.accountData(expense), expenseBefore);
    assertEvent(meta, "DirectContribution", {
      fan: f.fanA.publicKey, rider: f.rider.publicKey, mint: TEST_MINT, amount: 2_000_000n,
    });
  });

  it("supports repeated contributions from separate fans without a rider signature", () => {
    const f = new Fixture();
    success(f.initialize());
    success(f.contribute(2_000_000n));
    success(f.contribute(1_000_000n));
    const meta = success(f.contribute(3_000_000n, f.fanB));
    assert.deepEqual(balances(f), [17_000_000n, 7_000_000n, 6_000_000n]);
    assertEvent(meta, "DirectContribution", {
      fan: f.fanB.publicKey, rider: f.rider.publicKey, mint: TEST_MINT, amount: 3_000_000n,
    });
  });

  it("rejects zero and insufficient amounts atomically, but accepts an exact full-balance transfer", () => {
    const f = new Fixture();
    success(f.initialize());
    const before = balances(f);
    failure(f.contribute(0n), "InvalidContributionAmount");
    failure(f.contribute(INITIAL_FAN_A + 1n));
    failure(f.contribute(U64_MAX));
    assert.deepEqual(balances(f), before);
    assert.equal(f.supply(), INITIAL_SUPPLY);
    success(f.contribute(INITIAL_FAN_A));
    assert.deepEqual(balances(f), [0n, INITIAL_FAN_B, INITIAL_FAN_A]);
  });

  it("transfers the maximum u64 amount when the SPL source holds it", () => {
    const f = new Fixture();
    success(f.initialize());
    f.setMint(6, TOKEN_PROGRAM_ID, U64_MAX);
    f.setToken(f.ata(f.fanA.publicKey), f.fanA.publicKey, TEST_MINT, U64_MAX);
    f.setToken(f.ata(f.fanB.publicKey), f.fanB.publicKey, TEST_MINT, 0n);
    success(f.contribute(U64_MAX));
    assert.deepEqual(balances(f), [0n, 0n, U64_MAX]);
    assert.equal(f.supply(), U64_MAX);
  });

  it("rejects an unapproved mint, wrong decimals, wrong mint owner and wrong token program", () => {
    const f = new Fixture();
    success(f.initialize());
    const wrongMint = Keypair.generate().publicKey;
    f.svm.setAccount(wrongMint, f.account(TEST_MINT));
    const before = balances(f);
    failure(f.send("contribute_direct", contributionAccounts(f, { mock_usdc_mint: wrongMint }), { amount: 1n }, f.fanA), "InvalidMockUsdcMint");
    f.setMint(9);
    failure(f.contribute(1n), "InvalidMintDecimals");
    f.setMint(6, TOKEN_2022_PROGRAM_ID);
    failure(f.contribute(1n));
    f.setMint(6);
    failure(f.send("contribute_direct", contributionAccounts(f, { token_program: SystemProgram.programId }), { amount: 1n }, f.fanA));
    assert.deepEqual(balances(f), before);
  });

  it("rejects invalid source token owners, mints and program ownership", () => {
    const f = new Fixture();
    success(f.initialize());
    const source = f.ata(f.fanA.publicKey);
    const original = f.account(source);
    const before = balances(f);
    f.setToken(source, f.outsider.publicKey, TEST_MINT, INITIAL_FAN_A);
    failure(f.contribute(1n), "InvalidTokenAccountOwner");
    f.setToken(source, f.fanA.publicKey, Keypair.generate().publicKey, INITIAL_FAN_A);
    failure(f.contribute(1n), "InvalidTokenAccountMint");
    f.setToken(source, f.fanA.publicKey, TEST_MINT, INITIAL_FAN_A, TOKEN_2022_PROGRAM_ID);
    failure(f.contribute(1n));
    f.svm.setAccount(source, original);
    assert.deepEqual(balances(f), before);
  });

  it("rejects invalid destination token owners, mints and program ownership", () => {
    const f = new Fixture();
    success(f.initialize());
    const destination = f.ata(f.rider.publicKey);
    const original = f.account(destination);
    const before = balances(f);
    f.setToken(destination, f.outsider.publicKey, TEST_MINT, 0n);
    failure(f.contribute(1n), "InvalidTokenAccountOwner");
    f.setToken(destination, f.rider.publicKey, Keypair.generate().publicKey, 0n);
    failure(f.contribute(1n), "InvalidTokenAccountMint");
    f.setToken(destination, f.rider.publicKey, TEST_MINT, 0n, TOKEN_2022_PROGRAM_ID);
    failure(f.contribute(1n));
    f.svm.setAccount(destination, original);
    assert.deepEqual(balances(f), before);
  });

  it("rejects cross-rider and noncanonical destination accounts plus a forged profile PDA", () => {
    const f = new Fixture();
    success(f.initialize());
    success(f.initialize(f.secondRider));
    const before = balances(f);
    failure(f.send("contribute_direct", contributionAccounts(f, {
      rider_token_account: f.ata(f.secondRider.publicKey),
    }), { amount: 1n }, f.fanA), "InvalidTokenAccountOwner");
    const noncanonical = Keypair.generate().publicKey;
    f.setToken(noncanonical, f.rider.publicKey, TEST_MINT, 0n);
    failure(f.send("contribute_direct", contributionAccounts(f, {
      rider_token_account: noncanonical,
    }), { amount: 1n }, f.fanA), "InvalidRecipientTokenAccount");
    const forged = Keypair.generate().publicKey;
    f.svm.setAccount(forged, f.account(profilePda(f.rider.publicKey)));
    failure(f.send("contribute_direct", contributionAccounts(f, {
      rider_profile: forged,
    }), { amount: 1n }, f.fanA));
    assert.deepEqual(balances(f), before);
    assert.equal(f.balance(noncanonical), 0n);
    assert.equal(f.balance(f.ata(f.secondRider.publicKey)), 0n);
  });

  it("uses source owner and mint checks without imposing an unstated canonical source ATA rule", () => {
    const f = new Fixture();
    success(f.initialize());
    const source = Keypair.generate().publicKey;
    f.setMint(6, TOKEN_PROGRAM_ID, INITIAL_SUPPLY + 50n);
    f.setToken(source, f.fanA.publicKey, TEST_MINT, 50n);
    const meta = success(f.send("contribute_direct", contributionAccounts(f, {
      fan_token_account: source,
    }), { amount: 25n }, f.fanA));
    assert.equal(f.balance(source), 25n);
    assert.equal(f.balance(f.ata(f.rider.publicKey)), 25n);
    assertEvent(meta, "DirectContribution", {
      fan: f.fanA.publicKey, rider: f.rider.publicKey, mint: TEST_MINT, amount: 25n,
    });
  });

  it("requires the fan signature before entering the program", () => {
    const f = new Fixture();
    success(f.initialize());
    const ix = instruction("contribute_direct", contributionAccounts(f), { amount: 1n });
    const tx = new Transaction({ feePayer: f.outsider.publicKey, recentBlockhash: f.svm.latestBlockhash() }).add(ix);
    tx.sign(f.outsider);
    assert.throws(() => f.svm.sendTransaction(tx), /signature/i);
    assert.deepEqual(balances(f), [INITIAL_FAN_A, INITIAL_FAN_B, 0n]);
  });

  it("rolls back the token transfer when a later instruction in the same transaction fails", () => {
    const f = new Fixture();
    success(f.initialize());
    success(f.createSeason(100n));
    const expense = f.addExpense(100n).address;
    const expenseBefore = f.accountData(expense);
    const before = balances(f);
    const season = seasonPda(profilePda(f.rider.publicKey));
    const { address: sponsorship } = f.sponsor(expense, 0n);
    const first = instruction("contribute_direct", contributionAccounts(f), { amount: 1_000_000n });
    const second = instruction("sponsor_expense", {
      merchant: f.merchantA.publicKey, season, expense, sponsorship,
    }, { amount_cents: 0n });
    failure(f.sendInstructions(f.fanA, [first, second], [f.merchantA]), "InvalidSponsorshipAmount");
    assert.deepEqual(balances(f), before);
    assert.deepEqual(f.accountData(expense), expenseBefore);
    assert.equal(f.svm.getAccount(sponsorship), null);
  });
});
