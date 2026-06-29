import "server-only";

const shopeeAffiliateAccountIdPattern =
  /^an_[0-9]+$/;

export function getShopeeAffiliateAccountId(): string {
  const accountId =
    process.env.SHOPEE_AFFILIATE_ACCOUNT_ID?.trim();

  if (!accountId) {
    throw new Error(
      "SHOPEE_AFFILIATE_ACCOUNT_ID is required",
    );
  }

  if (
    !shopeeAffiliateAccountIdPattern.test(
      accountId,
    )
  ) {
    throw new Error(
      "SHOPEE_AFFILIATE_ACCOUNT_ID must match an_<digits>",
    );
  }

  return accountId;
}
