#![cfg(feature = "local-test-mint")]

use anchor_lang::{
    prelude::Pubkey,
    solana_program::{
        instruction::Instruction, program_option::COption, program_pack::Pack, system_program,
    },
    AccountDeserialize, AnchorSerialize, Discriminator, InstructionData, ToAccountMetas,
};
use anchor_spl::{associated_token::get_associated_token_address, token::spl_token};
use base64::{engine::general_purpose::STANDARD, Engine};
use gridsupport::{
    constants::APPROVED_MOCK_USDC_MINT,
    events::DirectContribution,
    state::{Expense, RiderProfile},
};
use litesvm::{types::TransactionResult, LiteSVM};
use solana_account::Account;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;
use std::str::FromStr;

const TOKEN_SUPPLY: u64 = 20_000_000;

fn send(svm: &mut LiteSVM, signer: &Keypair, ix: Instruction) -> TransactionResult {
    svm.expire_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&signer.pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[signer]).unwrap();
    svm.send_transaction(tx)
}

fn token_account(svm: &LiteSVM, key: Pubkey) -> spl_token::state::Account {
    let account = svm.get_account(&key).unwrap();
    assert_eq!(account.owner, spl_token::ID);
    spl_token::state::Account::unpack(&account.data).unwrap()
}

fn mint(svm: &LiteSVM, key: Pubkey) -> spl_token::state::Mint {
    let account = svm.get_account(&key).unwrap();
    assert_eq!(account.owner, spl_token::ID);
    spl_token::state::Mint::unpack(&account.data).unwrap()
}

