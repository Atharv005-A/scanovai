-- No policy grants anonymous reads of the registry tables; remove the
-- leftover role grants so the privilege matches the policy intent.
REVOKE SELECT ON public.products FROM anon;
REVOKE SELECT ON public.product_barcodes FROM anon;
REVOKE SELECT ON public.complaints FROM anon;