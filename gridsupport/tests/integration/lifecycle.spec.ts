import assert from "node:assert/strict";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  Fixture, U64_MAX, assertEvent, expensePda, failure, instruction,
  profilePda, seasonPda, sponsorshipPda, success,
} from "./helpers.js";

function stateBytes(f: Fixture, ...addresses: PublicKey[]): Buffer[] {
  return addresses.map((address) => f.accountData(address));
}

function unchanged(f: Fixture, addresses: PublicKey[], before: Buffer[]): void {
  addresses.forEach((address, index) => assert.deepEqual(f.accountData(address), before[index]));
}

describe("initialize_rider", () => {
  it("creates the canonical program-owned profile with the rider signer and event", () => {
    const f = new Fixture();
    const address = profilePda(f.rider.publicKey);
    const meta = success(f.initialize());
    const state = f.state("RiderProfile", address);
    assert.equal((state.rider as PublicKey).toBase58(), f.rider.publicKey.toBase58());
    assert.equal(state.bump, PublicKey.findProgramAddressSync([
      Buffer.from("rider"), f.rider.publicKey.toBuffer(),
    ], f.account(address).owner)[1]);
    assert.equal(f.accountData(address).length, 41);
    assertEvent(meta, "RiderInitialized", { rider: f.rider.publicKey, rider_profile: address });
  });

  it("rejects duplicate initialization, PDA substitution and a missing rider signature", () => {
    const f = new Fixture();
    const profile = profilePda(f.rider.publicKey);
    const wrong = Keypair.generate().publicKey;
    failure(f.send("initialize_rider", { rider: f.rider.publicKey, rider_profile: wrong }, {}, f.rider));
    assert.equal(f.svm.getAccount(wrong), null);
    success(f.initialize());
    const before = f.accountData(profile);
    failure(f.initialize());
    assert.deepEqual(f.accountData(profile), before);

    const ix = instruction("initialize_rider", {
      rider: f.outsider.publicKey, rider_profile: profilePda(f.outsider.publicKey),
    });
    const transaction = new Transaction({
      feePayer: f.merchantA.publicKey, recentBlockhash: f.svm.latestBlockhash(),
    }).add(ix);
    transaction.sign(f.merchantA);
    assert.throws(() => f.svm.sendTransaction(transaction), /signature/i);
    assert.equal(f.svm.getAccount(profilePda(f.outsider.publicKey)), null);
  });
});

describe("create_season", () => {
  it("stores the unique active season and emits the exact event", () => {
    const f = new Fixture();
    success(f.initialize());
    const profile = profilePda(f.rider.publicKey);
    const season = seasonPda(profile);
    const meta = success(f.createSeason(20_000n));
    const state = f.state("Season", season);
    assert.equal((state.rider as PublicKey).toBase58(), f.rider.publicKey.toBase58());
    assert.equal(state.season_id, 1n);
    assert.equal(state.budget_cents, 20_000n);
    assert.deepEqual(state.title_hash, Buffer.alloc(32, 7));
    assert.equal(state.status, 1);
    assert.equal(state.expense_count, 0n);
    assert.equal(f.accountData(season).length, 98);
    assertEvent(meta, "SeasonCreated", {
      rider: f.rider.publicKey, season, season_id: 1n, budget_cents: 20_000n,
    });
    const before = f.accountData(season);
    failure(f.createSeason(20_000n));
    assert.deepEqual(f.accountData(season), before);
  });

  it("rejects zero budget, another rider, incorrect PDA and wrong profile ownership", () => {
    const f = new Fixture();
    success(f.initialize());
    const profile = profilePda(f.rider.publicKey);
    const season = seasonPda(profile);
    failure(f.createSeason(0n), "InvalidSeasonBudget");
    assert.equal(f.svm.getAccount(season), null);
    failure(f.send("create_season", {
      rider: f.outsider.publicKey, rider_profile: profile, season,
    }, { budget_cents: 1n, title_hash: Buffer.alloc(32) }, f.outsider));
    const wrong = Keypair.generate().publicKey;
    failure(f.send("create_season", {
      rider: f.rider.publicKey, rider_profile: profile, season: wrong,
    }, { budget_cents: 1n, title_hash: Buffer.alloc(32) }, f.rider));
    assert.equal(f.svm.getAccount(wrong), null);
    f.rewriteAccount(profile, { owner: SystemProgram.programId });
    failure(f.createSeason(1n));
    assert.equal(f.svm.getAccount(season), null);
  });

  it("accepts the maximum u64 budget without treating it as expense coverage", () => {
    const f = new Fixture();
    success(f.initialize());
    success(f.createSeason(U64_MAX));
    const season = seasonPda(profilePda(f.rider.publicKey));
    assert.equal(f.state("Season", season).budget_cents, U64_MAX);
  });
});

