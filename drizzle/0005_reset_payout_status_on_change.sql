CREATE OR REPLACE FUNCTION public.reset_payout_account_status_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (
    ROW(
      NEW.method,
      NEW.provider,
      NEW.account_name,
      NEW.account_number
    )
    IS DISTINCT FROM
    ROW(
      OLD.method,
      OLD.provider,
      OLD.account_name,
      OLD.account_number
    )
    AND OLD.status IN ('verified', 'rejected')
  ) THEN
    NEW.status := 'unverified';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.reset_payout_account_status_on_change()
FROM PUBLIC;

CREATE TRIGGER payout_accounts_reset_status_on_change
BEFORE UPDATE OF
  method,
  provider,
  account_name,
  account_number
ON public.payout_accounts
FOR EACH ROW
EXECUTE FUNCTION public.reset_payout_account_status_on_change();