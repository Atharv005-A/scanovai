CREATE OR REPLACE FUNCTION public.track_complaint(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_agg(payload) -> 0 FROM (
    SELECT jsonb_build_object(
      'complaint_code', c.complaint_code,
      'status', c.status,
      'priority', c.priority,
      'product_name', c.product_name,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'resolution_note', c.resolution_note,
      'updates', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                          'status', u.status, 'note', u.note, 'created_at', u.created_at)
                          ORDER BY u.created_at), '[]'::jsonb)
                    FROM public.complaint_updates u
                   WHERE u.complaint_id = c.id AND u.is_public)
    ) AS payload
    FROM public.complaints c
    WHERE length(btrim(_token)) >= 14
      AND c.tracking_token = btrim(_token)
    LIMIT 1
  ) s
$function$;
REVOKE ALL ON FUNCTION public.track_complaint(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_complaint(text) TO anon, authenticated, service_role;