describe("add_expense", () => {
  it("creates sequential expenses and permits estimates above the independent season budget", () => {
    const f = new Fixture();
    success(f.initialize());
    success(f.createSeason(1n));
    const season = seasonPda(profilePda(f.rider.publicKey));
    const first = f.addExpense(15_000n);
    const firstMeta = success(first.result);
    const second = f.addExpense(4_000n);
    success(second.result);
    assert.equal(first.address.toBase58(), expensePda(season, 0n).toBase58());
    assert.equal(second.address.toBase58(), expensePda(season, 1n).toBase58());
    assert.equal(f.state("Season", season).expense_count, 2n);
    assert.equal(f.state("Expense", first.address).estimated_cost_cents, 15_000n);
    assert.equal(f.state("Expense", first.address).committed_coverage_cents, 0n);
    assert.equal(f.state("Expense", second.address).expense_id, 1n);
    assert.equal(f.accountData(first.address).length, 106);
    assertEvent(firstMeta, "ExpenseCreated", {
      season, expense: first.address, expense_id: 0n,
      estimated_cost_cents: 15_000n, category: 3,
    });
    const maximumCategory = expensePda(season, 2n);
    success(f.send("add_expense", {
      rider: f.rider.publicKey, rider_profile: profilePda(f.rider.publicKey),
      season, expense: maximumCategory,
    }, { estimated_cost_cents: 1n, category: 255, description_hash: Buffer.alloc(32) }, f.rider));
    assert.equal(f.state("Expense", maximumCategory).category, 255);
    assert.equal(f.state("Season", season).expense_count, 3n);
  });

  it("rejects zero estimate, wrong PDA, unauthorized rider and cross-rider substitution atomically", () => {
    const f = new Fixture();
    success(f.initialize());
    success(f.initialize(f.secondRider));
    success(f.createSeason(500n));
    const profile = profilePda(f.rider.publicKey);
    const season = seasonPda(profile);
    const first = expensePda(season, 0n);
    const addresses = [season];
    const before = stateBytes(f, ...addresses);
    failure(f.addExpense(0n).result, "InvalidExpenseAmount");
    failure(f.send("add_expense", {
      rider: f.rider.publicKey, rider_profile: profile, season,
      expense: expensePda(season, 1n),
    }, { estimated_cost_cents: 1n, category: 0, description_hash: Buffer.alloc(32) }, f.rider));
    failure(f.send("add_expense", {
      rider: f.outsider.publicKey, rider_profile: profile, season, expense: first,
    }, { estimated_cost_cents: 1n, category: 0, description_hash: Buffer.alloc(32) }, f.outsider));
    failure(f.send("add_expense", {
      rider: f.secondRider.publicKey, rider_profile: profilePda(f.secondRider.publicKey),
      season, expense: first,
    }, { estimated_cost_cents: 1n, category: 0, description_hash: Buffer.alloc(32) }, f.secondRider));
    unchanged(f, addresses, before);
    assert.equal(f.svm.getAccount(first), null);
  });

  it("rejects wrong season owner, inactive season and count overflow with no orphan expense", () => {
    const f = new Fixture();
    success(f.initialize());
    success(f.createSeason(1n));
    const season = seasonPda(profilePda(f.rider.publicKey));
    const original = f.account(season);
    f.rewriteAccount(season, { owner: SystemProgram.programId });
    failure(f.send("add_expense", {
      rider: f.rider.publicKey, rider_profile: profilePda(f.rider.publicKey),
      season, expense: expensePda(season, 0n),
    }, { estimated_cost_cents: 1n, category: 3, description_hash: Buffer.alloc(32) }, f.rider));
    f.svm.setAccount(season, original);
    const inactive = f.accountData(season);
    inactive.writeUInt8(2, 88);
    f.rewriteAccount(season, { data: inactive });
    failure(f.addExpense(1n).result, "SeasonNotActive");
    f.svm.setAccount(season, original);
    const overflow = f.accountData(season);
    overflow.writeBigUInt64LE(U64_MAX, 89);
    f.rewriteAccount(season, { data: overflow });
    const wouldCreate = expensePda(season, U64_MAX);
    const before = f.accountData(season);
    failure(f.addExpense(1n).result, "ArithmeticOverflow");
    assert.deepEqual(f.accountData(season), before);
    assert.equal(f.svm.getAccount(wouldCreate), null);
  });
});

