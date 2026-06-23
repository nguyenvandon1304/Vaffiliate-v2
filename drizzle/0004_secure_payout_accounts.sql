ALTER TABLE public.payout_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payout_accounts_select_own"
ON public.payout_accounts
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "payout_accounts_insert_own"
ON public.payout_accounts
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "payout_accounts_update_own"
ON public.payout_accounts
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL
ON TABLE public.payout_accounts
FROM authenticated;

GRANT SELECT
ON TABLE public.payout_accounts
TO authenticated;

GRANT INSERT (
  user_id,
  method,
  provider,
  account_name,
  account_number
)
ON TABLE public.payout_accounts
TO authenticated;

GRANT UPDATE (
  method,
  provider,
  account_name,
  account_number,
  updated_at
)
ON TABLE public.payout_accounts
TO authenticated;