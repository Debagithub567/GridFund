use anchor_lang::{
    prelude::{Clock, Pubkey},
    solana_program::{instruction::Instruction, system_program},
    AccountDeserialize, AccountSerialize, AnchorSerialize, Discriminator, InstructionData,
    ToAccountMetas,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use gridsupport::{
    events::{ExpenseCreated, RiderInitialized, SeasonCreated, SponsorshipCreated},
    state::{Expense, RiderProfile, Season, Sponsorship},
};
use litesvm::{
    types::{TransactionMetadata, TransactionResult},
    LiteSVM,
};
use solana_account::Account;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

fn pda(seeds: &[&[u8]]) -> (Pubkey, u8) {
    Pubkey::find_program_address(seeds, &gridsupport::id())
}

fn rider_pda(rider: &Pubkey) -> (Pubkey, u8) {
    pda(&[b"rider", rider.as_ref()])
}

fn season_pda(profile: &Pubkey) -> (Pubkey, u8) {
    pda(&[b"season", profile.as_ref()])
}

fn expense_pda(season: &Pubkey, id: u64) -> (Pubkey, u8) {
    pda(&[b"expense", season.as_ref(), &id.to_le_bytes()])
}

fn sponsorship_pda(expense: &Pubkey, id: u64) -> (Pubkey, u8) {
    pda(&[b"sponsorship", expense.as_ref(), &id.to_le_bytes()])
}

fn runner() -> LiteSVM {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/deploy/gridsupport.so"
    ));
    svm.add_program(gridsupport::id(), bytes).unwrap();
    svm
}

fn send(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) -> TransactionResult {
    svm.expire_blockhash();
    let message =
        Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[payer]).unwrap();
    svm.send_transaction(tx)
}

fn read<T: AccountDeserialize>(svm: &LiteSVM, key: &Pubkey) -> T {
    let account = svm.get_account(key).expect("account must exist");
    assert_eq!(account.owner, gridsupport::id());
    T::try_deserialize(&mut account.data.as_slice()).unwrap()
}

fn overwrite<T: AccountSerialize>(svm: &mut LiteSVM, key: Pubkey, value: &T) {
    let mut account = svm.get_account(&key).unwrap();
    let mut data = Vec::new();
    value.try_serialize(&mut data).unwrap();
    assert_eq!(data.len(), account.data.len());
    account.data = data;
    svm.set_account(key, account).unwrap();
}

fn assert_event<T: AnchorSerialize + Discriminator>(meta: &TransactionMetadata, event: &T) {
    let mut data = T::DISCRIMINATOR.to_vec();
    event.serialize(&mut data).unwrap();
    let expected = format!("Program data: {}", STANDARD.encode(data));
    assert!(
        meta.logs.iter().any(|log| log.contains(&expected)),
        "missing event: {:?}",
        meta.logs
    );
}

fn assert_failed(result: TransactionResult, code: &str) {
    let failure = result.expect_err("instruction should fail");
    assert!(
        failure.meta.logs.iter().any(|log| log.contains(code)),
        "expected {code}: {:?}",
        failure.meta.logs
    );
    assert!(
        failure
            .meta
            .logs
            .iter()
            .all(|log| !log.contains("Program data:")),
        "failed instruction emitted an event"
    );
}

struct Fixture {
    svm: LiteSVM,
    rider: Keypair,
    merchant_a: Keypair,
    merchant_b: Keypair,
    profile: Pubkey,
    season: Pubkey,
}

impl Fixture {
    fn new() -> Self {
        let mut svm = runner();
        let rider = Keypair::new();
        let merchant_a = Keypair::new();
        let merchant_b = Keypair::new();
        for key in [&rider, &merchant_a, &merchant_b] {
            svm.airdrop(&key.pubkey(), 10_000_000_000).unwrap();
        }
        let profile = rider_pda(&rider.pubkey()).0;
        let season = season_pda(&profile).0;
        Self {
            svm,
            rider,
            merchant_a,
            merchant_b,
            profile,
            season,
        }
    }