describe("sponsor_expense", () => {
  it("records repeated and cross-merchant in-kind commitments up to exact coverage", () => {
    const f = new Fixture();
    success(f.initialize());
    success(f.createSeason(15_000n));
    const expense = f.addExpense(15_000n).address;
    const fanBalance = f.balance(f.ata(f.fanA.publicKey));
    const riderBalance = f.balance(f.ata(f.rider.publicKey));
    const first = f.sponsor(expense, 500n);
    assertEvent(success(first.result), "SponsorshipCreated", {
      expense, sponsorship: first.address, merchant: f.merchantA.publicKey,
      sponsorship_id: 0n, amount_cents: 500n,
    });
    success(f.sponsor(expense, 200n).result);
    success(f.sponsor(expense, 14_300n, f.merchantB).result);
    assert.equal(f.state("Expense", expense).committed_coverage_cents, 15_000n);
    assert.equal(f.state("Expense", expense).sponsorship_count, 3n);
    assert.equal((f.state("Sponsorship", first.address).merchant as PublicKey).toBase58(), f.merchantA.publicKey.toBase58());
    assert.equal(f.accountData(first.address).length, 97);
    assert.equal(f.balance(f.ata(f.fanA.publicKey)), fanBalance);
    assert.equal(f.balance(f.ata(f.rider.publicKey)), riderBalance);
  });

  it("rejects zero, overcoverage and full expense without changing state", () => {
    const f = new Fixture();
    success(f.initialize());
    success(f.createSeason(1_000n));
    const expense = f.addExpense(1_000n).address;
    const before = f.accountData(expense);
    failure(f.sponsor(expense, 0n).result, "InvalidSponsorshipAmount");
    failure(f.sponsor(expense, 1_001n).result, "CoverageExceeded");
    assert.deepEqual(f.accountData(expense), before);
    assert.equal(f.svm.getAccount(sponsorshipPda(expense, 0n)), null);
    success(f.sponsor(expense, 1_000n).result);
    const covered = f.accountData(expense);
    failure(f.sponsor(expense, 1n).result, "ExpenseFullyCovered");
    assert.deepEqual(f.accountData(expense), covered);
    assert.equal(f.svm.getAccount(sponsorshipPda(expense, 1n)), null);
  });

  it("rejects PDA, owner and cross-rider substitution, and requires the merchant signature", () => {
    const f = new Fixture();
    success(f.initialize());
    success(f.initialize(f.secondRider));
    success(f.createSeason(1_000n));
    success(f.createSeason(1_000n, f.secondRider));
    const seasonA = seasonPda(profilePda(f.rider.publicKey));
    const seasonB = seasonPda(profilePda(f.secondRider.publicKey));
    const expense = f.addExpense(1_000n).address;
    const sponsorship = sponsorshipPda(expense, 0n);
    const before = f.accountData(expense);
    const wrong = Keypair.generate().publicKey;
    failure(f.send("sponsor_expense", {
      merchant: f.merchantA.publicKey, season: seasonA, expense, sponsorship: wrong,
    }, { amount_cents: 1n }, f.merchantA));
    failure(f.send("sponsor_expense", {
      merchant: f.merchantA.publicKey, season: seasonB, expense, sponsorship,
    }, { amount_cents: 1n }, f.merchantA));
    const original = f.account(expense);
    f.rewriteAccount(expense, { owner: SystemProgram.programId });
    failure(f.send("sponsor_expense", {
      merchant: f.merchantA.publicKey, season: seasonA, expense, sponsorship,
    }, { amount_cents: 1n }, f.merchantA));
    f.svm.setAccount(expense, original);
    assert.deepEqual(f.accountData(expense), before);
    assert.equal(f.svm.getAccount(sponsorship), null);

    const ix = instruction("sponsor_expense", {
      merchant: f.merchantA.publicKey, season: seasonA, expense, sponsorship,
    }, { amount_cents: 1n });
    const tx = new Transaction({ feePayer: f.rider.publicKey, recentBlockhash: f.svm.latestBlockhash() }).add(ix);
    tx.sign(f.rider);
    assert.throws(() => f.svm.sendTransaction(tx), /signature/i);
  });

  it("detects checked coverage and sponsorship-counter overflow at u64 limits", () => {
    const f = new Fixture();
    success(f.initialize());
    success(f.createSeason(1n));
    const expense = f.addExpense(U64_MAX).address;
    success(f.sponsor(expense, U64_MAX - 1n).result);
    const before = f.accountData(expense);
    failure(f.sponsor(expense, 2n).result, "ArithmeticOverflow");
    assert.deepEqual(f.accountData(expense), before);
    assert.equal(f.svm.getAccount(sponsorshipPda(expense, 1n)), null);
    success(f.sponsor(expense, 1n).result);
    assert.equal(f.state("Expense", expense).committed_coverage_cents, U64_MAX);

    const another = f.addExpense(100n).address;
    const counter = f.accountData(another);
    counter.writeBigUInt64LE(U64_MAX, 64);
    f.rewriteAccount(another, { data: counter });
    const counterBefore = f.accountData(another);
    failure(f.sponsor(another, 1n).result, "ArithmeticOverflow");
    assert.deepEqual(f.accountData(another), counterBefore);
    assert.equal(f.svm.getAccount(sponsorshipPda(another, U64_MAX)), null);
  });

  it("rejects sponsorship while the season is inactive and rolls back the new account", () => {
    const f = new Fixture();
    success(f.initialize());
    success(f.createSeason(100n));
    const season = seasonPda(profilePda(f.rider.publicKey));
    const expense = f.addExpense(100n).address;
    const inactive = f.accountData(season);
    inactive.writeUInt8(2, 88);
    f.rewriteAccount(season, { data: inactive });
    const before = f.accountData(expense);
    failure(f.sponsor(expense, 1n).result, "SeasonNotActive");
    assert.deepEqual(f.accountData(expense), before);
    assert.equal(f.svm.getAccount(sponsorshipPda(expense, 0n)), null);
  });
});
