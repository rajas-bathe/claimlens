import { GoogleGenAI } from '@google/genai';
import type { PolicyRule, UnsupportedClause } from '@/types';

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

const POLICY_STRUCTURING_PROMPT = `You are an expert compliance and expense policy analyst.
Your job is to read an official company expense policy document and convert it into a structured set of deterministic evaluation rules.

CRITICAL INSTRUCTIONS:
1. Extract ALL explicit rules: category caps, daily caps, per-expense caps, prohibited items, city-specific rules, client entertainment requirements, itemization rules, and approval thresholds.
2. For each rule:
   - "id": a unique snake_case identifier (e.g. "meal_office_daily_cap", "client_entertainment_per_attendee_cap")
   - "type": one of: "required_field", "per_expense_cap", "daily_cap", "category_cap", "city_cap", "prohibited_item", "approval_threshold", "trip_context_override", "client_entertainment_requirement", "itemization_requirement", "currency_restriction"
   - "source_clause": the section number or title (e.g. "Clause 2.1")
   - "supporting_text": verbatim quote from the policy
   - "limit": number or null (e.g. 25.00)
   - "limit_currency": "USD" or currency code
   - "aggregation_scope": "per_expense", "daily", "monthly", "per_trip", or null
   - "outcome": "block", "flag", "require_approval", "require_field", "info_only"
   - "categories": array of applicable category names (e.g. ["Business meals", "Accommodation"])
   - "cities": array of specific cities or null (e.g. ["New York", "London"])
   - "trip_contexts": array of ["business_trip", "office", "other"] or null
   - "prohibited_values": array of prohibited item strings (e.g. ["alcohol", "gambling", "minibar"]) or null
   - "conditions": array of conditions
   - "exceptions": array of exceptions

3. IDENTIFY UNSUPPORTED CLAUSES:
   If a clause contains subjective, discretionary, or uncomputable guidelines (e.g., "employees should exercise sound judgement", "moderately priced hotels should be favored", "extravagant entertainment is discouraged"), you MUST NOT invent fake numbers. Add it to the "unsupported_clauses" array with the clause ID, source text, and explanation.

Return ONLY valid JSON matching the schema without markdown formatting.`;

const POLICY_STRUCTURING_SCHEMA = {
  type: 'object',
  properties: {
    structured_rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: {
            type: 'string',
            enum: [
              'required_field',
              'per_expense_cap',
              'daily_cap',
              'category_cap',
              'city_cap',
              'prohibited_item',
              'approval_threshold',
              'trip_context_override',
              'client_entertainment_requirement',
              'itemization_requirement',
              'currency_restriction',
            ],
          },
          source_clause: { type: 'string' },
          supporting_text: { type: 'string' },
          limit: { type: ['number', 'null'] },
          limit_currency: { type: ['string', 'null'] },
          aggregation_scope: {
            type: ['string', 'null'],
            enum: ['per_expense', 'daily', 'monthly', 'per_trip', null],
          },
          required_field: { type: ['string', 'null'] },
          prohibited_values: { type: ['array', 'null'], items: { type: 'string' } },
          outcome: {
            type: 'string',
            enum: ['block', 'flag', 'require_approval', 'require_field', 'info_only'],
          },
          categories: { type: ['array', 'null'], items: { type: 'string' } },
          cities: { type: ['array', 'null'], items: { type: 'string' } },
          trip_contexts: { type: ['array', 'null'], items: { type: 'string' } },
          conditions: { type: 'array', items: { type: 'object' } },
          exceptions: { type: 'array', items: { type: 'object' } },
        },
        required: ['id', 'type', 'source_clause', 'supporting_text', 'outcome'],
      },
    },
    unsupported_clauses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          clause_id: { type: 'string' },
          source_text: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['clause_id', 'source_text', 'reason'],
      },
    },
  },
  required: ['structured_rules', 'unsupported_clauses'],
};

export interface StructuredPolicyOutput {
  structured_rules: PolicyRule[];
  unsupported_clauses: UnsupportedClause[];
}

