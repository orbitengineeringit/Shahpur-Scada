-- All test observations are rolled back. No synthetic readings are committed
-- or broadcast through Supabase Realtime.
BEGIN;
DO $$
DECLARE
  at_time timestamptz := date_trunc('minute',now());
  reading jsonb;
  observed public.telemetry_latest%rowtype;
  history_count integer;
  history_value double precision;
BEGIN
  reading := jsonb_build_array(jsonb_build_object('tag_id','OHT1-LT','section','oht',
    'value',41,'quality','good','received_at',at_time,'mqtt_topic','test/rollback'));
  PERFORM public.ingest_telemetry(reading);
  PERFORM public.ingest_telemetry(reading);
  reading := jsonb_set(reading,'{0,value}','42'::jsonb);
  reading := jsonb_set(reading,'{0,received_at}',to_jsonb(at_time+interval '0.1 seconds'));
  PERFORM public.ingest_telemetry(reading);
  -- A late response must not overwrite a newer sample.
  reading := jsonb_set(reading,'{0,value}','9'::jsonb);
  reading := jsonb_set(reading,'{0,received_at}',to_jsonb(at_time));
  PERFORM public.ingest_telemetry(reading);
  SELECT * INTO observed FROM public.telemetry_latest WHERE tag_id='OHT1-LT';
  IF observed.value <> 42 THEN RAISE EXCEPTION 'Live timestamp regression'; END IF;
  SELECT count(*),max(value) INTO history_count,history_value FROM public.historian_logs
    WHERE tag_id='OHT1-LT' AND timestamp=to_timestamp(floor(extract(epoch FROM at_time)/300)*300);
  IF history_count <> 1 OR history_value <> 42 THEN RAISE EXCEPTION 'Bucket deduplication/update failed'; END IF;
  -- A newly received zero is valid, even when the previous value was nonzero.
  reading := jsonb_set(reading,'{0,value}','0'::jsonb);
  reading := jsonb_set(reading,'{0,received_at}',to_jsonb(at_time+interval '0.2 seconds'));
  PERFORM public.ingest_telemetry(reading);
  SELECT * INTO observed FROM public.telemetry_latest WHERE tag_id='OHT1-LT';
  IF observed.value <> 0 OR observed.quality <> 'good' THEN RAISE EXCEPTION 'Zero was lost'; END IF;
  -- Fault updates live quality, not the valid historian value.
  reading := jsonb_set(reading,'{0,value}','null'::jsonb);
  reading := jsonb_set(reading,'{0,quality}','"fault"'::jsonb);
  reading := jsonb_set(reading,'{0,received_at}',to_jsonb(at_time+interval '0.3 seconds'));
  PERFORM public.ingest_telemetry(reading);
  SELECT * INTO observed FROM public.telemetry_latest WHERE tag_id='OHT1-LT';
  IF observed.quality <> 'fault' THEN RAISE EXCEPTION 'Fault quality lost'; END IF;
  SELECT value INTO history_value FROM public.historian_logs
    WHERE tag_id='OHT1-LT' AND timestamp=to_timestamp(floor(extract(epoch FROM at_time)/300)*300);
  IF history_value <> 0 THEN RAISE EXCEPTION 'Fault polluted history'; END IF;
  IF has_function_privilege('authenticated','public.ingest_telemetry(jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.ingest_telemetry(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Browser can write collector telemetry';
  END IF;
END $$;
ROLLBACK;
SELECT 'atomic latest/history, duplicate retry, ordering, zero, fault and writer permissions verified; tests rolled back' AS result;
