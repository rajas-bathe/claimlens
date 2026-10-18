-- Additive migration. No receipt, policy, approval or audit history is reset.
-- All review writes serialize by company; a revision catches changes since evaluation.
CREATE TABLE IF NOT EXISTS public.claimlens_company_revisions (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id),
  revision bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.claimlens_review_commands (
  request_id text PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  expense_id uuid NOT NULL REFERENCES public.expenses(id),
  command jsonb NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.claimlens_company_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claimlens_review_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.claimlens_company_revisions, public.claimlens_review_commands FROM anon, authenticated;
GRANT ALL ON public.claimlens_company_revisions, public.claimlens_review_commands TO service_role;

CREATE OR REPLACE FUNCTION public.claimlens_lock_company_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE company uuid;
BEGIN
  company := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;
  IF TG_OP = 'UPDATE' AND OLD.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'Company reassignment is not allowed';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(company::text, 0));
  INSERT INTO claimlens_company_revisions(company_id, revision) VALUES(company,1)
    ON CONFLICT(company_id) DO UPDATE SET revision=claimlens_company_revisions.revision+1;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := clock_timestamp();
    IF TG_TABLE_NAME = 'expenses' THEN NEW.version := OLD.version+1; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS claimlens_expense_revision ON public.expenses;
CREATE TRIGGER claimlens_expense_revision BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.claimlens_lock_company_write();
DROP TRIGGER IF EXISTS claimlens_policy_revision ON public.policy_versions;
CREATE TRIGGER claimlens_policy_revision BEFORE INSERT OR UPDATE OR DELETE ON public.policy_versions
  FOR EACH ROW EXECUTE FUNCTION public.claimlens_lock_company_write();