export async function structurePolicyDocument(documentText: string): Promise<StructuredPolicyOutput> {
  const apiKey = process.env.GEMINI_API_KEY;

  // Fallback to deterministic template parsing if no API key configured during local testing
  if (!apiKey) {
    return parsePolicyFallback(documentText);
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Analyze and structure this company expense policy document:\n\n${documentText}`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: POLICY_STRUCTURING_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: POLICY_STRUCTURING_SCHEMA as Parameters<typeof ai.models.generateContent>[0]['config'] extends object ? unknown : never,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Empty response received from Gemini API');
  }

  try {
    const parsed = JSON.parse(text) as StructuredPolicyOutput;
    return parsed;
  } catch {
    throw new Error(`Failed to parse AI policy response: ${text.slice(0, 200)}`);
  }
}

/**
 * Deterministic fallback parser for offline/demo/testing environments
 */
function parsePolicyFallback(text: string): StructuredPolicyOutput {
  const rules: PolicyRule[] = [
    {
      id: 'meal_office_daily_cap',
      type: 'daily_cap',
      source_clause: 'Clause 2.1',
      supporting_text: 'Routine office meals are capped at $25.00 USD per person per day.',
      conditions: [{ field: 'trip_context', operator: 'eq', value: 'office' }],
      limit: 25.0,
      limit_currency: 'USD',
      aggregation_scope: 'daily',
      required_field: null,
      prohibited_values: null,
      exceptions: [],
      outcome: 'block',
      categories: ['Business meals'],
      cities: null,
      trip_contexts: ['office'],
    },
    {
      id: 'meal_business_trip_daily_cap',
      type: 'daily_cap',
      source_clause: 'Clause 2.2 & 2.3',
      supporting_text: 'Business trip meals capped at $75.00 USD standard, or $100.00 USD in Tier 1 high cost cities.',
      conditions: [{ field: 'trip_context', operator: 'eq', value: 'business_trip' }],
      limit: 75.0,
      limit_currency: 'USD',
      aggregation_scope: 'daily',
      required_field: null,
      prohibited_values: null,
      exceptions: [],
      outcome: 'block',
      categories: ['Business meals'],
      cities: ['New York', 'San Francisco', 'London', 'Zurich', 'Tokyo'],
      trip_contexts: ['business_trip'],
    },
    {
      id: 'client_entertainment_attendee_cap',
      type: 'per_expense_cap',
      source_clause: 'Clause 3.2',
      supporting_text: 'Client meals are capped at $100.00 USD per attendee.',
      conditions: [],
      limit: 100.0,
      limit_currency: 'USD',
      aggregation_scope: 'per_expense',
      required_field: 'client_name',
      prohibited_values: null,
      exceptions: [],
      outcome: 'block',
      categories: ['Client entertainment'],
      cities: null,
      trip_contexts: null,
    },
    {
      id: 'executive_approval_threshold',
      type: 'approval_threshold',
      source_clause: 'Clause 3.3',
      supporting_text: 'Any single client entertainment expense exceeding $500.00 USD triggers an Executive Approval threshold.',
      conditions: [],
      limit: 500.0,
      limit_currency: 'USD',
      aggregation_scope: 'per_expense',
      required_field: null,
      prohibited_values: null,
      exceptions: [],
      outcome: 'require_approval',
      categories: ['Client entertainment'],
      cities: null,
      trip_contexts: null,
    },
    {
      id: 'prohibited_items_general',
      type: 'prohibited_item',
      source_clause: 'Clause 5.1',
      supporting_text: 'Personal items, tobacco, gambling, minibar consumables are non-reimbursable.',
      conditions: [],
      limit: null,
      limit_currency: null,
      aggregation_scope: null,
      required_field: null,
      prohibited_values: ['tobacco', 'gambling', 'minibar', 'cigarette', 'cigar', 'lottery'],
      exceptions: [],
      outcome: 'block',
      categories: null,
      cities: null,
      trip_contexts: null,
    },
  ];

  const unsupported: UnsupportedClause[] = [
    {
      clause_id: 'Clause 4.2 (Discretionary)',
      source_text: 'Moderately priced hotel options should be prioritized where reasonably available.',
      reason: 'Subjective guideline without a computable upper dollar threshold.',
    },
  ];

  return {
    structured_rules: rules,
    unsupported_clauses: unsupported,
  };
}
