-- Additive evidence checks. Apply after guarded_reviews; never resets claims or decisions.
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS capture_quality jsonb;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS ocr_evidence jsonb;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS first_submitted_at timestamptz;

-- Retain the tested transaction function and extend its validation in place.
-- Fail loudly if its expected version was changed rather than silently applying partial guards.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.claimlens_commit_review(uuid,uuid,uuid,bigint,integer,text,jsonb,jsonb,text,text,text)'::regprocedure) INTO definition;
  IF position('evidence_verified' in definition)>0 THEN RETURN; END IF;
  IF position('revised := jsonb_populate_record(target,p_updates' in definition)=0 OR position('UPDATE expenses SET merchant=revised.merchant' in definition)=0 THEN RAISE EXCEPTION 'Unexpected guarded-review definition. Review migration before applying.'; END IF;
  definition := replace(definition,'''3.0.0''','''3.1.0''');
  definition := replace(definition,'''invoice_number'',''currency_confirmed''','''invoice_number'',''evidence_verified'',''currency_confirmed''');
  definition := replace(definition,'fingerprint := jsonb_build_object(',E'IF p_action=''approve'' AND target.employee_id=p_actor_id THEN RAISE EXCEPTION ''SELF_APPROVAL''; END IF;\n  fingerprint := jsonb_build_object(');
  definition := replace(definition,'IF field_name=''currency_confirmed'' THEN CONTINUE; END IF;','IF field_name IN (''currency_confirmed'',''evidence_verified'') THEN CONTINUE; END IF;');
  definition := replace(definition,'IF revised.original_amount IS NOT NULL AND revised.original_amount<0 THEN', $new$
  IF p_updates ? 'evidence_verified' AND jsonb_typeof(p_updates->'evidence_verified')<>'boolean' THEN RAISE EXCEPTION 'INVALID_CONFIRMATION'; END IF;
  IF p_updates->>'evidence_verified'='true' THEN
    confirmed:=confirmed||jsonb_build_object('critical_evidence',jsonb_build_object('value',jsonb_build_object(
      'extraction_at',target.extraction_at,'quality_checked_at',target.capture_quality->>'checked_at','ocr_checked_at',target.ocr_evidence->>'checked_at',
      'merchant',revised.merchant,'expense_date',revised.expense_date,'original_amount',revised.original_amount,'original_currency',revised.original_currency),
      'source',CASE WHEN finance THEN 'finance' ELSE 'employee' END,'updated_by',p_actor_id,'updated_at',clock_timestamp()));
  END IF;
  IF p_action='submit' AND target.review_status='draft' AND revised.first_submitted_at IS NULL THEN revised.first_submitted_at:=clock_timestamp(); END IF;
  IF revised.original_amount IS NOT NULL AND revised.original_amount<0 THEN
  $new$);
  definition := replace(definition,'UPDATE expenses SET merchant=revised.merchant','UPDATE expenses SET first_submitted_at=revised.first_submitted_at,merchant=revised.merchant');
  definition := replace(definition,'ELSIF p_action=''save'' AND target.review_status=''draft''','ELSIF p_action IN (''save'',''evaluate'') AND target.review_status=''draft''');
  EXECUTE definition;
END $migration$;

CREATE OR REPLACE FUNCTION public.claimlens_store_ocr(p_expense_id uuid,p_company_id uuid,p_actor_id uuid,p_expected_version integer,p_ocr jsonb,p_quality jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target expenses; actor_role membership_role;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text,0));
  SELECT role INTO actor_role FROM memberships WHERE user_id=p_actor_id AND company_id=p_company_id;
  SELECT * INTO target FROM expenses WHERE id=p_expense_id AND company_id=p_company_id FOR UPDATE;
  IF actor_role IS NULL OR target.id IS NULL OR (actor_role<>'finance' AND target.employee_id<>p_actor_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF target.review_status IN ('approved','rejected') OR target.processing_status='extracting' OR target.version<>p_expected_version THEN RAISE EXCEPTION 'STALE_REVIEW'; END IF;
  UPDATE expenses SET ocr_evidence=p_ocr,capture_quality=p_quality WHERE id=p_expense_id RETURNING * INTO target;
  INSERT INTO review_events(expense_id,company_id,actor_id,actor_role,event_type,payload,note)
  VALUES(target.id,p_company_id,p_actor_id,actor_role,'status_changed',jsonb_build_object('evidence_version',target.version,'ocr_engine',p_ocr->>'engine'),'Independent OCR evidence added. Current evaluation must be refreshed.');
  RETURN to_jsonb(target);
END $$;
REVOKE ALL ON FUNCTION public.claimlens_store_ocr(uuid,uuid,uuid,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claimlens_store_ocr(uuid,uuid,uuid,integer,jsonb,jsonb) TO service_role;

-- All financial writes go through authorized application handlers/guarded functions.
REVOKE INSERT,UPDATE,DELETE ON public.expenses,public.evaluations,public.review_events,public.policy_versions FROM anon,authenticated;

-- Existing storage policy allowed every colleague to read every company receipt.
-- Keep employee evidence private while preserving company finance access.
DO $storage$
BEGIN
 IF to_regclass('storage.objects') IS NOT NULL THEN
   EXECUTE 'DROP POLICY IF EXISTS receipt_select_auth ON storage.objects';
   EXECUTE $policy$CREATE POLICY receipt_select_auth ON storage.objects FOR SELECT USING (
     bucket_id='receipts' AND EXISTS(SELECT 1 FROM public.expenses e JOIN public.memberships m ON m.company_id=e.company_id
       WHERE e.receipt_storage_path=storage.objects.name AND m.user_id=auth.uid() AND (m.role='finance' OR e.employee_id=auth.uid()))
   )$policy$;
 END IF;
END $storage$;