fn put_mint(svm: &mut LiteSVM, key: Pubkey, decimals: u8, owner: Pubkey) {
    let value = spl_token::state::Mint {
        mint_authority: COption::None,
        supply: TOKEN_SUPPLY,
        decimals,
        is_initialized: true,
        freeze_authority: COption::None,
    };
    let mut data = vec![0; spl_token::state::Mint::LEN];
    spl_token::state::Mint::pack(value, &mut data).unwrap();
    svm.set_account(
        key,
        Account {
            lamports: svm.minimum_balance_for_rent_exemption(data.len()),
            data,
            owner,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

fn put_token(
    svm: &mut LiteSVM,
    key: Pubkey,
    mint: Pubkey,
    owner: Pubkey,
    amount: u64,
    program: Pubkey,
) {
    let value = spl_token::state::Account {
        mint,
        owner,
        amount,
        delegate: COption::None,
        state: spl_token::state::AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    };
    let mut data = vec![0; spl_token::state::Account::LEN];
    spl_token::state::Account::pack(value, &mut data).unwrap();
    svm.set_account(
        key,
        Account {
            lamports: svm.minimum_balance_for_rent_exemption(data.len()),
            data,
            owner: program,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

fn event_present(meta: &litesvm::types::TransactionMetadata, value: &DirectContribution) -> bool {
    let mut bytes = DirectContribution::DISCRIMINATOR.to_vec();
    value.serialize(&mut bytes).unwrap();
    let expected = format!("Program data: {}", STANDARD.encode(bytes));
    meta.logs.iter().any(|log| log.contains(&expected))
}

struct Fixture {
    svm: LiteSVM,
    fan: Keypair,
    rider: Keypair,
    profile: Pubkey,
    approved_mint: Pubkey,
    source: Pubkey,
    destination: Pubkey,
}

impl Fixture {
    fn new() -> Self {
        let mut svm = LiteSVM::new();
        let bytes = include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/deploy/gridsupport.so"
        ));
        svm.add_program(gridsupport::id(), bytes).unwrap();
        let fan = Keypair::new();
        let rider = Keypair::new();
        svm.airdrop(&fan.pubkey(), 10_000_000_000).unwrap();
        svm.airdrop(&rider.pubkey(), 10_000_000_000).unwrap();
        let profile =
            Pubkey::find_program_address(&[b"rider", rider.pubkey().as_ref()], &gridsupport::id())
                .0;
        let initialize = Instruction::new_with_bytes(
            gridsupport::id(),
            &gridsupport::instruction::InitializeRider {}.data(),
            gridsupport::accounts::InitializeRider {
                rider: rider.pubkey(),
                rider_profile: profile,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        send(&mut svm, &rider, initialize).unwrap();
        let approved_mint = APPROVED_MOCK_USDC_MINT.unwrap();
        put_mint(&mut svm, approved_mint, 6, spl_token::ID);
        let source = get_associated_token_address(&fan.pubkey(), &approved_mint);
        let destination = get_associated_token_address(&rider.pubkey(), &approved_mint);
        put_token(
            &mut svm,
            source,
            approved_mint,
            fan.pubkey(),
            TOKEN_SUPPLY,
            spl_token::ID,
        );
        put_token(
            &mut svm,
            destination,
            approved_mint,
            rider.pubkey(),
            0,
            spl_token::ID,
        );
        Self {
            svm,
            fan,
            rider,
            profile,
            approved_mint,
            source,
            destination,
        }
    }

    fn ix(&self, amount: u64) -> Instruction {
        self.ix_with(
            amount,
            self.profile,
            self.approved_mint,
            self.source,
            self.destination,
            spl_token::ID,
        )
    }

    fn ix_with(
        &self,
        amount: u64,
        profile: Pubkey,
        mint: Pubkey,
        source: Pubkey,
        destination: Pubkey,
        program: Pubkey,
    ) -> Instruction {
        Instruction::new_with_bytes(
            gridsupport::id(),
            &gridsupport::instruction::ContributeDirect { amount }.data(),
            gridsupport::accounts::ContributeDirect {
                fan: self.fan.pubkey(),
                rider_profile: profile,
                mock_usdc_mint: mint,
                fan_token_account: source,
                rider_token_account: destination,
                token_program: program,
            }
            .to_account_metas(None),
        )
    }

    fn contribute(&mut self, amount: u64) -> TransactionResult {
        let ix = self.ix(amount);
        send(&mut self.svm, &self.fan, ix)
    }

    fn rejected(&mut self, ix: Instruction) {
        let before_source = self.svm.get_account(&self.source).unwrap();
        let before_destination = self.svm.get_account(&self.destination).unwrap();
        let failure = send(&mut self.svm, &self.fan, ix).expect_err("contribution must fail");
        assert_eq!(
            self.svm.get_account(&self.source).unwrap().data,
            before_source.data
        );
        assert_eq!(
            self.svm.get_account(&self.destination).unwrap().data,
            before_destination.data
        );
        assert!(
            failure
                .meta
                .logs
                .iter()
                .all(|log| !log.contains("Program data:")),
            "failed transfer emitted an event: {:?}",
            failure.meta.logs
        );
    }
}

#[test]
fn direct_transfer_is_exact_and_emits_only_after_success() {
    let mut f = Fixture::new();
    let mint_before = mint(&f.svm, f.approved_mint).supply;
    let profile_before = f.svm.get_account(&f.profile).unwrap();
    let season =
        Pubkey::find_program_address(&[b"season", f.profile.as_ref()], &gridsupport::id()).0;
    assert!(f.svm.get_account(&season).is_none());
    let meta = f.contribute(2_000_000).unwrap();
    assert_eq!(token_account(&f.svm, f.source).amount, 18_000_000);
    assert_eq!(token_account(&f.svm, f.destination).amount, 2_000_000);
    assert_eq!(mint(&f.svm, f.approved_mint).supply, mint_before);
    assert_eq!(
        f.svm.get_account(&f.profile).unwrap().data,
        profile_before.data
    );
    assert!(f.svm.get_account(&season).is_none());
    assert!(event_present(
        &meta,
        &DirectContribution {
            fan: f.fan.pubkey(),
            rider: f.rider.pubkey(),
            mint: f.approved_mint,
            amount: 2_000_000,
        }
    ));
}

#[test]
fn contribution_does_not_change_existing_sponsorship_coverage() {
    let mut f = Fixture::new();
    let season =
        Pubkey::find_program_address(&[b"season", f.profile.as_ref()], &gridsupport::id()).0;
    let expense = Pubkey::find_program_address(
        &[b"expense", season.as_ref(), &0u64.to_le_bytes()],
        &gridsupport::id(),
    )
    .0;
    let sponsorship = Pubkey::find_program_address(
        &[b"sponsorship", expense.as_ref(), &0u64.to_le_bytes()],
        &gridsupport::id(),
    )
    .0;
    let create_season = Instruction::new_with_bytes(
        gridsupport::id(),
        &gridsupport::instruction::CreateSeason {
            budget_cents: 10_000,
            title_hash: [1; 32],
        }
        .data(),
        gridsupport::accounts::CreateSeason {
            rider: f.rider.pubkey(),
            rider_profile: f.profile,
            season,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send(&mut f.svm, &f.rider, create_season).unwrap();
    let add_expense = Instruction::new_with_bytes(
        gridsupport::id(),
        &gridsupport::instruction::AddExpense {
            estimated_cost_cents: 5_000,
            category: 1,
            description_hash: [2; 32],
        }
        .data(),
        gridsupport::accounts::AddExpense {
            rider: f.rider.pubkey(),
            rider_profile: f.profile,
            season,
            expense,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send(&mut f.svm, &f.rider, add_expense).unwrap();
    let sponsor = Instruction::new_with_bytes(
        gridsupport::id(),
        &gridsupport::instruction::SponsorExpense {
            amount_cents: 1_000,
        }
        .data(),
        gridsupport::accounts::SponsorExpense {
            merchant: f.fan.pubkey(),
            season,
            expense,
            sponsorship,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send(&mut f.svm, &f.fan, sponsor).unwrap();
    let season_before = f.svm.get_account(&season).unwrap().data;
    let expense_before = f.svm.get_account(&expense).unwrap().data;
    let sponsorship_before = f.svm.get_account(&sponsorship).unwrap().data;
    f.contribute(2_000_000).unwrap();
    assert_eq!(f.svm.get_account(&season).unwrap().data, season_before);
    assert_eq!(f.svm.get_account(&expense).unwrap().data, expense_before);
    assert_eq!(
        f.svm.get_account(&sponsorship).unwrap().data,
        sponsorship_before
    );
    let state = Expense::try_deserialize(&mut expense_before.as_slice()).unwrap();
    assert_eq!(state.committed_coverage_cents, 1_000);
    assert_eq!(state.sponsorship_count, 1);
    let next_sponsorship = Pubkey::find_program_address(
        &[b"sponsorship", expense.as_ref(), &1u64.to_le_bytes()],
        &gridsupport::id(),
    )
    .0;
    assert!(f.svm.get_account(&next_sponsorship).is_none());
}

#[test]
fn rejects_invalid_amount_mint_and_program_atomically() {
    let mut f = Fixture::new();
    f.rejected(f.ix(0));
    f.rejected(f.ix(TOKEN_SUPPLY + 1));
    let other_mint = Keypair::new().pubkey();
    put_mint(&mut f.svm, other_mint, 6, spl_token::ID);
    f.rejected(f.ix_with(
        1,
        f.profile,
        other_mint,
        f.source,
        f.destination,
        spl_token::ID,
    ));
    put_mint(&mut f.svm, f.approved_mint, 9, spl_token::ID);
    f.rejected(f.ix(1));
    put_mint(&mut f.svm, f.approved_mint, 6, system_program::ID);
    f.rejected(f.ix(1));
    let token_2022 = Pubkey::from_str("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb").unwrap();
    put_mint(&mut f.svm, f.approved_mint, 6, token_2022);
    f.rejected(f.ix(1));
    put_mint(&mut f.svm, f.approved_mint, 6, spl_token::ID);
    f.rejected(f.ix_with(
        1,
        f.profile,
        f.approved_mint,
        f.source,
        f.destination,
        system_program::ID,
    ));
}

#[test]
fn rejects_invalid_source_and_destination_atomically() {
    let mut f = Fixture::new();
    let other = Keypair::new().pubkey();
    put_token(
        &mut f.svm,
        f.source,
        f.approved_mint,
        other,
        TOKEN_SUPPLY,
        spl_token::ID,
    );
    f.rejected(f.ix(1));
    put_token(
        &mut f.svm,
        f.source,
        other,
        f.fan.pubkey(),
        TOKEN_SUPPLY,
        spl_token::ID,
    );
    f.rejected(f.ix(1));
    put_token(
        &mut f.svm,
        f.source,
        f.approved_mint,
        f.fan.pubkey(),
        TOKEN_SUPPLY,
        system_program::ID,
    );
    f.rejected(f.ix(1));
    put_token(
        &mut f.svm,
        f.source,
        f.approved_mint,
        f.fan.pubkey(),
        TOKEN_SUPPLY,
        spl_token::ID,
    );
    put_token(
        &mut f.svm,
        f.destination,
        f.approved_mint,
        other,
        0,
        spl_token::ID,
    );
    f.rejected(f.ix(1));
    put_token(
        &mut f.svm,
        f.destination,
        other,
        f.rider.pubkey(),
        0,
        spl_token::ID,
    );
    f.rejected(f.ix(1));
    put_token(
        &mut f.svm,
        f.destination,
        f.approved_mint,
        f.rider.pubkey(),
        0,
        system_program::ID,
    );
    f.rejected(f.ix(1));
    put_token(
        &mut f.svm,
        f.destination,
        f.approved_mint,
        f.rider.pubkey(),
        0,
        spl_token::ID,
    );
    let other_ata = get_associated_token_address(&other, &f.approved_mint);
    put_token(
        &mut f.svm,
        other_ata,
        f.approved_mint,
        other,
        0,
        spl_token::ID,
    );
    f.rejected(f.ix_with(
        1,
        f.profile,
        f.approved_mint,
        f.source,
        other_ata,
        spl_token::ID,
    ));
    let noncanonical = Keypair::new().pubkey();
    put_token(
        &mut f.svm,
        noncanonical,
        f.approved_mint,
        f.rider.pubkey(),
        0,
        spl_token::ID,
    );
    f.rejected(f.ix_with(
        1,
        f.profile,
        f.approved_mint,
        f.source,
        noncanonical,
        spl_token::ID,
    ));
    let mut invalid = f.svm.get_account(&f.source).unwrap();
    invalid.data = vec![0; 3];
    f.svm.set_account(f.source, invalid).unwrap();
    f.rejected(f.ix(1));
    put_token(
        &mut f.svm,
        f.source,
        f.approved_mint,
        f.fan.pubkey(),
        TOKEN_SUPPLY,
        spl_token::ID,
    );
    let mut invalid_destination = f.svm.get_account(&f.destination).unwrap();
    invalid_destination.data = vec![0; 3];
    f.svm
        .set_account(f.destination, invalid_destination)
        .unwrap();
    f.rejected(f.ix(1));
}

#[test]
fn rejects_forged_profile_and_missing_fan_signature() {
    let mut f = Fixture::new();
    let forged = Keypair::new().pubkey();
    let valid_profile = f.svm.get_account(&f.profile).unwrap();
    f.svm.set_account(forged, valid_profile).unwrap();
    f.rejected(f.ix_with(
        1,
        forged,
        f.approved_mint,
        f.source,
        f.destination,
        spl_token::ID,
    ));
    let mut tampered = f.svm.get_account(&f.profile).unwrap();
    let mut profile = RiderProfile::try_deserialize(&mut tampered.data.as_slice()).unwrap();
    profile.rider = Keypair::new().pubkey();
    let mut bytes = Vec::new();
    anchor_lang::AccountSerialize::try_serialize(&profile, &mut bytes).unwrap();
    tampered.data = bytes;
    f.svm.set_account(f.profile, tampered).unwrap();
    f.rejected(f.ix(1));

    let payer = Keypair::new();
    let ix = f.ix(1);
    let msg = Message::new(&[ix], Some(&payer.pubkey()));
    assert!(VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&payer]).is_err());
}

#[test]
fn three_contributions_require_only_each_fan_signature() {
    let mut f = Fixture::new();
    let first = f.contribute(2_000_000).unwrap();
    let second = f.contribute(1_000_000).unwrap();
    let fan_b = Keypair::new();
    f.svm.airdrop(&fan_b.pubkey(), 1_000_000_000).unwrap();
    let source_b = get_associated_token_address(&fan_b.pubkey(), &f.approved_mint);
    put_token(
        &mut f.svm,
        source_b,
        f.approved_mint,
        fan_b.pubkey(),
        3_000_000,
        spl_token::ID,
    );
    let mut ix_b = f.ix_with(
        3_000_000,
        f.profile,
        f.approved_mint,
        source_b,
        f.destination,
        spl_token::ID,
    );
    ix_b.accounts[0].pubkey = fan_b.pubkey();
    let third = send(&mut f.svm, &fan_b, ix_b).unwrap();
    assert_eq!(token_account(&f.svm, f.source).amount, 17_000_000);
    assert_eq!(token_account(&f.svm, source_b).amount, 0);
    assert_eq!(token_account(&f.svm, f.destination).amount, 6_000_000);
    assert!(event_present(
        &first,
        &DirectContribution {
            fan: f.fan.pubkey(),
            rider: f.rider.pubkey(),
            mint: f.approved_mint,
            amount: 2_000_000
        }
    ));
    assert!(event_present(
        &second,
        &DirectContribution {
            fan: f.fan.pubkey(),
            rider: f.rider.pubkey(),
            mint: f.approved_mint,
            amount: 1_000_000
        }
    ));
    assert!(event_present(
        &third,
        &DirectContribution {
            fan: fan_b.pubkey(),
            rider: f.rider.pubkey(),
            mint: f.approved_mint,
            amount: 3_000_000
        }
    ));
    assert_eq!(mint(&f.svm, f.approved_mint).supply, TOKEN_SUPPLY);
}