CREATE OR REPLACE FUNCTION public.claimlens_review_context(p_company_id uuid,p_expense_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE role membership_role; target expenses; result jsonb;
BEGIN
  SELECT m.role INTO role FROM memberships m WHERE m.company_id=p_company_id AND m.user_id=p_actor_id;
  SELECT * INTO target FROM expenses WHERE id=p_expense_id AND company_id=p_company_id;
  IF role IS NULL OR target.id IS NULL OR (role<>'finance' AND target.employee_id<>p_actor_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  -- One statement gives a consistent MVCC snapshot of both revision and evidence.
  SELECT jsonb_build_object(
    'revision',coalesce((SELECT revision FROM claimlens_company_revisions WHERE company_id=p_company_id),0),
    'expense',(SELECT to_jsonb(e) FROM expenses e WHERE e.id=p_expense_id AND e.company_id=p_company_id),
    'history',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM expenses e WHERE e.company_id=p_company_id AND e.id<>p_expense_id),'[]'::jsonb),
    'policies',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.version_number DESC) FROM policy_versions p WHERE p.company_id=p_company_id AND p.confirmed_at IS NOT NULL AND p.status IN ('active','superseded')),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.claimlens_commit_review(
  p_company_id uuid,p_expense_id uuid,p_actor_id uuid,p_revision bigint,p_expected_version integer,
  p_action text,p_updates jsonb,p_evaluation jsonb,p_note text,p_override text,p_request_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_role membership_role; target expenses; revised expenses; saved_eval evaluations;
  previous_command claimlens_review_commands; fingerprint jsonb; response jsonb;
  next_status review_status; event_kind review_event_type; actual_revision bigint; field_name text;
  confirmed jsonb; field_changes jsonb := '{}'::jsonb; finance boolean; terminal boolean;
BEGIN
  IF length(p_request_id)>180 OR p_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST_ID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text,0));
  SELECT m.role INTO actor_role FROM memberships m WHERE m.company_id=p_company_id AND m.user_id=p_actor_id;
  SELECT * INTO target FROM expenses WHERE id=p_expense_id AND company_id=p_company_id FOR UPDATE;
  finance := actor_role='finance';
  IF actor_role IS NULL OR target.id IS NULL OR (NOT finance AND target.employee_id<>p_actor_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_action NOT IN ('save','submit','evaluate','approve','reject','request') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  IF p_action IN ('approve','reject','request') AND NOT finance THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  fingerprint := jsonb_build_object('action',p_action,'updates',p_updates,'note',p_note,'override',p_override,'expected_version',p_expected_version);
  SELECT * INTO previous_command FROM claimlens_review_commands WHERE request_id=p_request_id;
  IF FOUND THEN
    IF previous_command.actor_id<>p_actor_id OR previous_command.expense_id<>p_expense_id OR previous_command.command<>fingerprint THEN RAISE EXCEPTION 'COMMAND_REUSED'; END IF;
    RETURN previous_command.response;
  END IF;
  terminal := target.review_status IN ('approved','rejected');
  IF terminal AND ((p_action='approve' AND target.review_status='approved') OR (p_action='reject' AND target.review_status='rejected')) THEN
    RETURN jsonb_build_object('expense',to_jsonb(target),'already_applied',true);
  END IF;
  IF terminal AND p_action<>'evaluate' THEN RAISE EXCEPTION 'DECISION_ALREADY_RECORDED'; END IF;
  SELECT coalesce(revision,0) INTO actual_revision FROM claimlens_company_revisions WHERE company_id=p_company_id;
  IF coalesce(actual_revision,0)<>p_revision OR target.version<>p_expected_version THEN RAISE EXCEPTION 'STALE_REVIEW' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_updates) k WHERE k NOT IN
    ('merchant','expense_date','original_amount','original_currency','category','city','trip_context','business_purpose','client_name','attendee_count','attendee_names','invoice_number','currency_confirmed','converted_currency','converted_amount','exchange_rate','exchange_rate_date','exchange_rate_source')) THEN RAISE EXCEPTION 'INVALID_FIELDS'; END IF;
  IF p_action IN ('approve','reject','request','evaluate') AND p_updates<>'{}'::jsonb THEN RAISE EXCEPTION 'DECISION_WITH_FIELD_CHANGES'; END IF;
  revised := jsonb_populate_record(target,p_updates - 'invoice_number');
  confirmed := coalesce(target.confirmed_fields,'{}'::jsonb);
  FOR field_name IN SELECT jsonb_object_keys(p_updates) LOOP
    IF field_name='currency_confirmed' THEN CONTINUE; END IF;
    IF field_name='original_currency' AND coalesce(p_updates->>'currency_confirmed','false')<>'true' THEN
      IF p_updates->field_name IS DISTINCT FROM to_jsonb(target)->field_name THEN confirmed:=confirmed-field_name; END IF;
      CONTINUE;
    END IF;
    confirmed := confirmed || jsonb_build_object(field_name,jsonb_build_object('value',p_updates->field_name,'source',CASE WHEN finance THEN 'finance' ELSE 'employee' END,'updated_by',p_actor_id,'updated_at',clock_timestamp()));
    IF p_updates->field_name IS DISTINCT FROM to_jsonb(target)->field_name THEN field_changes:=field_changes||jsonb_build_object(field_name,p_updates->field_name); END IF;
  END LOOP;
  IF revised.original_amount IS NOT NULL AND revised.original_amount<0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF revised.original_currency IS NOT NULL AND revised.original_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'INVALID_CURRENCY'; END IF;
  IF p_action<>'save' AND p_evaluation IS NULL THEN RAISE EXCEPTION 'EVALUATION_REQUIRED'; END IF;
  IF p_evaluation IS NOT NULL AND (p_evaluation->>'evaluator_version'<>'3.0.0' OR jsonb_typeof(p_evaluation->'rule_results')<>'array') THEN RAISE EXCEPTION 'INVALID_EVALUATION'; END IF;
  IF p_action='approve' THEN
    IF target.review_status NOT IN ('submitted','needs_review','ready_for_approval') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_evaluation->'rule_results') r WHERE r->'details'->>'non_overridable'='true' AND r->>'outcome'='unknown') THEN RAISE EXCEPTION 'FINANCIAL_EVIDENCE_UNRESOLVED'; END IF;
    IF p_evaluation->>'overall_outcome'<>'pass' AND coalesce(length(trim(p_override)),0)=0 THEN RAISE EXCEPTION 'OVERRIDE_REASON_REQUIRED'; END IF;
    next_status := 'approved';
  ELSIF p_action='reject' THEN
    IF coalesce(length(trim(p_note)),0)=0 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
    next_status := 'rejected';
  ELSIF p_action='request' THEN
    IF coalesce(length(trim(p_note)),0)=0 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
    next_status := 'needs_information';
  ELSIF p_action='save' AND target.review_status='draft' THEN next_status := 'draft';
  ELSIF terminal THEN next_status := target.review_status;
  ELSE
    next_status := CASE p_evaluation->>'overall_outcome' WHEN 'pass' THEN 'ready_for_approval' WHEN 'unknown' THEN
      CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(p_evaluation->'rule_results') r WHERE r->'details'->>'supported'='false' OR r->>'rule_id' LIKE 'policy_%' OR r->'details' ? 'unresolved_expense_ids') THEN 'needs_review'::review_status ELSE 'needs_information'::review_status END
      ELSE 'needs_review' END;
  END IF;
  UPDATE expenses SET merchant=revised.merchant,expense_date=revised.expense_date,original_amount=revised.original_amount,
    original_currency=revised.original_currency,converted_currency=revised.converted_currency,converted_amount=revised.converted_amount,exchange_rate=revised.exchange_rate,exchange_rate_date=revised.exchange_rate_date,exchange_rate_source=revised.exchange_rate_source,category=revised.category,city=revised.city,trip_context=revised.trip_context,
    business_purpose=revised.business_purpose,client_name=revised.client_name,attendee_count=revised.attendee_count,
    attendee_names=revised.attendee_names,confirmed_fields=confirmed,review_status=next_status
    WHERE id=target.id RETURNING * INTO revised;
  IF p_evaluation IS NOT NULL THEN
    INSERT INTO evaluations(expense_id,policy_version_id,evaluator_version,inputs_snapshot,rule_results,overall_outcome,reimbursable_amount,reimbursable_currency,duplicate_findings,spending_context)
    VALUES(target.id,(p_evaluation->>'policy_version_id')::uuid,'3.0.0',
      (p_evaluation->'inputs_snapshot')||jsonb_build_object('expense_version',revised.version,'history_revision',p_revision),
      p_evaluation->'rule_results',p_evaluation->>'overall_outcome',(p_evaluation->>'reimbursable_amount')::numeric,
      nullif(p_evaluation->>'reimbursable_currency',''),p_evaluation->'duplicate_findings',p_evaluation->'spending_context')
    RETURNING * INTO saved_eval;
  END IF;
  IF field_changes<>'{}'::jsonb THEN
    INSERT INTO review_events(expense_id,company_id,actor_id,actor_role,event_type,payload,note)
    VALUES(target.id,p_company_id,p_actor_id,actor_role,CASE WHEN finance THEN 'status_changed'::review_event_type ELSE 'employee_correction'::review_event_type END,
      jsonb_build_object('field_changes',field_changes,'previous',to_jsonb(target),'source',actor_role),p_note);
  END IF;
  event_kind := CASE p_action WHEN 'approve' THEN CASE WHEN p_evaluation->>'overall_outcome'='pass' THEN 'approved'::review_event_type ELSE 'policy_override'::review_event_type END
    WHEN 'reject' THEN 'rejected' WHEN 'request' THEN 'information_requested' WHEN 'submit' THEN 'submitted' WHEN 'save' THEN 'status_changed' ELSE 'evaluation_complete' END;
  INSERT INTO review_events(expense_id,company_id,actor_id,actor_role,event_type,payload,note)
  VALUES(target.id,p_company_id,p_actor_id,actor_role,event_kind,
    jsonb_build_object('from',target.review_status,'to',next_status,'evaluation_id',saved_eval.id,'history_revision',p_revision,'request_id',p_request_id,'is_override',p_action='approve' AND p_evaluation->>'overall_outcome'<>'pass'),
    coalesce(nullif(p_override,''),p_note));
  response := jsonb_build_object('expense',to_jsonb(revised),'evaluation',CASE WHEN saved_eval.id IS NOT NULL THEN to_jsonb(saved_eval) ELSE null END,'already_applied',false);
  INSERT INTO claimlens_review_commands(request_id,actor_id,expense_id,command,response) VALUES(p_request_id,p_actor_id,target.id,fingerprint,response);
  RETURN response;
