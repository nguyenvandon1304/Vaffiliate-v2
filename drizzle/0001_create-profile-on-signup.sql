CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
INSERT INTO public.profiles (
user_id,
full_name
)
VALUES (
NEW.id,
NULLIF(NEW.raw_user_meta_data ->> 'full_name', '')
)
ON CONFLICT (user_id) DO NOTHING;

RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();