-- Push dispatch runs from cron and SECURITY DEFINER database triggers.
-- Mobile clients must never be able to submit arbitrary outbound HTTP requests.
do $$
declare
    v_function regprocedure;
begin
    for v_function in
        select p.oid::regprocedure
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'net'
    loop
        execute format(
            'revoke all on function %s from public, anon, authenticated',
            v_function
        );
    end loop;
end;
$$;