END $$;

REVOKE ALL ON FUNCTION public.claimlens_review_context(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claimlens_commit_review(uuid,uuid,uuid,bigint,integer,text,jsonb,jsonb,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claimlens_review_context(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claimlens_commit_review(uuid,uuid,uuid,bigint,integer,text,jsonb,jsonb,text,text,text) TO service_role;
-- Policy activation uses the same company lock and is all-or-nothing.
CREATE OR REPLACE FUNCTION public.claimlens_activate_policy(p_company_id uuid,p_policy_id uuid,p_actor_id uuid,p_effective_from date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target policy_versions;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM memberships WHERE company_id=p_company_id AND user_id=p_actor_id AND role='finance') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO target FROM policy_versions WHERE id=p_policy_id AND company_id=p_company_id FOR UPDATE;
  IF target.id IS NULL OR target.status<>'proposed' THEN RAISE EXCEPTION 'Only a proposed policy can be activated'; END IF;
  IF p_effective_from IS NULL OR p_effective_from>current_date THEN RAISE EXCEPTION 'Choose an effective date on or before today'; END IF;
  IF EXISTS(SELECT 1 FROM policy_versions WHERE company_id=p_company_id AND status='active' AND effective_from>=p_effective_from) THEN RAISE EXCEPTION 'The effective date overlaps the start of an existing policy. Review its version dates first.'; END IF;
  UPDATE policy_versions SET status='superseded',effective_to=p_effective_from-1 WHERE company_id=p_company_id AND status='active';
  UPDATE policy_versions SET status='active',confirmed_by=p_actor_id,confirmed_at=clock_timestamp(),effective_from=p_effective_from,effective_to=null WHERE id=p_policy_id RETURNING * INTO target;
  RETURN to_jsonb(target);
END $$;
REVOKE ALL ON FUNCTION public.claimlens_activate_policy(uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claimlens_activate_policy(uuid,uuid,uuid,date) TO service_role;