    fn initialize_ix(rider: Pubkey, profile: Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            gridsupport::id(),
            &gridsupport::instruction::InitializeRider {}.data(),
            gridsupport::accounts::InitializeRider {
                rider,
                rider_profile: profile,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn season_ix(rider: Pubkey, profile: Pubkey, season: Pubkey, budget: u64) -> Instruction {
        Instruction::new_with_bytes(
            gridsupport::id(),
            &gridsupport::instruction::CreateSeason {
                budget_cents: budget,
                title_hash: [7; 32],
            }
            .data(),
            gridsupport::accounts::CreateSeason {
                rider,
                rider_profile: profile,
                season,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn expense_ix(
        rider: Pubkey,
        profile: Pubkey,
        season: Pubkey,
        expense: Pubkey,
        cost: u64,
    ) -> Instruction {
        Instruction::new_with_bytes(
            gridsupport::id(),
            &gridsupport::instruction::AddExpense {
                estimated_cost_cents: cost,
                category: 3,
                description_hash: [9; 32],
            }
            .data(),
            gridsupport::accounts::AddExpense {
                rider,
                rider_profile: profile,
                season,
                expense,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn sponsor_ix(
        merchant: Pubkey,
        season: Pubkey,
        expense: Pubkey,
        sponsorship: Pubkey,
        amount: u64,
    ) -> Instruction {
        Instruction::new_with_bytes(
            gridsupport::id(),
            &gridsupport::instruction::SponsorExpense {
                amount_cents: amount,
            }
            .data(),
            gridsupport::accounts::SponsorExpense {
                merchant,
                season,
                expense,
                sponsorship,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn initialize(&mut self) -> TransactionMetadata {
        send(
            &mut self.svm,
            &self.rider,
            Fixture::initialize_ix(self.rider.pubkey(), self.profile),
        )
        .unwrap()
    }

    fn create_season(&mut self, budget: u64) -> TransactionMetadata {
        send(
            &mut self.svm,
            &self.rider,
            Fixture::season_ix(self.rider.pubkey(), self.profile, self.season, budget),
        )
        .unwrap()
    }

    fn add_expense(&mut self, cost: u64) -> (Pubkey, TransactionMetadata) {
        let id = read::<Season>(&self.svm, &self.season).expense_count;
        let expense = expense_pda(&self.season, id).0;
        let meta = send(
            &mut self.svm,
            &self.rider,
            Fixture::expense_ix(
                self.rider.pubkey(),
                self.profile,
                self.season,
                expense,
                cost,
            ),
        )
        .unwrap();
        (expense, meta)
    }

    fn sponsor(
        &mut self,
        expense: Pubkey,
        amount: u64,
        use_second_merchant: bool,
    ) -> (Pubkey, TransactionMetadata) {
        let id = read::<Expense>(&self.svm, &expense).sponsorship_count;
        let sponsorship = sponsorship_pda(&expense, id).0;
        let merchant = if use_second_merchant {
            &self.merchant_b
        } else {
            &self.merchant_a
        };
        let meta = send(
            &mut self.svm,
            merchant,
            Fixture::sponsor_ix(merchant.pubkey(), self.season, expense, sponsorship, amount),
        )
        .unwrap();
        (sponsorship, meta)
    }
}

#[test]
fn rider_and_season_initialize_with_events_and_reject_duplicates() {
    let mut f = Fixture::new();
    let wrong_profile = Keypair::new().pubkey();
    let bad = send(
        &mut f.svm,
        &f.rider,
        Fixture::initialize_ix(f.rider.pubkey(), wrong_profile),
    );
    assert!(bad.is_err());
    assert!(f.svm.get_account(&wrong_profile).is_none());

    let meta = f.initialize();
    let profile: RiderProfile = read(&f.svm, &f.profile);
    assert_eq!(profile.rider, f.rider.pubkey());
    assert_eq!(profile.bump, rider_pda(&f.rider.pubkey()).1);
    assert_event(
        &meta,
        &RiderInitialized {
            rider: f.rider.pubkey(),
            rider_profile: f.profile,
        },
    );
    assert!(send(
        &mut f.svm,
        &f.rider,
        Fixture::initialize_ix(f.rider.pubkey(), f.profile)
    )
    .is_err());

    let original_profile = f.svm.get_account(&f.profile).unwrap();
    let mut wrong_owner = original_profile.clone();
    wrong_owner.owner = system_program::ID;
    f.svm.set_account(f.profile, wrong_owner).unwrap();
    let rejected = send(
        &mut f.svm,
        &f.rider,
        Fixture::season_ix(f.rider.pubkey(), f.profile, f.season, 100),
    );
    assert!(rejected.is_err());
    assert!(f.svm.get_account(&f.season).is_none());
    f.svm.set_account(f.profile, original_profile).unwrap();

    let zero = send(
        &mut f.svm,
        &f.rider,
        Fixture::season_ix(f.rider.pubkey(), f.profile, f.season, 0),
    );
    assert_failed(zero, "InvalidSeasonBudget");
    assert!(f.svm.get_account(&f.season).is_none());

    let other = Keypair::new();
    f.svm.airdrop(&other.pubkey(), 1_000_000_000).unwrap();
    let unauthorized = send(
        &mut f.svm,
        &other,
        Fixture::season_ix(other.pubkey(), f.profile, f.season, 100),
    );
    assert!(unauthorized.is_err());
    assert!(f.svm.get_account(&f.season).is_none());

    let wrong_season = Keypair::new().pubkey();
    let wrong = send(
        &mut f.svm,
        &f.rider,
        Fixture::season_ix(f.rider.pubkey(), f.profile, wrong_season, 100),
    );
    assert!(wrong.is_err());
    assert!(f.svm.get_account(&wrong_season).is_none());

    let meta = f.create_season(20_000);
    let season: Season = read(&f.svm, &f.season);
    assert_eq!(season.rider, f.rider.pubkey());
    assert_eq!(season.season_id, 1);
    assert_eq!(season.budget_cents, 20_000);
    assert_eq!(season.title_hash, [7; 32]);
    assert_eq!(season.status, 1);
    assert_eq!(season.expense_count, 0);
    assert_eq!(season.bump, season_pda(&f.profile).1);
    assert_event(
        &meta,
        &SeasonCreated {
            rider: f.rider.pubkey(),
            season: f.season,
            season_id: 1,
            budget_cents: 20_000,
        },
    );
    assert!(send(
        &mut f.svm,
        &f.rider,
        Fixture::season_ix(f.rider.pubkey(), f.profile, f.season, 20_000)
    )
    .is_err());
}

#[test]
fn expenses_are_sequential_and_failures_leave_counter_unchanged() {
    let mut f = Fixture::new();
    f.initialize();
    f.create_season(1);
    let (expense0, bump0) = expense_pda(&f.season, 0);

    let zero = send(
        &mut f.svm,
        &f.rider,
        Fixture::expense_ix(f.rider.pubkey(), f.profile, f.season, expense0, 0),
    );
    assert_failed(zero, "InvalidExpenseAmount");
    assert!(f.svm.get_account(&expense0).is_none());
    assert_eq!(read::<Season>(&f.svm, &f.season).expense_count, 0);

    let wrong_expense = expense_pda(&f.season, 1).0;
    let wrong = send(
        &mut f.svm,
        &f.rider,
        Fixture::expense_ix(f.rider.pubkey(), f.profile, f.season, wrong_expense, 15_000),
    );
    assert!(wrong.is_err());
    assert!(f.svm.get_account(&wrong_expense).is_none());

    let other = Keypair::new();
    f.svm.airdrop(&other.pubkey(), 1_000_000_000).unwrap();
    let unauthorized = send(
        &mut f.svm,
        &other,
        Fixture::expense_ix(other.pubkey(), f.profile, f.season, expense0, 15_000),
    );
    assert!(unauthorized.is_err());
    assert_eq!(read::<Season>(&f.svm, &f.season).expense_count, 0);

    let (key0, meta0) = f.add_expense(15_000);
    assert_eq!(key0, expense0);
    let first: Expense = read(&f.svm, &key0);
    assert_eq!(first.season, f.season);
    assert_eq!(first.expense_id, 0);
    assert_eq!(first.estimated_cost_cents, 15_000);
    assert_eq!(first.committed_coverage_cents, 0);
    assert_eq!(first.sponsorship_count, 0);
    assert_eq!(first.category, 3);
    assert_eq!(first.description_hash, [9; 32]);
    assert_eq!(first.bump, bump0);
    assert_event(
        &meta0,
        &ExpenseCreated {
            season: f.season,
            expense: key0,
            expense_id: 0,
            estimated_cost_cents: 15_000,
            category: 3,
        },
    );

    let duplicate = send(
        &mut f.svm,
        &f.rider,
        Fixture::expense_ix(f.rider.pubkey(), f.profile, f.season, key0, 15_000),
    );
    assert!(duplicate.is_err());
    assert_eq!(read::<Season>(&f.svm, &f.season).expense_count, 1);

    let (key1, meta1) = f.add_expense(20_000);
    assert_eq!(key1, wrong_expense);
    assert_eq!(read::<Expense>(&f.svm, &key1).expense_id, 1);
    assert_eq!(read::<Season>(&f.svm, &f.season).expense_count, 2);
    assert_event(
        &meta1,
        &ExpenseCreated {
            season: f.season,
            expense: key1,
            expense_id: 1,
            estimated_cost_cents: 20_000,
            category: 3,
        },
    );

    let mut inactive: Season = read(&f.svm, &f.season);
    inactive.status = 2;
    overwrite(&mut f.svm, f.season, &inactive);
    let expense2 = expense_pda(&f.season, 2).0;
    let rejected = send(
        &mut f.svm,
        &f.rider,
        Fixture::expense_ix(f.rider.pubkey(), f.profile, f.season, expense2, 1),
    );
    assert_failed(rejected, "SeasonNotActive");
    assert_eq!(read::<Season>(&f.svm, &f.season).expense_count, 2);
    assert!(f.svm.get_account(&expense2).is_none());
}

#[test]
fn merchants_can_repeat_in_kind_sponsorships_until_exactly_full() {
    let mut f = Fixture::new();
    f.initialize();
    f.create_season(1);
    let (expense, _) = f.add_expense(15_000);

    let (sponsor0, meta0) = f.sponsor(expense, 500, false);
    let record0: Sponsorship = read(&f.svm, &sponsor0);
    assert_eq!(record0.expense, expense);
    assert_eq!(record0.merchant, f.merchant_a.pubkey());
    assert_eq!(record0.sponsorship_id, 0);
    assert_eq!(record0.amount_cents, 500);
    assert_eq!(record0.bump, sponsorship_pda(&expense, 0).1);
    assert_eq!(
        record0.created_at,
        f.svm.get_sysvar::<Clock>().unix_timestamp
    );
    assert_eq!(
        read::<Expense>(&f.svm, &expense).committed_coverage_cents,
        500
    );
    assert_event(
        &meta0,
        &SponsorshipCreated {
            expense,
            sponsorship: sponsor0,
            merchant: f.merchant_a.pubkey(),
            sponsorship_id: 0,
            amount_cents: 500,
        },
    );

    let (sponsor1, meta1) = f.sponsor(expense, 200, false);
    assert_ne!(sponsor0, sponsor1);
    let record1: Sponsorship = read(&f.svm, &sponsor1);
    assert_eq!(record1.merchant, f.merchant_a.pubkey());
    assert_eq!(record1.sponsorship_id, 1);
    assert_eq!(record1.amount_cents, 200);
    assert_eq!(
        read::<Expense>(&f.svm, &expense).committed_coverage_cents,
        700
    );
    assert_event(
        &meta1,
        &SponsorshipCreated {
            expense,
            sponsorship: sponsor1,
            merchant: f.merchant_a.pubkey(),
            sponsorship_id: 1,
            amount_cents: 200,
        },
    );

    let (sponsor2, _) = f.sponsor(expense, 300, true);
    assert_eq!(
        read::<Sponsorship>(&f.svm, &sponsor2).merchant,
        f.merchant_b.pubkey()
    );
    assert_eq!(read::<Expense>(&f.svm, &expense).sponsorship_count, 3);
    let next = sponsorship_pda(&expense, 3).0;
    let before: Expense = read(&f.svm, &expense);
    let zero = send(
        &mut f.svm,
        &f.merchant_a,
        Fixture::sponsor_ix(f.merchant_a.pubkey(), f.season, expense, next, 0),
    );
    assert_failed(zero, "InvalidSponsorshipAmount");
    assert_eq!(
        read::<Expense>(&f.svm, &expense).committed_coverage_cents,
        before.committed_coverage_cents
    );
    assert_eq!(
        read::<Expense>(&f.svm, &expense).sponsorship_count,
        before.sponsorship_count
    );
    assert!(f.svm.get_account(&next).is_none());

    let over = send(
        &mut f.svm,
        &f.merchant_a,
        Fixture::sponsor_ix(f.merchant_a.pubkey(), f.season, expense, next, 14_001),
    );
    assert_failed(over, "CoverageExceeded");
    assert_eq!(
        read::<Expense>(&f.svm, &expense).committed_coverage_cents,
        1_000
    );
    assert!(f.svm.get_account(&next).is_none());

    let (final_sponsorship, _) = f.sponsor(expense, 14_000, false);
    assert_eq!(final_sponsorship, next);
    let full: Expense = read(&f.svm, &expense);
    assert_eq!(full.committed_coverage_cents, 15_000);
    assert_eq!(full.sponsorship_count, 4);
    let post_full = sponsorship_pda(&expense, 4).0;
    let rejected = send(
        &mut f.svm,
        &f.merchant_a,
        Fixture::sponsor_ix(f.merchant_a.pubkey(), f.season, expense, post_full, 1),
    );
    assert_failed(rejected, "ExpenseFullyCovered");
    assert!(f.svm.get_account(&post_full).is_none());
    assert_eq!(
        read::<Expense>(&f.svm, &expense).committed_coverage_cents,
        15_000
    );
}

#[test]
fn sponsorship_rejects_wrong_addresses_relationships_and_missing_signer() {
    let mut f = Fixture::new();
    f.initialize();
    f.create_season(15_000);
    let (expense, _) = f.add_expense(15_000);
    let sponsorship = sponsorship_pda(&expense, 0).0;

    let wrong_sponsorship = Keypair::new().pubkey();
    let wrong = send(
        &mut f.svm,
        &f.merchant_a,
        Fixture::sponsor_ix(
            f.merchant_a.pubkey(),
            f.season,
            expense,
            wrong_sponsorship,
            500,
        ),
    );
    assert!(wrong.is_err());
    assert!(f.svm.get_account(&wrong_sponsorship).is_none());

    let bad_season = Keypair::new().pubkey();
    let season_state: Season = read(&f.svm, &f.season);
    let mut season_bytes = Vec::new();
    season_state.try_serialize(&mut season_bytes).unwrap();
    f.svm
        .set_account(
            bad_season,
            Account {
                lamports: 1_000_000,
                data: season_bytes,
                owner: gridsupport::id(),
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    let wrong = send(
        &mut f.svm,
        &f.merchant_a,
        Fixture::sponsor_ix(f.merchant_a.pubkey(), bad_season, expense, sponsorship, 500),
    );
    assert_failed(wrong, "InvalidSeason");

    let bad_expense = Keypair::new().pubkey();
    let expense_state: Expense = read(&f.svm, &expense);
    let mut expense_bytes = Vec::new();
    expense_state.try_serialize(&mut expense_bytes).unwrap();
    f.svm
        .set_account(
            bad_expense,
            Account {
                lamports: 1_000_000,
                data: expense_bytes,
                owner: gridsupport::id(),
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    let bad_sponsorship = sponsorship_pda(&bad_expense, 0).0;
    let wrong = send(
        &mut f.svm,
        &f.merchant_a,
        Fixture::sponsor_ix(
            f.merchant_a.pubkey(),
            f.season,
            bad_expense,
            bad_sponsorship,
            500,
        ),
    );
    assert!(wrong.is_err());
    assert!(f.svm.get_account(&bad_sponsorship).is_none());

    let mut bad_relation: Expense = read(&f.svm, &expense);
    bad_relation.season = Keypair::new().pubkey();
    overwrite(&mut f.svm, expense, &bad_relation);
    let wrong = send(
        &mut f.svm,
        &f.merchant_a,
        Fixture::sponsor_ix(f.merchant_a.pubkey(), f.season, expense, sponsorship, 500),
    );
    assert_failed(wrong, "InvalidExpense");
    assert_eq!(read::<Expense>(&f.svm, &expense).sponsorship_count, 0);
    assert!(f.svm.get_account(&sponsorship).is_none());

    let ix = Fixture::sponsor_ix(f.merchant_a.pubkey(), f.season, expense, sponsorship, 500);
    let message =
        Message::new_with_blockhash(&[ix], Some(&f.rider.pubkey()), &f.svm.latest_blockhash());
    assert!(
        VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[&f.rider]).is_err(),
        "merchant signature must be required"
    );
}

#[test]
fn near_u64_max_coverage_detects_overflow_and_inactive_season() {
    let mut f = Fixture::new();
    f.initialize();
    f.create_season(1);
    let (expense, _) = f.add_expense(u64::MAX);
    f.sponsor(expense, u64::MAX - 1, false);
    let next = sponsorship_pda(&expense, 1).0;
    let overflow = send(
        &mut f.svm,
        &f.merchant_a,
        Fixture::sponsor_ix(f.merchant_a.pubkey(), f.season, expense, next, 2),
    );
    assert_failed(overflow, "ArithmeticOverflow");
    let unchanged: Expense = read(&f.svm, &expense);
    assert_eq!(unchanged.committed_coverage_cents, u64::MAX - 1);
    assert_eq!(unchanged.sponsorship_count, 1);
    assert!(f.svm.get_account(&next).is_none());

    let mut inactive: Season = read(&f.svm, &f.season);
    inactive.status = 2;
    overwrite(&mut f.svm, f.season, &inactive);
    let rejected = send(
        &mut f.svm,
        &f.merchant_a,
        Fixture::sponsor_ix(f.merchant_a.pubkey(), f.season, expense, next, 1),
    );
    assert_failed(rejected, "SeasonNotActive");
    assert!(f.svm.get_account(&next).is_none());

    inactive.status = 1;
    overwrite(&mut f.svm, f.season, &inactive);
    f.sponsor(expense, 1, false);
    assert_eq!(
        read::<Expense>(&f.svm, &expense).committed_coverage_cents,
        u64::MAX
    );
}
