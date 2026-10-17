// ClaimLane – Shared TypeScript types
// These types mirror the database schema and are used across client and server.

// ─── Enums ────────────────────────────────────────────────────────────────────

export type MembershipRole = 'employee' | 'finance';

export type ProcessingStatus =
  | 'uploading'
  | 'extracting'
  | 'extracted'
  | 'extraction_failed'
  | 'manual_entry';

export type ReviewStatus =
  | 'draft'
  | 'submitted'
  | 'needs_information'
  | 'needs_review'
  | 'ready_for_approval'
  | 'approved'
  | 'rejected';

export type PolicyStatus =
  | 'draft'
  | 'proposed'
  | 'active'
  | 'superseded'
  | 'archived';

export type ReviewEventType =
  | 'submitted'
  | 'extraction_complete'
  | 'extraction_failed'
  | 'employee_correction'
  | 'evaluation_complete'
  | 'information_requested'
  | 'information_provided'
  | 'approved'
  | 'rejected'
  | 'reopened'
  | 'duplicate_flagged'
  | 'policy_override'
  | 'batch_imported'
  | 'status_changed';

export type TripContext = 'business_trip' | 'office' | 'other';

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  user_id: string;
  company_id: string;
  role: MembershipRole;
  display_name: string | null;
  email: string | null;
  created_at: string;
}

