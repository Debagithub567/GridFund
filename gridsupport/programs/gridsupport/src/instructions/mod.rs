pub mod add_expense;
pub mod contribute_direct;
pub mod create_season;
pub mod initialize_rider;
pub mod sponsor_expense;

pub use add_expense::*;
pub use contribute_direct::*;
pub use create_season::*;
pub use initialize_rider::*;
pub use sponsor_expense::*;

pub(crate) fn next_count(current: u64) -> anchor_lang::Result<u64> {
    current
        .checked_add(1)
        .ok_or_else(|| anchor_lang::error!(crate::errors::GridSupportError::ArithmeticOverflow))
}

#[cfg(test)]
mod tests {
    use super::next_count;

    #[test]
    fn count_overflow_is_rejected() {
        assert_eq!(next_count(0).unwrap(), 1);
        assert!(next_count(u64::MAX).is_err());
    }
}