export interface PolicyVersion {
  id: string;
  company_id: string;
  version_number: number;
  status: PolicyStatus;
  source_document: string | null;
  source_file_path: string | null;
  structured_rules: PolicyRule[] | null;
  unsupported_clauses: UnsupportedClause[] | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  company_id: string;
  employee_id: string;
  processing_status: ProcessingStatus;
  review_status: ReviewStatus;
  receipt_storage_path: string | null;
  receipt_file_hash: string | null;
  receipt_mime_type: string | null;
  receipt_file_size: number | null;
  extraction_raw: ExtractionResult | null;
  extraction_at: string | null;
  extraction_model: string | null;
  extraction_error: string | null;
  confirmed_fields: ConfirmedFields;
  merchant: string | null;
  expense_date: string | null;
  original_amount: number | null;
  original_currency: string | null;
  converted_amount: number | null;
  converted_currency: string | null;
  exchange_rate: number | null;
  exchange_rate_date: string | null;
  exchange_rate_source: string | null;
  category: string | null;
  city: string | null;
  trip_context: TripContext | null;
  business_purpose: string | null;
  client_name: string | null;
  attendee_count: number | null;
  attendee_names: string[] | null;
  policy_version_id: string | null;
  batch_import_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Evaluation {
  id: string;
  expense_id: string;
  policy_version_id: string | null;
  evaluated_at: string;
  evaluator_version: string;
  inputs_snapshot: Record<string, unknown>;
  rule_results: RuleResult[];
  overall_outcome: 'pass' | 'fail' | 'unknown' | 'needs_review';
  reimbursable_amount: number | null;
  reimbursable_currency: string | null;
  duplicate_findings: DuplicateFinding[];
  spending_context: SpendingContext;
  created_at: string;
}

export interface ReviewEvent {
  id: string;
  expense_id: string;
  company_id: string;
  actor_id: string | null;
  actor_role: MembershipRole | null;
  event_type: ReviewEventType;
  payload: Record<string, unknown>;
  note: string | null;
  created_at: string;
}

export interface BatchImport {
  id: string;
  company_id: string;
  created_by: string;
  total_files: number;
  processed_files: number;
  failed_files: number;
  status: 'pending' | 'processing' | 'complete' | 'partial_failure';
  created_at: string;
  updated_at: string;
}

// ─── Extraction ───────────────────────────────────────────────────────────────

export interface ExtractionResult {
  merchant: ExtractionField<string>;
  invoice_number: ExtractionField<string>;
  printed_date: ExtractionField<string>;
  normalized_date: ExtractionField<string>;        // ISO 8601
  printed_currency: ExtractionField<string>;
  normalized_currency: ExtractionField<string>;    // ISO 4217
  subtotal: ExtractionField<number>;
  tax: ExtractionField<number>;
  service_charge: ExtractionField<number>;
  tip: ExtractionField<number>;
  discount: ExtractionField<number>;
  total: ExtractionField<number>;
  line_items: LineItem[];
  itemization_completeness: 'complete' | 'partial' | 'none' | 'unclear';
  missing_fields: string[];
  ambiguous_fields: AmbiguousField[];
  unreadable_regions: string[];
  conflicting_fields: ConflictingField[];
  arithmetic_check: ArithmeticCheck | null;
  suggested_category: string | null;   // suggestion only, not confirmed fact
  extraction_notes: string[];
  page_references: Record<string, string>;
}

export interface ExtractionField<T> {
  value: T | null;
  confidence: 'high' | 'medium' | 'low' | null;
  source: 'printed' | 'derived' | null;
  supporting_text: string | null;
  page_ref: string | null;
}

export interface LineItem {
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  page_ref: string | null;
}

export interface AmbiguousField {
  field: string;
  possible_values: string[];
  reason: string;
}

export interface ConflictingField {
  field: string;
  values: Array<{ value: string; location: string }>;
}

export interface ArithmeticCheck {
  calculated_total: number | null;
  printed_total: number | null;
  discrepancy: number | null;
  note: string;
}

// ─── Confirmed fields ─────────────────────────────────────────────────────────

export type FieldSource = 'extracted' | 'employee' | 'finance' | 'manual';

export interface ConfirmedField<T> {
  value: T;
  source: FieldSource;
  updated_at: string;
  updated_by: string | null;
}

export interface ConfirmedFields {
  merchant?: ConfirmedField<string>;
  expense_date?: ConfirmedField<string>;
  original_amount?: ConfirmedField<number>;
  original_currency?: ConfirmedField<string>;
  category?: ConfirmedField<string>;
  city?: ConfirmedField<string>;
  trip_context?: ConfirmedField<TripContext>;
  business_purpose?: ConfirmedField<string>;
  client_name?: ConfirmedField<string>;
  attendee_count?: ConfirmedField<number>;
  attendee_names?: ConfirmedField<string[]>;
  invoice_number?: ConfirmedField<string>;
  [key: string]: ConfirmedField<unknown> | undefined;
}

// ─── Policy ───────────────────────────────────────────────────────────────────

export type RuleType =
  | 'required_field'
  | 'per_expense_cap'
  | 'daily_cap'
  | 'category_cap'
  | 'city_cap'
  | 'prohibited_item'
  | 'approval_threshold'
  | 'trip_context_override'
  | 'client_entertainment_requirement'
  | 'itemization_requirement'
  | 'currency_restriction';

export interface PolicyRule {
  id: string;
  type: RuleType;
  source_clause: string;
  supporting_text: string;
  conditions: PolicyCondition[];
  limit: number | null;
  limit_currency: string | null;
  aggregation_scope: 'per_expense' | 'daily' | 'monthly' | 'per_trip' | null;
  required_field: string | null;
  prohibited_values: string[] | null;
  exceptions: PolicyException[];
  outcome: 'block' | 'flag' | 'require_approval' | 'require_field' | 'info_only';
  categories: string[] | null;
  cities: string[] | null;
  trip_contexts: TripContext[] | null;
}

export interface PolicyCondition {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'present' | 'absent';
  value: unknown;
}

export interface PolicyException {
  condition: PolicyCondition;
  override: Partial<PolicyRule>;
  note: string;
}

export interface UnsupportedClause {
  clause_id: string;
  source_text: string;
  reason: string;
}

// ─── Policy Engine ────────────────────────────────────────────────────────────

export type RuleOutcome = 'pass' | 'fail' | 'unknown' | 'not_applicable';

export interface RuleResult {
  rule_id: string;
  rule_type: RuleType;
  outcome: RuleOutcome;
  message: string;
  details: Record<string, unknown>;
  reimbursable_impact: number | null;
}

export interface DuplicateFinding {
  type: 'exact_hash' | 'probable' | 'related';
  matched_expense_id: string;
  matched_expense_date: string | null;
  matched_merchant: string | null;
  matched_amount: number | null;
  matching_fields: string[];
  differing_fields: string[];
  note: string;
}

export interface SpendingContext {
  employee_id: string;
  period_start: string;
  period_end: string;
  category: string | null;
  city: string | null;
  trip_context: TripContext | null;
  prior_total: number;
  currency: string;
  expense_ids_included: string[];
}

// ─── Auth / Session ───────────────────────────────────────────────────────────

export interface UserSession {
  id: string;
  email: string;
  membership: Membership;
  company: Company;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
